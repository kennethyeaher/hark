// finds which transcript segment is playing at a given time

/** how far past a segment's end the time can be before it counts as a gap, in seconds */
const gapToleranceSeconds = 1

/**
 * find the segment that is playing at a time. it is the last segment that starts at or before the
 * time, unless the time is more than a second past that segment's end, which counts as a gap.
 * @param {{ startSeconds: number, endSeconds: number }[]} segments segments in time order
 * @param {number} seconds playback position in seconds
 * @returns {number} the segment index, or -1 before the first segment or inside a gap
 * @throws {TypeError} when segments is not an array or seconds is not a number
 */
export function findActiveSegmentIndex(segments, seconds) {
  if (!Array.isArray(segments)) {
    throw new TypeError('segments must be an array')
  }
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    throw new TypeError(`seconds must be a number, got ${String(seconds)}`)
  }

  // binary search for the last start at or before the time
  let low = 0
  let high = segments.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (segments[middle].startSeconds <= seconds) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  if (found === -1) return -1
  if (seconds > segments[found].endSeconds + gapToleranceSeconds) return -1
  return found
}
