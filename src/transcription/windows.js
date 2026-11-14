/*
  plans the windows a long file is transcribed in.

  whisper damages speech when a window ends in the middle of a word: it drops words, invents a
  sentence, or repeats one. so each cut moves to the quietest moment near its nominal place, and
  the audio sent for a window carries a few seconds of context past both edges. every window
  owns only the time between its cuts, and a segment belongs to the window that owns its
  midpoint, so the context never shows up twice in the transcript.
*/

/**
 * check that a value is a finite number above 0.
 * @param {unknown} value number to check
 * @param {string} label name used in the error message
 * @returns {number} the value, unchanged
 * @throws {RangeError} when value is not a finite number above 0
 */
function assertPositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number above 0, got ${String(value)}`)
  }
  return value
}

/**
 * check that a value is a finite number of 0 or more.
 * @param {unknown} value number to check
 * @param {string} label name used in the error message
 * @returns {number} the value, unchanged
 * @throws {RangeError} when value is not a finite number or is negative
 */
function assertNotNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number of 0 or more, got ${String(value)}`)
  }
  return value
}

/**
 * measure the loudness of a stretch of samples as root mean square.
 * @param {Float32Array} samples audio samples
 * @param {number} start first sample, inclusive
 * @param {number} end last sample, exclusive
 * @returns {number} the RMS of the stretch
 */
function measureLoudness(samples, start, end) {
  let sumOfSquares = 0
  for (let position = start; position < end; position += 1) {
    sumOfSquares += samples[position] * samples[position]
  }
  return Math.sqrt(sumOfSquares / (end - start))
}

/**
 * find where to cut long audio: near every multiple of the window length, at the quietest moment.
 * for each nominal cut it slides a frame in steps across plus or minus searchSeconds and picks the
 * center of the frame with the lowest RMS. on a tie the earliest frame wins. frames stay inside
 * the audio.
 * @param {Float32Array} samples mono audio samples
 * @param {{ sampleRate: number, windowSeconds?: number, searchSeconds?: number,
 *   frameSeconds?: number, stepSeconds?: number }} options sample rate of the audio, window
 *   length, how far a cut may move each way, frame length, and step between frames, in seconds
 * @returns {number[]} cut times in seconds, in order. empty when the audio is no longer than one
 *   window.
 * @throws {TypeError} when samples is not a Float32Array
 * @throws {RangeError} when an option is not a finite number in range
 */
export function findQuietCuts(
  samples,
  { sampleRate, windowSeconds = 300, searchSeconds = 8, frameSeconds = 0.5, stepSeconds = 0.1 } = {}
) {
  if (!(samples instanceof Float32Array)) {
    throw new TypeError(`samples must be a Float32Array, got ${String(samples)}`)
  }
  assertPositive(sampleRate, 'sampleRate')
  assertPositive(windowSeconds, 'windowSeconds')
  assertNotNegative(searchSeconds, 'searchSeconds')
  assertPositive(frameSeconds, 'frameSeconds')
  assertPositive(stepSeconds, 'stepSeconds')

  // work in whole samples so candidate centers never drift with floating point steps
  const frameLength = Math.max(1, Math.round(frameSeconds * sampleRate))
  const halfFrame = Math.floor(frameLength / 2)
  const stepLength = Math.max(1, Math.round(stepSeconds * sampleRate))
  const stepCount = Math.floor((searchSeconds * sampleRate) / stepLength)
  const windowLength = Math.round(windowSeconds * sampleRate)

  const cuts = []
  for (let nominal = windowLength; nominal < samples.length; nominal += windowLength) {
    let quietestCenter = null
    let quietestLoudness = Infinity
    for (let step = -stepCount; step <= stepCount; step += 1) {
      const center = nominal + step * stepLength
      const start = center - halfFrame
      const end = start + frameLength
      if (start < 0 || end > samples.length) continue
      const loudness = measureLoudness(samples, start, end)
      if (loudness < quietestLoudness) {
        quietestLoudness = loudness
        quietestCenter = center
      }
    }
    // audio too short for even one frame keeps the nominal cut
    cuts.push((quietestCenter ?? nominal) / sampleRate)
  }
  return cuts
}

/**
 * plan the windows between cuts: the time each window owns, and the audio sent for it, which
 * reaches contextSeconds past each owned edge, clamped to the file.
 * @param {number} durationSeconds length of the audio
 * @param {number[]} cuts cut times in seconds, increasing, each inside the audio
 * @param {{ contextSeconds?: number }} [options] extra audio on each side of a window
 * @returns {Array<{ ownedStart: number, ownedEnd: number, audioStart: number, audioEnd: number,
 *   isLast: boolean }>} one window per stretch between cuts, in order. empty for empty audio.
 * @throws {TypeError} when cuts is not an array
 * @throws {RangeError} when the duration or context is not a number of 0 or more, or a cut is
 *   out of order or outside the audio
 */
export function planWindows(durationSeconds, cuts, { contextSeconds = 5 } = {}) {
  assertNotNegative(durationSeconds, 'durationSeconds')
  assertNotNegative(contextSeconds, 'contextSeconds')
  if (!Array.isArray(cuts)) {
    throw new TypeError(`cuts must be an array, got ${String(cuts)}`)
  }
  if (durationSeconds === 0) return []

  const edges = [0, ...cuts, durationSeconds]
  // checked in order, so each cut only needs to follow the one before it and stay inside the file
  for (let position = 1; position < edges.length - 1; position += 1) {
    const cut = edges[position]
    const previous = edges[position - 1]
    if (typeof cut !== 'number' || !(cut > previous && cut < durationSeconds)) {
      throw new RangeError(
        `cut ${position - 1} must be after ${previous} and before ${durationSeconds}, got ${String(cut)}`
      )
    }
  }

  return edges.slice(0, -1).map((ownedStart, position) => {
    const ownedEnd = edges[position + 1]
    return {
      ownedStart,
      ownedEnd,
      audioStart: Math.max(0, ownedStart - contextSeconds),
      audioEnd: Math.min(durationSeconds, ownedEnd + contextSeconds),
      isLast: position === edges.length - 2,
    }
  })
}

/**
 * keep the segments a window owns: those whose midpoint is at or after ownedStart and before
 * ownedEnd. the last window also keeps a midpoint that lands exactly on the end of the file.
 * @param {Array<{ startSeconds: number, endSeconds: number }>} segments segments with file times
 * @param {{ ownedStart: number, ownedEnd: number, isLast?: boolean }} window owned range
 * @returns {Array<object>} the owned segments, in their original order and unchanged
 * @throws {TypeError} when segments is not an array
 * @throws {RangeError} when the owned range is not two numbers in order
 */
export function keepOwnedSegments(segments, { ownedStart, ownedEnd, isLast = false } = {}) {
  if (!Array.isArray(segments)) {
    throw new TypeError(`segments must be an array, got ${String(segments)}`)
  }
  assertNotNegative(ownedStart, 'ownedStart')
  assertNotNegative(ownedEnd, 'ownedEnd')
  if (ownedEnd < ownedStart) {
    throw new RangeError(`ownedEnd ${ownedEnd} must not come before ownedStart ${ownedStart}`)
  }
  return segments.filter((segment) => {
    const midpoint = (segment.startSeconds + segment.endSeconds) / 2
    if (midpoint < ownedStart) return false
    return isLast ? midpoint <= ownedEnd : midpoint < ownedEnd
  })
}
