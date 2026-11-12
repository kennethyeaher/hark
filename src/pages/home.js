// home page: quick access, course folders, and the recent recordings table

import { createElement } from '../lib/dom.js'
import { sortRecordings } from '../lib/filters.js'
import { renderRecordingCard } from '../components/recording-card.js'
import { renderCourseFolder } from '../components/course-folder.js'
import { renderRecordingTable } from '../components/recording-table.js'

const quickAccessCount = 4
const recentCount = 6

/**
 * build a section with a heading row, an optional link on the right, and a body.
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
 * render the first run page for a library with no courses and no recordings.
 * @param {(() => Promise<void>) | undefined} onLoadSamples writes the sample lectures, when the app offers them
 * @returns {HTMLElement} the empty state page
 *
 * side effect: a click on the sample button calls onLoadSamples and shows any failure in place.
 */
function renderEmptyHome(onLoadSamples) {
  const status = createElement('p', { className: 'empty-state-status', role: 'status' })
  const button = createElement('button', {
    className: 'button button-primary',
    type: 'button',
    text: 'Try with sample lectures',
  })
  let isLoading = false

  /**
   * add the sample lectures once, and show any failure under the button.
   * @returns {Promise<void>} resolves once the attempt is over
   */
  async function handleClick() {
    if (isLoading || !onLoadSamples) return
    // aria-disabled keeps focus on the button while the samples are written
    isLoading = true
    button.setAttribute('aria-disabled', 'true')
    status.textContent = 'Adding sample lectures…'
    try {
      await onLoadSamples()
      // the page usually redraws first, but clear the line in case it is still on screen
      status.textContent = ''
    } catch (error) {
      // the page stays, so the reason goes on screen and in the console instead of a blank state
      status.textContent = `Could not add the sample lectures. ${error.message}`
      status.classList.add('is-error')
      console.error(error)
    } finally {
      isLoading = false
      button.removeAttribute('aria-disabled')
    }
  }
  button.addEventListener('click', handleClick)

  // the hidden h1 keeps the tab title as Home, and the one visible heading is the h2
  return createElement('div', { className: 'page page-home page-home-empty' }, [
    createElement('h1', { className: 'visually-hidden', text: 'Home' }),
    createElement('section', { className: 'empty-state', 'aria-labelledby': 'home-empty-title' }, [
      createElement('h2', {
        className: 'page-title',
        id: 'home-empty-title',
        text: 'No lectures yet',
      }),
      createElement('p', {
        className: 'page-note',
        text: 'Recordings stay in this browser, on this device. Nothing is uploaded.',
      }),
      button,
      status,
    ]),
  ])
}

/**
 * render the home page, or the empty state when there are no courses and no recordings.
 * @param {object} _params route params, unused on home
 * @param {{ courses: object[], recordings: object[], view: 'grid' | 'list', now?: Date,
 *   onLoadSamples?: () => Promise<void> }} context
 *   app data, the current view, the current time, and the action behind the sample button
 * @returns {HTMLElement} the page element
 * @throws {TypeError} when courses or recordings are not arrays, or onLoadSamples is not a function
 */
export function renderHome(
  _params,
  { courses, recordings, view, now = new Date(), onLoadSamples }
) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderHome needs courses and recordings arrays')
  }
  if (onLoadSamples !== undefined && typeof onLoadSamples !== 'function') {
    throw new TypeError('renderHome needs onLoadSamples to be a function when it is given')
  }
  if (courses.length === 0 && recordings.length === 0) return renderEmptyHome(onLoadSamples)
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
