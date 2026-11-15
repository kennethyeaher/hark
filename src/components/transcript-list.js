// the transcript: one button per segment with its time, built once and then updated in place

import { createElement } from '../lib/dom.js'
import { formatClock } from '../lib/format.js'
import { findActiveSegmentIndex } from '../player/active-segment.js'

// more moments than this in one row show as a count after the dots
const maxDotsPerRow = 3

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
 *   setCurrentMatch: (matchIndex: number) => HTMLElement | null, startEditing: () => void,
 *   stopEditing: () => void, getChanges: () => object[], hasChanges: () => boolean,
 *   showEmptyErrors: (indexes: number[]) => void, getField: (index: number) => HTMLElement }}
 *   the list and its updates. edits read and write `segment.text`, so the caller's
 *   segments stay the source of truth.
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
  // the text fields while editing, one per segment
  let fields = null

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

  /**
   * build an edit field for one segment. times are never edited.
   * @param {{ startSeconds: number, text: string }} segment the segment
   * @param {number} index its index
   * @returns {{ wrapper: HTMLElement, field: HTMLTextAreaElement, error: HTMLElement }} the parts
   */
  function buildField(segment, index) {
    const time = formatClock(segment.startSeconds)
    const field = createElement('textarea', {
      className: 'transcript-field',
      rows: 2,
      'aria-label': `Segment at ${time}`,
      'data-index': index,
    })
    field.value = segment.text.trim()
    const error = createElement('p', {
      className: 'transcript-field-error',
      id: `transcript-field-error-${index}`,
    })
    error.hidden = true
    const wrapper = createElement('div', { className: 'transcript-edit-row' }, [
      createElement('span', { className: 'transcript-time', text: time }),
      createElement('div', { className: 'transcript-field-wrap' }, [field, error]),
    ])
    return { wrapper, field, error }
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
        // a few dots fit beside the text; more than that collapse into a count
        const shown = group.slice(0, maxDotsPerRow)
        const extraCount = group.length - shown.length
        row.querySelector('.transcript-moments').replaceChildren(
          ...shown.map((moment) =>
            createElement('span', {
              className: 'transcript-moment-dot',
              'aria-hidden': 'true',
              style: `background: var(--course-${moment.color})`,
            })
          ),
          ...(extraCount > 0
            ? [
                createElement('span', {
                  className: 'transcript-moment-more',
                  'aria-hidden': 'true',
                  text: `+${extraCount}`,
                }),
              ]
            : []),
          createElement('span', {
            className: 'visually-hidden',
            text: `, ${group.length === 1 ? 'moment' : 'moments'} ${group.map((moment) => moment.label).join(', ')}`,
          })
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

    /**
     * turn every row into a text field. the row buttons are kept aside, so stopping puts the
     * same rows back with their active class and moment dots.
     * @returns {void}
     */
    startEditing() {
      if (fields) return
      fields = segments.map((segment, index) => {
        const parts = buildField(segment, index)
        rows[index].replaceWith(parts.wrapper)
        return parts
      })
    },

    /**
     * put the row buttons back, showing any saved text.
     * @returns {void}
     */
    stopEditing() {
      if (!fields) return
      fields.forEach(({ wrapper }, index) => {
        refreshText(index)
        wrapper.replaceWith(rows[index])
      })
      fields = null
    },

    /**
     * list the segments whose trimmed text differs from the saved text.
     * @returns {{ index: number, text: string }[]} the changes, in transcript order
     */
    getChanges() {
      if (!fields) return []
      return fields.flatMap(({ field }, index) => {
        const text = field.value.trim()
        return text === segments[index].text.trim() ? [] : [{ index, text }]
      })
    },

    /**
     * check whether any field differs from the saved text.
     * @returns {boolean} true when there is something to save
     */
    hasChanges() {
      return Boolean(
        fields?.some(({ field }, index) => field.value.trim() !== segments[index].text.trim())
      )
    },

    /**
     * mark empty fields as invalid with an inline message, and clear the mark from the rest.
     * @param {number[]} indexes segments that are empty
     * @returns {void}
     */
    showEmptyErrors(indexes) {
      if (!fields) return
      const invalid = new Set(indexes)
      fields.forEach(({ field, error }, index) => {
        const isInvalid = invalid.has(index)
        error.hidden = !isInvalid
        error.textContent = isInvalid ? 'A segment cannot be empty.' : ''
        if (isInvalid) {
          field.setAttribute('aria-invalid', 'true')
          field.setAttribute('aria-describedby', error.id)
        } else {
          field.removeAttribute('aria-invalid')
          field.removeAttribute('aria-describedby')
        }
      })
    },

    /**
     * read the edit field for a segment.
     * @param {number} index segment index
     * @returns {HTMLTextAreaElement | undefined} the field, while editing
     */
    getField: (index) => fields?.[index]?.field,
  }
}
