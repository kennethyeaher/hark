// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  nextMomentColor,
  renderMomentsPanel,
  undoWindowMs,
} from '../src/components/moments-panel.js'

const savedMoments = [
  { id: 'm2', recordingId: 'week9', atSeconds: 852, label: 'Ask about this', color: 'pink' },
  { id: 'm1', recordingId: 'week9', atSeconds: 758, label: 'Exam hint', color: 'orange' },
]

/**
 * render the panel into the document with spies, saving by echoing the moment back with an id.
 * @param {object} [overrides] options to replace
 * @returns {{ panel: object, options: object }} the panel and the options it got
 */
function setup(overrides = {}) {
  const options = {
    moments: savedMoments,
    recordingId: 'week9',
    getCurrentTime: () => 795.6,
    onSeek: vi.fn(),
    onSave: vi.fn(async (moment) => ({ id: moment.id ?? 'new', ...moment })),
    onDelete: vi.fn(async () => {}),
    onChange: vi.fn(),
    ...overrides,
  }
  const panel = renderMomentsPanel(options)
  document.body.replaceChildren(panel.element)
  return { panel, options }
}

/**
 * read the labels shown in the list, in order.
 * @param {HTMLElement} element the panel
 * @returns {string[]} the labels
 */
const labelsOf = (element) =>
  [...element.querySelectorAll('.moment-label')].map((field) => field.value)

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('nextMomentColor', () => {
  it('cycles through the course colors', () => {
    expect(nextMomentColor('indigo')).toBe('teal')
    expect(nextMomentColor('pink')).toBe('indigo')
  })
})

describe('renderMomentsPanel', () => {
  it('lists moments by time with their time and label', () => {
    const { panel } = setup()
    expect(labelsOf(panel.element)).toEqual(['Exam hint', 'Ask about this'])
    expect(panel.element.querySelector('.moment-time').textContent).toBe('12:38')
    expect(panel.element.querySelector('.moment-time').getAttribute('aria-label')).toBe(
      'Play from 12:38'
    )
  })

  it('says there are none yet', () => {
    const { panel } = setup({ moments: [] })
    expect(panel.element.querySelector('.moments-empty').textContent).toMatch(/No moments yet/)
  })

  it('seeks from the time button', () => {
    const { panel, options } = setup()
    panel.element.querySelectorAll('.moment-time')[1].click()
    expect(options.onSeek).toHaveBeenCalledWith(852)
  })

  it('adds a moment at the current time labeled Moment, with its label focused', async () => {
    const { panel, options } = setup()
    panel.element.querySelector('.moments-add').click()
    await vi.waitFor(() => expect(labelsOf(panel.element)).toHaveLength(3))
    expect(options.onSave).toHaveBeenCalledWith({
      recordingId: 'week9',
      atSeconds: 795,
      label: 'Moment',
      color: 'orange',
    })
    expect(labelsOf(panel.element)).toEqual(['Exam hint', 'Moment', 'Ask about this'])
    expect(document.activeElement).toBe(panel.element.querySelectorAll('.moment-label')[1])
    expect(options.onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.anything()]))
  })

  it('renames inline on change, and ignores an empty label', async () => {
    const { panel, options } = setup()
    const field = panel.element.querySelector('.moment-label')
    field.value = '  Exam hint, chapter 3 '
    field.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(options.onSave).toHaveBeenCalled())
    expect(options.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', label: 'Exam hint, chapter 3' })
    )
    expect(panel.element.querySelector('.moment-delete').getAttribute('aria-label')).toBe(
      'Delete Exam hint, chapter 3'
    )
    field.value = '   '
    field.dispatchEvent(new Event('change'))
    expect(field.value).toBe('Exam hint, chapter 3')
    expect(options.onSave).toHaveBeenCalledTimes(1)
  })

  it('cycles the color from the dot and keeps focus on it', async () => {
    const { panel, options } = setup()
    const dot = panel.element.querySelector('.moment-dot')
    dot.focus()
    dot.click()
    expect(dot.getAttribute('aria-label')).toBe('Color pink, change color')
    expect(document.activeElement).toBe(dot)
    await vi.waitFor(() =>
      expect(options.onSave).toHaveBeenCalledWith(expect.objectContaining({ color: 'pink' }))
    )
  })

  it('puts the color back when the save fails', async () => {
    const { panel } = setup({ onSave: vi.fn(async () => Promise.reject(new Error('full'))) })
    const dot = panel.element.querySelector('.moment-dot')
    dot.click()
    await vi.waitFor(() =>
      expect(dot.getAttribute('aria-label')).toBe('Color orange, change color')
    )
  })

  it('deletes without a confirm and offers Undo for 5 seconds', async () => {
    vi.useFakeTimers()
    const { panel, options } = setup()
    panel.element.querySelector('.moment-delete').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(options.onDelete).toHaveBeenCalledWith('m1')
    expect(labelsOf(panel.element)).toEqual(['Ask about this'])
    const undoBar = panel.element.querySelector('.moments-undo')
    expect(undoBar.hidden).toBe(false)
    expect(document.activeElement).toBe(undoBar.querySelector('button'))
    await vi.advanceTimersByTimeAsync(undoWindowMs)
    expect(undoBar.hidden).toBe(true)
    expect(document.activeElement).toBe(panel.element.querySelector('.moments-add'))
  })

  it('restores the deleted moment on Undo', async () => {
    const { panel, options } = setup()
    panel.element.querySelector('.moment-delete').click()
    await vi.waitFor(() => expect(panel.element.querySelector('.moments-undo').hidden).toBe(false))
    panel.element.querySelector('.moments-undo button').click()
    await vi.waitFor(() => expect(labelsOf(panel.element)).toEqual(['Exam hint', 'Ask about this']))
    expect(options.onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })
})
