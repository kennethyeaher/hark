// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  describeMatchCount,
  renderTranscriptToolbar,
} from '../src/components/transcript-toolbar.js'

/**
 * render the toolbar with spies for every callback.
 * @returns {{ toolbar: object, callbacks: Record<string, import('vitest').Mock> }} the parts
 */
function setup() {
  const callbacks = { onAutoScroll: vi.fn(), onFind: vi.fn(), onFindStep: vi.fn() }
  const toolbar = renderTranscriptToolbar({ isAutoScrollOn: true, ...callbacks })
  document.body.replaceChildren(toolbar.element)
  return { toolbar, callbacks }
}

/**
 * press a key in the find field.
 * @param {HTMLInputElement} input the field
 * @param {string} key the key
 * @param {boolean} [shiftKey] true to hold Shift
 * @returns {KeyboardEvent} the event
 */
function press(input, key, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true })
  input.dispatchEvent(event)
  return event
}

describe('describeMatchCount', () => {
  it('reads the position, no matches, or nothing for a short query', () => {
    expect(describeMatchCount(2, 12, true)).toBe('3 of 12')
    expect(describeMatchCount(-1, 0, true)).toBe('No matches')
    expect(describeMatchCount(-1, 0, false)).toBe('')
  })
})

describe('renderTranscriptToolbar', () => {
  it('reports each change to the find field', () => {
    const { toolbar, callbacks } = setup()
    const input = toolbar.element.querySelector('input')
    expect(input.getAttribute('aria-label')).toBe('Find in transcript')
    input.value = 'codebook'
    input.dispatchEvent(new Event('input'))
    expect(callbacks.onFind).toHaveBeenCalledWith('codebook')
  })

  it('steps forward on Enter and back on Shift+Enter', () => {
    const { toolbar, callbacks } = setup()
    const input = toolbar.element.querySelector('input')
    expect(press(input, 'Enter').defaultPrevented).toBe(true)
    expect(callbacks.onFindStep).toHaveBeenLastCalledWith(1)
    press(input, 'Enter', true)
    expect(callbacks.onFindStep).toHaveBeenLastCalledWith(-1)
  })

  it('clears the field on Escape', () => {
    const { toolbar, callbacks } = setup()
    const input = toolbar.element.querySelector('input')
    input.value = 'code'
    press(input, 'Escape')
    expect(input.value).toBe('')
    expect(callbacks.onFind).toHaveBeenLastCalledWith('')
  })

  it('shows the count in a polite live region', () => {
    const { toolbar } = setup()
    toolbar.setMatchCount('3 of 12')
    const count = toolbar.element.querySelector('.transcript-find-count')
    expect(count.textContent).toBe('3 of 12')
    expect(count.getAttribute('aria-live')).toBe('polite')
    toolbar.clearFind()
    expect(count.textContent).toBe('')
  })

  it('flips the Auto-scroll switch', () => {
    const { toolbar, callbacks } = setup()
    const toggle = toolbar.element.querySelector('[role="switch"]')
    toggle.click()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(callbacks.onAutoScroll).toHaveBeenCalledWith(false)
  })
})

describe('transcript toolbar editing', () => {
  it('swaps Edit for Cancel and Save, and turns find off', () => {
    const callbacks = {
      onAutoScroll: vi.fn(),
      onFind: vi.fn(),
      onFindStep: vi.fn(),
      onEdit: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
    }
    const toolbar = renderTranscriptToolbar({ isAutoScrollOn: true, ...callbacks })
    const edit = toolbar.element.querySelector('.transcript-edit')
    edit.click()
    expect(callbacks.onEdit).toHaveBeenCalled()
    toolbar.setEditing(true)
    expect(edit.hidden).toBe(true)
    expect(toolbar.element.querySelector('.transcript-find-input').disabled).toBe(true)
    toolbar.element.querySelector('.transcript-save').click()
    toolbar.element.querySelector('.transcript-cancel').click()
    expect(callbacks.onSave).toHaveBeenCalled()
    expect(callbacks.onCancel).toHaveBeenCalled()
    toolbar.setSaving(true)
    expect(toolbar.element.querySelector('.transcript-save').textContent).toBe('Saving')
    expect(toolbar.element.querySelector('.transcript-save').disabled).toBe(true)
  })
})
