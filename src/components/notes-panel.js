// My notes: one text field per recording that saves itself shortly after typing stops

import { createElement, createIcon } from '../lib/dom.js'
import { announce } from '../lib/announce.js'

const noteIconPaths = ['M7 3.5h10v17H7z', 'M9.5 8h5', 'M9.5 11.5h5', 'M9.5 15h3']

/** how long typing has to pause before the note saves */
export const autosaveDelayMs = 600

/**
 * render the notes card.
 * @param {{ initialBody: string, onSave: (body: string) => Promise<unknown>,
 *   delayMs?: number }} options the saved text, how to save, and the pause before saving
 * @returns {{ element: HTMLElement, flush: () => Promise<void> }} the card, and a way to save a
 *   pending change right away, used when the page leaves
 * @throws {TypeError} when initialBody is not a string or onSave is not a function
 */
export function renderNotesPanel({ initialBody, onSave, delayMs = autosaveDelayMs }) {
  if (typeof initialBody !== 'string') throw new TypeError('renderNotesPanel needs a note body')
  if (typeof onSave !== 'function') throw new TypeError('renderNotesPanel needs onSave')

  const status = createElement('span', { className: 'notes-status' })
  const field = createElement('textarea', {
    className: 'notes-field',
    placeholder: 'Add a note…',
    'aria-labelledby': 'notes-title',
    rows: 3,
  })
  field.value = initialBody

  let savedBody = initialBody
  let timer = null
  // the save running now, so a second save waits for it and the order of writes holds
  let running = Promise.resolve()

  /**
   * save the field when it differs from what was saved last.
   * @returns {Promise<void>} resolves once the save finishes or fails
   */
  function save() {
    clearTimeout(timer)
    timer = null
    running = running.then(async () => {
      const body = field.value
      if (body === savedBody) return
      status.textContent = 'Saving'
      try {
        await onSave(body)
        savedBody = body
        status.textContent = field.value === body ? 'Saved' : 'Saving'
        announce('Note saved')
      } catch (error) {
        status.textContent = 'Not saved'
        announce(`The note could not be saved: ${error.message}`)
      }
    })
    return running
  }

  field.addEventListener('input', () => {
    status.textContent = 'Saving'
    clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  })

  const element = createElement(
    'section',
    { className: 'rail-card notes-panel', 'aria-labelledby': 'notes-title' },
    [
      createElement('h2', { className: 'rail-card-title' }, [
        createIcon(noteIconPaths, { size: 16 }),
        createElement('span', { id: 'notes-title', text: 'My notes' }),
        status,
      ]),
      field,
    ]
  )

  return {
    element,

    /**
     * save a pending change now instead of waiting for the pause. a note whose last save failed
     * is not retried here; the next edit tries again.
     * @returns {Promise<void>} resolves once nothing is left to save
     */
    flush() {
      if (timer === null) return running
      return save()
    },
  }
}
