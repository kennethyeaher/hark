// one polite status region that outlives page changes, for messages that follow a navigation

import { createElement } from './dom.js'

const regionId = 'app-announcer'

/**
 * read a message to screen readers through a polite status region on the body. the region is
 * made on first use and stays, so a page change does not cut the message off.
 * @param {string} message the text to read
 * @returns {void}
 * @throws {TypeError} when message is not a non empty string
 */
export function announce(message) {
  if (typeof message !== 'string' || message.trim() === '') {
    throw new TypeError(`announce needs a message, got ${String(message)}`)
  }
  let region = document.getElementById(regionId)
  if (!region) {
    region = createElement('p', { id: regionId, className: 'visually-hidden', role: 'status' })
    document.body.append(region)
  }
  // clearing first and writing on the next turn makes a repeated message count as a change
  region.textContent = ''
  setTimeout(() => {
    region.textContent = message
  }, 100)
}
