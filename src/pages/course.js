// course page: tinted header, filter chips, sort, and the course's recordings

import { createElement, createIcon } from '../lib/dom.js'
import { assertCourse, formatDuration, formatRecordingCount } from '../lib/format.js'
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

// filter and sort per course id, so a grid or list switch redraws the page without resetting them
const choicesByCourseId = new Map()

/**
 * forget every remembered filter and sort, so each course opens on All and Newest again.
 * @returns {void}
 */
export function clearCourseChoices() {
  choicesByCourseId.clear()
}

/**
 * build the tinted course header with the folder tile, names, totals, and the New recording link.
 * @param {{ code: string, name: string, color: string, recordingCount: number, totalSeconds: number }} course course data
 * @returns {HTMLElement} the header element
 * @throws {TypeError} when the course is missing a field the header reads
 */
function renderCourseHeader(course) {
  assertCourse(course, 'renderCourse')
  if (typeof course.name !== 'string' || !Number.isFinite(course.totalSeconds)) {
    throw new TypeError(`renderCourse needs course ${course.id} to have a name and totalSeconds`)
  }
  const tile = createElement('span', { className: 'course-header-tile', 'aria-hidden': 'true' }, [
    createIcon(folderIconPaths, { size: 26 }),
  ])
  tile.style.background = `var(--course-${course.color})`
  const header = createElement('div', { className: 'course-header' }, [
    tile,
    createElement('div', { className: 'course-header-text' }, [
      createElement('h1', { className: 'course-header-title', text: course.code }),
      createElement('p', { className: 'course-header-meta' }, [
        course.name,
        createElement('span', { 'aria-hidden': 'true', text: ' · ' }),
        createElement('span', { className: 'visually-hidden', text: ', ' }),
        formatRecordingCount(course.recordingCount),
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
 * render the course page for one course id.
 * @param {{ id: string }} params route params with the course id
 * @param {{ courses: object[], recordings: object[], view: 'grid' | 'list', now?: Date }} context
 *   app data, the current view, and the current time
 * @returns {HTMLElement} the page, or the not found page when the id is unknown
 * @throws {TypeError} when courses or recordings are not arrays, or the course is malformed
 */
export function renderCourse({ id }, { courses, recordings, view, now = new Date() }) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderCourse needs courses and recordings arrays')
  }
  const course = courses.find((candidate) => candidate.id === id)
  if (!course) {
    return renderNotFound({ path: `/course/${id}` })
  }
  const header = renderCourseHeader(course)
  const courseRecordings = recordings.filter((recording) => recording.courseId === course.id)
  const recordingsHeading = createElement('h2', {
    className: 'visually-hidden',
    text: 'Recordings',
  })

  // a course with nothing in it gets one line and no filter controls
  if (courseRecordings.length === 0) {
    return createElement('div', { className: 'page page-course' }, [
      header,
      recordingsHeading,
      createElement('p', {
        className: 'empty-note course-empty',
        text: 'No recordings in this course yet.',
      }),
    ])
  }

  const choices = choicesByCourseId.get(course.id) ?? { filter: 'all', sort: 'newest' }
  choicesByCourseId.set(course.id, choices)

  // chips are a button group, exactly one is pressed
  const chipButtons = recordingFilters.map((filter) => {
    const button = createElement('button', {
      type: 'button',
      className: 'chip',
      'aria-pressed': String(filter.id === choices.filter),
      text: filter.label,
    })
    button.addEventListener('click', () => {
      choices.filter = filter.id
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
  sortSelect.value = choices.sort
  sortSelect.addEventListener('change', () => {
    choices.sort = sortSelect.value
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
   * redraw the recordings for the current filter, sort, and view, and announce the count.
   * @returns {void}
   */
  function updateResults() {
    const shown = sortRecordings(
      filterRecordings(courseRecordings, choices.filter, now),
      choices.sort
    )
    status.textContent = `${formatRecordingCount(shown.length)} shown`
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
    header,
    recordingsHeading,
    createElement('div', { className: 'course-toolbar' }, [chipGroup, sortControl]),
    results,
    status,
  ])
}
