// optional hooks a page can attach to its element, so the shell can update it in place and
// tell it when it leaves. most pages have none and are simply redrawn.

const hooksByPage = new WeakMap()

/**
 * attach hooks to a page element.
 * @param {HTMLElement} page the page element a renderer returned
 * @param {{ onData?: (data: object) => void, onLeave?: () => void }} hooks onData takes new
 *   library data instead of a full redraw, and onLeave runs once when the page is replaced
 * @returns {void}
 * @throws {TypeError} when page is not an element or a hook is not a function
 */
export function setPageHooks(page, hooks) {
  if (!(page instanceof HTMLElement)) {
    throw new TypeError(`setPageHooks needs an HTMLElement page, got ${String(page)}`)
  }
  for (const name of ['onData', 'onLeave']) {
    if (hooks?.[name] !== undefined && typeof hooks[name] !== 'function') {
      throw new TypeError(`page hook ${name} must be a function`)
    }
  }
  hooksByPage.set(page, { ...hooks })
}

/**
 * read the hooks of a page element.
 * @param {Element | null | undefined} page a page element, or nothing
 * @returns {{ onData?: (data: object) => void, onLeave?: () => void }} the hooks, or an empty object
 */
export function getPageHooks(page) {
  return (page && hooksByPage.get(page)) ?? {}
}

/**
 * run a page's leave hook once and forget its hooks, so a second call does nothing.
 * @param {Element | null | undefined} page the page that is being replaced
 * @returns {void}
 */
export function leavePage(page) {
  const { onLeave } = getPageHooks(page)
  if (page) hooksByPage.delete(page)
  onLeave?.()
}
