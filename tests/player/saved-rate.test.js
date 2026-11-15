import { describe, expect, it } from 'vitest'
import { readSavedRate, saveRate } from '../../src/player/saved-rate.js'

/**
 * build an in memory storage like localStorage.
 * @returns {{ getItem: Function, setItem: Function, values: Map<string, string> }} the storage
 */
function createMemoryStorage() {
  const values = new Map()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('saved playback rate', () => {
  it('reads back a saved rate', () => {
    const storage = createMemoryStorage()
    saveRate(1.5, () => storage)
    expect(storage.values.get('hark.playbackRate')).toBe('1.5')
    expect(readSavedRate(() => storage)).toBe(1.5)
  })

  it('falls back to 1 when nothing or something invalid is saved', () => {
    const storage = createMemoryStorage()
    expect(readSavedRate(() => storage)).toBe(1)
    storage.setItem('hark.playbackRate', '3')
    expect(readSavedRate(() => storage)).toBe(1)
  })

  it('falls back to 1 when storage throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    expect(readSavedRate(blocked)).toBe(1)
    expect(() => saveRate(2, blocked)).not.toThrow()
  })

  it('rejects a rate the menu does not offer', () => {
    expect(() => saveRate(3, () => createMemoryStorage())).toThrow(RangeError)
  })
})
