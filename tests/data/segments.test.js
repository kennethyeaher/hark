import { beforeEach, describe, expect, it } from 'vitest'
import { dataEvents } from '../../src/data/events.js'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { getRecording, saveRecording } from '../../src/data/recordings.js'
import {
  deleteSegments,
  getSegment,
  listSegmentsForRecording,
  normalizeSegment,
  saveSegments,
  updateSegmentTexts,
} from '../../src/data/segments.js'

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({ id: 'inst630', code: 'INST 630', name: 'Information Ethics', color: 'teal' })
  await saveRecording({ id: 'lecture17', title: 'Lecture 17', courseId: 'inst630' })
  await saveRecording({ id: 'lecture16', title: 'Lecture 16', courseId: 'inst630' })
})

/**
 * build a valid segment with fields that a test can override.
 * @param {object} [overrides] fields to replace
 * @returns {object} the segment
 */
function makeSegment(overrides = {}) {
  return {
    id: 'lecture17-0',
    recordingId: 'lecture17',
    index: 0,
    startSeconds: 0,
    endSeconds: 4.5,
    text: 'Welcome back to week ten.',
    ...overrides,
  }
}

describe('segments', () => {
  it('saves segments and lists them in index order', async () => {
    await saveSegments('lecture17', [
      makeSegment({ id: 'b', index: 1, startSeconds: 4.5, endSeconds: 9, text: 'Second.' }),
      makeSegment({ id: 'a' }),
    ])
    const stored = await listSegmentsForRecording('lecture17')
    expect(stored.map((segment) => segment.id)).toEqual(['a', 'b'])
    expect(await getSegment('b')).toEqual({
      id: 'b',
      recordingId: 'lecture17',
      index: 1,
      startSeconds: 4.5,
      endSeconds: 9,
      text: 'Second.',
    })
  })

  it('fills the recordingId and a new id when a segment has none', async () => {
    const [saved] = await saveSegments('lecture17', [
      { index: 0, startSeconds: 0, endSeconds: 1, text: 'Hi.' },
    ])
    expect(saved.recordingId).toBe('lecture17')
    expect(saved.id).toEqual(expect.any(String))
  })

  it('replaces the old transcript instead of appending to it', async () => {
    await saveSegments('lecture17', [
      makeSegment({ id: 'old0' }),
      makeSegment({ id: 'old1', index: 1 }),
    ])
    await saveSegments('lecture16', [makeSegment({ id: 'other', recordingId: 'lecture16' })])
    await saveSegments('lecture17', [makeSegment({ id: 'new0', text: 'New text.' })])
    expect((await listSegmentsForRecording('lecture17')).map((segment) => segment.id)).toEqual([
      'new0',
    ])
    expect((await listSegmentsForRecording('lecture16')).map((segment) => segment.id)).toEqual([
      'other',
    ])
  })

  it('clears a transcript with an empty list and with deleteSegments', async () => {
    await saveSegments('lecture17', [makeSegment()])
    await saveSegments('lecture17', [])
    expect(await listSegmentsForRecording('lecture17')).toEqual([])
    await saveSegments('lecture17', [makeSegment()])
    await deleteSegments('lecture17')
    expect(await listSegmentsForRecording('lecture17')).toEqual([])
  })

  it('writes nothing when one segment in the list is invalid', async () => {
    await saveSegments('lecture17', [makeSegment({ id: 'keep' })])
    await expect(
      saveSegments('lecture17', [makeSegment({ id: 'x' }), makeSegment({ id: 'y', text: '' })])
    ).rejects.toThrow(/segment y text/)
    expect((await listSegmentsForRecording('lecture17')).map((segment) => segment.id)).toEqual([
      'keep',
    ])
  })

  it('rejects segments for a missing recording or another recording', async () => {
    await expect(
      saveSegments('missing', [makeSegment({ recordingId: 'missing' })])
    ).rejects.toThrow(/recording missing, which does not exist/)
    await expect(
      saveSegments('lecture17', [makeSegment({ recordingId: 'lecture16' })])
    ).rejects.toThrow(/belongs to lecture16, not recording lecture17/)
    await expect(saveSegments('lecture17', 'text')).rejects.toThrow(/must be an array/)
  })

  it.each([
    [{ startSeconds: 5, endSeconds: 4 }, /ends at 4 seconds, before it starts at 5/],
    [{ startSeconds: -1 }, /startSeconds must be a finite number of 0 or more/],
    [{ endSeconds: -2, startSeconds: 0 }, /endSeconds must be a finite number of 0 or more/],
    [{ text: '' }, /text must be a non empty string/],
    [{ text: '   ' }, /text must be a non empty string/],
    [{ index: 1.5 }, /index must be a whole number/],
    [{ index: -1 }, /index must be a whole number/],
    [{ recordingId: '' }, /recordingId must be a non empty string/],
  ])('rejects a segment with %j', (overrides, message) => {
    expect(() => normalizeSegment(makeSegment(overrides))).toThrow(message)
  })

  it('allows a segment that starts and ends at the same time', () => {
    expect(normalizeSegment(makeSegment({ startSeconds: 3, endSeconds: 3 })).endSeconds).toBe(3)
  })
})

describe('saveSegments with status changes', () => {
  it('writes the segments and the recording progress together', async () => {
    await saveSegments('lecture17', [makeSegment()], { status: 'transcribing', progress: 0.4 })
    const recording = await getRecording('lecture17')
    expect(recording.status).toBe('transcribing')
    expect(recording.progress).toBe(0.4)
    expect(await listSegmentsForRecording('lecture17')).toHaveLength(1)
  })

  it('writes nothing when the status changes are invalid', async () => {
    await expect(saveSegments('lecture17', [makeSegment()], { progress: 1.5 })).rejects.toThrow(
      RangeError
    )
    await expect(saveSegments('lecture17', [makeSegment()], { title: 'x' })).rejects.toThrow(
      /can only set/
    )
    expect(await listSegmentsForRecording('lecture17')).toEqual([])
    expect((await getRecording('lecture17')).progress).toBe(0)
  })
})

describe('updateSegmentTexts', () => {
  beforeEach(async () => {
    await saveSegments('lecture17', [
      makeSegment({ id: 'a', index: 0, text: 'First.' }),
      makeSegment({ id: 'b', index: 1, startSeconds: 4.5, endSeconds: 9, text: 'Second.' }),
    ])
    await saveSegments('lecture16', [makeSegment({ id: 'other', recordingId: 'lecture16' })])
  })

  it('changes only the text, trimmed, in one write, and announces segments', async () => {
    const events = []
    const listener = (event) => events.push(event.detail)
    dataEvents.addEventListener('change', listener)
    const updated = await updateSegmentTexts('lecture17', [
      { id: 'b', text: '  Second, fixed.  ' },
      { id: 'a', text: 'First, fixed.' },
    ])
    dataEvents.removeEventListener('change', listener)
    expect(updated.map((segment) => segment.id)).toEqual(['b', 'a'])
    expect(events).toEqual([{ store: 'segments', id: 'lecture17' }])
    expect(await getSegment('b')).toEqual(
      makeSegment({ id: 'b', index: 1, startSeconds: 4.5, endSeconds: 9, text: 'Second, fixed.' })
    )
    expect((await getSegment('a')).text).toBe('First, fixed.')
  })

  it('does nothing for an empty list', async () => {
    const events = []
    const listener = (event) => events.push(event.detail)
    dataEvents.addEventListener('change', listener)
    expect(await updateSegmentTexts('lecture17', [])).toEqual([])
    dataEvents.removeEventListener('change', listener)
    expect(events).toEqual([])
  })

  it('rejects bad changes before writing', async () => {
    await expect(updateSegmentTexts('lecture17', 'a')).rejects.toThrow(/must be an array/)
    await expect(updateSegmentTexts('lecture17', [{ id: 'a', text: '   ' }])).rejects.toThrow(
      /text must be a non empty/
    )
    await expect(updateSegmentTexts('lecture17', [{ id: '', text: 'x' }])).rejects.toThrow(/id/)
    await expect(
      updateSegmentTexts('lecture17', [
        { id: 'a', text: 'one' },
        { id: 'a', text: 'two' },
      ])
    ).rejects.toThrow(/appears twice/)
    expect((await getSegment('a')).text).toBe('First.')
  })

  it('writes nothing when one id is unknown or from another recording', async () => {
    await expect(
      updateSegmentTexts('lecture17', [
        { id: 'a', text: 'changed' },
        { id: 'missing', text: 'x' },
      ])
    ).rejects.toThrow(/does not exist/)
    await expect(
      updateSegmentTexts('lecture17', [
        { id: 'a', text: 'changed' },
        { id: 'other', text: 'x' },
      ])
    ).rejects.toThrow(/belongs to lecture16/)
    expect((await getSegment('a')).text).toBe('First.')
    expect((await getSegment('other')).text).toBe('Welcome back to week ten.')
  })
})
