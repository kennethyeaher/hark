// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announce } from '../src/lib/announce.js'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('announce', () => {
  it('makes one polite status region on the body and writes the message to it', () => {
    announce('Removed Lecture 18.')
    const region = document.querySelector('#app-announcer')
    expect(region.getAttribute('role')).toBe('status')
    expect(region.classList.contains('visually-hidden')).toBe(true)
    expect(region.textContent).toBe('')
    vi.advanceTimersByTime(100)
    expect(region.textContent).toBe('Removed Lecture 18.')
  })

  it('reuses the region and clears it before a repeated message', () => {
    announce('Saved.')
    vi.advanceTimersByTime(100)
    announce('Saved.')
    expect(document.querySelectorAll('#app-announcer')).toHaveLength(1)
    expect(document.querySelector('#app-announcer').textContent).toBe('')
    vi.advanceTimersByTime(100)
    expect(document.querySelector('#app-announcer').textContent).toBe('Saved.')
  })

  it('rejects an empty message', () => {
    expect(() => announce('  ')).toThrow(TypeError)
  })
})
