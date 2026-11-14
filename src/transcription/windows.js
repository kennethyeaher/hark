/*
  plans the windows a long file is transcribed in.

  whisper damages speech when a window ends in the middle of a word: it drops words, invents a
  sentence, or repeats one. so each cut moves to the quietest moment near its nominal place.
  windows do not overlap. a test in 04c gave each window 5 seconds of context past its edges
  and kept segments by midpoint, but whisper then ran sentences across the cut and the text
  between the cut and the context edge landed in neither window.
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
 * the audio. a last cut that would leave less than shortestLastSeconds is skipped, so the end of
 * the file joins the window before it instead of going to whisper as a clip it may invent text for.
 * @param {Float32Array} samples mono audio samples
 * @param {{ sampleRate: number, windowSeconds?: number, searchSeconds?: number,
 *   frameSeconds?: number, stepSeconds?: number, shortestLastSeconds?: number }} options sample
 *   rate of the audio, window length, how far a cut may move each way, frame length, step
 *   between frames, and the shortest last window, in seconds
 * @returns {number[]} cut times in seconds, in order. empty when the audio is no longer than one
 *   window plus shortestLastSeconds.
 * @throws {TypeError} when samples is not a Float32Array
 * @throws {RangeError} when an option is not a finite number in range
 */
export function findQuietCuts(
  samples,
  {
    sampleRate,
    windowSeconds = 300,
    searchSeconds = 8,
    frameSeconds = 0.5,
    stepSeconds = 0.1,
    shortestLastSeconds = 10,
  } = {}
) {
  if (!(samples instanceof Float32Array)) {
    throw new TypeError(`samples must be a Float32Array, got ${String(samples)}`)
  }
  assertPositive(sampleRate, 'sampleRate')
  assertPositive(windowSeconds, 'windowSeconds')
  assertNotNegative(searchSeconds, 'searchSeconds')
  assertPositive(frameSeconds, 'frameSeconds')
  assertPositive(stepSeconds, 'stepSeconds')
  assertNotNegative(shortestLastSeconds, 'shortestLastSeconds')

  // work in whole samples so candidate centers never drift with floating point steps
  const frameLength = Math.max(1, Math.round(frameSeconds * sampleRate))
  const halfFrame = Math.floor(frameLength / 2)
  const stepLength = Math.max(1, Math.round(stepSeconds * sampleRate))
  const stepCount = Math.floor((searchSeconds * sampleRate) / stepLength)
  const windowLength = Math.round(windowSeconds * sampleRate)
  const shortestLastLength = Math.round(shortestLastSeconds * sampleRate)

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
    const cut = quietestCenter ?? nominal
    // cuts sit a window apart, so only the last one can leave a short tail
    if (samples.length - cut < shortestLastLength) break
    cuts.push(cut / sampleRate)
  }
  return cuts
}

/**
 * plan the windows between cuts, each running from one cut to the next.
 * @param {number} durationSeconds length of the audio
 * @param {number[]} cuts cut times in seconds, increasing, each inside the audio
 * @returns {Array<{ startSeconds: number, endSeconds: number }>} one window per stretch between
 *   cuts, in order. empty for empty audio.
 * @throws {TypeError} when cuts is not an array
 * @throws {RangeError} when the duration is not a number of 0 or more, or a cut is out of order
 *   or outside the audio
 */
export function planWindows(durationSeconds, cuts) {
  assertNotNegative(durationSeconds, 'durationSeconds')
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

  return edges.slice(0, -1).map((startSeconds, position) => ({
    startSeconds,
    endSeconds: edges[position + 1],
  }))
}

// a repeat shorter than this many words, like "Yes. Yes.", is ordinary speech and stays
const shortestRepeatWords = 4

/**
 * reduce segment text to lowercase letters and digits with single spaces, for comparing repeats.
 * @param {string} text segment text
 * @returns {string} the normalized text
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * drop a segment whose normalized text matches the segment kept just before it, a guard against
 * whisper repeating one sentence in a loop. only text of 4 or more words counts as a repeat.
 * @param {Array<{ text: string }>} segments transcript segments in order
 * @returns {Array<object>} new segment objects without the repeats, numbered again from 0
 * @throws {TypeError} when segments is not an array or a segment has no text
 */
export function dropRepeatedSegments(segments) {
  if (!Array.isArray(segments)) {
    throw new TypeError(`segments must be an array, got ${String(segments)}`)
  }
  const kept = []
  let previousText = null
  segments.forEach((segment, position) => {
    if (typeof segment?.text !== 'string') {
      throw new TypeError(`segment ${position} text must be a string, got ${String(segment?.text)}`)
    }
    const text = normalizeText(segment.text)
    const isRepeat = text === previousText && text.split(' ').length >= shortestRepeatWords
    if (isRepeat) return
    kept.push({ ...segment, index: kept.length })
    previousText = text
  })
  return kept
}
