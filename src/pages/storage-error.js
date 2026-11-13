// the page shown instead of the app when browser storage cannot open

import { createElement } from '../lib/dom.js'

/**
 * render a plain page that explains Hark needs browser storage, with the browser's reason.
 * @param {unknown} error the error from opening the database
 * @returns {HTMLElement} the page element, ready to place in the root
 */
export function renderStorageError(error) {
  const reason = error instanceof Error && error.message ? error.message : String(error)
  return createElement('main', { className: 'page page-storage-error', id: 'content' }, [
    createElement('h1', { className: 'page-title', text: 'Hark needs browser storage' }),
    createElement('p', {
      className: 'page-note',
      text: 'Hark needs browser storage to keep recordings on this device. This browser did not let it open, which can happen in private browsing or when site data is blocked. Allow storage for this site, then reload the page.',
    }),
    createElement('p', { className: 'page-note', text: `Reason: ${reason}` }),
  ])
}
