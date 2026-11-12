// entry point: load global styles, open the library, then hand the page to the app shell
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/components.css'
import './styles/pages.css'
import { mountApp } from './app/app.js'
import { loadLibrary } from './data/library.js'
import { dataEvents } from './data/events.js'
import { renderStorageError } from './pages/storage-error.js'

/**
 * load the library and mount the app, or show the storage error page when indexeddb will not open.
 * @param {HTMLElement} root element that receives the app
 * @returns {Promise<void>} resolves once the first page is on screen
 *
 * side effect: reloads the library and redraws the app after every write to the store.
 */
async function startApp(root) {
  let library
  try {
    library = await loadLibrary()
  } catch (error) {
    // without storage nothing can be kept, so say so instead of leaving a blank screen
    root.replaceChildren(renderStorageError(error))
    console.error(error)
    return
  }

  const app = mountApp(root, library)

  // writes can come in bursts, so at most one reload runs and one more waits behind it
  let reloading = null
  let hasPendingReload = false
  /**
   * reload the library and redraw, folding changes that arrive during a reload into one more pass.
   * @returns {Promise<void>} resolves once the screen shows the latest data
   */
  async function reload() {
    if (reloading) {
      hasPendingReload = true
      return reloading
    }
    reloading = (async () => {
      do {
        hasPendingReload = false
        app.updateData(await loadLibrary())
      } while (hasPendingReload)
    })()
    try {
      await reloading
    } finally {
      reloading = null
    }
  }
  dataEvents.addEventListener('change', reload)
}

startApp(document.querySelector('#app'))
