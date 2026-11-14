// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRecordingTitle, readAudioDuration } from '../src/lib/audio-file.js'

describe('buildRecordingTitle', () => {
  it.each([
    ['lecture-18_qualitative-coding.m4a', 'lecture 18 qualitative coding'],
    ['Week 9 · Thematic analysis.mp3', 'Week 9 · Thematic analysis'],
    ['notes.from.class.wav', 'notes.from.class'],
    ['no extension', 'no extension'],
    ['--__.mp3', 'Untitled recording'],
    ['.hidden', '.hidden'],
  ])('turns %j into %j', (fileName, title) => {
    expect(buildRecordingTitle(fileName)).toBe(title)
  })

  it('rejects a name that is not a string', () => {
    expect(() => buildRecordingTitle(undefined)).toThrow(TypeError)
  })
})

/** a fake audio element that the test drives by firing its events */
class FakeAudio extends EventTarget {
  /** start with no length, like an element before metadata loads */
  constructor() {
    super()
    this.duration = Number.NaN
    this.error = null
    this.currentTime = 0
    this.src = ''
  }

  /**
   * forget the source.
   * @returns {void}
   */
  removeAttribute() {
    this.src = ''
  }
}

let audio

beforeEach(() => {
  audio = new FakeAudio()
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * start reading the length of a small file with the fake element.
 * @param {object} [options] extra options
 * @returns {Promise<number>} the read
 */
function startRead(options = {}) {
  const file = new File([new Uint8Array(4)], 'lecture.mp3', { type: 'audio/mpeg' })
  return readAudioDuration(file, { createAudioElement: () => audio, ...options })
}

describe('readAudioDuration', () => {
  it('resolves with the metadata length and revokes the object url', async () => {
    const read = startRead()
    expect(audio.src).toBe('blob:fake')
    audio.duration = 3480.5
    audio.dispatchEvent(new Event('loadedmetadata'))
    await expect(read).resolves.toBe(3480.5)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('seeks to the end when a recorder file reports an endless length', async () => {
    const read = startRead()
    audio.duration = Infinity
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(Number.MAX_SAFE_INTEGER)
    audio.duration = 95
    audio.dispatchEvent(new Event('durationchange'))
    await expect(read).resolves.toBe(95)
  })

  it('rejects when the browser cannot read the file', async () => {
    const read = startRead()
    audio.error = { message: 'DEMUXER_ERROR_COULD_NOT_OPEN' }
    audio.dispatchEvent(new Event('error'))
    await expect(read).rejects.toThrow('DEMUXER_ERROR_COULD_NOT_OPEN')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('rejects a length of zero', async () => {
    const read = startRead()
    audio.duration = 0
    audio.dispatchEvent(new Event('loadedmetadata'))
    await expect(read).rejects.toThrow('length of zero')
  })

  it('rejects after the timeout when no metadata arrives', async () => {
    vi.useFakeTimers()
    const read = startRead({ timeoutMilliseconds: 1000 })
    vi.advanceTimersByTime(1000)
    await expect(read).rejects.toThrow('took too long')
  })

  it('rejects input that is not a file', () => {
    expect(() => readAudioDuration('lecture.mp3')).toThrow(TypeError)
  })
})
