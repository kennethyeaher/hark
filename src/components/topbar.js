// top bar: a search field that grows and a grid or list view toggle

import { createElement, createIcon } from '../lib/dom.js'
import { getView, setView, subscribeToView } from '../app/view.js'

const cleanupByElement = new WeakMap()

const searchIconPaths = ['M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z', 'M20 20l-4-4']
const gridIconPaths = ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z']
const listIconPaths = ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01']

const viewOptions = [
  { view: 'grid', label: 'Grid view', iconPaths: gridIconPaths },
  { view: 'list', label: 'List view', iconPaths: listIconPaths },
]

/**
 * Build the top bar with the search form and the view toggle.
 * The bar lives for the whole app, but `destroyTopbar` removes its view subscription.
 * @param {{ navigate?: (hash: string) => void, initialQuery?: string, viewStore?: { getView: () => string, setView: (view: string) => void, subscribeToView: (listener: (view: string) => void) => () => void } }} [options]
 *   `navigate` receives the target hash, `initialQuery` fills the field, `viewStore` defaults to the shared store
 * @returns {HTMLElement} the top bar element
 * @throws {TypeError} when navigate is not a function or initialQuery is not a string
 */
export function renderTopbar({
  navigate = (hash) => {
    window.location.hash = hash
  },
  initialQuery = '',
  viewStore = { getView, setView, subscribeToView },
} = {}) {
  if (typeof navigate !== 'function') throw new TypeError('navigate must be a function')
  if (typeof initialQuery !== 'string') throw new TypeError('initialQuery must be a string')

  // search form with a hidden label, the field, and a decorative magnifier
  const input = createElement('input', {
    id: 'topbar-search',
    className: 'topbar-input',
    type: 'search',
    name: 'q',
    placeholder: 'Search recordings and notes',
    autocomplete: 'off',
  })
  input.value = initialQuery
  const form = createElement('form', { className: 'topbar-search', role: 'search' }, [
    createElement('label', {
      className: 'visually-hidden',
      for: 'topbar-search',
      text: 'Search recordings and notes',
    }),
    createIcon(searchIconPaths, { className: 'icon topbar-search-icon' }),
    input,
  ])
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const trimmedQuery = input.value.trim()
    if (trimmedQuery === '') return
    navigate(`#/search?q=${encodeURIComponent(trimmedQuery)}`)
  })

  // view toggle, one icon button per view
  const buttonByView = new Map()
  const group = createElement('div', {
    className: 'topbar-toggle',
    role: 'group',
    'aria-label': 'View',
  })
  for (const { view, label, iconPaths } of viewOptions) {
    const button = createElement(
      'button',
      { className: 'topbar-toggle-button', type: 'button', 'aria-label': label },
      [createIcon(iconPaths)]
    )
    button.addEventListener('click', () => viewStore.setView(view))
    buttonByView.set(view, button)
    group.append(button)
  }

  /**
   * Mark the button for the current view as pressed.
   * @param {string} currentView `grid` or `list`
   * @returns {void}
   */
  const updatePressedState = (currentView) => {
    for (const [view, button] of buttonByView) {
      const isPressed = view === currentView
      button.setAttribute('aria-pressed', String(isPressed))
    }
  }
  updatePressedState(viewStore.getView())
  const unsubscribe = viewStore.subscribeToView(updatePressedState)

  const topbar = createElement('div', { className: 'topbar' }, [form, group])
  cleanupByElement.set(topbar, unsubscribe)
  return topbar
}

/**
 * Set the search field text, for example when the route is a search page.
 * @param {HTMLElement} topbarElement an element returned by `renderTopbar`
 * @param {string} query the text to show
 * @returns {void}
 * @throws {Error} when the element has no search field or the query is not a string
 */
export function setSearchQuery(topbarElement, query) {
  if (typeof query !== 'string') throw new TypeError('query must be a string')
  const input = topbarElement?.querySelector?.('input[name="q"]')
  if (!input) throw new Error('topbar element has no search field')
  input.value = query
}

/**
 * Remove the view subscription of a top bar.
 * @param {HTMLElement} topbarElement an element returned by `renderTopbar`
 * @returns {void}
 */
export function destroyTopbar(topbarElement) {
  const unsubscribe = cleanupByElement.get(topbarElement)
  if (!unsubscribe) return
  unsubscribe()
  cleanupByElement.delete(topbarElement)
}
