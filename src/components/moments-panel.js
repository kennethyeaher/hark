// Moments: marked times in the recording, each with a label and a color tag

import { createElement, createIcon } from '../lib/dom.js'
import { courseColors, formatClock } from '../lib/format.js'
import { announce } from '../lib/announce.js'

const flagIconPaths = ['M6 21V4', 'M6 4h11l-2 4l2 4H6']
const plusIconPaths = ['M12 5v14', 'M5 12h14']
const closeIconPaths = ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11']

/** how long the Undo link stays after a delete */
export const undoWindowMs = 5000

/**
 * pick the color after the given one, wrapping to the first.
 * @param {string} color a course color name
 * @returns {string} the next course color
 */
export function nextMomentColor(color) {
  const index = courseColors.indexOf(color)
  return courseColors[(index + 1) % courseColors.length]
}

/**
 * sort moments by time, earliest first, without changing the input.
 * @param {{ atSeconds: number }[]} moments the moments
 * @returns {object[]} a sorted copy
 */
function sortByTime(moments) {
  return [...moments].sort((first, second) => first.atSeconds - second.atSeconds)
}

/**
 * render the Moments card.
 * @param {{ moments: object[], recordingId: string, getCurrentTime: () => number,
 *   onSeek: (seconds: number) => void, onSave: (moment: object) => Promise<object>,
 *   onDelete: (id: string) => Promise<void>, onChange: (moments: object[]) => void }} options
 *   the saved moments, the recording they belong to, the playback position, and the callbacks.
 *   onChange gets the list after every change, so the transcript dots can follow
 * @returns {{ element: HTMLElement, destroy: () => void }} the card, and a way to stop the
 *   undo timer when the page leaves
 */
export function renderMomentsPanel({
  moments: initialMoments,
  recordingId,
  getCurrentTime,
  onSeek,
  onSave,
  onDelete,
  onChange,
}) {
  let moments = sortByTime(initialMoments)
  let undoTimer = null

  const list = createElement('ul', { className: 'moments-list' })
  const undoBar = createElement('div', { className: 'moments-undo' })
  undoBar.hidden = true
  const addButton = createElement(
    'button',
    { type: 'button', className: 'moments-add', 'aria-label': 'Add a moment at the current time' },
    [createIcon(plusIconPaths, { size: 16 })]
  )

  /**
   * replace the list with new moments, tell the page, and redraw.
   * @param {object[]} next the moments
   * @returns {void}
   */
  function setMoments(next) {
    moments = sortByTime(next)
    onChange(moments)
    draw()
  }

  /**
   * focus a control in a moment's row after a redraw.
   * @param {string} id moment id
   * @param {string} selector the control inside the row
   * @returns {HTMLElement | null} the control, if found
   */
  function focusInRow(id, selector) {
    const control = list.querySelector(`[data-id="${CSS.escape(id)}"] ${selector}`)
    control?.focus()
    return control
  }

  /**
   * show a changed moment in its row without rebuilding the list, so focus stays where the
   * user put it, and tell the page.
   * @param {object} next the moment as it is now
   * @returns {void}
   */
  function applyMoment(next) {
    moments = moments.map((moment) => (moment.id === next.id ? next : moment))
    onChange(moments)
    const row = list.querySelector(`[data-id="${CSS.escape(next.id)}"]`)
    if (row) updateRow(row, next)
  }

  /**
   * save one changed moment, showing the change at once and putting it back if the save fails.
   * @param {object} previous the moment as it was
   * @param {object} next the moment with its change
   * @returns {Promise<boolean>} true once saved, false when the save failed
   */
  async function saveChange(previous, next) {
    applyMoment(next)
    try {
      await onSave(next)
      return true
    } catch (error) {
      applyMoment(previous)
      announce(`The moment could not be saved: ${error.message}`)
      return false
    }
  }

  /**
   * remove a moment and offer Undo for a few seconds. there is no confirm, since Undo is there.
   * @param {object} moment the moment to delete
   * @returns {Promise<void>} resolves once deleted or reported
   */
  async function deleteMoment(moment) {
    const before = moments
    setMoments(moments.filter((candidate) => candidate.id !== moment.id))
    try {
      await onDelete(moment.id)
    } catch (error) {
      setMoments(before)
      focusInRow(moment.id, '.moment-delete')
      announce(`The moment could not be deleted: ${error.message}`)
      return
    }
    showUndo(moment)
    announce(`Deleted ${moment.label}`)
  }

  /**
   * show the Undo link for a deleted moment, and hide it again after the undo window.
   * @param {object} moment the deleted moment
   * @returns {void}
   */
  function showUndo(moment) {
    clearTimeout(undoTimer)
    const undoButton = createElement('button', {
      type: 'button',
      className: 'moments-undo-button',
      text: 'Undo',
    })
    undoButton.addEventListener('click', async () => {
      hideUndo()
      try {
        const restored = await onSave(moment)
        setMoments([...moments, restored])
        focusInRow(restored.id, '.moment-label')
        announce(`Restored ${moment.label}`)
      } catch (error) {
        announce(`The moment could not be restored: ${error.message}`)
      }
    })
    undoBar.replaceChildren(createElement('span', { text: `Deleted ${moment.label}.` }), undoButton)
    undoBar.hidden = false
    undoButton.focus()
    undoTimer = setTimeout(hideUndo, undoWindowMs)
  }

  /**
   * hide the Undo link, keeping focus in the card when it was on the link.
   * @returns {void}
   */
  function hideUndo() {
    clearTimeout(undoTimer)
    undoTimer = null
    const hadFocus = undoBar.contains(document.activeElement)
    undoBar.hidden = true
    undoBar.replaceChildren()
    if (hadFocus) addButton.focus()
  }

  /**
   * bring a row in line with its moment: dot color, label, and the names that mention them.
   * @param {HTMLElement} row the row
   * @param {{ label: string, color: string }} moment the moment
   * @returns {void}
   */
  function updateRow(row, moment) {
    const dotButton = row.querySelector('.moment-dot')
    dotButton.setAttribute('aria-label', `Color ${moment.color}, change color`)
    dotButton.firstChild.style.background = `var(--course-${moment.color})`
    const labelField = row.querySelector('.moment-label')
    if (document.activeElement !== labelField) labelField.value = moment.label
    row.querySelector('.moment-delete').setAttribute('aria-label', `Delete ${moment.label}`)
  }

  /**
   * build one moment row: color dot, time, label field, and delete. the handlers look the moment
   * up by id, so they always act on its latest label and color.
   * @param {{ id: string, atSeconds: number }} moment the moment
   * @returns {HTMLLIElement} the row
   */
  function renderRow({ id, atSeconds }) {
    /**
     * read this row's moment as it is now.
     * @returns {object} the moment
     */
    const current = () => moments.find((moment) => moment.id === id)
    const time = formatClock(atSeconds)

    const dotButton = createElement('button', { type: 'button', className: 'moment-dot' }, [
      createElement('span', { className: 'moment-dot-fill', 'aria-hidden': 'true' }),
    ])
    dotButton.addEventListener('click', () => {
      const moment = current()
      saveChange(moment, { ...moment, color: nextMomentColor(moment.color) })
    })

    const timeButton = createElement('button', {
      type: 'button',
      className: 'moment-time',
      'aria-label': `Play from ${time}`,
      text: time,
    })
    timeButton.addEventListener('click', () => onSeek(atSeconds))

    // the label renames in place: Enter or leaving the field saves, Escape puts it back
    const labelField = createElement('input', {
      type: 'text',
      className: 'moment-label',
      'aria-label': `Label for the moment at ${time}`,
      maxlength: 80,
    })
    labelField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') labelField.blur()
      if (event.key === 'Escape') {
        labelField.value = current().label
        labelField.blur()
      }
    })
    labelField.addEventListener('change', async () => {
      const moment = current()
      const label = labelField.value.trim()
      if (label === '' || label === moment.label) {
        labelField.value = moment.label
        return
      }
      if (await saveChange(moment, { ...moment, label })) announce(`Renamed to ${label}`)
      else labelField.value = current().label
    })

    const deleteButton = createElement('button', { type: 'button', className: 'moment-delete' }, [
      createIcon(closeIconPaths, { size: 14 }),
    ])
    deleteButton.addEventListener('click', () => deleteMoment(current()))

    const row = createElement('li', { className: 'moment-row', 'data-id': id }, [
      dotButton,
      timeButton,
      labelField,
      deleteButton,
    ])
    updateRow(row, current())
    return row
  }

  /**
   * draw the list, or the empty line when there are no moments.
   * @returns {void}
   */
  function draw() {
    if (moments.length === 0) {
      list.replaceChildren(
        createElement('li', {
          className: 'moments-empty',
          text: 'No moments yet. Add one to mark the current time.',
        })
      )
      return
    }
    list.replaceChildren(...moments.map(renderRow))
  }

  addButton.addEventListener('click', async () => {
    const draft = {
      recordingId,
      atSeconds: Math.floor(getCurrentTime()),
      label: 'Moment',
      color: courseColors[moments.length % courseColors.length],
    }
    try {
      const saved = await onSave(draft)
      setMoments([...moments, saved])
      const field = focusInRow(saved.id, '.moment-label')
      field?.select()
      announce(`Added a moment at ${formatClock(saved.atSeconds)}`)
    } catch (error) {
      announce(`The moment could not be added: ${error.message}`)
    }
  })

  draw()
  const element = createElement(
    'section',
    { className: 'rail-card moments-panel', 'aria-labelledby': 'moments-title' },
    [
      createElement('h2', { className: 'rail-card-title' }, [
        createIcon(flagIconPaths, { size: 16 }),
        createElement('span', { id: 'moments-title', text: 'Moments' }),
        addButton,
      ]),
      list,
      undoBar,
    ]
  )

  return {
    element,

    /**
     * stop the undo timer.
     * @returns {void}
     */
    destroy() {
      clearTimeout(undoTimer)
    },
  }
}
