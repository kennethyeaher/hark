// finds a search query inside transcript segments, ignoring case and accents

const combiningMarks = /[̀-ͯ]/g

/** shortest query, in characters after trimming, that is searched for */
const minimumQueryLength = 2

/**
 * lowercase a string, split accents off, and drop them, while recording which original range
 * each output character came from. one original character can produce several output characters
 * or none, so offsets cannot be assumed to line up.
 * @param {string} text the original text
 * @returns {{ normalized: string, starts: number[], ends: number[] }} the folded text and, for
 *   every folded character, the start and end offsets of its source in the original text
 */
function foldWithOffsets(text) {
  let normalized = ''
  const starts = []
  const ends = []
  let offset = 0
  // iterate by code point so surrogate pairs stay whole
  for (const character of text) {
    const folded = character.toLowerCase().normalize('NFD').replace(combiningMarks, '')
    for (let index = 0; index < folded.length; index += 1) {
      starts.push(offset)
      ends.push(offset + character.length)
    }
    normalized += folded
    offset += character.length
  }
  return { normalized, starts, ends }
}

/**
 * find every match of a query in the segments, ignoring case and accents.
 * @param {{ text: string }[]} segments transcript segments
 * @param {string} query what to look for; queries under 2 characters after trimming match nothing
 * @returns {{ segmentIndex: number, start: number, end: number }[]} matches in order, never
 *   overlapping, with start and end as character offsets into the original segment text
 * @throws {TypeError} when segments is not an array or query is not a string
 */
export function findMatches(segments, query) {
  if (!Array.isArray(segments)) {
    throw new TypeError('segments must be an array')
  }
  if (typeof query !== 'string') {
    throw new TypeError('query must be a string')
  }

  const needle = foldWithOffsets(query.trim()).normalized
  if (query.trim().length < minimumQueryLength || needle.length === 0) return []

  const matches = []
  segments.forEach((segment, segmentIndex) => {
    const { normalized, starts, ends } = foldWithOffsets(segment.text)
    let from = 0
    while (from <= normalized.length - needle.length) {
      const found = normalized.indexOf(needle, from)
      if (found === -1) break
      const next = found + needle.length
      let end = ends[next - 1]
      // keep accent marks that trail the match, since they fold to nothing
      if (next >= starts.length) end = segment.text.length
      else if (starts[next] >= end) end = starts[next]
      matches.push({ segmentIndex, start: starts[found], end })
      // continue after this match so matches never overlap
      from = found + needle.length
    }
  })
  return matches
}
