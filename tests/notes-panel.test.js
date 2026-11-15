// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autosaveDelayMs, renderNotesPanel } from '../src/components/notes-panel.js'
import { renderSummaryPanel, summaryPlaceholder } from '../src/components/summary-panel.js'

/**
 * type into the notes field.
 * @param {HTMLTextAreaElement} field the field
 * @param {string} text the new value
 * @returns {void}
 */
function type(field, text) {
  field.value = text
  field.dispatchEvent(new Event('input'))
}

describe('renderNotesPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the saved note in a field labeled My notes', () => {
    const panel = renderNotesPanel({ initialBody: 'Pilot first.', onSave: vi.fn() })
    document.body.replaceChildren(panel.element)
    const field = panel.element.querySelector('textarea')
    expect(field.value).toBe('Pilot first.')
    expect(document.getElementById(field.getAttribute('aria-labelledby')).textContent).toBe(
      'My notes'
    )
  })

  it('saves 600 ms after typing stops, once, and shows Saving then Saved', async () => {
    const onSave = vi.fn(async () => {})
    const panel = renderNotesPanel({ initialBody: '', onSave })
    const field = panel.element.querySelector('textarea')
    const status = panel.element.querySelector('.notes-status')
    type(field, 'A')
    vi.advanceTimersByTime(autosaveDelayMs - 100)
    type(field, 'Ab')
    vi.advanceTimersByTime(autosaveDelayMs - 1)
    expect(onSave).not.toHaveBeenCalled()
    expect(status.textContent).toBe('Saving')
    await vi.advanceTimersByTimeAsync(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('Ab')
    expect(status.textContent).toBe('Saved')
  })

  it('says Not saved when the save fails, and tries again on the next pause', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue()
    const panel = renderNotesPanel({ initialBody: '', onSave })
    const field = panel.element.querySelector('textarea')
    type(field, 'First')
    await vi.advanceTimersByTimeAsync(autosaveDelayMs)
    expect(panel.element.querySelector('.notes-status').textContent).toBe('Not saved')
    type(field, 'First try')
    await vi.advanceTimersByTimeAsync(autosaveDelayMs)
    expect(onSave).toHaveBeenLastCalledWith('First try')
    expect(panel.element.querySelector('.notes-status').textContent).toBe('Saved')
  })

  it('saves a pending change right away on flush, and skips text that did not change', async () => {
    const onSave = vi.fn(async () => {})
    const panel = renderNotesPanel({ initialBody: 'Same', onSave })
    await panel.flush()
    expect(onSave).not.toHaveBeenCalled()
    type(panel.element.querySelector('textarea'), 'Changed')
    await panel.flush()
    expect(onSave).toHaveBeenCalledWith('Changed')
    await vi.advanceTimersByTimeAsync(autosaveDelayMs)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing body or save function', () => {
    expect(() => renderNotesPanel({ initialBody: null, onSave: vi.fn() })).toThrow(TypeError)
    expect(() => renderNotesPanel({ initialBody: '' })).toThrow(TypeError)
  })
})

describe('renderSummaryPanel', () => {
  it('says the summary comes later and has no refresh button', () => {
    const panel = renderSummaryPanel()
    expect(panel.textContent).toContain(summaryPlaceholder)
    expect(panel.querySelector('button')).toBeNull()
    expect(panel.querySelector('.summary-body')).not.toBeNull()
  })
})
