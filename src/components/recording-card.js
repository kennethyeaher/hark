import { createElement, createIcon } from '../lib/dom.js'
import { courseColors, formatDuration, formatRelativeDate } from '../lib/format.js'
import { renderWaveform } from './waveform.js'

const moreIconPaths = ['M5 12h.01', 'M12 12h.01', 'M19 12h.01']

/**
 * Check a recording and course pair before rendering.
 * @param {object} recording recording data
 * @param {object} course course data
 * @returns {void}
 * @throws {TypeError} when either is missing, ids differ, or the color is invalid
 */
function validateRecordingAndCourse(recording, course) {
  if (!recording || typeof recording.id !== 'string' || recording.id === '') {
    throw new TypeError(`recording must have a string id, got ${String(recording?.id)}`)
  }
  if (!course || typeof course.id !== 'string' || typeof course.code !== 'string') {
    throw new TypeError(`course must have a string id and code, got ${String(course?.id)}`)
  }
  if (recording.courseId !== course.id) {
    throw new TypeError(
      `recording ${recording.id} belongs to ${recording.courseId}, not course ${course.id}`
    )
  }
  if (!courseColors.includes(course.color)) {
    throw new TypeError(
      `course color must be one of ${courseColors.join(', ')}, got ${course.color}`
    )
  }
}

/**
 * Render a recording card with waveform, title, meta line, and a placeholder More button.
 * @param {{ recording: object, course: object, meta?: 'course' | 'date', now?: Date }} options
 *   meta picks the course code or the relative date for the meta line
 * @returns {HTMLElement} the article element
 * @throws {TypeError} when recording, course, or meta is invalid
 */
export function renderRecordingCard({ recording, course, meta = 'course', now = new Date() }) {
  validateRecordingAndCourse(recording, course)
  if (meta !== 'course' && meta !== 'date') {
    throw new TypeError(`meta must be 'course' or 'date', got ${String(meta)}`)
  }

  const metaText = meta === 'course' ? course.code : formatRelativeDate(recording.recordedAt, now)

  // the link holds all readable content, the more button sits outside it
  const link = createElement(
    'a',
    {
      className: 'recording-card-link',
      href: `#/recording/${encodeURIComponent(recording.id)}`,
    },
    [
      createElement('span', {
        className: 'recording-card-stripe',
        'aria-hidden': 'true',
        style: `background: var(--course-${course.color})`,
      }),
      renderWaveform({ seed: recording.id, color: course.color }),
      createElement('h3', {
        className: 'recording-card-title',
        text: recording.title,
        title: recording.title,
      }),
      createElement('p', { className: 'recording-card-meta' }, [
        createElement('span', {
          className: 'recording-card-dot',
          'aria-hidden': 'true',
          style: `background: var(--course-${course.color})`,
        }),
        createElement('span', { className: 'recording-card-meta-text', text: metaText }),
        createElement('span', {
          className: 'recording-card-separator',
          'aria-hidden': 'true',
          text: '·',
        }),
        createElement('span', {
          className: 'recording-card-duration',
          text: formatDuration(recording.durationSeconds),
        }),
      ]),
    ]
  )

  // aria disabled keeps the button focusable, it has no behavior yet
  const moreButton = createElement(
    'button',
    {
      type: 'button',
      className: 'recording-card-more',
      'aria-label': 'More options, coming soon',
      'aria-disabled': 'true',
    },
    [createIcon(moreIconPaths, { size: 20 })]
  )

  return createElement('article', { className: 'recording-card' }, [link, moreButton])
}

/**
 * Render the small square icon tile used in recording tables.
 * @param {{ recording: object, course: object }} options recording and its course
 * @returns {HTMLElement} the decorative tile
 * @throws {TypeError} when recording or course is invalid
 */
export function renderRecordingIcon({ recording, course }) {
  validateRecordingAndCourse(recording, course)
  return createElement('span', { className: 'recording-icon', 'aria-hidden': 'true' }, [
    renderWaveform({ seed: recording.id, color: course.color, barCount: 5, height: 16 }),
  ])
}
