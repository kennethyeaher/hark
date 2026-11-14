// time estimates for a transcription: a fixed rule before any audio is done, then live speed

import { getModel } from './models.js'

/**
 * check that a value is a finite number of zero or more.
 * @param {unknown} value value to check
 * @param {string} label name used in the error message
 * @returns {number} the value, unchanged
 * @throws {RangeError} when value is not a finite number or is negative
 */
function assertSeconds(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number of 0 or more, got ${String(value)}`)
  }
  return value
}

/**
 * estimate how long a whole file takes with the fixed rule: audio length times the model factor.
 * @param {{ durationSeconds: number, modelKey: string }} options audio length and model choice
 * @returns {number} estimated seconds of work
 * @throws {RangeError} when durationSeconds is negative or not finite, or the model is unknown
 */
export function estimateSeconds({ durationSeconds, modelKey }) {
  assertSeconds(durationSeconds, 'durationSeconds')
  return durationSeconds * getModel(modelKey).secondsPerAudioSecond
}

/**
 * estimate the seconds left in a running transcription. before any audio is processed this is
 * the fixed rule for the whole file. after that it is the audio still to go times the speed
 * measured so far, so it follows the real device instead of the guess.
 * @param {{ durationSeconds: number, processedSeconds: number, elapsedSeconds: number,
 *   modelKey: string }} options audio length, audio done so far, time spent, and model choice
 * @returns {number} estimated seconds left, never below 0
 * @throws {RangeError} when a number is negative or not finite, or the model is unknown
 */
export function estimateRemainingSeconds({
  durationSeconds,
  processedSeconds,
  elapsedSeconds,
  modelKey,
}) {
  assertSeconds(durationSeconds, 'durationSeconds')
  assertSeconds(processedSeconds, 'processedSeconds')
  assertSeconds(elapsedSeconds, 'elapsedSeconds')
  if (processedSeconds === 0) return estimateSeconds({ durationSeconds, modelKey })
  getModel(modelKey)

  // the last window can report a little past the decoded length, so the rest never goes negative
  const remainingAudioSeconds = Math.max(0, durationSeconds - processedSeconds)
  const measuredSecondsPerAudioSecond = elapsedSeconds / processedSeconds
  return remainingAudioSeconds * measuredSecondsPerAudioSecond
}

/**
 * describe an estimate in words, rounded to the nearest minute.
 * @param {number} seconds estimated seconds
 * @returns {string} "less than a minute", "about 1 minute", or "about N minutes"
 * @throws {RangeError} when seconds is negative or not finite
 */
export function formatEstimate(seconds) {
  assertSeconds(seconds, 'seconds')
  const minutes = Math.round(seconds / 60)
  if (minutes === 0) return 'less than a minute'
  if (minutes === 1) return 'about 1 minute'
  return `about ${minutes} minutes`
}
