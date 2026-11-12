import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import {
  deleteRecordingForever,
  getRecording,
  listRecordings,
  listRecordingsForCourse,
  restoreRecording,
  saveRecording,
  trashRecording,
} from '../../src/data/recordings.js'

/**
 * build a valid recording with fields that a test can override.
 * @param {object} [overrides] fields to replace
 * @returns {object} the recording
 */
function makeRecording(overrides = {}) {
  return {
    id: 'week9',
    title: 'Week 9 · Thematic analysis',
    courseId: 'hcim605',
    durationSeconds: 74 * 60,
    recordedAt: new Date(2026, 9, 28, 11),
    createdAt: new Date(2026, 9, 28, 12),
    status: 'summarized',
    progress: 1,
    isStarred: true,
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
  })
  await saveCourse({
    id: 'inst360',
    code: 'INST 360',
    name: 'Programming Human-Centered Interfaces',
    color: 'teal',
  })
})

describe('saveRecording', () => {
  it('saves a recording and reads it back with dates as Dates', async () => {
    const recording = makeRecording()
    await saveRecording(recording)
    const stored = await getRecording('week9')
    expect(stored).toEqual(recording)
    expect(stored.recordedAt).toBeInstanceOf(Date)
    expect(stored.createdAt).toBeInstanceOf(Date)
    expect(stored.recordedAt.getTime()).toBe(recording.recordedAt.getTime())
  })

  it('fills an id and defaults for a new recording', async () => {
    const saved = await saveRecording({ title: 'Lecture 1', courseId: 'inst360' })
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(saved).toMatchObject({
      durationSeconds: 0,
      status: 'queued',
      progress: 0,
      isStarred: false,
      deletedAt: null,
    })
    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(await getRecording(saved.id)).toEqual(saved)
  })

  it('drops fields the store does not keep', async () => {
    await saveRecording(makeRecording({ hasNotes: true }))
    expect(await getRecording('week9')).not.toHaveProperty('hasNotes')
  })

  it('keeps a deletedAt date through the round trip', async () => {
    const deletedAt = new Date(2026, 9, 30)
    await saveRecording(makeRecording({ deletedAt }))
    const stored = await getRecording('week9')
    expect(stored.deletedAt).toBeInstanceOf(Date)
    expect(stored.deletedAt.getTime()).toBe(deletedAt.getTime())
  })
})

describe('recording validation', () => {
  it.each([
    ['a missing title', { title: undefined }, TypeError, /title must be a non empty string/],
    ['a blank title', { title: '  ' }, TypeError, /title must be a non empty string/],
    [
      'an unknown status',
      { status: 'done' },
      TypeError,
      /status must be one of queued, transcribing, transcribed, summarized, failed, got done/,
    ],
    [
      'progress above 1',
      { progress: 1.2 },
      RangeError,
      /progress must be a number from 0 to 1, got 1.2/,
    ],
    ['progress below 0', { progress: -0.1 }, RangeError, /progress must be a number from 0 to 1/],
    [
      'progress that is NaN',
      { progress: Number.NaN },
      RangeError,
      /progress must be a number from 0 to 1/,
    ],
    [
      'a negative duration',
      { durationSeconds: -1 },
      RangeError,
      /durationSeconds must be a finite number/,
    ],
    [
      'a recordedAt string',
      { recordedAt: '2026-10-28' },
      TypeError,
      /recordedAt must be a valid Date/,
    ],
    [
      'an invalid date',
      { createdAt: new Date('nope') },
      TypeError,
      /createdAt must be a valid Date/,
    ],
    [
      'a starred flag that is not boolean',
      { isStarred: 'yes' },
      TypeError,
      /isStarred must be true or false/,
    ],
    [
      'a missing course id',
      { courseId: undefined },
      TypeError,
      /courseId must be a non empty string/,
    ],
  ])('rejects %s', async (_name, overrides, ErrorType, message) => {
    const saving = saveRecording(makeRecording(overrides))
    await expect(saving).rejects.toThrow(ErrorType)
    await expect(saveRecording(makeRecording(overrides))).rejects.toThrow(message)
    expect(await listRecordings({ includeDeleted: true })).toEqual([])
  })

  it('rejects a recording whose course does not exist and writes nothing', async () => {
    await expect(saveRecording(makeRecording({ courseId: 'inst999' }))).rejects.toThrow(
      /points to course inst999, which does not exist/
    )
    expect(await getRecording('week9')).toBeUndefined()
  })
})

describe('listing recordings', () => {
  beforeEach(async () => {
    await saveRecording(makeRecording({ id: 'week8', recordedAt: new Date(2026, 9, 21) }))
    await saveRecording(makeRecording({ id: 'week9', recordedAt: new Date(2026, 9, 28) }))
    await saveRecording(
      makeRecording({ id: 'lecture17', courseId: 'inst360', recordedAt: new Date(2026, 9, 27) })
    )
  })

  it('lists newest first through the recordedAt index', async () => {
    expect((await listRecordings()).map((recording) => recording.id)).toEqual([
      'week9',
      'lecture17',
      'week8',
    ])
  })

  it('lists one course through the courseId index', async () => {
    expect((await listRecordingsForCourse('hcim605')).map((recording) => recording.id)).toEqual([
      'week9',
      'week8',
    ])
    expect((await listRecordingsForCourse('inst360')).map((recording) => recording.id)).toEqual([
      'lecture17',
    ])
    expect(await listRecordingsForCourse('inst711')).toEqual([])
  })

  it('leaves trashed recordings out unless includeDeleted is true', async () => {
    await trashRecording('week8')
    expect((await listRecordings()).map((recording) => recording.id)).toEqual([
      'week9',
      'lecture17',
    ])
    expect(await listRecordings({ includeDeleted: true })).toHaveLength(3)
    expect(await listRecordingsForCourse('hcim605')).toHaveLength(1)
    expect(await listRecordingsForCourse('hcim605', { includeDeleted: true })).toHaveLength(2)
  })
})

describe('trash, restore, and delete forever', () => {
  beforeEach(async () => {
    await saveRecording(makeRecording())
  })

  it('trash sets deletedAt and keeps the rest of the recording', async () => {
    const now = new Date(2026, 10, 1, 9)
    const trashed = await trashRecording('week9', now)
    expect(trashed.deletedAt).toEqual(now)
    const stored = await getRecording('week9')
    expect(stored.deletedAt).toBeInstanceOf(Date)
    expect(stored.title).toBe('Week 9 · Thematic analysis')
  })

  it('restore clears deletedAt and the recording lists again', async () => {
    await trashRecording('week9')
    await restoreRecording('week9')
    expect((await getRecording('week9')).deletedAt).toBeNull()
    expect(await listRecordings()).toHaveLength(1)
  })

  it('trash and restore throw for a recording that does not exist', async () => {
    await expect(trashRecording('missing')).rejects.toThrow('no recording with id missing')
    await expect(restoreRecording('missing')).rejects.toThrow('no recording with id missing')
  })

  it('delete forever removes the recording', async () => {
    await deleteRecordingForever('week9')
    expect(await getRecording('week9')).toBeUndefined()
    expect(await listRecordings({ includeDeleted: true })).toEqual([])
  })
})
