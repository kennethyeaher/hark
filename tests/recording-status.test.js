// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderRecordingStatus, renderStatusBadge } from '../src/components/recording-status.js'
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

describe('renderRecordingStatus for a failed recording', () => {
  it('shows the error message under Failed, cut to one line with the full text as a title', () => {
    const message = 'This file could not be read as audio'
    const status = renderRecordingStatus({
      title: 'Lecture 1',
      status: 'failed',
      errorMessage: message,
    })
    const line = status.querySelector('.recording-status-message')
    expect(status.querySelector('.recording-status-failed').textContent).toBe('Failed')
    expect(line.textContent).toBe(message)
    expect(line.getAttribute('title')).toBe(message)
  })

  it.each([null, undefined, '', '   '])('adds nothing extra for the message %j', (message) => {
    const status = renderRecordingStatus({
      title: 'Lecture 1',
      status: 'failed',
      errorMessage: message,
    })
    expect(status.textContent).toBe('Failed')
    expect(status.querySelector('.recording-status-message')).toBeNull()
  })

  it('ignores an error message on a status that is not failed', () => {
    const status = renderRecordingStatus({
      title: 'Lecture 1',
      status: 'queued',
      errorMessage: 'old message',
    })
    expect(status.textContent).toBe('Queued')
  })
})

describe('renderStatusBadge', () => {
  it.each([
    ['queued', 0, 'Queued', 'recording-status-queued', false],
    ['transcribing', 0.42, 'Transcribing 42%', 'recording-status-working', false],
    ['transcribed', 1, 'Transcribed', 'recording-status-transcribed', true],
    ['failed', 0, 'Failed', 'recording-status-failed', true],
  ])('shows %s as a word', (status, progress, text, className, hasIcon) => {
    const badge = renderStatusBadge({ status, progress })
    expect(badge.textContent).toBe(text)
    expect(badge.classList.contains('status-badge')).toBe(true)
    expect(badge.classList.contains(className)).toBe(true)
    expect(badge.querySelector('svg') !== null).toBe(hasIcon)
  })

  it('shows no badge for a summarized recording', () => {
    expect(renderStatusBadge({ status: 'summarized', progress: 1 })).toBeNull()
  })

  it('rejects an unknown status and bad progress', () => {
    expect(() => renderStatusBadge({ status: 'archived' })).toThrow(/unknown recording status/)
    expect(() => renderStatusBadge({ status: 'transcribing', progress: 2 })).toThrow(RangeError)
  })
})
