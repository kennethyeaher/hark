// turns whisper pipeline output into transcript segments. the data store keeps them separately.

/**
 * check that a timestamp is a finite number of zero or more.
 * @param {unknown} value timestamp to check
 * @param {string} label name used in the error message
 * @returns {number} the value, unchanged
 * @throws {RangeError} when value is not a finite number or is negative
 */
function assertTimestamp(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number of 0 or more, got ${String(value)}`)
  }
  return value
}

/**
 * build transcript segments from the `chunks` a whisper pipeline returns with timestamps.
 * text is trimmed and chunks with no words are dropped. a missing end, which whisper gives the
 * last chunk when the audio stops mid sentence, becomes the next chunk's start or the audio
 * duration. an end that lands before its start is moved up to the start.
 * @param {Array<{ timestamp: [number, number | null], text: string }>} chunks pipeline chunks
 * @param {{ offsetSeconds?: number, durationSeconds?: number }} [options] seconds to add to every
 *   time, for a window that starts part way into the file, and the length of the audio these
 *   chunks came from, used for a missing last end
 * @returns {Array<{ index: number, startSeconds: number, endSeconds: number, text: string }>}
 *   segments numbered from 0, in order
 * @throws {TypeError} when chunks is not an array or a chunk is malformed
 * @throws {RangeError} when a time is negative, or a last end is missing with no duration given
 */
export function buildSegments(chunks, { offsetSeconds = 0, durationSeconds } = {}) {
  if (!Array.isArray(chunks)) {
    throw new TypeError(`chunks must be an array, got ${String(chunks)}`)
  }
  assertTimestamp(offsetSeconds, 'offsetSeconds')
  if (durationSeconds !== undefined) assertTimestamp(durationSeconds, 'durationSeconds')

  const segments = []
  chunks.forEach((chunk, position) => {
    const label = `chunk ${position}`
    if (chunk === null || typeof chunk !== 'object' || !Array.isArray(chunk.timestamp)) {
      throw new TypeError(`${label} must have a timestamp array, got ${JSON.stringify(chunk)}`)
    }
    if (typeof chunk.text !== 'string') {
      throw new TypeError(`${label} text must be a string, got ${String(chunk.text)}`)
    }
    const text = chunk.text.trim()
    if (text === '') return

    const [start, rawEnd] = chunk.timestamp
    assertTimestamp(start, `${label} start`)
    const end = rawEnd ?? findMissingEnd(chunks, position, durationSeconds)
    assertTimestamp(end, `${label} end`)

    segments.push({
      index: segments.length,
      startSeconds: offsetSeconds + start,
      endSeconds: offsetSeconds + Math.max(start, end),
      text,
    })
  })
  return segments
}

/**
 * find the end for a chunk whisper left open: the next chunk's start, or the audio duration.
 * @param {Array<{ timestamp: Array<number | null> }>} chunks every chunk
 * @param {number} position index of the open chunk
 * @param {number | undefined} durationSeconds audio length, when known
 * @returns {number} the end time, relative to the chunks
 * @throws {RangeError} when there is no next chunk and no duration
 */
function findMissingEnd(chunks, position, durationSeconds) {
  const nextStart = chunks[position + 1]?.timestamp?.[0]
  if (typeof nextStart === 'number') return nextStart
  if (durationSeconds === undefined) {
    throw new RangeError(`chunk ${position} has no end time and no durationSeconds was given`)
  }
  return durationSeconds
}
