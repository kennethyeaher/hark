// the playback speed the listener picked last, kept in localStorage across visits

import { playbackRates } from './player.js'

const storageKey = 'hark.playbackRate'

/**
 * read the browser's localStorage, which can throw on access when site data is blocked.
 * @returns {Storage} the storage object
 */
function getBrowserStorage() {
  return window.localStorage
}

/**
 * read the saved speed, falling back to 1 when nothing valid is saved or storage throws.
 * storage throws in private mode or when blocked, so the catch is deliberate.
 * @param {() => { getItem: (key: string) => string | null }} [getStorage] returns the storage to read
 * @returns {number} one of the playback rates
 */
export function readSavedRate(getStorage = getBrowserStorage) {
  try {
    const saved = Number(getStorage().getItem(storageKey))
    return playbackRates.includes(saved) ? saved : 1
  } catch {
    return 1
  }
}

/**
 * save the speed for the next visit. a failed write only loses the memory of the choice, so it
 * is ignored and the speed still applies now.
 * @param {number} rate one of the playback rates
 * @param {() => { setItem: (key: string, value: string) => void }} [getStorage] returns the storage
 * @returns {void}
 * @throws {RangeError} when rate is not one of the playback rates
 */
export function saveRate(rate, getStorage = getBrowserStorage) {
  if (!playbackRates.includes(rate)) {
    throw new RangeError(`rate must be one of ${playbackRates.join(', ')}, got ${String(rate)}`)
  }
  try {
    getStorage().setItem(storageKey, String(rate))
  } catch {
    // private mode or full storage: the speed works for this visit only
  }
}
