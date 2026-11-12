import { createElement } from '../lib/dom.js'

/**
 * render the shared page for screens that later milestones build.
 * @param {{ title: string }} params page title shown as the heading
 * @returns {HTMLElement} the page section
 * @throws {Error} when the title is missing
 */
export function renderPlaceholder({ title } = {}) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('renderPlaceholder needs a page title')
  }
  return createElement('section', { className: 'page page-placeholder' }, [
    createElement('h1', { className: 'page-title', text: title }),
    createElement('p', { className: 'page-note', text: 'Coming in a later milestone.' }),
  ])
}
