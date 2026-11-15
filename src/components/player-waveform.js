// the player's waveform: real peaks drawn as bars, and a slider you can click, drag, or key through

import { createElement } from '../lib/dom.js'
import { describeSpokenTime } from '../lib/format.js'
import { buildBarHeights } from './waveform.js'

// one bar is 3 px wide with a 3 px gap, as in the mock
const barPitch = 6
const minimumBarCount = 12
const placeholderBarCount = 120
const arrowStepSeconds = 5
const pageStepSeconds = 30

/**
 * shrink a list of peaks to fewer bars by keeping the loudest value in each bucket, so short
 * loud moments still show. a list that already fits is copied as it is.
 * @param {number[]} peaks values from 0 to 1
 * @param {number} barCount how many bars there is room for, 1 or more
 * @returns {number[]} at most barCount values
 * @throws {TypeError} when peaks is not an array
 * @throws {RangeError} when barCount is not a whole number of 1 or more
 */
export function resamplePeaks(peaks, barCount) {
  if (!Array.isArray(peaks)) throw new TypeError('resamplePeaks needs an array of peaks')
  if (!Number.isInteger(barCount) || barCount < 1) {
    throw new RangeError(`barCount must be a whole number of 1 or more, got ${String(barCount)}`)
  }
  if (peaks.length <= barCount) return [...peaks]
  return Array.from({ length: barCount }, (_, barIndex) => {
    const start = Math.floor((barIndex * peaks.length) / barCount)
    const end = Math.max(start + 1, Math.floor(((barIndex + 1) * peaks.length) / barCount))
    return Math.max(...peaks.slice(start, end))
  })
}

/**
 * describe a position for the slider's aria value text.
 * @param {number} seconds the position
 * @param {number} durationSeconds the length of the recording
 * @returns {string} for example `13 minutes 15 seconds of 1 hour 14 minutes`
 */
export function describePosition(seconds, durationSeconds) {
  return `${describeSpokenTime(seconds)} of ${describeSpokenTime(durationSeconds)}`
}

/**
 * render the seek waveform. it is a slider: arrow keys move 5 s, Page Up and Page Down move
 * 30 s, Home and End jump to the ends, and a click or drag seeks to the pointer.
 * @param {{ peaks?: number[] | null, seed: string, durationSeconds: number,
 *   onSeek: (seconds: number) => void }} options real peaks when they exist, the seed for the
 *   placeholder bars until then, the length, and what to call with a new position
 * @returns {{ element: HTMLElement, setTime: (seconds: number) => void,
 *   setDuration: (seconds: number) => void, setPeaks: (peaks: number[]) => void,
 *   setDisabled: (isDisabled: boolean) => void, destroy: () => void }} the slider and its updates
 * @throws {TypeError} when onSeek is not a function
 */
export function renderPlayerWaveform({ peaks = null, seed, durationSeconds, onSeek }) {
  if (typeof onSeek !== 'function') throw new TypeError('renderPlayerWaveform needs onSeek')

  const bars = createElement('div', { className: 'player-waveform-bars' })
  const element = createElement(
    'div',
    {
      className: 'player-waveform',
      role: 'slider',
      tabindex: 0,
      'aria-label': 'Playback position',
      'aria-valuemin': 0,
    },
    [bars]
  )

  let duration = durationSeconds
  let currentTime = 0
  let sourcePeaks = peaks
  let isDisabled = false
  let drawnCount = 0
  let playedCount = -1

  /**
   * work out how many bars fit the current width. jsdom and a hidden element report 0, so
   * the full count is used then.
   * @param {number} available how many values there are to show
   * @returns {number} the bar count
   */
  function fitBarCount(available) {
    const width = element.clientWidth
    if (!width) return available
    return Math.max(minimumBarCount, Math.min(available, Math.floor((width + 3) / barPitch)))
  }

  /**
   * draw the bars from the real peaks, or the seeded placeholder at the pending opacity.
   * @returns {void}
   */
  function drawBars() {
    const isPending = !sourcePeaks || sourcePeaks.length === 0
    const values = isPending
      ? buildBarHeights(seed, placeholderBarCount)
      : sourcePeaks.map((value) => Math.max(0.08, value))
    const heights = resamplePeaks(values, fitBarCount(values.length))
    element.classList.toggle('is-pending', isPending)
    bars.replaceChildren(
      ...heights.map((height) => {
        const bar = createElement('span', { className: 'player-waveform-bar' })
        bar.style.height = `${Math.round(height * 100)}%`
        return bar
      })
    )
    drawnCount = heights.length
    playedCount = -1
    showTime()
  }

  /**
   * color the played bars and update the slider values, touching only bars that changed.
   * @returns {void}
   */
  function showTime() {
    const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0
    const nextPlayedCount = Math.round(fraction * drawnCount)
    if (nextPlayedCount !== playedCount) {
      const children = bars.children
      const low = Math.max(0, Math.min(playedCount, nextPlayedCount))
      const high = playedCount < 0 ? drawnCount : Math.max(playedCount, nextPlayedCount)
      for (let index = low; index < high; index += 1) {
        children[index].classList.toggle('is-played', index < nextPlayedCount)
      }
      playedCount = nextPlayedCount
    }
    element.setAttribute('aria-valuemax', String(Math.floor(duration)))
    element.setAttribute('aria-valuenow', String(Math.floor(currentTime)))
    element.setAttribute('aria-valuetext', describePosition(currentTime, duration))
  }

  /**
   * seek to a position, clamped to the recording, and show it right away.
   * @param {number} seconds the target
   * @returns {void}
   */
  function seekTo(seconds) {
    if (isDisabled) return
    currentTime = Math.min(Math.max(0, seconds), duration)
    showTime()
    onSeek(currentTime)
  }

  /**
   * turn a pointer position into seconds along the waveform.
   * @param {PointerEvent} event the pointer event
   * @returns {number} the time under the pointer
   */
  function timeAtPointer(event) {
    const box = bars.getBoundingClientRect()
    if (box.width === 0) return currentTime
    return ((event.clientX - box.left) / box.width) * duration
  }

  // drag to scrub: the pointer is captured so the drag keeps working outside the bars
  element.addEventListener('pointerdown', (event) => {
    if (isDisabled || event.button !== 0) return
    element.setPointerCapture?.(event.pointerId)
    element.classList.add('is-dragging')
    seekTo(timeAtPointer(event))
  })
  element.addEventListener('pointermove', (event) => {
    if (element.hasPointerCapture?.(event.pointerId)) seekTo(timeAtPointer(event))
  })
  for (const name of ['pointerup', 'pointercancel']) {
    element.addEventListener(name, (event) => {
      element.releasePointerCapture?.(event.pointerId)
      element.classList.remove('is-dragging')
    })
  }

  // the slider keys from the aria authoring practices
  const keySteps = {
    ArrowLeft: -arrowStepSeconds,
    ArrowDown: -arrowStepSeconds,
    ArrowRight: arrowStepSeconds,
    ArrowUp: arrowStepSeconds,
    PageDown: -pageStepSeconds,
    PageUp: pageStepSeconds,
  }
  element.addEventListener('keydown', (event) => {
    if (isDisabled) return
    if (Object.hasOwn(keySteps, event.key)) seekTo(currentTime + keySteps[event.key])
    else if (event.key === 'Home') seekTo(0)
    else if (event.key === 'End') seekTo(duration)
    else return
    event.preventDefault()
  })

  // redraw when the width changes enough to fit a different number of bars
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          const available = sourcePeaks?.length || placeholderBarCount
          if (fitBarCount(available) !== drawnCount) drawBars()
        })
      : null
  resizeObserver?.observe(element)

  drawBars()

  return {
    element,

    /**
     * show a new playback position.
     * @param {number} seconds the position
     * @returns {void}
     */
    setTime(seconds) {
      // a drag in progress owns the position until the pointer lets go
      if (element.classList.contains('is-dragging')) return
      currentTime = Math.min(Math.max(0, seconds), duration)
      showTime()
    },

    /**
     * use the exact length once the audio reports it.
     * @param {number} seconds the length
     * @returns {void}
     */
    setDuration(seconds) {
      if (!(seconds > 0) || seconds === duration) return
      duration = seconds
      showTime()
    },

    /**
     * swap the placeholder for real peaks.
     * @param {number[]} nextPeaks values from 0 to 1
     * @returns {void}
     */
    setPeaks(nextPeaks) {
      sourcePeaks = nextPeaks
      drawBars()
    },

    /**
     * turn seeking off, for recordings with no audio on this device.
     * @param {boolean} nextIsDisabled true to disable
     * @returns {void}
     */
    setDisabled(nextIsDisabled) {
      isDisabled = nextIsDisabled
      element.setAttribute('aria-disabled', String(isDisabled))
      element.tabIndex = isDisabled ? -1 : 0
    },

    /**
     * stop watching the element's size.
     * @returns {void}
     */
    destroy() {
      resizeObserver?.disconnect()
    },
  }
}
