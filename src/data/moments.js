// moments in the indexeddb store: marked points in time inside a recording

import { abortTransaction, openDatabase } from './db.js'
import { announceChange } from './events.js'
import { courseColors } from '../lib/format.js'
import { assertNonNegativeNumber, assertObject, assertText } from './validate.js'

/**
 * check a moment and copy only the fields the store keeps. a moment without an id gets a new one.
 * @param {unknown} moment moment with recordingId, atSeconds, label, color, and an optional id
 * @returns {{ id: string, recordingId: string, atSeconds: number, label: string, color: string }}
 *   the moment to store
 * @throws {TypeError} when a field is missing or the color is not a course color
 * @throws {RangeError} when atSeconds is negative or not a finite number
 */
export function normalizeMoment(moment) {
  assertObject(moment, 'moment')
  const id = moment.id ?? crypto.randomUUID()
  assertText(id, 'moment id')
  const label = `moment ${id}`
  assertText(moment.recordingId, `${label} recordingId`)
  assertNonNegativeNumber(moment.atSeconds, `${label} atSeconds`)
  assertText(moment.label, `${label} label`)
  if (!courseColors.includes(moment.color)) {
    throw new TypeError(
      `${label} color must be one of ${courseColors.join(', ')}, got ${String(moment.color)}`
    )
  }
  return {
    id,
    recordingId: moment.recordingId,
    atSeconds: moment.atSeconds,
    label: moment.label,
    color: moment.color,
  }
}

/**
 * read one moment by id.
 * @param {string} id moment id
 * @returns {Promise<object | undefined>} the moment, or undefined when there is none
 * @throws {TypeError} when id is not a non empty string
 */
export async function getMoment(id) {
  assertText(id, 'moment id')
  const database = await openDatabase()
  return database.get('moments', id)
}

/**
 * list the moments of one recording through the recordingId index, earliest first.
 * @param {string} recordingId recording id
 * @returns {Promise<object[]>} the moments
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function listMomentsForRecording(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  const moments = await database.getAllFromIndex('moments', 'recordingId', recordingId)
  return moments.sort((first, second) => first.atSeconds - second.atSeconds)
}

/**
 * add a moment or replace the one with the same id. the recording check and the write
 * share one transaction.
 * @param {object} moment moment with recordingId, atSeconds, label, and color
 * @returns {Promise<object>} the moment as stored
 * @throws {TypeError} when the moment fails validation or its recording does not exist
 * @throws {RangeError} when atSeconds is negative
 */
export async function saveMoment(moment) {
  const stored = normalizeMoment(moment)
  const database = await openDatabase()
  const transaction = database.transaction(['recordings', 'moments'], 'readwrite')
  const recording = await transaction.objectStore('recordings').get(stored.recordingId)
  if (!recording) {
    await abortTransaction(transaction)
    throw new TypeError(
      `moment ${stored.id} points to recording ${stored.recordingId}, which does not exist`
    )
  }
  await transaction.objectStore('moments').put(stored)
  await transaction.done
  announceChange('moments', stored.id)
  return stored
}

/**
 * remove one moment. removing a moment that does not exist does nothing.
 * @param {string} id moment id
 * @returns {Promise<void>} resolves once the moment is gone
 * @throws {TypeError} when id is not a non empty string
 */
export async function deleteMoment(id) {
  assertText(id, 'moment id')
  const database = await openDatabase()
  await database.delete('moments', id)
  announceChange('moments', id)
}
