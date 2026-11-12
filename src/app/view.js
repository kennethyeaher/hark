// a tiny store for the content view mode, shared by the top bar and the pages

const storageKey = 'hark.view'
const validViews = ['grid', 'list']

/**
 * Check whether a value is a supported view name.
 * @param {unknown} value the value to check
 * @returns {boolean} true for `grid` or `list`
 */
function isValidView(value) {
  return validViews.includes(value)
}

/**
 * Create a view store that persists to the given storage.
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage
 *   a localStorage shaped object. its methods may throw, which the store tolerates.
 * @returns {{ getView: () => string, setView: (view: string) => void, subscribeToView: (listener: (view: string) => void) => () => void }}
 *   the store functions
 */
export function createViewStore(storage) {
  const listeners = new Set()
  let currentView = null

  // reads the saved view once. storage can throw in private mode or when blocked, so fall back
  const readSavedView = () => {
    try {
      const saved = storage.getItem(storageKey)
      return isValidView(saved) ? saved : 'grid'
    } catch {
      return 'grid'
    }
  }

  /**
   * Get the current view, loading the saved value on first use.
   * @returns {string} `grid` or `list`
   */
  const getStoredView = () => {
    if (currentView === null) currentView = readSavedView()
    return currentView
  }

  return {
    getView: getStoredView,

    /**
     * Set the view, save it, and notify listeners when it changed.
     * @param {string} view `grid` or `list`
     * @returns {void}
     * @throws {Error} when the view is not `grid` or `list`
     */
    setView(view) {
      if (!isValidView(view)) {
        throw new Error(`view must be "grid" or "list", received ${String(view)}`)
      }
      const previousView = getStoredView()
      currentView = view
      // saving can fail in private mode, and the view still works for this session
      try {
        storage.setItem(storageKey, view)
      } catch {
        // nothing to do, the in memory value is already updated
      }
      if (view === previousView) return
      for (const listener of [...listeners]) listener(view)
    },

    /**
     * Listen for view changes.
     * @param {(view: string) => void} listener called with the new view
     * @returns {() => void} a function that removes the listener
     * @throws {TypeError} when the listener is not a function
     */
    subscribeToView(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// reaches localStorage lazily because even reading the property can throw when blocked
const browserStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}

const defaultStore = createViewStore(browserStorage)

/**
 * Get the current view from the shared store.
 * @returns {string} `grid` or `list`
 */
export function getView() {
  return defaultStore.getView()
}

/**
 * Set the view on the shared store.
 * @param {string} view `grid` or `list`
 * @returns {void}
 * @throws {Error} when the view is not `grid` or `list`
 */
export function setView(view) {
  defaultStore.setView(view)
}

/**
 * Listen for view changes on the shared store.
 * @param {(view: string) => void} listener called with the new view
 * @returns {() => void} a function that removes the listener
 */
export function subscribeToView(listener) {
  return defaultStore.subscribeToView(listener)
}
