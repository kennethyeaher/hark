import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer, playbackRates } from '../../src/player/player.js'

/** a fake audio element that behaves enough like the real one */
class FakeAudio extends EventTarget {
  constructor() {
    super()
    this.currentTime = 0
    this.duration = NaN
    this.paused = true
    this.ended = false
    this.playbackRate = 1
    this.playError = null
  }

  async play() {
    if (this.playError) throw this.playError
    this.paused = false
    this.dispatchEvent(new Event('play'))
  }

  pause() {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }

  /**
   * forget the source, as the real element does when its src attribute is removed.
   * @param {string} name attribute name
   * @returns {void}
   */
  removeAttribute(name) {
    if (name === 'src') this.src = ''
  }

  /**
   * count reloads, so a test can see the element was reset.
   * @returns {void}
   */
  load() {
    this.loadCount = (this.loadCount ?? 0) + 1
  }
}

let audio
let frames
let nextHandle
let revoked
let player

/** run the oldest scheduled frame, if any */
function runFrame() {
  const [handle, callback] = [...frames.entries()][0] ?? []
  if (handle === undefined) return false
  frames.delete(handle)
  callback()
  return true
}

beforeEach(() => {
  audio = new FakeAudio()
  frames = new Map()
  nextHandle = 1
  revoked = []
  player = createPlayer(new Blob(['x']), {
    audio,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: (url) => revoked.push(url),
    requestAnimationFrame: (callback) => {
      frames.set(nextHandle, callback)
      return nextHandle++
    },
    cancelAnimationFrame: (handle) => frames.delete(handle),
  })
})

describe('createPlayer', () => {
  it('points the element at the object url and starts idle', () => {
    expect(audio.src).toBe('blob:fake')
    expect(player.getState()).toEqual({
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      rate: 1,
      errorMessage: '',
    })
  })

  it('requires a blob', () => {
    expect(() => createPlayer(null, { audio })).toThrow(TypeError)
  })

  it('treats Infinity and NaN durations as 0', () => {
    audio.duration = Infinity
    expect(player.getState().duration).toBe(0)
    audio.duration = 120
    expect(player.getState().duration).toBe(120)
  })

  it('plays, reports frames while playing, and stops the loop on pause', async () => {
    const listener = vi.fn()
    player.subscribe(listener)
    await player.play()
    expect(player.getState().isPlaying).toBe(true)
    expect(frames.size).toBe(1)

    audio.currentTime = 1.5
    runFrame()
    expect(listener.mock.lastCall[0].currentTime).toBe(1.5)
    expect(frames.size).toBe(1)

    player.pause()
    expect(frames.size).toBe(0)
    expect(player.getState().isPlaying).toBe(false)
  })

  it('does not notify when nothing changed', async () => {
    await player.play()
    const listener = vi.fn()
    player.subscribe(listener)
    runFrame()
    runFrame()
    expect(listener).not.toHaveBeenCalled()
  })

  it('toggles between playing and paused', async () => {
    await player.toggle()
    expect(player.getState().isPlaying).toBe(true)
    await player.toggle()
    expect(player.getState().isPlaying).toBe(false)
  })

  it('seeks with clamping and reports while paused', () => {
    audio.duration = 100
    const listener = vi.fn()
    player.subscribe(listener)
    player.seek(40)
    expect(audio.currentTime).toBe(40)
    expect(listener.mock.lastCall[0].currentTime).toBe(40)
    player.seek(500)
    expect(audio.currentTime).toBe(100)
    player.seek(-5)
    expect(audio.currentTime).toBe(0)
    expect(() => player.seek(NaN)).toThrow(TypeError)
  })

  it('reports paused seeks that come from the element events', () => {
    const listener = vi.fn()
    player.subscribe(listener)
    audio.currentTime = 7
    audio.dispatchEvent(new Event('seeked'))
    expect(listener.mock.lastCall[0].currentTime).toBe(7)
  })

  it('skips forward and back, clamped', () => {
    audio.duration = 100
    audio.currentTime = 10
    player.skip(15)
    expect(audio.currentTime).toBe(25)
    player.skip(-60)
    expect(audio.currentTime).toBe(0)
  })

  it('sets only allowed rates', () => {
    for (const rate of playbackRates) {
      player.setRate(rate)
      expect(audio.playbackRate).toBe(rate)
    }
    expect(() => player.setRate(3)).toThrow(RangeError)
    expect(() => player.setRate('1')).toThrow(RangeError)
  })

  it('tells listeners about duration changes', () => {
    const listener = vi.fn()
    player.subscribe(listener)
    audio.duration = 60
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(listener.mock.lastCall[0].duration).toBe(60)
  })

  it('unsubscribes a listener', () => {
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    unsubscribe()
    player.setRate(2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('reports an error event', () => {
    audio.dispatchEvent(new Event('error'))
    expect(player.getState().errorMessage).toBe('This audio could not be played in this browser.')
  })

  it('reports a rejected play', async () => {
    audio.playError = new DOMException('no', 'NotSupportedError')
    await player.play()
    expect(player.getState().errorMessage).toMatch(/could not be played/)
    expect(player.getState().isPlaying).toBe(false)
  })

  it('ignores an aborted play', async () => {
    audio.playError = new DOMException('interrupted', 'AbortError')
    await player.play()
    expect(player.getState().errorMessage).toBe('')
  })

  it('cleans up on destroy and ignores later calls', async () => {
    await player.play()
    const listener = vi.fn()
    player.subscribe(listener)
    player.destroy()
    expect(audio.paused).toBe(true)
    expect(frames.size).toBe(0)
    expect(revoked).toEqual(['blob:fake'])
    expect(audio.src).toBe('')
    expect(audio.loadCount).toBe(1)

    audio.dispatchEvent(new Event('seeked'))
    player.seek(5)
    player.skip(5)
    player.pause()
    await player.play()
    await player.toggle()
    player.destroy()
    expect(listener).not.toHaveBeenCalled()
    expect(revoked).toHaveLength(1)
  })
})
