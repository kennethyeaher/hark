import { createSvgElement } from '../lib/dom.js'
import { courseColors } from '../lib/format.js'

const barWidth = 3
const barGap = 3.5
const minimumBarHeight = 0.3
const tallBarThreshold = 0.7
const dimmedOpacity = 0.55
const pendingOpacity = 0.3

/**
 * hash a string to a 32 bit unsigned integer with FNV 1a.
 * @param {string} text text to hash
 * @returns {number} the hash
 */
function hashString(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * build a seeded random number generator with mulberry32.
 * @param {number} seed 32 bit integer seed
 * @returns {() => number} function returning numbers from 0 up to 1
 */
function createGenerator(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * compute repeatable bar heights for a seed.
 * @param {string} seed text such as a recording id
 * @param {number} barCount number of bars, 1 to 200
 * @returns {number[]} heights from 0.3 up to 1
 * @throws {TypeError} when seed is not a non empty string
 * @throws {RangeError} when barCount is not an integer from 1 to 200
 */
export function buildBarHeights(seed, barCount) {
  if (typeof seed !== 'string' || seed === '') {
    throw new TypeError(`seed must be a non empty string, got ${String(seed)}`)
  }
  if (!Number.isInteger(barCount) || barCount < 1 || barCount > 200) {
    throw new RangeError(`barCount must be an integer from 1 to 200, got ${barCount}`)
  }

  const nextNumber = createGenerator(hashString(seed))
  return Array.from({ length: barCount }, () => {
    return minimumBarHeight + nextNumber() * (1 - minimumBarHeight)
  })
}

/**
 * check that a progress fraction is a number from 0 to 1.
 * @param {unknown} fraction value to check
 * @returns {void}
 * @throws {RangeError} when fraction is not a number from 0 to 1
 */
function assertFraction(fraction) {
  if (typeof fraction !== 'number' || !(fraction >= 0 && fraction <= 1)) {
    throw new RangeError(`progressFraction must be a number from 0 to 1, got ${String(fraction)}`)
  }
}

/**
 * render a decorative waveform svg for a recording.
 * @param {{ seed: string, color: string, barCount?: number, height?: number,
 *   progressFraction?: number | null }} options seed picks the bar pattern, color is a course
 *   color name, and progressFraction, when given, splits the bars into done and still to go
 * @returns {SVGSVGElement} an aria hidden svg at its natural width
 * @throws {TypeError} when seed or color is invalid
 * @throws {RangeError} when barCount, height, or progressFraction is out of range
 */
export function renderWaveform({
  seed,
  color,
  barCount = 32,
  height = 38,
  progressFraction = null,
}) {
  if (!courseColors.includes(color)) {
    throw new TypeError(`color must be one of ${courseColors.join(', ')}, got ${String(color)}`)
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
    throw new RangeError(`height must be a positive number, got ${String(height)}`)
  }
  if (progressFraction !== null) assertFraction(progressFraction)
  const heights = buildBarHeights(seed, barCount)

  // width is natural so bars never stretch, css caps it with max width
  const width = barCount * barWidth + (barCount - 1) * barGap
  const svg = createSvgElement('svg', {
    class: 'waveform',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-hidden': 'true',
    focusable: 'false',
    // bars fill with currentColor because svg fill attributes do not reliably resolve custom properties
    style: `color: var(--course-${color})`,
  })

  // each bar is centered vertically, tall bars are fully opaque
  heights.forEach((barHeight, index) => {
    const pixelHeight = barHeight * height
    svg.append(
      createSvgElement('rect', {
        x: index * (barWidth + barGap),
        y: (height - pixelHeight) / 2,
        width: barWidth,
        height: pixelHeight,
        rx: barWidth / 2,
        fill: 'currentColor',
        opacity: barHeight > tallBarThreshold ? 1 : dimmedOpacity,
      })
    )
  })
  if (progressFraction !== null) setWaveformProgress(svg, progressFraction)
  return svg
}

/**
 * split a waveform into done and still to go: bars up to the fraction show in full color and
 * the rest in a light tint. color is not the only signal, since the page shows the percent too.
 * @param {SVGSVGElement} svg a waveform from renderWaveform
 * @param {number} fraction progress from 0 to 1
 * @returns {void}
 * @throws {RangeError} when fraction is not a number from 0 to 1
 */
export function setWaveformProgress(svg, fraction) {
  assertFraction(fraction)
  const bars = [...svg.querySelectorAll('rect')]
  const doneCount = Math.round(fraction * bars.length)
  bars.forEach((bar, index) => {
    bar.setAttribute('opacity', String(index < doneCount ? 1 : pendingOpacity))
  })
}
