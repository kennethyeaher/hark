import { createElement } from '../lib/dom.js'
import { startRouter } from './router.js'
import { renderPlaceholder } from '../pages/placeholder.js'
import { renderNotFound } from '../pages/not-found.js'
import { renderSidebar, setSidebarActive } from '../components/sidebar.js'
import { destroyTopbar, renderTopbar, setSearchQuery } from '../components/topbar.js'
import { getView, subscribeToView } from './view.js'
import { renderHome } from '../pages/home.js'
import { renderCourse } from '../pages/course.js'

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
  new: 'New recording',
}

/**
 * Build the page element for a route.
 * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
 * @param {{ courses: object[], recordings: object[] }} data app data passed to built pages
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
 * Build the layout that stays on screen across routes.
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
 * Point the document title at the page and move focus to its heading so
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
 * Render the app shell into the root element once, then swap only the page
 * content when the route changes.
 * @param {HTMLElement} root element that receives the app
 * @param {{ courses?: object[], recordings?: object[] }} [data] courses and recordings to show
 * @returns {{ content: HTMLElement, showRoute: (route: object) => HTMLElement, stopRouter: () => void }}
 *   the content region, a function that shows a parsed route, and one that stops listening
 * @throws {Error} when root is missing or is not an html element
 */
export function mountApp(root, { courses = [], recordings = [] } = {}) {
  if (!(root instanceof HTMLElement)) {
    throw new Error(`mountApp needs an HTMLElement root element, and got ${String(root)}`)
  }

  const layout = buildLayout()
  const sidebar = renderSidebar({ courses, activeRoute: { name: 'home', params: {}, query: {} } })
  layout.sidebarSlot.append(sidebar)
  const topbar = renderTopbar()
  layout.topbarSlot.append(topbar)
  root.replaceChildren(layout.shell)
  let currentRoute = null
  let hasShownPage = false
  const data = { courses, recordings }

  /**
   * Render the page for a route into the content region.
   * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
   * @returns {HTMLElement} the page that was rendered
   */
  function showRoute(route) {
    currentRoute = route
    const page = renderPage(route, data)
    layout.content.replaceChildren(page)
    setSidebarActive(sidebar, route)
    setSearchQuery(topbar, route.name === 'search' ? (route.query.q ?? '') : '')
    announcePage(page, hasShownPage)
    hasShownPage = true
    return page
  }

  // a grid or list switch redraws the page in place, without moving focus off the toggle
  const stopViewUpdates = subscribeToView(() => {
    if (currentRoute) layout.content.replaceChildren(renderPage(currentRoute, data))
  })

  const stopListening = startRouter(showRoute)

  /**
   * Stop following hash and view changes, and release the top bar's view subscription.
   * @returns {void}
   */
  function stopRouter() {
    stopListening()
    stopViewUpdates()
    destroyTopbar(topbar)
  }

  return { content: layout.content, showRoute, stopRouter }
}
