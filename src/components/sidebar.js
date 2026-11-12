// sidebar for the app shell: brand, new button, primary navigation, courses, storage

import { createElement, createIcon, createSvgElement } from '../lib/dom.js'

// icon path data on a 24 unit grid, one string per path
const iconPaths = {
  home: ['M3 11l9-8 9 8', 'M5 9.5V20h14V9.5', 'M10 20v-6h4v6'],
  recordings: [
    'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z',
    'M5 11a7 7 0 0 0 14 0',
    'M12 18v3',
  ],
  notes: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  starred: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  settings: [
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    'M12 2v2.5',
    'M12 19.5V22',
    'M2 12h2.5',
    'M19.5 12H22',
    'M4.9 4.9l1.8 1.8',
    'M17.3 17.3l1.8 1.8',
    'M4.9 19.1l1.8-1.8',
    'M17.3 6.7l1.8-1.8',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
}

// main navigation rows in display order, keyed by the route name they match
const mainLinks = [
  { key: 'home', label: 'Home', href: '#/' },
  { key: 'recordings', label: 'Recordings', href: '#/recordings' },
  { key: 'notes', label: 'Notes', href: '#/notes' },
  { key: 'starred', label: 'Starred', href: '#/starred' },
  { key: 'trash', label: 'Trash', href: '#/trash' },
]

const settingsLink = { key: 'settings', label: 'Settings', href: '#/settings' }

const courseColors = ['indigo', 'teal', 'orange', 'pink']
const bytesPerKilobyte = 1024

/**
 * Check that the courses argument is an array of well formed course objects.
 * @param {unknown} courses value passed to renderSidebar
 * @returns {void}
 * @throws {TypeError} when courses or any course in it is malformed
 */
function validateCourses(courses) {
  if (!Array.isArray(courses)) {
    throw new TypeError('renderSidebar needs courses to be an array')
  }
  courses.forEach((course, index) => {
    if (course === null || typeof course !== 'object') {
      throw new TypeError(`course at index ${index} must be an object`)
    }
    if (typeof course.id !== 'string' || course.id === '') {
      throw new TypeError(`course at index ${index} needs a non empty string id`)
    }
    if (typeof course.code !== 'string' || course.code === '') {
      throw new TypeError(`course at index ${index} needs a non empty string code`)
    }
    if (!courseColors.includes(course.color)) {
      throw new TypeError(`course ${course.id} needs a color of ${courseColors.join(', ')}`)
    }
    if (!Number.isInteger(course.recordingCount) || course.recordingCount < 0) {
      throw new TypeError(`course ${course.id} needs a recordingCount of 0 or more`)
    }
  })
}

/**
 * Format a byte count as KB, MB, or GB for display.
 * @param {number} bytes number of bytes, 0 or more
 * @returns {string} text such as `512 KB`, `38.5 MB`, or `4.2 GB`
 * @throws {TypeError} when bytes is not a finite number of 0 or more
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError(`formatBytes needs a finite number of 0 or more, and got ${String(bytes)}`)
  }
  const kilobytes = bytes / bytesPerKilobyte
  if (kilobytes < bytesPerKilobyte) return `${Math.round(kilobytes)} KB`
  const megabytes = kilobytes / bytesPerKilobyte
  if (megabytes < bytesPerKilobyte) return `${megabytes.toFixed(1)} MB`
  return `${(megabytes / bytesPerKilobyte).toFixed(1)} GB`
}

/**
 * Build the text for a number of recordings with the right plural.
 * @param {number} count number of recordings
 * @returns {string} text such as `1 recording` or `38 recordings`
 */
function formatRecordingCount(count) {
  return `${count} ${count === 1 ? 'recording' : 'recordings'}`
}

/**
 * Build the Hark mark as an inline svg copied from the favicon.
 * @returns {SVGSVGElement} decorative svg element
 */
function createMark() {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 128 128',
    width: 30,
    height: 30,
    class: 'sidebar-mark',
    'aria-hidden': 'true',
    focusable: 'false',
  })
  const group = createSvgElement('g', { transform: 'translate(-72 -86)' })
  group.append(
    createSvgElement('rect', {
      x: 72,
      y: 86,
      width: 128,
      height: 128,
      rx: 36,
      class: 'sidebar-mark-tile',
    })
  )
  const bars = [
    { x: 112, y: 130, height: 40 },
    { x: 129, y: 113, height: 74 },
    { x: 146, y: 123, height: 54 },
  ]
  for (const bar of bars) {
    group.append(createSvgElement('rect', { ...bar, width: 14, rx: 4, class: 'sidebar-mark-bar' }))
  }
  svg.append(group)
  return svg
}

/**
 * Build one navigation row with an icon and a label.
 * @param {{ key: string, label: string, href: string }} link row definition
 * @returns {HTMLLIElement} list item holding the link
 */
function createNavItem(link) {
  const anchor = createElement('a', {
    className: 'sidebar-nav-link',
    href: link.href,
    'data-route-key': link.key,
  })
  anchor.append(
    createIcon(iconPaths[link.key]),
    createElement('span', { className: 'sidebar-nav-label', text: link.label })
  )
  return createElement('li', { className: 'sidebar-item' }, [anchor])
}

/**
 * Build one course row with a color dot, the code, and the recording count.
 * @param {{ id: string, code: string, color: string, recordingCount: number }} course course data
 * @returns {HTMLLIElement} list item holding the link
 */
function createCourseItem(course) {
  const unit = course.recordingCount === 1 ? ' recording' : ' recordings'
  const anchor = createElement('a', {
    className: 'sidebar-course-link',
    href: `#/course/${encodeURIComponent(course.id)}`,
    'data-course-id': course.id,
  })
  const dot = createElement('span', { className: 'sidebar-course-dot', 'aria-hidden': 'true' })
  dot.style.backgroundColor = `var(--course-${course.color})`
  anchor.append(
    dot,
    createElement('span', { className: 'sidebar-course-code', text: course.code }),
    createElement('span', { className: 'sidebar-course-count' }, [
      String(course.recordingCount),
      createElement('span', { className: 'visually-hidden', text: unit }),
    ])
  )
  return createElement('li', { className: 'sidebar-item' }, [anchor])
}

/**
 * Build the brand link with the mark and wordmark.
 * @returns {HTMLAnchorElement} link to the home route
 */
function createBrand() {
  return createElement('a', { className: 'sidebar-brand', href: '#/', 'aria-label': 'Hark home' }, [
    createMark(),
    createElement('span', { className: 'sidebar-wordmark', text: 'Hark' }),
  ])
}

/**
 * Build the New recording pill link.
 * @returns {HTMLAnchorElement} link to the new recording route
 */
function createNewButton() {
  return createElement('a', { className: 'sidebar-new-button', href: '#/new' }, [
    createIcon(iconPaths.plus),
    createElement('span', { text: 'New' }),
    createElement('span', { className: 'visually-hidden', text: ' recording' }),
  ])
}

/**
 * Build the storage block that shows used space and the recording count.
 * @param {number} recordingCount total recordings across all courses
 * @returns {HTMLDivElement} block that starts in the count only state
 */
function createStorageBlock(recordingCount) {
  const fill = createElement('div', { className: 'sidebar-meter-fill' })
  const meter = createElement(
    'div',
    {
      className: 'sidebar-meter',
      role: 'meter',
      'aria-label': 'Storage used on this device',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      hidden: true,
    },
    [fill]
  )
  return createElement('div', { className: 'sidebar-storage' }, [
    createElement('p', { className: 'sidebar-storage-title', text: 'On this device' }),
    meter,
    createElement('p', {
      className: 'sidebar-storage-detail',
      text: formatRecordingCount(recordingCount),
    }),
  ])
}

/**
 * Show real storage usage in the storage block, or fall back to the count only line.
 * @param {HTMLElement} meterElement the `.sidebar-storage` block from renderSidebar
 * @param {number} recordingCount total recordings across all courses
 * @param {{ estimate?: () => Promise<{ usage?: number, quota?: number }> }} [storage]
 *   storage manager, defaults to navigator.storage
 * @returns {Promise<void>} resolves after the block is updated
 * @throws {TypeError} when meterElement is not an element or recordingCount is invalid
 */
export async function updateStorageMeter(
  meterElement,
  recordingCount,
  storage = globalThis.navigator?.storage
) {
  if (!(meterElement instanceof Element)) {
    throw new TypeError('updateStorageMeter needs an element')
  }
  if (!Number.isInteger(recordingCount) || recordingCount < 0) {
    throw new TypeError('updateStorageMeter needs a recordingCount of 0 or more')
  }
  const track = meterElement.querySelector('.sidebar-meter')
  const fill = meterElement.querySelector('.sidebar-meter-fill')
  const detail = meterElement.querySelector('.sidebar-storage-detail')
  const countText = formatRecordingCount(recordingCount)

  // ask the browser for an estimate, and fall back to the count when it cannot answer
  let estimate = null
  if (typeof storage?.estimate === 'function') {
    try {
      estimate = await storage.estimate()
    } catch {
      estimate = null
    }
  }
  const usage = estimate?.usage
  const quota = estimate?.quota
  const isUsable = Number.isFinite(usage) && usage >= 0 && Number.isFinite(quota) && quota > 0
  if (!isUsable) {
    track.hidden = true
    detail.textContent = countText
    return
  }

  // show the used share as a bar and the used size as text
  const percent = Math.min(100, Math.max(0, (usage / quota) * 100))
  fill.style.width = `${percent}%`
  track.setAttribute('aria-valuenow', String(Math.round(percent)))
  track.setAttribute('aria-valuetext', `${formatBytes(usage)} used`)
  track.hidden = false
  detail.textContent = `${formatBytes(usage)} · ${countText}`
}

/**
 * Mark exactly one sidebar link as the current page, or none.
 * @param {HTMLElement} sidebarElement element returned by renderSidebar
 * @param {{ name: string, params?: Record<string, string> }} route the active route
 * @returns {void}
 * @throws {TypeError} when sidebarElement is not an element or route has no name
 */
export function setSidebarActive(sidebarElement, route) {
  if (!(sidebarElement instanceof Element)) {
    throw new TypeError('setSidebarActive needs a sidebar element')
  }
  if (route === null || typeof route !== 'object' || typeof route.name !== 'string') {
    throw new TypeError('setSidebarActive needs a route object with a name')
  }
  for (const link of sidebarElement.querySelectorAll('[aria-current]')) {
    link.removeAttribute('aria-current')
  }

  // find the one link that matches the route, if any
  let match = null
  if (route.name === 'home') {
    match = sidebarElement.querySelector('[data-route-key="home"]')
  } else if (route.name === 'course') {
    const courseLinks = sidebarElement.querySelectorAll('[data-course-id]')
    match = [...courseLinks].find((link) => link.dataset.courseId === route.params?.id) ?? null
  } else {
    const keys = [...mainLinks, settingsLink].map((link) => link.key)
    if (keys.includes(route.name)) {
      match = sidebarElement.querySelector(`[data-route-key="${route.name}"]`)
    }
  }
  match?.setAttribute('aria-current', 'page')
}

/**
 * Build the sidebar for the app shell.
 * @param {{ courses: Array<{ id: string, code: string, color: string, recordingCount: number }>,
 *   activeRoute: { name: string, params?: Record<string, string> } }} options
 *   course list and the current route
 * @returns {HTMLElement} sidebar element ready to mount
 * @throws {TypeError} when courses is malformed
 *
 * side effect: starts a storage estimate that updates the storage block when it resolves.
 */
export function renderSidebar({ courses, activeRoute }) {
  validateCourses(courses)
  const totalRecordings = courses.reduce((sum, course) => sum + course.recordingCount, 0)

  // main list and course list share one primary nav
  const mainList = createElement('ul', { className: 'sidebar-list' }, mainLinks.map(createNavItem))
  const courseHeading = createElement('h2', { className: 'sidebar-heading', text: 'Courses' })
  const courseList = createElement(
    'ul',
    { className: 'sidebar-list' },
    courses.map(createCourseItem)
  )
  const settingsList = createElement('ul', { className: 'sidebar-list sidebar-list-bottom' }, [
    createNavItem(settingsLink),
  ])
  const nav = createElement('nav', { className: 'sidebar-nav', 'aria-label': 'Primary' }, [
    mainList,
    courseHeading,
    courseList,
    settingsList,
  ])

  const storageBlock = createStorageBlock(totalRecordings)
  const sidebar = createElement('div', { className: 'sidebar' }, [
    createBrand(),
    createNewButton(),
    nav,
    storageBlock,
  ])
  setSidebarActive(sidebar, activeRoute)

  // fire and forget: updateStorageMeter handles its own estimate failures
  updateStorageMeter(storageBlock, totalRecordings)
  return sidebar
}
