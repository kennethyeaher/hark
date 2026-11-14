// entry point: load global styles, open the library, then hand the page to the app shell
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/components.css'
import './styles/pages.css'
import './styles/sheet.css'
import { mountApp } from './app/app.js'
import { loadLibrary } from './data/library.js'
import { dataEvents } from './data/events.js'
import { seedSampleLibrary } from './data/seed.js'
import { renderStorageError } from './pages/storage-error.js'
import { resumeQueuedRecordings } from './transcription/jobs.js'

/**
 * load the library and mount the app, or show the storage error page when indexeddb will not open.
 * @param {HTMLElement} root element that receives the app
 * @returns {Promise<void>} resolves once the first page is on screen
 *
 * side effect: seeds the samples into an empty library in development, reloads the library
 * and redraws the app after every write to the store, and picks up transcriptions that a
 * closed tab left unfinished.
 */
async function startApp(root) {
  let library
  try {
    // development starts with the samples so every page has data; production waits for the button
    if (import.meta.env.DEV) await seedSampleLibrary()
    library = await loadLibrary()
  } catch (error) {
    // without storage nothing can be kept, so say so instead of leaving a blank screen
    root.replaceChildren(renderStorageError(error))
    console.error(error)
    return
  }

  /**
   * write the samples, or reload when another tab already filled the library, so the page
   * always ends up showing what the store holds.
   * @returns {Promise<void>} resolves once the samples are written or the page is reloaded
   */
  async function loadSamples() {
    const wasSeeded = await seedSampleLibrary()
    // a successful write fires a change event that redraws; a skipped one does not
    if (!wasSeeded) await reload()
  }

  const app = mountApp(root, { ...library, onLoadSamples: loadSamples })

  // writes can come in bursts, so at most one reload runs and one more waits behind it.
  // the flags are set and cleared without an await in between, so no change is missed
  let isReloading = false
  let hasPendingReload = false
  /**
   * reload the library and redraw, folding changes that arrive during a reload into one more pass.
   * @returns {Promise<void>} resolves once the screen shows the latest data it could read
   */
  async function reload() {
    if (isReloading) {
      hasPendingReload = true
      return
    }
    isReloading = true
    try {
      do {
        hasPendingReload = false
        try {
          app.updateData(await loadLibrary())
        } catch (error) {
          // the page keeps its last good data and the next change tries again, so report and go on
          console.error('Hark could not reload the library', error)
        }
      } while (hasPendingReload)
    } finally {
      isReloading = false
    }
  }
  dataEvents.addEventListener('change', reload)

  // closing the tab pauses a transcription, so anything left unfinished starts again here
  try {
    await resumeQueuedRecordings()
  } catch (error) {
    console.error('Hark could not resume unfinished transcriptions', error)
  }
}

startApp(document.querySelector('#app'))
