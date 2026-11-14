// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderRecordingStatus } from '../src/components/recording-table.js'
import { recordingStatuses } from '../src/data/recordings.js'

/**
 * render a status for a recording titled Lecture 1.
 * @param {string} status recording status
 * @param {number} [progress] progress from 0 to 1
 * @returns {HTMLElement} the rendered status
 */
function renderStatus(status, progress = 0) {
  return renderRecordingStatus({ title: 'Lecture 1', status, progress })
}

describe('renderRecordingStatus', () => {
  it('shows Queued as a word with no icon', () => {
    const status = renderStatus('queued')
    expect(status.textContent).toBe('Queued')
    expect(status.classList.contains('recording-status-queued')).toBe(true)
    expect(status.querySelector('svg')).toBeNull()
  })

  it('shows a progress bar while transcribing', () => {
    const status = renderStatus('transcribing', 0.42)
    const bar = status.querySelector('[role="progressbar"]')
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(bar.getAttribute('aria-label')).toBe('Transcribing Lecture 1')
    expect(status.textContent).toBe('42%')
  })

  it('shows Transcribed with a check icon', () => {
    const status = renderStatus('transcribed')
    expect(status.textContent).toBe('Transcribed')
    expect(status.classList.contains('recording-status-transcribed')).toBe(true)
    expect(status.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('shows Summarized with a check icon', () => {
    const status = renderStatus('summarized')
    expect(status.textContent).toBe('Summarized')
    expect(status.classList.contains('recording-status-done')).toBe(true)
    expect(status.querySelector('svg')).not.toBeNull()
  })

  it('shows the word Failed with an alert icon, not color alone', () => {
    const status = renderStatus('failed')
    expect(status.textContent).toBe('Failed')
    expect(status.classList.contains('recording-status-failed')).toBe(true)
    expect(status.querySelectorAll('svg path')).toHaveLength(3)
  })

  it('renders every status the store allows', () => {
    for (const status of recordingStatuses) {
      expect(() => renderStatus(status)).not.toThrow()
    }
  })

  it('throws a RangeError on an unknown status', () => {
    expect(() => renderStatus('archived')).toThrow(RangeError)
    expect(() => renderStatus('toString')).toThrow(/unknown recording status toString/)
  })
})
