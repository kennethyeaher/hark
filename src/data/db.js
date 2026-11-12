// the one indexeddb database that keeps courses and recordings on this device

import { openDB } from 'idb'

export const databaseName = 'hark'
export const databaseVersion = 2

// one shared connection, opened on first use
let databasePromise = null

/**
 * create or update the stores for a database that is moving from oldVersion to newVersion.
 * each case adds what its version introduced and falls through to the next one, so a
 * database on any older version reaches the newest without rebuilding what it has.
 * @param {import('idb').IDBPDatabase} database the database being upgraded
 * @param {number} oldVersion version on disk, 0 for a new database
 * @param {number} newVersion version being opened, so tests can stop at an older one
 * @returns {void}
 */
export function upgradeDatabase(database, oldVersion, newVersion) {
  switch (oldVersion) {
    case 0: {
      // version 1 holds courses and recordings
      database.createObjectStore('courses', { keyPath: 'id' })
      const recordings = database.createObjectStore('recordings', { keyPath: 'id' })
      recordings.createIndex('courseId', 'courseId')
      recordings.createIndex('recordedAt', 'recordedAt')
    }
    // falls through
    case 1: {
      // version 2 adds one note per recording and the moments marked inside a recording
      if (newVersion < 2) break
      database.createObjectStore('notes', { keyPath: 'recordingId' })
      const moments = database.createObjectStore('moments', { keyPath: 'id' })
      moments.createIndex('recordingId', 'recordingId')
    }
  }
}

/**
 * open the hark database, upgrading it first when it is older than this code.
 * @returns {Promise<import('idb').IDBPDatabase>} the open database, shared by every caller
 * @throws {Error} when indexeddb is missing or refuses to open, for example when storage is blocked
 */
export function openDatabase() {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser'))
  }

  const opening = openDB(databaseName, databaseVersion, {
    upgrade: upgradeDatabase,
    // another tab wants a newer version, so let go of this connection instead of blocking it
    blocking() {
      closeDatabase()
    },
    // the browser closed the connection, so the next call opens a new one
    terminated() {
      if (databasePromise === opening) databasePromise = null
    },
  })
  databasePromise = opening
  // a failed open is not kept, so the next call can try again. callers still get the rejection
  opening.catch(() => {
    if (databasePromise === opening) databasePromise = null
  })
  return opening
}

/**
 * close the shared connection if one is open. tests call this before swapping in a fresh database.
 * @returns {Promise<void>} resolves once the connection is closed
 */
export async function closeDatabase() {
  const pending = databasePromise
  databasePromise = null
  if (!pending) return
  // an open that failed has no connection to close, and its caller already got the error
  const database = await pending.catch(() => null)
  database?.close()
}

/**
 * abort a transaction on purpose and wait for it to finish, so nothing it wrote is kept.
 * @param {import('idb').IDBPTransaction} transaction the transaction to abort
 * @returns {Promise<void>} resolves once the abort is done
 * @throws {Error} any error from the transaction other than the AbortError this causes
 */
export async function abortTransaction(transaction) {
  transaction.abort()
  try {
    await transaction.done
  } catch (error) {
    if (error?.name !== 'AbortError') throw error
  }
}
