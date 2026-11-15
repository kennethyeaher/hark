// waveform peaks: a short list of bar heights computed from decoded audio samples

/** the lowest bar height, so silent stretches still draw a visible bar */
export const peakFloor = 0.08

/**
 * reduce decoded samples to bar heights, one per bucket. each bar is the loudest absolute
 * sample in its bucket, scaled so the loudest bucket is 1 and none falls below peakFloor.
 * silence gives every bar the floor. samples shorter than barCount give every sample its
 * own bar and repeat the nearest sample for the rest.
 * @param {Float32Array} samples decoded mono samples, each from -1 to 1
 * @param {number} barCount how many bars to return, a whole number of 1 or more
 * @returns {number[]} barCount heights from peakFloor to 1
 * @throws {TypeError} when samples is not a Float32Array or barCount is not a whole number
 * @throws {RangeError} when samples is empty, has a value that is not finite, or barCount is below 1
 */
export function buildPeaks(samples, barCount) {
  if (!(samples instanceof Float32Array)) {
    throw new TypeError(`samples must be a Float32Array, got ${String(samples)}`)
  }
  if (!Number.isInteger(barCount)) {
    throw new TypeError(`barCount must be a whole number, got ${String(barCount)}`)
  }
  if (barCount < 1) throw new RangeError(`barCount must be 1 or more, got ${barCount}`)
  if (samples.length === 0) throw new RangeError('samples must not be empty')

  // loudest absolute sample per bucket. a bucket always holds at least one sample, so a
  // short clip stretches across the bars instead of leaving empty ones
  const loudest = new Array(barCount)
  let overall = 0
  for (let bar = 0; bar < barCount; bar += 1) {
    const start = Math.min(Math.floor((bar * samples.length) / barCount), samples.length - 1)
    const end = Math.max(Math.floor(((bar + 1) * samples.length) / barCount), start + 1)
    let top = 0
    for (let index = start; index < end; index += 1) {
      const value = Math.abs(samples[index])
      if (!Number.isFinite(value)) {
        throw new RangeError(`sample ${index} must be a finite number, got ${samples[index]}`)
      }
      if (value > top) top = value
    }
    loudest[bar] = top
    if (top > overall) overall = top
  }
  if (overall === 0) return loudest.map(() => peakFloor)
  return loudest.map((top) => Math.max(peakFloor, top / overall))
}
