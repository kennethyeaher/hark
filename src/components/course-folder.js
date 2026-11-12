import { createElement, createIcon } from '../lib/dom.js'
import { courseColors } from '../lib/format.js'

// tint strength for the folder background. 8 percent keeps the secondary
// label at 4.5:1 or better on all four course colors, 10 percent does not.
export const courseTintPercent = 8

const folderPaths = ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']
const chevronPaths = ['M9 6l6 6-6 6']

/**
 * Render a course folder link with a colored tile, code, and recording count.
 * @param {{ course: { id: string, code: string, color: string, recordingCount: number } }} options
 *   course data
 * @returns {HTMLAnchorElement} the link element
 * @throws {TypeError} when course fields are missing or the color is invalid
 * @throws {RangeError} when recordingCount is not a whole number of zero or more
 */
export function renderCourseFolder({ course }) {
  if (!course || typeof course.id !== 'string' || course.id === '') {
    throw new TypeError(`course must have a string id, got ${String(course?.id)}`)
  }
  if (typeof course.code !== 'string' || course.code === '') {
    throw new TypeError(`course code must be a non empty string, got ${String(course.code)}`)
  }
  if (!courseColors.includes(course.color)) {
    throw new TypeError(
      `course color must be one of ${courseColors.join(', ')}, got ${course.color}`
    )
  }
  if (!Number.isInteger(course.recordingCount) || course.recordingCount < 0) {
    throw new RangeError(`recordingCount must be a whole number, got ${course.recordingCount}`)
  }

  const noun = course.recordingCount === 1 ? 'recording' : 'recordings'
  const tile = createElement('span', { className: 'course-folder-tile', 'aria-hidden': 'true' }, [
    createIcon(folderPaths, { size: 20 }),
  ])
  tile.style.background = `var(--course-${course.color})`

  const link = createElement(
    'a',
    { className: 'course-folder', href: `#/course/${encodeURIComponent(course.id)}` },
    [
      tile,
      createElement('span', { className: 'course-folder-text' }, [
        createElement('span', { className: 'course-folder-code', text: course.code }),
        createElement('span', {
          className: 'course-folder-count',
          text: `${course.recordingCount} ${noun}`,
        }),
      ]),
      createIcon(chevronPaths, { size: 20, className: 'icon course-folder-chevron' }),
    ]
  )
  link.style.setProperty('--course-folder-color', `var(--course-${course.color})`)
  return link
}
