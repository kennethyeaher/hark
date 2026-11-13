// gives each test an empty fake indexeddb, so no test sees data from another

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { closeDatabase } from '../../src/data/db.js'

/**
 * close the shared connection and swap in a new, empty indexeddb factory.
 * @returns {Promise<void>} resolves once the old connection is closed
 */
export async function useFreshDatabase() {
  await closeDatabase()
  globalThis.indexedDB = new IDBFactory()
}
