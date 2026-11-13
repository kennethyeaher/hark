// notes in the indexeddb store: one note document per recording

import { abortTransaction, openDatabase } from './db.js'
import { announceChange } from './events.js'
import { assertDate, assertObject, assertText } from './validate.js'

/**
 * check a note and copy only the fields the store keeps. an empty body is allowed,
 * because clearing a note is a normal edit.
 * @param {unknown} note note with recordingId, body, and an optional updatedAt
 * @param {Date} [now] time used for updatedAt when it is missing
 * @returns {{ recordingId: string, body: string, updatedAt: Date }} the note to store
 * @throws {TypeError} when recordingId is missing, body is not a string, or updatedAt is not a Date
 */
export function normalizeNote(note, now = new Date()) {
  assertObject(note, 'note')
  assertText(note.recordingId, 'note recordingId')
  if (typeof note.body !== 'string') {
    throw new TypeError(
      `note for ${note.recordingId} body must be a string, got ${String(note.body)}`
    )
  }
  const updatedAt = note.updatedAt ?? now
  assertDate(updatedAt, `note for ${note.recordingId} updatedAt`)
  return { recordingId: note.recordingId, body: note.body, updatedAt }
}

/**
 * read the note for one recording.
 * @param {string} recordingId recording id
 * @returns {Promise<object | undefined>} the note, or undefined when the recording has none
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function getNote(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  return database.get('notes', recordingId)
}

/**
 * list every note in the store, one per recording that has one.
 * @returns {Promise<object[]>} the notes
 */
export async function listNotes() {
  const database = await openDatabase()
  return database.getAll('notes')
}

/**
 * add or replace the note for a recording. the recording check and the write share one
 * transaction.
 * @param {object} note note with recordingId and body
 * @returns {Promise<object>} the note as stored
 * @throws {TypeError} when the note fails validation or its recording does not exist
 */
export async function saveNote(note) {
  const stored = normalizeNote(note)
  const database = await openDatabase()
  const transaction = database.transaction(['recordings', 'notes'], 'readwrite')
  const recording = await transaction.objectStore('recordings').get(stored.recordingId)
  if (!recording) {
    await abortTransaction(transaction)
    throw new TypeError(`note points to recording ${stored.recordingId}, which does not exist`)
  }
  await transaction.objectStore('notes').put(stored)
  await transaction.done
  announceChange('notes', stored.recordingId)
  return stored
}

/**
 * remove the note for a recording. removing a note that does not exist does nothing.
 * @param {string} recordingId recording id
 * @returns {Promise<void>} resolves once the note is gone
 * @throws {TypeError} when recordingId is not a non empty string
 */
export async function deleteNote(recordingId) {
  assertText(recordingId, 'recordingId')
  const database = await openDatabase()
  await database.delete('notes', recordingId)
  announceChange('notes', recordingId)
}
