// course page: tinted header, filter chips, sort, and the course's recordings

import { createElement, createIcon } from '../lib/dom.js'
import { formatDuration } from '../lib/format.js'
import {
  filterRecordings,
  recordingFilters,
  recordingSorts,
  sortRecordings,
} from '../lib/filters.js'
import { renderRecordingCard } from '../components/recording-card.js'
import { renderRecordingTable } from '../components/recording-table.js'
import { renderNotFound } from './not-found.js'

const folderIconPaths = [
  'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
]
const plusIconPaths = ['M12 5v14', 'M5 12h14']
const chevronDownPaths = ['M6 9l6 6 6-6']

/**
 * Build the tinted course header with the folder tile, names, totals, and the New recording link.
 * @param {{ code: string, name: string, color: string, recordingCount: number, totalSeconds: number }} course course data
 * @returns {HTMLElement} the header element
 */
function renderCourseHeader(course) {
  const tile = createElement('span', { className: 'course-header-tile', 'aria-hidden': 'true' }, [
    createIcon(folderIconPaths, { size: 26 }),
  ])
  tile.style.background = `var(--course-${course.color})`
  const noun = course.recordingCount === 1 ? 'recording' : 'recordings'

  const header = createElement('div', { className: 'course-header' }, [
    tile,
    createElement('div', { className: 'course-header-text' }, [
      createElement('h1', { className: 'course-header-title', text: course.code }),
      createElement('p', { className: 'course-header-meta' }, [
        course.name,
        createElement('span', { 'aria-hidden': 'true', text: ' · ' }),
        createElement('span', { className: 'visually-hidden', text: ', ' }),
        `${course.recordingCount} ${noun}`,
        createElement('span', { 'aria-hidden': 'true', text: ' · ' }),
        createElement('span', { className: 'visually-hidden', text: ', ' }),
        formatDuration(course.totalSeconds),
      ]),
    ]),
    createElement('a', { className: 'button button-primary', href: '#/new' }, [
      createIcon(plusIconPaths),
      'New recording',
    ]),
  ])
  header.style.setProperty('--course-header-color', `var(--course-${course.color})`)
  return header
}

/**
 * Render the course page for one course id.
 * @param {{ id: string }} params route params with the course id
 * @param {{ courses: object[], recordings: object[], view: 'grid' | 'list', now?: Date }} context
 *   app data, the current view, and the current time
 * @returns {HTMLElement} the page, or the not found page when the id is unknown
 * @throws {TypeError} when courses or recordings are not arrays
 */
export function renderCourse({ id }, { courses, recordings, view, now = new Date() }) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderCourse needs courses and recordings arrays')
  }
  const course = courses.find((candidate) => candidate.id === id)
  if (!course) {
    return renderNotFound({ path: `/course/${id}` })
  }
  const courseRecordings = recordings.filter((recording) => recording.courseId === course.id)
  let activeFilter = 'all'
  let activeSort = 'newest'

  // chips are a button group, exactly one is pressed
  const chipButtons = recordingFilters.map((filter) => {
    const button = createElement('button', {
      type: 'button',
      className: 'chip',
      'aria-pressed': String(filter.id === activeFilter),
      text: filter.label,
    })
    button.addEventListener('click', () => {
      activeFilter = filter.id
      for (const chip of chipButtons) {
        chip.setAttribute('aria-pressed', String(chip === button))
      }
      updateResults()
    })
    return button
  })
  const chipGroup = createElement(
    'div',
    { className: 'chip-group', role: 'group', 'aria-label': 'Filter recordings' },
    chipButtons
  )

  // a native select keeps sort keyboard and screen reader friendly
  const sortSelect = createElement(
    'select',
    { className: 'sort-select', id: 'course-sort' },
    recordingSorts.map((sort) => createElement('option', { value: sort.id, text: sort.label }))
  )
  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value
    updateResults()
  })
  const sortControl = createElement('div', { className: 'sort-control' }, [
    createElement('label', { for: 'course-sort', text: 'Sort:' }),
    sortSelect,
    createIcon(chevronDownPaths, { size: 16, className: 'icon sort-chevron' }),
  ])

  const results = createElement('div', { className: 'course-results' })
  const status = createElement('p', { className: 'visually-hidden', role: 'status' })

  /**
   * Redraw the recordings for the current filter, sort, and view, and announce the count.
   * @returns {void}
   */
  function updateResults() {
    const shown = sortRecordings(filterRecordings(courseRecordings, activeFilter, now), activeSort)
    status.textContent = `${shown.length} ${shown.length === 1 ? 'recording' : 'recordings'} shown`
    if (shown.length === 0) {
      results.replaceChildren(
        createElement('p', { className: 'empty-note', text: 'No recordings match this filter.' })
      )
    } else if (view === 'list') {
      results.replaceChildren(
        renderRecordingTable({
          recordings: shown,
          courses,
          caption: `${course.code} recordings`,
          now,
        })
      )
    } else {
      results.replaceChildren(
        createElement(
          'div',
          { className: 'card-grid' },
          shown.map((recording) => renderRecordingCard({ recording, course, meta: 'date', now }))
        )
      )
    }
  }
  updateResults()

  return createElement('div', { className: 'page page-course' }, [
    renderCourseHeader(course),
    createElement('div', { className: 'course-toolbar' }, [chipGroup, sortControl]),
    results,
    status,
  ])
}
