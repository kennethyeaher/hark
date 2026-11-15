// the row above the transcript: find, the Auto-scroll switch, and Edit with Save and Cancel

import { createElement, createIcon } from '../lib/dom.js'

const searchIconPaths = ['M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0 -13z', 'M15.5 15.5L20 20']

/**
 * describe the find count, such as `3 of 12`.
 * @param {number} currentIndex position of the current match, from 0
 * @param {number} total number of matches
 * @param {boolean} hasQuery true when the query is long enough to search
 * @returns {string} the count text, or an empty string when there is nothing to count
 */
export function describeMatchCount(currentIndex, total, hasQuery) {
  if (!hasQuery) return ''
  if (total === 0) return 'No matches'
  return `${currentIndex + 1} of ${total}`
}

/**
 * render the transcript toolbar. it holds no transcript state; it reports what the user did.
 * @param {{ isAutoScrollOn: boolean, onAutoScroll: (isOn: boolean) => void,
 *   onFind: (query: string) => void, onFindStep: (direction: 1 | -1) => void,
 *   onEdit: () => void, onSave: () => void, onCancel: () => void }} options the starting switch
 *   state and the callbacks
 * @returns {{ element: HTMLElement, setMatchCount: (text: string) => void,
 *   clearFind: () => void, setEditing: (isEditing: boolean) => void,
 *   setSaving: (isSaving: boolean) => void, focusEdit: () => void }} the toolbar and its updates
 */
export function renderTranscriptToolbar({
  isAutoScrollOn,
  onAutoScroll,
  onFind,
  onFindStep,
  onEdit,
  onSave,
  onCancel,
}) {
  // find: Enter and Shift+Enter step through matches, Escape clears
  const findInput = createElement('input', {
    type: 'search',
    className: 'transcript-find-input',
    placeholder: 'Find in transcript',
    'aria-label': 'Find in transcript',
    'aria-describedby': 'transcript-find-count',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const count = createElement('span', {
    id: 'transcript-find-count',
    className: 'transcript-find-count',
    'aria-live': 'polite',
  })
  findInput.addEventListener('input', () => onFind(findInput.value))
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onFindStep(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape' && findInput.value !== '') {
      event.preventDefault()
      findInput.value = ''
      onFind('')
    }
  })

  const switchButton = createElement(
    'button',
    {
      type: 'button',
      className: 'switch',
      role: 'switch',
      'aria-checked': String(isAutoScrollOn),
      'aria-labelledby': 'transcript-autoscroll-label',
    },
    [createElement('span', { className: 'switch-thumb', 'aria-hidden': 'true' })]
  )
  switchButton.addEventListener('click', () => {
    const isOn = switchButton.getAttribute('aria-checked') !== 'true'
    switchButton.setAttribute('aria-checked', String(isOn))
    onAutoScroll(isOn)
  })

  const editButton = createElement('button', {
    type: 'button',
    className: 'button button-plain button-small transcript-edit',
    text: 'Edit',
  })
  const cancelButton = createElement('button', {
    type: 'button',
    className: 'button button-outline button-small transcript-cancel',
    text: 'Cancel',
  })
  const saveButton = createElement('button', {
    type: 'button',
    className: 'button button-primary button-small transcript-save',
    text: 'Save',
  })
  editButton.addEventListener('click', () => onEdit())
  cancelButton.addEventListener('click', () => onCancel())
  saveButton.addEventListener('click', () => onSave())
  cancelButton.hidden = true
  saveButton.hidden = true

  const findBox = createElement('div', { className: 'transcript-find' }, [
    createIcon(searchIconPaths, { size: 16 }),
    findInput,
    count,
  ])
  const element = createElement('div', { className: 'transcript-toolbar' }, [
    findBox,
    createElement('div', { className: 'transcript-autoscroll' }, [
      createElement('span', { id: 'transcript-autoscroll-label', text: 'Auto-scroll' }),
      switchButton,
    ]),
    editButton,
    cancelButton,
    saveButton,
  ])

  return {
    element,

    /**
     * show the find count.
     * @param {string} text such as `3 of 12`, or empty
     * @returns {void}
     */
    setMatchCount(text) {
      count.textContent = text
    },

    /**
     * empty the find field and its count.
     * @returns {void}
     */
    clearFind() {
      findInput.value = ''
      count.textContent = ''
    },

    /**
     * switch between Edit and Save with Cancel. find is off while editing.
     * @param {boolean} isEditing true while the transcript is being edited
     * @returns {void}
     */
    setEditing(isEditing) {
      editButton.hidden = isEditing
      cancelButton.hidden = !isEditing
      saveButton.hidden = !isEditing
      findInput.disabled = isEditing
      findBox.classList.toggle('is-disabled', isEditing)
    },

    /**
     * hold Save and Cancel while a save runs.
     * @param {boolean} isSaving true while saving
     * @returns {void}
     */
    setSaving(isSaving) {
      saveButton.disabled = isSaving
      cancelButton.disabled = isSaving
      saveButton.textContent = isSaving ? 'Saving' : 'Save'
    },

    /**
     * move focus to the Edit button, after editing ends.
     * @returns {void}
     */
    focusEdit() {
      editButton.focus()
    },
  }
}
