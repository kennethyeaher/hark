import { createElement } from '../lib/dom.js'
import { startRouter } from './router.js'
import { renderPlaceholder } from '../pages/placeholder.js'
import { renderNotFound } from '../pages/not-found.js'

// titles for routes whose pages arrive in later milestones
const placeholderTitles = {
  home: 'Home',
  course: 'Course',
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
 * @returns {HTMLElement} the page to show in the content area
 */
function renderPage(route) {
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
  const content = createElement('main', { id: 'content', className: 'app-content' })
  const shell = createElement('div', { className: 'app-shell' }, [
    sidebarSlot,
    createElement('div', { className: 'app-main' }, [topbarSlot, content]),
  ])
  return { shell, sidebarSlot, topbarSlot, content }
}

/**
 * Point the document title at the page and move focus to its heading so
 * keyboard and screen reader users land on the new page.
 * @param {HTMLElement} page the page that was just shown
 * @returns {void}
 */
function announcePage(page) {
  const heading = page.querySelector('h1')
  const title = heading?.textContent.trim() || 'Hark'
  document.title = title === 'Hark' ? 'Hark' : `${title} · Hark`
  if (heading) {
    heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }
}

/**
 * Render the app shell into the root element once, then swap only the page
 * content when the route changes.
 * @param {HTMLElement} root element that receives the app
 * @returns {{ content: HTMLElement, showRoute: (route: object) => HTMLElement, stopRouter: () => void }}
 *   the content region, a function that shows a parsed route, and one that stops listening
 * @throws {Error} when root is missing or is not an html element
 */
export function mountApp(root) {
  if (!(root instanceof HTMLElement)) {
    throw new Error(`mountApp needs an HTMLElement root element, and got ${String(root)}`)
  }

  const layout = buildLayout()
  root.replaceChildren(layout.shell)

  /**
   * Render the page for a route into the content region.
   * @param {{ name: string, params: Record<string, string>, query: Record<string, string> }} route parsed route
   * @returns {HTMLElement} the page that was rendered
   */
  function showRoute(route) {
    const page = renderPage(route)
    layout.content.replaceChildren(page)
    announcePage(page)
    return page
  }

  const stopRouter = startRouter(showRoute)
  return { content: layout.content, showRoute, stopRouter }
}
