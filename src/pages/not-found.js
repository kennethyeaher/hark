import { createElement } from '../lib/dom.js'

/**
 * Render the page for a route or id that does not exist.
 * @param {{ path?: string }} [params] the path that did not match, shown to the user
 * @returns {HTMLElement} the page section
 */
export function renderNotFound({ path } = {}) {
  const message = path
    ? `Nothing lives at ${path}. It may have moved or been deleted.`
    : 'This page does not exist. It may have moved or been deleted.'
  return createElement('section', { className: 'page page-not-found' }, [
    createElement('h1', { className: 'page-title', text: 'Page not found' }),
    createElement('p', { className: 'page-note', text: message }),
    createElement('a', { className: 'page-link', href: '#/', text: 'Go to Home' }),
  ])
}
