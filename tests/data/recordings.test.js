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
  updateRecordingStatus,
} from '../../src/data/recordings.js'
import { getNote, saveNote } from '../../src/data/notes.js'
import { listMomentsForRecording, saveMoment } from '../../src/data/moments.js'
import { getAudio, saveAudio } from '../../src/data/audio.js'
import { listSegmentsForRecording, saveSegments } from '../../src/data/segments.js'

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
    model: 'balanced',
    errorMessage: null,
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
    id: 'inst630',
    code: 'INST 630',
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
    const saved = await saveRecording({ title: 'Lecture 1', courseId: 'inst630' })
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(saved).toMatchObject({
      durationSeconds: 0,
      status: 'queued',
      progress: 0,
      isStarred: false,
      deletedAt: null,
      model: 'balanced',
      errorMessage: null,
    })
    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(await getRecording(saved.id)).toEqual(saved)
  })

  it('keeps a model choice and an error message', async () => {
    await saveRecording(
      makeRecording({ model: 'fast', status: 'failed', errorMessage: 'decoding failed' })
    )
    expect(await getRecording('week9')).toMatchObject({
      model: 'fast',
      status: 'failed',
      errorMessage: 'decoding failed',
    })
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
      'an unknown model',
      { model: 'huge' },
      TypeError,
      /model must be one of fast, balanced, accurate, got huge/,
    ],
    [
      'an errorMessage that is not a string',
      { errorMessage: 42 },
      TypeError,
      /errorMessage must be a string or null, got 42/,
    ],
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
      makeRecording({ id: 'lecture17', courseId: 'inst630', recordedAt: new Date(2026, 9, 27) })
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
    expect((await listRecordingsForCourse('inst630')).map((recording) => recording.id)).toEqual([
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

describe('delete forever with notes and moments', () => {
  it('removes the recording, its note, and its moments, and leaves other recordings alone', async () => {
    await saveRecording(makeRecording({ id: 'week9' }))
    await saveRecording(makeRecording({ id: 'week8' }))
    await saveNote({ recordingId: 'week9', body: 'gone soon' })
    await saveNote({ recordingId: 'week8', body: 'stays' })
    await saveMoment({ id: 'a', recordingId: 'week9', atSeconds: 10, label: 'A', color: 'teal' })
    await saveMoment({ id: 'b', recordingId: 'week9', atSeconds: 20, label: 'B', color: 'teal' })
    await saveMoment({ id: 'c', recordingId: 'week8', atSeconds: 30, label: 'C', color: 'teal' })

    await deleteRecordingForever('week9')

    expect(await getRecording('week9')).toBeUndefined()
    expect(await getNote('week9')).toBeUndefined()
    expect(await listMomentsForRecording('week9')).toEqual([])
    expect(await getRecording('week8')).toBeDefined()
    expect((await getNote('week8')).body).toBe('stays')
    expect((await listMomentsForRecording('week8')).map((stored) => stored.id)).toEqual(['c'])
  })

  it('removes the audio and segments too, and leaves other recordings alone', async () => {
    await saveRecording(makeRecording({ id: 'week9' }))
    await saveRecording(makeRecording({ id: 'week8' }))
    for (const recordingId of ['week9', 'week8']) {
      const file = new File([new Uint8Array([1])], `${recordingId}.wav`, { type: 'audio/wav' })
      await saveAudio({ recordingId, blob: file })
      await saveSegments(recordingId, [
        { index: 0, startSeconds: 0, endSeconds: 2, text: 'First line.' },
        { index: 1, startSeconds: 2, endSeconds: 5, text: 'Second line.' },
      ])
    }

    await deleteRecordingForever('week9')

    expect(await getAudio('week9')).toBeUndefined()
    expect(await listSegmentsForRecording('week9')).toEqual([])
    expect((await getAudio('week8')).name).toBe('week8.wav')
    expect(await listSegmentsForRecording('week8')).toHaveLength(2)
  })

  it('does nothing when the recording does not exist', async () => {
    await expect(deleteRecordingForever('missing')).resolves.toBeUndefined()
  })
})

describe('updateRecordingStatus', () => {
  it('changes status, progress, and the error message, and keeps every other field', async () => {
    await saveRecording(makeRecording({ status: 'queued', progress: 0 }))
    const stored = await updateRecordingStatus('week9', {
      status: 'failed',
      progress: 0.5,
      errorMessage: 'This file could not be read as audio',
    })
    expect(stored.status).toBe('failed')
    expect(stored.progress).toBe(0.5)
    expect(stored.errorMessage).toBe('This file could not be read as audio')
    expect((await getRecording('week9')).title).toBe('Week 9 · Thematic analysis')
  })

  it('refuses fields other than status, progress, and errorMessage', async () => {
    await saveRecording(makeRecording())
    await expect(updateRecordingStatus('week9', { title: 'Renamed' })).rejects.toThrow(
      /can only set status, progress, errorMessage, got title/
    )
    expect((await getRecording('week9')).title).toBe('Week 9 · Thematic analysis')
  })

  it('rejects a bad status, bad progress, and a missing recording', async () => {
    await saveRecording(makeRecording())
    await expect(updateRecordingStatus('week9', { status: 'paused' })).rejects.toThrow(TypeError)
    await expect(updateRecordingStatus('week9', { progress: 2 })).rejects.toThrow(RangeError)
    await expect(updateRecordingStatus('missing', { progress: 0 })).rejects.toThrow(
      'no recording with id missing'
    )
    await expect(updateRecordingStatus('week9', null)).rejects.toThrow(/must be an object/)
  })
})
