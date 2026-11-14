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

// whisper can loop on a short phrase inside one segment, such as "who is a person" 90 times
const shortestLoopPhrase = 2
const longestLoopPhrase = 8
const fewestLoopRepeats = 3

/**
 * reduce one word to lowercase letters and digits, for comparing phrases.
 * @param {string} word one word as written, with its punctuation
 * @returns {string} the normalized word, empty for punctuation alone
 */
function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * count how many times the phrase starting at a position repeats back to back.
 * @param {string[]} normalized normalized words of the text
 * @param {number} start index of the first word of the phrase
 * @param {number} length words in the phrase
 * @returns {number} occurrences in a row, 1 when the phrase does not repeat
 */
function countRepeats(normalized, start, length) {
  let count = 1
  while (start + (count + 1) * length <= normalized.length) {
    const next = start + count * length
    let isSame = true
    for (let offset = 0; offset < length && isSame; offset += 1) {
      isSame = normalized[next + offset] === normalized[start + offset]
    }
    if (!isSame) break
    count += 1
  }
  return count
}

/**
 * collapse a phrase of 2 to 8 words that whisper repeats 3 or more times in a row down to its
 * first occurrence, with that occurrence's casing and punctuation. words are compared
 * normalized. a phrase said twice, like "very, very", stays as it is.
 * @param {string} text segment text
 * @returns {string} the text with loops collapsed, unchanged when there are none
 * @throws {TypeError} when text is not a string
 */
export function collapseRepeatedPhrases(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`text must be a string, got ${String(text)}`)
  }
  const words = text.trim().split(/\s+/).filter(Boolean)
  const normalized = words.map(normalizeWord)

  const kept = []
  let hasCollapsed = false
  let position = 0
  while (position < words.length) {
    // the phrase length that covers the most words wins; on a tie the shorter phrase does
    let bestLength = 0
    let bestCount = 1
    for (let length = shortestLoopPhrase; length <= longestLoopPhrase; length += 1) {
      const phrase = normalized.slice(position, position + length)
      // a phrase of punctuation alone is not speech, so it never counts as a loop
      if (phrase.length < length || phrase.every((word) => word === '')) continue
      const count = countRepeats(normalized, position, length)
      if (count >= fewestLoopRepeats && count * length > bestCount * bestLength) {
        bestLength = length
        bestCount = count
      }
    }
    if (bestLength > 0) {
      kept.push(...words.slice(position, position + bestLength))
      position += bestLength * bestCount
      hasCollapsed = true
    } else {
      kept.push(words[position])
      position += 1
    }
  }
  return hasCollapsed ? kept.join(' ') : text
}
