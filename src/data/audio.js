// audio in the indexeddb store: the original uploaded file of each recording, kept as a blob

import { abortTransaction, openDatabase } from './db.js'
import { announceChange } from './events.js'
import { assertNonNegativeNumber, assertObject, assertText } from './validate.js'

/** the most waveform bars an audio entry may keep */
export const maxPeakCount = 400

/**
 * check a list of waveform peaks.
 * @param {unknown} peaks value to check
 * @param {string} label what the peaks belong to, used in the error message
 * @returns {number[]} a copy of the peaks
 * @throws {TypeError} when peaks is not an array
 * @throws {RangeError} when peaks is longer than maxPeakCount or holds a value that is not
 *   a finite number from 0 to 1
 */
function assertPeaks(peaks, label) {
  if (!Array.isArray(peaks)) {
    throw new TypeError(`${label} peaks must be an array, got ${String(peaks)}`)
  }
  if (peaks.length > maxPeakCount) {
    throw new RangeError(
      `${label} peaks can hold at most ${maxPeakCount} values, got ${peaks.length}`
    )
  }
  peaks.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `${label} peak ${index} must be a number from 0 to 1, got ${String(value)}`
      )
    }
  })
  return [...peaks]
}

/**
 * check an audio entry and copy only the fields the store keeps. name, type, and size are
 * read from the blob when they are missing, so a File can be passed straight in.
 * @param {unknown} audio audio with recordingId, blob, and optional name, type, size, and peaks
 * @returns {{ recordingId: string, blob: Blob, name: string, type: string, size: number,
 *   peaks?: number[] }} the audio to store, with peaks only when it had them
 * @throws {TypeError} when recordingId or name is missing, blob is not a Blob, type is
 *   not a string, or peaks is not an array
 * @throws {RangeError} when size is negative or does not match the blob, or peaks is longer
 *   than maxPeakCount or holds a value that is not a number from 0 to 1
 */
export function normalizeAudio(audio) {
  assertObject(audio, 'audio')
  assertText(audio.recordingId, 'audio recordingId')
  const label = `audio for ${audio.recordingId}`
  if (!(audio.blob instanceof Blob)) {
    throw new TypeError(`${label} blob must be a Blob or File, got ${String(audio.blob)}`)
  }

  const stored = {
    recordingId: audio.recordingId,
    blob: audio.blob,
    name: audio.name ?? audio.blob.name,
    type: audio.type ?? audio.blob.type,
    size: audio.size ?? audio.blob.size,
  }
  assertText(stored.name, `${label} name`)
  // browsers leave type empty for files they do not recognize, so an empty string is allowed
  if (typeof stored.type !== 'string') {
    throw new TypeError(`${label} type must be a string, got ${String(stored.type)}`)
  }
  assertNonNegativeNumber(stored.size, `${label} size`)
  if (stored.size !== stored.blob.size) {
    throw new RangeError(`${label} size is ${stored.size} but the blob has ${stored.blob.size}`)
  }
  if (audio.peaks !== undefined) stored.peaks = assertPeaks(audio.peaks, label)
  return stored
}

/**
 * read the audio of one recording.
 * @param {string} recordingId recording id
 * @returns {Promise<object | undefined>} the audio, or undefined when the recording has none
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function getAudio(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  return database.get('audio', recordingId)
}

/**
 * list every audio entry in the store, one per recording that has one.
 * @returns {Promise<object[]>} the audio entries, blobs included
 */
export async function listAudio() {
  const database = await openDatabase()
  return database.getAll('audio')
}

/**
 * add or replace the audio of a recording. the recording check and the write share one
 * transaction.
 * @param {object} audio audio with recordingId and blob
 * @returns {Promise<object>} the audio as stored
 * @throws {TypeError} when the audio fails validation or its recording does not exist
 * @throws {RangeError} when size is wrong
 */
export async function saveAudio(audio) {
  const stored = normalizeAudio(audio)
  const database = await openDatabase()
  const transaction = database.transaction(['recordings', 'audio'], 'readwrite')
  const recording = await transaction.objectStore('recordings').get(stored.recordingId)
  if (!recording) {
    await abortTransaction(transaction)
    throw new TypeError(`audio points to recording ${stored.recordingId}, which does not exist`)
  }
  await transaction.objectStore('audio').put(stored)
  await transaction.done
  announceChange('audio', stored.recordingId)
  return stored
}

/**
 * store waveform peaks on the audio record a recording already has, leaving the blob alone.
 * @param {string} recordingId recording id
 * @param {number[]} peaks bar heights from 0 to 1, at most maxPeakCount long
 * @returns {Promise<void>} resolves once the peaks are stored
 * @throws {TypeError} when recordingId is blank, peaks is not an array, or the recording has no audio
 * @throws {RangeError} when peaks is too long or holds a value outside 0 to 1
 */
export async function saveAudioPeaks(recordingId, peaks) {
  assertText(recordingId, 'recordingId')
  const stored = assertPeaks(peaks, `audio for ${recordingId}`)
  const database = await openDatabase()
  const transaction = database.transaction('audio', 'readwrite')
  const audio = await transaction.store.get(recordingId)
  if (!audio) {
    await abortTransaction(transaction)
    throw new TypeError(`recording ${recordingId} has no audio to save peaks on`)
  }
  await transaction.store.put({ ...audio, peaks: stored })
  await transaction.done
  announceChange('audio', recordingId)
}

/**
 * remove the audio of a recording. removing audio that does not exist does nothing.
 * @param {string} recordingId recording id
 * @returns {Promise<void>} resolves once the audio is gone
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function deleteAudio(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  await database.delete('audio', recordingId)
  announceChange('audio', recordingId)
}
