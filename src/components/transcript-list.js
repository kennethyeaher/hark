// the transcript: one button per segment with its time, built once and then updated in place

import { createElement } from '../lib/dom.js'
import { formatClock } from '../lib/format.js'
import { findActiveSegmentIndex } from '../player/active-segment.js'

/**
 * group moments by the segment they fall in. a moment in a gap between segments has no row.
 * @param {{ startSeconds: number, endSeconds: number }[]} segments segments in time order
 * @param {{ atSeconds: number }[]} moments the moments
 * @returns {Map<number, object[]>} moments keyed by segment index, in time order
 */
export function groupMomentsBySegment(segments, moments) {
  const groups = new Map()
  const sorted = [...moments].sort((first, second) => first.atSeconds - second.atSeconds)
  for (const moment of sorted) {
    const index = findActiveSegmentIndex(segments, moment.atSeconds)
    if (index === -1) continue
    if (!groups.has(index)) groups.set(index, [])
    groups.get(index).push(moment)
  }
  return groups
}

/**
 * render the transcript list. rows are made once; playback only moves the active class, so a
 * two hour transcript with about 1,500 rows stays smooth.
 * @param {{ segments: { startSeconds: number, endSeconds: number, text: string }[],
 *   onSeek: (seconds: number) => void }} options segments in time order and what a row click calls
 * @returns {{ element: HTMLElement, getRow: (index: number) => HTMLElement | undefined,
 *   setActiveIndex: (index: number) => HTMLElement | null,
 *   setMoments: (moments: object[]) => void, showMatches: (matches: object[]) => void,
 *   setCurrentMatch: (matchIndex: number) => HTMLElement | null }} the list and its updates
 * @throws {TypeError} when segments is not an array or onSeek is not a function
 */
export function renderTranscriptList({ segments, onSeek }) {
  if (!Array.isArray(segments)) throw new TypeError('renderTranscriptList needs a segments array')
  if (typeof onSeek !== 'function') throw new TypeError('renderTranscriptList needs onSeek')

  const element = createElement('ol', { className: 'transcript-list', 'aria-label': 'Transcript' })
  const rows = segments.map((segment, index) => {
    const row = createElement(
      'button',
      { type: 'button', className: 'transcript-row', 'data-index': index },
      [
        createElement('span', {
          className: 'transcript-time',
          text: formatClock(segment.startSeconds),
        }),
        createElement('span', { className: 'transcript-text', text: segment.text.trim() }),
        createElement('span', { className: 'transcript-moments' }),
      ]
    )
    element.append(createElement('li', { className: 'transcript-item' }, [row]))
    return row
  })

  // one listener for every row, so 1,500 rows do not mean 1,500 listeners
  element.addEventListener('click', (event) => {
    const row = event.target.closest('.transcript-row')
    if (!row || !element.contains(row)) return
    onSeek(segments[Number(row.dataset.index)].startSeconds)
  })

  let activeIndex = -1
  let rowsWithMoments = []
  // rows that show find highlights, and the marks in match order
  let markedIndexes = []
  let marks = []
  let currentMark = null

  /**
   * read the text span of a row.
   * @param {number} index segment index
   * @returns {HTMLElement} the span
   */
  const textOf = (index) => rows[index].querySelector('.transcript-text')

  /**
   * show a row's text with no highlights.
   * @param {number} index segment index
   * @returns {void}
   */
  function refreshText(index) {
    textOf(index).textContent = segments[index].text.trim()
  }

  return {
    element,

    /**
     * read one row.
     * @param {number} index segment index
     * @returns {HTMLElement | undefined} the row button
     */
    getRow: (index) => rows[index],

    /**
     * mark the playing segment. only the old and new rows change.
     * @param {number} index segment index, or -1 when no segment is playing
     * @returns {HTMLElement | null} the new active row, or null
     */
    setActiveIndex(index) {
      if (index === activeIndex) return rows[index] ?? null
      const previous = rows[activeIndex]
      if (previous) {
        previous.classList.remove('is-active')
        previous.removeAttribute('aria-current')
      }
      activeIndex = index
      const next = rows[index]
      if (!next) return null
      next.classList.add('is-active')
      next.setAttribute('aria-current', 'true')
      return next
    },

    /**
     * show a dot on each row that holds a moment, in the moment's color.
     * @param {{ atSeconds: number, label: string, color: string }[]} moments the moments
     * @returns {void}
     */
    setMoments(moments) {
      for (const row of rowsWithMoments) row.querySelector('.transcript-moments').replaceChildren()
      rowsWithMoments = []
      for (const [index, group] of groupMomentsBySegment(segments, moments)) {
        const row = rows[index]
        row.querySelector('.transcript-moments').replaceChildren(
          ...group.flatMap((moment) => [
            createElement('span', {
              className: 'transcript-moment-dot',
              'aria-hidden': 'true',
              style: `background: var(--course-${moment.color})`,
            }),
            createElement('span', {
              className: 'visually-hidden',
              text: `, moment ${moment.label}`,
            }),
          ])
        )
        rowsWithMoments.push(row)
      }
    },

    /**
     * highlight find matches with mark elements. rows that had highlights before go back to
     * plain text first, so only the rows that change are touched.
     * @param {{ segmentIndex: number, start: number, end: number }[]} matches matches in order,
     *   with offsets into each segment's trimmed text
     * @returns {void}
     */
    showMatches(matches) {
      for (const index of markedIndexes) refreshText(index)
      markedIndexes = []
      marks = []
      currentMark = null
      const byRow = new Map()
      for (const match of matches) {
        if (!byRow.has(match.segmentIndex)) byRow.set(match.segmentIndex, [])
        byRow.get(match.segmentIndex).push(match)
      }
      for (const [index, rowMatches] of byRow) {
        const text = segments[index].text.trim()
        const parts = []
        let position = 0
        for (const match of rowMatches) {
          parts.push(text.slice(position, match.start))
          const mark = createElement('mark', {
            className: 'transcript-match',
            text: text.slice(match.start, match.end),
          })
          marks.push(mark)
          parts.push(mark)
          position = match.end
        }
        parts.push(text.slice(position))
        textOf(index).replaceChildren(...parts.filter((part) => part !== ''))
        markedIndexes.push(index)
      }
    },

    /**
     * mark one highlight as the current match.
     * @param {number} matchIndex position in the matches, or -1 for none
     * @returns {HTMLElement | null} the row that holds it, or null
     */
    setCurrentMatch(matchIndex) {
      currentMark?.classList.remove('is-current')
      currentMark = marks[matchIndex] ?? null
      currentMark?.classList.add('is-current')
      return currentMark?.closest('.transcript-row') ?? null
    },
  }
}
