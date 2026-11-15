// audio playback for one recording, with a small state and subscription api

/** playback speeds the speed menu offers */
export const playbackRates = [0.75, 1, 1.25, 1.5, 2]

const unplayableMessage = 'This audio could not be played in this browser.'

/**
 * turn a media duration into a usable number, since it is NaN or Infinity before metadata loads.
 * @param {number} value the duration reported by the audio element
 * @returns {number} the duration, or 0 when it is not a finite number
 */
function cleanDuration(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * create a player for an audio blob.
 * @param {Blob} blob the audio to play
 * @param {object} [options] injection points, used by tests
 * @param {HTMLAudioElement} [options.audio] the audio element to drive
 * @param {(blob: Blob) => string} [options.createObjectURL] makes the object url
 * @param {(url: string) => void} [options.revokeObjectURL] releases the object url
 * @param {(callback: FrameRequestCallback) => number} [options.requestAnimationFrame] schedules a frame
 * @param {(handle: number) => void} [options.cancelAnimationFrame] cancels a frame
 * @returns {{
 *   play: () => Promise<void>,
 *   pause: () => void,
 *   toggle: () => Promise<void>,
 *   seek: (seconds: number) => void,
 *   skip: (deltaSeconds: number) => void,
 *   setRate: (rate: number) => void,
 *   getState: () => { currentTime: number, duration: number, isPlaying: boolean, rate: number, errorMessage: string },
 *   subscribe: (listener: Function) => () => void,
 *   destroy: () => void
 * }} the player controls
 * @throws {TypeError} when blob is missing
 */
export function createPlayer(blob, options = {}) {
  if (!blob) {
    throw new TypeError('blob is required to create a player')
  }
  const audio = options.audio ?? new Audio()
  const urlApi = {
    create: options.createObjectURL ?? ((value) => URL.createObjectURL(value)),
    revoke: options.revokeObjectURL ?? ((value) => URL.revokeObjectURL(value)),
  }
  const requestFrame =
    options.requestAnimationFrame ?? ((callback) => requestAnimationFrame(callback))
  const cancelFrame = options.cancelAnimationFrame ?? ((handle) => cancelAnimationFrame(handle))

  const listeners = new Set()
  let isDestroyed = false
  let frameHandle = null
  let errorMessage = ''
  let lastKey = ''

  const objectUrl = urlApi.create(blob)
  audio.preload = 'metadata'
  audio.src = objectUrl

  /**
   * read the current state from the audio element.
   * @returns {{ currentTime: number, duration: number, isPlaying: boolean, rate: number, errorMessage: string }} the state
   */
  function getState() {
    return {
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: cleanDuration(audio.duration),
      isPlaying: !audio.paused && !audio.ended,
      rate: audio.playbackRate || 1,
      errorMessage,
    }
  }

  /**
   * tell listeners the state, but only when something they show has changed.
   * @param {boolean} [force] notify even when nothing changed
   * @returns {void}
   */
  function notify(force = false) {
    if (isDestroyed) return
    const state = getState()
    const key = `${state.currentTime}|${state.duration}|${state.isPlaying}|${state.rate}|${state.errorMessage}`
    if (!force && key === lastKey) return
    lastKey = key
    for (const listener of [...listeners]) listener(state)
  }

  /**
   * run one animation frame: report the time, then schedule the next while playing.
   * @returns {void}
   */
  function tick() {
    frameHandle = null
    if (isDestroyed) return
    notify()
    if (getState().isPlaying) frameHandle = requestFrame(tick)
  }

  /**
   * start the frame loop if it is not already running.
   * @returns {void}
   */
  function startLoop() {
    if (frameHandle === null && !isDestroyed) frameHandle = requestFrame(tick)
  }

  /**
   * stop the frame loop.
   * @returns {void}
   */
  function stopLoop() {
    if (frameHandle !== null) {
      cancelFrame(frameHandle)
      frameHandle = null
    }
  }

  /**
   * record a playback failure as a plain message.
   * @returns {void}
   */
  function reportError() {
    errorMessage = unplayableMessage
    stopLoop()
    notify()
  }

  /**
   * handle play and pause events from the element, which can come from outside this player.
   * @returns {void}
   */
  function handlePlayState() {
    if (getState().isPlaying) startLoop()
    else stopLoop()
    notify()
  }

  const handlers = {
    timeupdate: () => notify(),
    seeked: () => notify(),
    loadedmetadata: () => notify(),
    durationchange: () => notify(),
    ratechange: () => notify(),
    play: handlePlayState,
    playing: handlePlayState,
    pause: handlePlayState,
    ended: handlePlayState,
    error: reportError,
  }
  for (const [name, handler] of Object.entries(handlers)) audio.addEventListener(name, handler)

  return {
    /**
     * start playback.
     * @returns {Promise<void>} resolves once playing, or after an error is reported
     */
    async play() {
      if (isDestroyed) return
      try {
        await audio.play()
        errorMessage = ''
      } catch (error) {
        // a pause that interrupts a pending play is not a failure
        if (error?.name === 'AbortError') return
        reportError()
        return
      }
      handlePlayState()
    },

    /**
     * pause playback.
     * @returns {void}
     */
    pause() {
      if (isDestroyed) return
      audio.pause()
      handlePlayState()
    },

    /**
     * play when paused, pause when playing.
     * @returns {Promise<void>} resolves when the change is done
     */
    async toggle() {
      if (isDestroyed) return
      if (getState().isPlaying) this.pause()
      else await this.play()
    },

    /**
     * jump to a time, clamped to 0 and the duration.
     * @param {number} seconds target time in seconds
     * @returns {void}
     * @throws {TypeError} when seconds is not a number
     */
    seek(seconds) {
      if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
        throw new TypeError(`seconds must be a number, got ${String(seconds)}`)
      }
      if (isDestroyed) return
      const { duration } = getState()
      const upper = duration > 0 ? duration : Infinity
      audio.currentTime = Math.min(Math.max(seconds, 0), upper)
      notify()
    },

    /**
     * move the position by an offset, clamped like seek.
     * @param {number} deltaSeconds seconds to move, negative to go back
     * @returns {void}
     */
    skip(deltaSeconds) {
      if (isDestroyed) return
      this.seek(getState().currentTime + deltaSeconds)
    },

    /**
     * change the playback speed.
     * @param {number} rate one of the values in playbackRates
     * @returns {void}
     * @throws {RangeError} when rate is not an allowed speed
     */
    setRate(rate) {
      if (!playbackRates.includes(rate)) {
        throw new RangeError(`rate must be one of ${playbackRates.join(', ')}, got ${String(rate)}`)
      }
      if (isDestroyed) return
      audio.playbackRate = rate
      notify()
    },

    getState,

    /**
     * listen for state changes.
     * @param {(state: object) => void} listener called with the state when it changes
     * @returns {() => void} a function that removes the listener
     * @throws {TypeError} when listener is not a function
     */
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('listener must be a function')
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /**
     * stop playback and release the audio, listeners, and object url. safe to call twice.
     * @returns {void}
     */
    destroy() {
      if (isDestroyed) return
      // flag first so the pause event below does not notify anyone
      isDestroyed = true
      audio.pause()
      stopLoop()
      for (const [name, handler] of Object.entries(handlers)) {
        audio.removeEventListener(name, handler)
      }
      listeners.clear()
      // dropping the source lets the browser free the decoded audio now, not at garbage collection
      audio.removeAttribute('src')
      audio.load()
      urlApi.revoke(objectUrl)
    },
  }
}
