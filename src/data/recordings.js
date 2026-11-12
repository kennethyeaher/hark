// recordings in the indexeddb store: read, list, save, trash, restore, and delete

import { abortTransaction, openDatabase } from './db.js'
import { assertDate, assertNonNegativeNumber, assertObject, assertText } from './validate.js'

/** every status a recording can be in, from upload to summary */
export const recordingStatuses = ['queued', 'transcribing', 'transcribed', 'summarized', 'failed']

/**
 * check a recording and copy only the fields the store keeps, filling defaults for a new one.
 * this does not check that the course exists, because that needs the database.
 * @param {unknown} recording recording to check, with or without an id
 * @param {Date} [now] time used for createdAt and recordedAt when they are missing
 * @returns {object} the recording to store
 * @throws {TypeError} when a field is missing, has the wrong type, or the status is unknown
 * @throws {RangeError} when durationSeconds is negative or progress is outside 0 to 1
 */
export function normalizeRecording(recording, now = new Date()) {
  assertObject(recording, 'recording')
  const id = recording.id ?? crypto.randomUUID()
  assertText(id, 'recording id')
  const label = `recording ${id}`

  const stored = {
    id,
    title: recording.title,
    courseId: recording.courseId,
    durationSeconds: recording.durationSeconds ?? 0,
    recordedAt: recording.recordedAt ?? now,
    createdAt: recording.createdAt ?? now,
    status: recording.status ?? 'queued',
    progress: recording.progress ?? 0,
    isStarred: recording.isStarred ?? false,
    deletedAt: recording.deletedAt ?? null,
  }

  assertText(stored.title, `${label} title`)
  assertText(stored.courseId, `${label} courseId`)
  assertNonNegativeNumber(stored.durationSeconds, `${label} durationSeconds`)
  assertDate(stored.recordedAt, `${label} recordedAt`)
  assertDate(stored.createdAt, `${label} createdAt`)
  if (!recordingStatuses.includes(stored.status)) {
    throw new TypeError(
      `${label} status must be one of ${recordingStatuses.join(', ')}, got ${String(stored.status)}`
    )
  }
  if (typeof stored.progress !== 'number' || !(stored.progress >= 0 && stored.progress <= 1)) {
    throw new RangeError(
      `${label} progress must be a number from 0 to 1, got ${String(stored.progress)}`
    )
  }
  if (typeof stored.isStarred !== 'boolean') {
    throw new TypeError(`${label} isStarred must be true or false, got ${String(stored.isStarred)}`)
  }
  if (stored.deletedAt !== null) assertDate(stored.deletedAt, `${label} deletedAt`)
  return stored
}

/**
 * list recordings, newest recordedAt first.
 * @param {{ includeDeleted?: boolean }} [options] true to keep recordings that are in Trash
 * @returns {Promise<object[]>} the recordings
 */
export async function listRecordings({ includeDeleted = false } = {}) {
  const database = await openDatabase()
  const oldestFirst = await database.getAllFromIndex('recordings', 'recordedAt')
  const newestFirst = oldestFirst.reverse()
  return includeDeleted ? newestFirst : newestFirst.filter((recording) => !recording.deletedAt)
}

/**
 * list the recordings of one course through the courseId index, newest recordedAt first.
 * @param {string} courseId course id
 * @param {{ includeDeleted?: boolean }} [options] true to keep recordings that are in Trash
 * @returns {Promise<object[]>} the course's recordings
 * @throws {TypeError} when courseId is not a non empty string
 */
export async function listRecordingsForCourse(courseId, { includeDeleted = false } = {}) {
  assertText(courseId, 'courseId')
  const database = await openDatabase()
  const recordings = await database.getAllFromIndex('recordings', 'courseId', courseId)
  recordings.sort((first, second) => second.recordedAt - first.recordedAt)
  return includeDeleted ? recordings : recordings.filter((recording) => !recording.deletedAt)
}

/**
 * read one recording by id, including one that is in Trash.
 * @param {string} id recording id
 * @returns {Promise<object | undefined>} the recording, or undefined when there is none
 * @throws {TypeError} when id is not a non empty string
 */
export async function getRecording(id) {
  assertText(id, 'recording id')
  const database = await openDatabase()
  return database.get('recordings', id)
}

/**
 * add a recording or replace the one with the same id. the course check and the write
 * share one transaction, so a course deleted in between cannot slip through.
 * @param {object} recording recording with at least title and courseId
 * @returns {Promise<object>} the recording as stored
 * @throws {TypeError} when the recording fails validation or its course does not exist
 * @throws {RangeError} when a number is out of range
 */
export async function saveRecording(recording) {
  const stored = normalizeRecording(recording)
  const database = await openDatabase()
  const transaction = database.transaction(['courses', 'recordings'], 'readwrite')
  const course = await transaction.objectStore('courses').get(stored.courseId)
  if (!course) {
    await abortTransaction(transaction)
    throw new TypeError(
      `recording ${stored.id} points to course ${stored.courseId}, which does not exist`
    )
  }
  await transaction.objectStore('recordings').put(stored)
  await transaction.done
  return stored
}

/**
 * change fields on a stored recording inside one transaction.
 * @param {string} id recording id
 * @param {(recording: object) => object} change returns the updated recording
 * @returns {Promise<object>} the recording as stored
 * @throws {Error} when there is no recording with that id
 */
async function updateRecording(id, change) {
  assertText(id, 'recording id')
  const database = await openDatabase()
  const transaction = database.transaction('recordings', 'readwrite')
  const current = await transaction.store.get(id)
  if (!current) {
    await abortTransaction(transaction)
    throw new Error(`no recording with id ${id}`)
  }
  const stored = normalizeRecording(change(current))
  await transaction.store.put(stored)
  await transaction.done
  return stored
}

/**
 * move a recording to Trash by setting deletedAt. its data stays until it is deleted forever.
 * @param {string} id recording id
 * @param {Date} [now] time to record as deletedAt
 * @returns {Promise<object>} the trashed recording
 * @throws {Error} when there is no recording with that id
 */
export function trashRecording(id, now = new Date()) {
  return updateRecording(id, (recording) => ({ ...recording, deletedAt: now }))
}

/**
 * bring a recording back from Trash by clearing deletedAt.
 * @param {string} id recording id
 * @returns {Promise<object>} the restored recording
 * @throws {Error} when there is no recording with that id
 */
export function restoreRecording(id) {
  return updateRecording(id, (recording) => ({ ...recording, deletedAt: null }))
}

/**
 * remove a recording from the store for good. nothing in the ui calls this yet.
 * @param {string} id recording id
 * @returns {Promise<void>} resolves once the recording is gone
 * @throws {TypeError} when id is not a non empty string
 */
export async function deleteRecordingForever(id) {
  assertText(id, 'recording id')
  const database = await openDatabase()
  await database.delete('recordings', id)
}
