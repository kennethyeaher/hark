// home page: quick access, course folders, and the recent recordings table

import { createElement } from '../lib/dom.js'
import { sortRecordings } from '../lib/filters.js'
import { renderRecordingCard } from '../components/recording-card.js'
import { renderCourseFolder } from '../components/course-folder.js'
import { renderRecordingTable } from '../components/recording-table.js'

const quickAccessCount = 4
const recentCount = 6

/**
 * Build a section with a heading row, an optional link on the right, and a body.
 * @param {{ title: string, link?: { href: string, text: string, hiddenText: string }, body: HTMLElement }} options
 *   section title, the link with extra screen reader text, and the content
 * @returns {HTMLElement} the section
 */
function renderSection({ title, link, body }) {
  const headingId = `home-${title.toLowerCase().replace(/\s+/g, '-')}`
  const header = createElement('div', { className: 'section-header' }, [
    createElement('h2', { className: 'section-title', id: headingId, text: title }),
    link &&
      createElement('a', { className: 'section-link', href: link.href }, [
        link.text,
        createElement('span', { className: 'visually-hidden', text: ` ${link.hiddenText}` }),
      ]),
  ])
  return createElement('section', { className: 'home-section', 'aria-labelledby': headingId }, [
    header,
    body,
  ])
}

/**
 * Render the home page.
 * @param {object} _params route params, unused on home
 * @param {{ courses: object[], recordings: object[], view: 'grid' | 'list', now?: Date }} context
 *   app data, the current view, and the current time
 * @returns {HTMLElement} the page element
 * @throws {TypeError} when courses or recordings are not arrays
 */
export function renderHome(_params, { courses, recordings, view, now = new Date() }) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderHome needs courses and recordings arrays')
  }
  const courseById = new Map(courses.map((course) => [course.id, course]))
  const newestFirst = sortRecordings(recordings, 'newest')
  const quickAccess = newestFirst.slice(0, quickAccessCount)

  // quick access shows cards in grid view and table rows in list view
  const quickAccessBody =
    view === 'list'
      ? renderRecordingTable({
          recordings: quickAccess,
          courses,
          caption: 'Quick access recordings',
          now,
        })
      : createElement(
          'div',
          { className: 'card-grid' },
          quickAccess.map((recording) =>
            renderRecordingCard({ recording, course: courseById.get(recording.courseId), now })
          )
        )

  const courseGrid = createElement(
    'div',
    { className: 'folder-grid' },
    courses.map((course) => renderCourseFolder({ course }))
  )

  const recentTable = renderRecordingTable({
    recordings: newestFirst.slice(0, recentCount),
    courses,
    caption: 'Recent recordings',
    now,
  })

  return createElement('div', { className: 'page page-home' }, [
    createElement('h1', { className: 'visually-hidden', text: 'Home' }),
    renderSection({
      title: 'Quick access',
      link: { href: '#/recordings', text: 'See all', hiddenText: 'recordings' },
      body: quickAccessBody,
    }),
    renderSection({
      title: 'Courses',
      link: { href: '#/settings', text: 'Manage', hiddenText: 'courses' },
      body: courseGrid,
    }),
    renderSection({ title: 'Recent', body: recentTable }),
  ])
}
