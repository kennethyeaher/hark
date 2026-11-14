import { createElement } from '../lib/dom.js'
import { describeFocus, restoreFocus } from '../lib/focus.js'
import { startRouter } from './router.js'
import { renderPlaceholder } from '../pages/placeholder.js'
import { renderNotFound } from '../pages/not-found.js'
import { renderSidebar, setSidebarActive } from '../components/sidebar.js'
import { destroyTopbar, renderTopbar, setSearchQuery } from '../components/topbar.js'
import { getView, subscribeToView } from './view.js'
import { renderHome } from '../pages/home.js'
import { renderCourse } from '../pages/course.js'
import { renderNewRecordingSheet } from '../pages/new-recording.js'

// pages built so far, keyed by route name
const pageRenderers = {
  home: renderHome,
  course: renderCourse,
}

// titles for routes whose pages arrive in later milestones
const placeholderTitles = {
  recording: 'Recording',
  recordings: 'Recordings',
  notes: 'Notes',
  starred: 'Starred',
  trash: 'Trash',
  settings: 'Settings',
  search: 'Search',
}

const homeRoute = { name: 'home', params: {}, query: {} }

/**
 * build the page element for a route.
 * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
 * @param {{ courses: object[], recordings: object[], onLoadSamples?: () => Promise<void> }} data
 *   app data and actions passed to built pages
 * @returns {HTMLElement} the page to show in the content area
 */
function renderPage(route, data) {
  if (Object.hasOwn(pageRenderers, route.name)) {
    return pageRenderers[route.name](route.params, { ...data, view: getView(), query: route.query })
  }
  if (Object.hasOwn(placeholderTitles, route.name)) {
    return renderPlaceholder({ title: placeholderTitles[route.name] })
  }
  return renderNotFound(route.params)
}

/**
 * build the layout that stays on screen across routes.
 * @returns {{ shell: HTMLElement, sidebarSlot: HTMLElement, topbarSlot: HTMLElement, content: HTMLElement }}
 *   the shell and the three regions inside it
 */
function buildLayout() {
  const sidebarSlot = createElement('div', { className: 'app-sidebar' })
  const topbarSlot = createElement('header', { className: 'app-topbar' })
  const content = createElement('main', { id: 'content', className: 'app-content', tabindex: -1 })

  // skip link: the hash belongs to the router, so the click moves focus itself instead of navigating
  const skipLink = createElement('a', {
    className: 'skip-link',
    href: '#content',
    text: 'Skip to content',
  })
  skipLink.addEventListener('click', (event) => {
    event.preventDefault()
    content.focus()
  })

  const shell = createElement('div', { className: 'app-shell' }, [
    skipLink,
    sidebarSlot,
    createElement('div', { className: 'app-main' }, [topbarSlot, content]),
  ])
  return { shell, sidebarSlot, topbarSlot, content }
}

/**
 * point the document title at the page and move focus to its heading so
 * keyboard and screen reader users land on the new page.
 * @param {HTMLElement} page the page that was just shown
 * @param {boolean} shouldMoveFocus false on first load, so focus starts at the top of the document
 * @returns {void}
 */
function announcePage(page, shouldMoveFocus) {
  const heading = page.querySelector('h1')
  const title = heading?.textContent.trim() || 'Hark'
  document.title = title === 'Hark' ? 'Hark' : `${title} · Hark`
  if (heading && shouldMoveFocus) {
    heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }
}

/**
 * send the browser to a hash route.
 * @param {string} hash target such as `#/`
 * @returns {void}
 */
function navigateToHash(hash) {
  window.location.hash = hash
}

/**
 * render the app shell into the root element once, then swap only the page
 * content when the route changes. the new recording route opens a sheet over the page that
 * was showing instead of replacing it.
 * @param {HTMLElement} root element that receives the app
 * @param {{ courses?: object[], recordings?: object[], onLoadSamples?: () => Promise<void>,
 *   navigate?: (hash: string) => void }} [data] courses and recordings to show, the action
 *   behind the empty state's sample button, and how to change the route
 * @returns {{ content: HTMLElement, showRoute: (route: object) => HTMLElement,
 *   updateData: (next: { courses: object[], recordings: object[] }) => void, stopRouter: () => void }}
 *   the content region, a function that shows a parsed route, one that redraws with new data,
 *   and one that stops listening
 * @throws {Error} when root is missing or is not an html element
 */
export function mountApp(
  root,
  { courses = [], recordings = [], onLoadSamples, navigate = navigateToHash } = {}
) {
  if (!(root instanceof HTMLElement)) {
    throw new Error(`mountApp needs an HTMLElement root element, and got ${String(root)}`)
  }

  const layout = buildLayout()
  let sidebar = renderSidebar({ courses, activeRoute: homeRoute })
  layout.sidebarSlot.append(sidebar)
  const topbar = renderTopbar()
  layout.topbarSlot.append(topbar)
  root.replaceChildren(layout.shell)
  let currentRoute = null
  let hasShownPage = false
  const data = { courses, recordings, onLoadSamples }
  // the open New recording sheet, the route that opened it, and the hash of the page under it
  let sheet = null
  let backgroundHash = '#/'

  /**
   * render the page for a route into the content region.
   * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
   * @returns {HTMLElement} the page that was rendered
   */
  function renderBackground(route) {
    currentRoute = route
    const page = renderPage(route, data)
    layout.content.replaceChildren(page)
    setSearchQuery(topbar, route.name === 'search' ? (route.query.q ?? '') : '')
    return page
  }

  /**
   * close and remove the sheet when it is open.
   * @returns {boolean} true when the sheet was closed by its own Close, Cancel, Escape, or
   *   backdrop, so focus goes back to the New button
   */
  function closeSheet() {
    if (!sheet) return false
    const { dialog, wasDismissed } = sheet
    sheet = null
    if (dialog.open) dialog.close()
    dialog.remove()
    return wasDismissed
  }

  /**
   * open the New recording sheet over the current page, or over Home on a first load.
   * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route
   *   the new recording route, with an optional course in its query
   * @returns {HTMLDialogElement} the open sheet
   */
  function showSheet(route) {
    if (!currentRoute) renderBackground(homeRoute)
    setSidebarActive(sidebar, route)
    document.title = 'New recording · Hark'
    hasShownPage = true
    if (sheet) return sheet.dialog

    const dialog = renderNewRecordingSheet({
      courses: data.courses,
      initialCourseId: route.query.course,
      onDismiss: () => {
        if (sheet) sheet.wasDismissed = true
        navigate(backgroundHash)
      },
      onStart: (recordingId) => navigate(`#/transcribe/${encodeURIComponent(recordingId)}`),
    })
    sheet = { dialog, route, wasDismissed: false }
    // the browser can close a modal on its own, for example on a second Escape, so a close
    // that did not come from closeSheet counts as a dismissal
    dialog.addEventListener('close', () => {
      if (sheet?.dialog !== dialog) return
      sheet.wasDismissed = true
      navigate(backgroundHash)
    })
    layout.shell.append(dialog)
    dialog.showModal()
    return dialog
  }

  /**
   * show a parsed route: a page in the content region, or the sheet over it.
   * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
   * @returns {HTMLElement} the page that was rendered, or the sheet
   */
  function showRoute(route) {
    if (route.name === 'new') return showSheet(route)
    const wasSheetDismissed = closeSheet()
    backgroundHash = window.location.hash || '#/'
    const page = renderBackground(route)
    setSidebarActive(sidebar, route)
    announcePage(page, hasShownPage && !wasSheetDismissed)
    // a dismissed sheet hands focus back to the button that opened it
    if (wasSheetDismissed) sidebar.querySelector('.sidebar-new-button')?.focus()
    hasShownPage = true
    return page
  }

  /**
   * redraw the current page after a grid or list switch, without moving focus off the toggle.
   * @returns {void}
   */
  function redrawForView() {
    if (currentRoute) layout.content.replaceChildren(renderPage(currentRoute, data))
  }
  const stopViewUpdates = subscribeToView(redrawForView)

  /**
   * redraw the sidebar and the current page with new data, keeping focus where it was.
   * @param {{ courses: object[], recordings: object[] }} next the reloaded library
   * @returns {void}
   * @throws {TypeError} when courses or recordings is not an array
   */
  function updateData(next) {
    if (!Array.isArray(next?.courses) || !Array.isArray(next?.recordings)) {
      throw new TypeError('updateData needs courses and recordings arrays')
    }
    data.courses = next.courses
    data.recordings = next.recordings
    // the top bar is not redrawn, so only focus in the sidebar or the page needs to be found again
    const sidebarFocus = describeFocus(layout.sidebarSlot)
    const contentFocus = describeFocus(layout.content)

    const activeRoute = sheet?.route ?? currentRoute ?? homeRoute
    const nextSidebar = renderSidebar({ courses: data.courses, activeRoute })
    sidebar.replaceWith(nextSidebar)
    sidebar = nextSidebar
    if (currentRoute) layout.content.replaceChildren(renderPage(currentRoute, data))

    // the old focused element may be gone, so find its rebuilt copy or fall back to the content
    restoreFocus(layout.sidebarSlot, sidebarFocus, layout.content)
    restoreFocus(layout.content, contentFocus, layout.content)
  }

  const stopListening = startRouter(showRoute)

  /**
   * stop following hash and view changes, and release the top bar's view subscription.
   * @returns {void}
   */
  function stopRouter() {
    stopListening()
    closeSheet()
    stopViewUpdates()
    destroyTopbar(topbar)
  }

  return { content: layout.content, showRoute, updateData, stopRouter }
}
