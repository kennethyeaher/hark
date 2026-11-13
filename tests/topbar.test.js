// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderTopbar, setSearchQuery, destroyTopbar } from '../src/components/topbar.js'
import { createViewStore } from '../src/app/view.js'

/**
 * build an in memory storage for tests.
 * @param {Record<string, string>} [initial] starting values
 * @returns {{ getItem: Function, setItem: Function, data: Record<string, string> }} fake storage
 */
function createFakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

/**
 * render a top bar with a fresh store and a navigate spy.
 * @returns {{ topbar: HTMLElement, navigate: import('vitest').Mock, store: ReturnType<typeof createViewStore> }} parts
 */
function setup() {
  const store = createViewStore(createFakeStorage())
  const navigate = vi.fn()
  const topbar = renderTopbar({ navigate, viewStore: store })
  return { topbar, navigate, store }
}

/**
 * type into the search field and submit the form.
 * @param {HTMLElement} topbar the top bar
 * @param {string} value text to type
 * @returns {void}
 */
function submitSearch(topbar, value) {
  topbar.querySelector('input').value = value
  topbar.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }))
}

describe('topbar search', () => {
  it('navigates with a trimmed and encoded query', () => {
    const { topbar, navigate } = setup()
    submitSearch(topbar, '  thematic analysis & bias ')
    expect(navigate).toHaveBeenCalledWith('#/search?q=thematic%20analysis%20%26%20bias')
  })

  it('does not navigate on empty or whitespace input', () => {
    const { topbar, navigate } = setup()
    submitSearch(topbar, '')
    submitSearch(topbar, '   ')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('has a search role form and a label tied to the input', () => {
    const { topbar } = setup()
    expect(topbar.querySelector('form').getAttribute('role')).toBe('search')
    const input = topbar.querySelector('input[type="search"]')
    const label = topbar.querySelector(`label[for="${input.id}"]`)
    expect(label.textContent).toBe('Search recordings and notes')
    expect(input.getAttribute('autocomplete')).toBe('off')
  })

  it('fills the field from initialQuery and setSearchQuery', () => {
    const topbar = renderTopbar({ initialQuery: 'bias', viewStore: setup().store })
    expect(topbar.querySelector('input').value).toBe('bias')
    setSearchQuery(topbar, 'memory')
    expect(topbar.querySelector('input').value).toBe('memory')
  })

  it('rejects a bad navigate option', () => {
    expect(() => renderTopbar({ navigate: 'x' })).toThrow('navigate must be a function')
  })
})

describe('topbar view toggle', () => {
  it('shows the current view as pressed', () => {
    const { topbar } = setup()
    const [gridButton, listButton] = topbar.querySelectorAll('button')
    expect(gridButton.getAttribute('aria-label')).toBe('Grid view')
    expect(gridButton.getAttribute('aria-pressed')).toBe('true')
    expect(listButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('sets the list view on click and calls through to the store', () => {
    const { topbar, store } = setup()
    const [gridButton, listButton] = topbar.querySelectorAll('button')
    listButton.click()
    expect(store.getView()).toBe('list')
    expect(listButton.getAttribute('aria-pressed')).toBe('true')
    expect(gridButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('follows changes from elsewhere until destroyed', () => {
    const { topbar, store } = setup()
    const listButton = topbar.querySelectorAll('button')[1]
    store.setView('list')
    expect(listButton.getAttribute('aria-pressed')).toBe('true')
    destroyTopbar(topbar)
    store.setView('grid')
    expect(listButton.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('view store', () => {
  it('defaults to grid and rejects bad values', () => {
    const store = createViewStore(createFakeStorage())
    expect(store.getView()).toBe('grid')
    expect(() => store.setView('tiles')).toThrow('view must be "grid" or "list"')
    expect(store.getView()).toBe('grid')
  })

  it('reads a stored value and ignores an invalid one', () => {
    expect(createViewStore(createFakeStorage({ 'hark.view': 'list' })).getView()).toBe('list')
    expect(createViewStore(createFakeStorage({ 'hark.view': 'bogus' })).getView()).toBe('grid')
  })

  it('saves the view and notifies only on change', () => {
    const storage = createFakeStorage()
    const store = createViewStore(storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribeToView(listener)
    store.setView('grid')
    expect(listener).not.toHaveBeenCalled()
    store.setView('list')
    expect(listener).toHaveBeenCalledWith('list')
    expect(storage.data['hark.view']).toBe('list')
    unsubscribe()
    store.setView('grid')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps working when storage throws', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createViewStore(throwingStorage)
    expect(store.getView()).toBe('grid')
    expect(() => store.setView('list')).not.toThrow()
    expect(store.getView()).toBe('list')
  })
})
