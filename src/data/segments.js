// transcript segments in the indexeddb store: timed lines of text inside a recording

import { abortTransaction, openDatabase } from './db.js'
import { announceChange } from './events.js'
import { assertNonNegativeNumber, assertObject, assertText } from './validate.js'

/**
 * check a segment and copy only the fields the store keeps. a segment without an id gets a new one.
 * @param {unknown} segment segment with recordingId, index, startSeconds, endSeconds, text,
 *   and an optional id
 * @returns {{ id: string, recordingId: string, index: number, startSeconds: number,
 *   endSeconds: number, text: string }} the segment to store
 * @throws {TypeError} when a field is missing or the text is empty
 * @throws {RangeError} when index is not a whole number of 0 or more, a time is negative,
 *   or the segment ends before it starts
 */
export function normalizeSegment(segment) {
  assertObject(segment, 'segment')
  const id = segment.id ?? crypto.randomUUID()
  assertText(id, 'segment id')
  const label = `segment ${id}`
  assertText(segment.recordingId, `${label} recordingId`)
  if (!Number.isInteger(segment.index) || segment.index < 0) {
    throw new RangeError(
      `${label} index must be a whole number of 0 or more, got ${String(segment.index)}`
    )
  }
  assertNonNegativeNumber(segment.startSeconds, `${label} startSeconds`)
  assertNonNegativeNumber(segment.endSeconds, `${label} endSeconds`)
  if (segment.endSeconds < segment.startSeconds) {
    throw new RangeError(
      `${label} ends at ${segment.endSeconds} seconds, before it starts at ${segment.startSeconds}`
    )
  }
  assertText(segment.text, `${label} text`)
  return {
    id,
    recordingId: segment.recordingId,
    index: segment.index,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
  }
}

/**
 * read one segment by id.
 * @param {string} id segment id
 * @returns {Promise<object | undefined>} the segment, or undefined when there is none
 * @throws {TypeError} when id is not a non empty string
 */
export async function getSegment(id) {
  assertText(id, 'segment id')
  const database = await openDatabase()
  return database.get('segments', id)
}

/**
 * list the segments of one recording through the recordingId index, in transcript order.
 * @param {string} recordingId recording id
 * @returns {Promise<object[]>} the segments, sorted by index
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function listSegmentsForRecording(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  const segments = await database.getAllFromIndex('segments', 'recordingId', recordingId)
  return segments.sort((first, second) => first.index - second.index)
}

/**
 * replace every segment of a recording with a new list, in one transaction, so a reader never
 * sees half of an old transcript mixed with a new one. segments without a recordingId take
 * the one passed in.
 * @param {string} recordingId recording the transcript belongs to
 * @param {object[]} segments the full new transcript, possibly empty
 * @returns {Promise<object[]>} the segments as stored
 * @throws {TypeError} when a segment fails validation, names another recording, or the
 *   recording does not exist
 * @throws {RangeError} when a segment has bad times or index
 */
export async function saveSegments(recordingId, segments) {
  assertText(recordingId, 'recordingId')
  if (!Array.isArray(segments)) {
    throw new TypeError(`segments for ${recordingId} must be an array, got ${String(segments)}`)
  }
  // validate everything before the transaction opens, so a bad segment writes nothing
  const stored = segments.map((segment) => {
    assertObject(segment, 'segment')
    const normalized = normalizeSegment({ recordingId, ...segment })
    if (normalized.recordingId !== recordingId) {
      throw new TypeError(
        `segment ${normalized.id} belongs to ${normalized.recordingId}, not recording ${recordingId}`
      )
    }
    return normalized
  })

  const database = await openDatabase()
  const transaction = database.transaction(['recordings', 'segments'], 'readwrite')
  const recording = await transaction.objectStore('recordings').get(recordingId)
  if (!recording) {
    await abortTransaction(transaction)
    throw new TypeError(`segments point to recording ${recordingId}, which does not exist`)
  }
  const segmentStore = transaction.objectStore('segments')
  const oldIds = await segmentStore.index('recordingId').getAllKeys(recordingId)
  await Promise.all([
    ...oldIds.map((id) => segmentStore.delete(id)),
    ...stored.map((segment) => segmentStore.put(segment)),
    transaction.done,
  ])
  announceChange('segments', recordingId)
  return stored
}

/**
 * remove every segment of a recording. a recording with no segments is left as it is.
 * @param {string} recordingId recording id
 * @returns {Promise<void>} resolves once the segments are gone
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function deleteSegments(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  const transaction = database.transaction('segments', 'readwrite')
  const ids = await transaction.store.index('recordingId').getAllKeys(recordingId)
  await Promise.all([...ids.map((id) => transaction.store.delete(id)), transaction.done])
  announceChange('segments', recordingId)
}
