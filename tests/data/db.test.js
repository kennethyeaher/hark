import { beforeEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { useFreshDatabase } from './fresh-database.js'
import {
  closeDatabase,
  databaseName,
  databaseVersion,
  openDatabase,
  upgradeDatabase,
} from '../../src/data/db.js'
import { getCourse } from '../../src/data/courses.js'
import { getRecording, listRecordingsForCourse } from '../../src/data/recordings.js'
import { getNote, saveNote } from '../../src/data/notes.js'

beforeEach(useFreshDatabase)

describe('openDatabase', () => {
  it('creates every store and index on a new database', async () => {
    const database = await openDatabase()
    expect(database.version).toBe(databaseVersion)
    expect([...database.objectStoreNames].sort()).toEqual([
      'courses',
      'moments',
      'notes',
      'recordings',
    ])
    const transaction = database.transaction(['recordings', 'moments'])
    expect([...transaction.objectStore('recordings').indexNames].sort()).toEqual([
      'courseId',
      'recordedAt',
    ])
    expect([...transaction.objectStore('moments').indexNames]).toEqual(['recordingId'])
  })

  it('shares one connection between callers', async () => {
    expect(await openDatabase()).toBe(await openDatabase())
  })

  it('rejects with a clear error when indexeddb is missing', async () => {
    await closeDatabase()
    const factory = globalThis.indexedDB
    delete globalThis.indexedDB
    try {
      await expect(openDatabase()).rejects.toThrow('IndexedDB is not available in this browser')
    } finally {
      globalThis.indexedDB = factory
    }
  })
})

describe('upgrade from version 1 to version 2', () => {
  it('keeps version 1 data and adds the notes and moments stores', async () => {
    // build a version 1 database the way the first release left it
    const versionOne = await openDB(databaseName, 1, {
      upgrade: (database, oldVersion, newVersion) =>
        upgradeDatabase(database, oldVersion, newVersion),
    })
    expect([...versionOne.objectStoreNames].sort()).toEqual(['courses', 'recordings'])
    const recordedAt = new Date(2026, 9, 28, 11)
    await versionOne.put('courses', {
      id: 'hcim605',
      code: 'HCIM 605',
      name: 'Qualitative Research Methods',
      color: 'indigo',
    })
    await versionOne.put('recordings', {
      id: 'week9',
      title: 'Week 9 · Thematic analysis',
      courseId: 'hcim605',
      durationSeconds: 4440,
      recordedAt,
      createdAt: recordedAt,
      status: 'summarized',
      progress: 1,
      isStarred: false,
      deletedAt: null,
    })
    versionOne.close()

    const database = await openDatabase()
    expect(database.version).toBe(2)
    expect([...database.objectStoreNames]).toEqual(expect.arrayContaining(['notes', 'moments']))
    expect((await getCourse('hcim605')).code).toBe('HCIM 605')
    const recording = await getRecording('week9')
    expect(recording.recordedAt).toEqual(recordedAt)
    expect((await listRecordingsForCourse('hcim605')).map((stored) => stored.id)).toEqual(['week9'])

    // the new stores work on the upgraded data
    await saveNote({ recordingId: 'week9', body: 'codes and themes' })
    expect((await getNote('week9')).body).toBe('codes and themes')
  })
})
