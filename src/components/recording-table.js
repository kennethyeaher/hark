// recording table: the Recent list on home and the list view on the course page

import { createElement, createIcon } from '../lib/dom.js'
import { formatDuration, formatRelativeDate } from '../lib/format.js'
import { renderRecordingIcon } from './recording-card.js'

const checkIconPaths = ['M5 12.5l4.5 4.5L19 7.5']

// column headings in order, with the class that sets each width
const columns = [
  { label: 'Name', className: 'recording-table-name' },
  { label: 'Course', className: 'recording-table-course' },
  { label: 'Length', className: 'recording-table-length' },
  { label: 'Date', className: 'recording-table-date' },
  { label: 'Status', className: 'recording-table-status' },
]

/**
 * Build the status cell content: a check and Summarized, or a progress bar.
 * @param {{ title: string, status: string, progress?: number }} recording recording data
 * @returns {HTMLElement} the status content
 * @throws {RangeError} when the status is unknown or progress is outside 0 to 1
 */
export function renderRecordingStatus(recording) {
  if (recording.status === 'summarized') {
    return createElement('span', { className: 'recording-status recording-status-done' }, [
      createIcon(checkIconPaths, { size: 16 }),
      'Summarized',
    ])
  }
  if (recording.status !== 'transcribing') {
    throw new RangeError(`unknown recording status ${String(recording.status)}`)
  }
  const progress = recording.progress
  if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) {
    throw new RangeError(`progress must be a number from 0 to 1, got ${String(progress)}`)
  }

  // a native looking bar with progressbar semantics and the percent as text beside it
  const percent = Math.round(progress * 100)
  const fill = createElement('span', { className: 'recording-progress-fill' })
  fill.style.width = `${percent}%`
  return createElement('span', { className: 'recording-status recording-status-working' }, [
    createElement(
      'span',
      {
        className: 'recording-progress',
        role: 'progressbar',
        'aria-label': `Transcribing ${recording.title}`,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': percent,
      },
      [fill]
    ),
    createElement('span', { className: 'recording-progress-text', text: `${percent}%` }),
  ])
}

/**
 * Build one table row for a recording.
 * @param {object} recording recording data
 * @param {object} course the course the recording belongs to
 * @param {Date} now the current time for relative dates
 * @returns {HTMLTableRowElement} the row
 */
function renderRow(recording, course, now) {
  const dot = createElement('span', { className: 'recording-table-dot', 'aria-hidden': 'true' })
  dot.style.background = `var(--course-${course.color})`

  return createElement('tr', {}, [
    createElement('th', { scope: 'row', className: 'recording-table-name' }, [
      createElement(
        'a',
        {
          className: 'recording-table-link',
          href: `#/recording/${encodeURIComponent(recording.id)}`,
        },
        [
          renderRecordingIcon({ recording, course }),
          createElement('span', { className: 'recording-table-title', text: recording.title }),
        ]
      ),
    ]),
    createElement('td', { className: 'recording-table-course' }, [dot, course.code]),
    createElement('td', { text: formatDuration(recording.durationSeconds) }),
    createElement('td', { text: formatRelativeDate(recording.recordedAt, now) }),
    createElement('td', {}, [renderRecordingStatus(recording)]),
  ])
}

/**
 * Render a table of recordings with Name, Course, Length, Date, and Status columns.
 * @param {{ recordings: object[], courses: object[], caption: string, now?: Date }} options
 *   recordings in display order, every course they reference, a caption that is
 *   read by screen readers but hidden on screen, and the current time
 * @returns {HTMLElement} a scroll region holding the table, so narrow windows scroll the table
 *   instead of crushing its columns. the region takes focus so keyboard users can scroll it.
 * @throws {TypeError} when the inputs are not arrays, the caption is empty, or a course is missing
 */
export function renderRecordingTable({ recordings, courses, caption, now = new Date() }) {
  if (!Array.isArray(recordings) || !Array.isArray(courses)) {
    throw new TypeError('renderRecordingTable needs recordings and courses arrays')
  }
  if (typeof caption !== 'string' || caption.trim() === '') {
    throw new TypeError('renderRecordingTable needs a caption')
  }
  const courseById = new Map(courses.map((course) => [course.id, course]))

  const rows = recordings.map((recording) => {
    const course = courseById.get(recording.courseId)
    if (!course) {
      throw new TypeError(
        `recording ${recording.id} points to missing course ${recording.courseId}`
      )
    }
    return renderRow(recording, course, now)
  })

  const table = createElement('table', { className: 'recording-table' }, [
    createElement('caption', { className: 'visually-hidden', text: caption }),
    createElement(
      'colgroup',
      {},
      columns.map((column) => createElement('col', { className: column.className }))
    ),
    createElement('thead', {}, [
      createElement(
        'tr',
        {},
        columns.map((column) => createElement('th', { scope: 'col', text: column.label }))
      ),
    ]),
    createElement('tbody', {}, rows),
  ])
  return createElement(
    'div',
    { className: 'table-scroll', role: 'region', 'aria-label': caption, tabindex: 0 },
    [table]
  )
}
