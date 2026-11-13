import { createElement, createIcon } from '../lib/dom.js'
import { assertCourse, formatRecordingCount } from '../lib/format.js'

const folderPaths = ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']
const chevronPaths = ['M9 6l6 6-6 6']

/**
 * render a course folder link with a colored tile, code, and recording count.
 * @param {{ course: { id: string, code: string, color: string, recordingCount: number } }} options
 *   course data
 * @returns {HTMLAnchorElement} the link element
 * @throws {TypeError} when course fields are missing or the color is invalid
 */
export function renderCourseFolder({ course } = {}) {
  assertCourse(course, 'renderCourseFolder')

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
        createElement('span', {
          className: 'course-folder-code',
          text: course.code,
          title: course.code,
        }),
        createElement('span', {
          className: 'course-folder-count',
          text: formatRecordingCount(course.recordingCount),
        }),
      ]),
      createIcon(chevronPaths, { size: 20, className: 'icon course-folder-chevron' }),
    ]
  )
  link.style.setProperty('--course-folder-color', `var(--course-${course.color})`)
  return link
}
