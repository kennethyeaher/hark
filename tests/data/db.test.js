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
import { getMoment } from '../../src/data/moments.js'
import { getAudio, saveAudio } from '../../src/data/audio.js'
import { listSegmentsForRecording, saveSegments } from '../../src/data/segments.js'

beforeEach(useFreshDatabase)

describe('openDatabase', () => {
  it('creates every store and index on a new database', async () => {
    const database = await openDatabase()
    expect(database.version).toBe(databaseVersion)
    expect([...database.objectStoreNames].sort()).toEqual([
      'audio',
      'courses',
      'moments',
      'notes',
      'recordings',
      'segments',
    ])
    const transaction = database.transaction(['recordings', 'moments', 'audio', 'segments'])
    expect([...transaction.objectStore('recordings').indexNames].sort()).toEqual([
      'courseId',
      'recordedAt',
    ])
    expect([...transaction.objectStore('moments').indexNames]).toEqual(['recordingId'])
    expect(transaction.objectStore('audio').keyPath).toBe('recordingId')
    expect([...transaction.objectStore('audio').indexNames]).toEqual([])
    expect(transaction.objectStore('segments').keyPath).toBe('id')
    expect([...transaction.objectStore('segments').indexNames]).toEqual(['recordingId'])
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

describe('other tabs', () => {
  it('lets go of its connection when another tab opens a newer version', async () => {
    const database = await openDatabase()
    const newerTab = await openDB(databaseName, databaseVersion + 1)
    expect(newerTab.version).toBe(databaseVersion + 1)
    newerTab.close()
    expect(() => database.transaction('courses')).toThrow()
  })

  it('rejects with a clear error when an older tab will not let go', async () => {
    // an older tab with no blocking handler keeps its version 1 connection open
    const olderTab = await openDB(databaseName, 1, {
      upgrade: (database, oldVersion, newVersion) =>
        upgradeDatabase(database, oldVersion, newVersion),
    })
    await expect(openDatabase()).rejects.toThrow(
      /open in another tab that is using an older version/
    )
    olderTab.close()
  })
})

describe('upgrade from version 1', () => {
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
    expect(database.version).toBe(databaseVersion)
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

/**
 * open the database at an older version, built the way that release left it.
 * @param {number} version version to stop at
 * @returns {Promise<import('idb').IDBPDatabase>} the open older database
 */
function openOlderVersion(version) {
  return openDB(databaseName, version, {
    upgrade: (database, oldVersion, newVersion) =>
      upgradeDatabase(database, oldVersion, newVersion),
  })
}

describe('upgrade to version 3', () => {
  it('builds every store in one step from 0 to 3', async () => {
    const database = await openOlderVersion(3)
    expect([...database.objectStoreNames].sort()).toEqual([
      'audio',
      'courses',
      'moments',
      'notes',
      'recordings',
      'segments',
    ])
    database.close()
  })

  it('keeps version 2 data and adds the audio and segments stores', async () => {
    const versionTwo = await openOlderVersion(2)
    expect([...versionTwo.objectStoreNames].sort()).toEqual([
      'courses',
      'moments',
      'notes',
      'recordings',
    ])
    const recordedAt = new Date(2026, 10, 3, 9)
    await versionTwo.put('courses', {
      id: 'inst630',
      code: 'INST 630',
      name: 'Information Ethics',
      color: 'teal',
    })
    // a version 2 recording has no model or errorMessage yet
    await versionTwo.put('recordings', {
      id: 'lecture17',
      title: 'Lecture 17',
      courseId: 'inst630',
      durationSeconds: 3120,
      recordedAt,
      createdAt: recordedAt,
      status: 'summarized',
      progress: 1,
      isStarred: true,
      deletedAt: null,
    })
    await versionTwo.put('notes', {
      recordingId: 'lecture17',
      body: 'privacy',
      updatedAt: recordedAt,
    })
    await versionTwo.put('moments', {
      id: 'm1',
      recordingId: 'lecture17',
      atSeconds: 90,
      label: 'Key idea',
      color: 'teal',
    })
    versionTwo.close()

    const database = await openDatabase()
    expect(database.version).toBe(3)
    expect([...database.objectStoreNames]).toEqual(expect.arrayContaining(['audio', 'segments']))
    expect((await getRecording('lecture17')).isStarred).toBe(true)
    expect((await getNote('lecture17')).body).toBe('privacy')
    expect((await getMoment('m1')).atSeconds).toBe(90)

    // the new stores work on the upgraded data
    const file = new File([new Uint8Array([1, 2])], 'lecture17.wav', { type: 'audio/wav' })
    await saveAudio({ recordingId: 'lecture17', blob: file })
    expect((await getAudio('lecture17')).size).toBe(2)
    await saveSegments('lecture17', [
      { index: 0, startSeconds: 0, endSeconds: 2, text: 'Good morning.' },
    ])
    expect(await listSegmentsForRecording('lecture17')).toHaveLength(1)
  })

  it('stops at version 2 when asked for version 2', async () => {
    const versionTwo = await openOlderVersion(2)
    expect([...versionTwo.objectStoreNames]).not.toContain('audio')
    versionTwo.close()
  })
})
