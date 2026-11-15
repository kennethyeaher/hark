// the Recording page header: back, course crumb, meta line, title, star, and later actions

import { createElement, createIcon } from '../lib/dom.js'
import { formatDuration, formatFullDate } from '../lib/format.js'

const backIconPaths = ['M15 5l-7 7l7 7']
const chevronIconPaths = ['M9 6l6 6l-6 6']
const starIconPaths = [
  'M12 3.5l2.6 5.3l5.9 .9l-4.25 4.1l1 5.85L12 16.9l-5.25 2.75l1 -5.85L3.5 9.7l5.9 -.9z',
]
const downloadIconPaths = ['M12 4v11', 'M7.5 10.5L12 15l4.5 -4.5', 'M5 19h14']
const moreIconPaths = ['M5 12h.01', 'M12 12h.01', 'M19 12h.01']

/**
 * describe the meta line under the crumb.
 * @param {{ recordedAt: Date, durationSeconds: number }} recording the recording
 * @returns {string} for example `Oct 28, 2026 · 1 hr 14 min`
 */
export function describeRecordingMeta(recording) {
  return `${formatFullDate(recording.recordedAt)} · ${formatDuration(recording.durationSeconds)}`
}

/**
 * render the header.
 * @param {{ recording: object, course: { id: string, code: string, color: string },
 *   onBack: () => void, onStar: (isStarred: boolean) => void }} options the recording and
 *   its course, and what Back and Star do
 * @returns {{ element: HTMLElement, setRecording: (recording: object) => void,
 *   setStarBusy: (isBusy: boolean) => void }} the header, a way to show a changed recording,
 *   and a way to hold the star while a save runs
 */
export function renderRecordingHeader({ recording, course, onBack, onStar }) {
  const backButton = createElement(
    'button',
    { type: 'button', className: 'recording-back', 'aria-label': 'Back' },
    [createIcon(backIconPaths, { size: 18 })]
  )
  backButton.addEventListener('click', () => onBack())

  const dot = createElement('span', { className: 'recording-crumb-dot', 'aria-hidden': 'true' })
  dot.style.background = `var(--course-${course.color})`
  const meta = createElement('span', { className: 'recording-meta' })
  const title = createElement('h1', { className: 'recording-title' })

  const starButton = createElement('button', {
    type: 'button',
    className: 'recording-star',
    'aria-label': 'Star',
  })
  starButton.append(createIcon(starIconPaths, { size: 18 }))
  // a flag, not disabled, so the button keeps keyboard focus while its save runs
  let isStarBusy = false
  starButton.addEventListener('click', () => {
    if (isStarBusy) return
    onStar(starButton.getAttribute('aria-pressed') !== 'true')
  })

  // aria disabled keeps these focusable, as on recording cards, until Milestone 6 gives them work
  const exportButton = createElement(
    'button',
    {
      type: 'button',
      className: 'button button-outline button-small recording-export',
      'aria-disabled': 'true',
      'aria-label': 'Export, coming soon',
    },
    [createIcon(downloadIconPaths, { size: 16 }), 'Export']
  )
  const moreButton = createElement(
    'button',
    {
      type: 'button',
      className: 'recording-more',
      'aria-disabled': 'true',
      'aria-label': 'More options, coming soon',
    },
    [createIcon(moreIconPaths, { size: 18 })]
  )

  const element = createElement('header', { className: 'recording-header' }, [
    backButton,
    createElement('div', { className: 'recording-heading' }, [
      createElement('p', { className: 'recording-crumb' }, [
        createElement(
          'a',
          { className: 'recording-crumb-link', href: `#/course/${encodeURIComponent(course.id)}` },
          [dot, course.code]
        ),
        createIcon(chevronIconPaths, { size: 12, className: 'icon recording-crumb-chevron' }),
        meta,
      ]),
      title,
    ]),
    createElement('div', { className: 'recording-actions' }, [
      starButton,
      exportButton,
      moreButton,
    ]),
  ])

  /**
   * show the recording's title, meta line, and star state.
   * @param {{ title: string, recordedAt: Date, durationSeconds: number, isStarred: boolean }} next
   *   the recording
   * @returns {void}
   */
  function setRecording(next) {
    title.textContent = next.title
    meta.textContent = describeRecordingMeta(next)
    starButton.setAttribute('aria-pressed', String(next.isStarred))
    starButton.classList.toggle('is-starred', next.isStarred)
  }
  setRecording(recording)

  return {
    element,
    setRecording,

    /**
     * hold the star still while its save runs, so a double click does not race.
     * @param {boolean} isBusy true while saving
     * @returns {void}
     */
    setStarBusy(isBusy) {
      isStarBusy = isBusy
    },
  }
}
