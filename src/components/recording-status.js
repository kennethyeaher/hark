// recording status shared by the table and the cards: one table of words and icons, two renderers

import { createElement, createIcon } from '../lib/dom.js'

const checkIconPaths = ['M5 12.5l4.5 4.5L19 7.5']
const alertIconPaths = ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0 -18z', 'M12 8v4.5', 'M12 16h.01']

// every status that renders as a word, with its icon when it has one. transcribing adds its
// percent. the word is always shown, so no status depends on color alone.
const statusDetails = {
  queued: { label: 'Queued', className: 'recording-status-queued', iconPaths: null },
  transcribing: {
    label: 'Transcribing',
    className: 'recording-status-working',
    iconPaths: null,
  },
  transcribed: {
    label: 'Transcribed',
    className: 'recording-status-transcribed',
    iconPaths: checkIconPaths,
  },
  summarized: {
    label: 'Summarized',
    className: 'recording-status-done',
    iconPaths: checkIconPaths,
  },
  failed: { label: 'Failed', className: 'recording-status-failed', iconPaths: alertIconPaths },
}

/**
 * look up the details of a status and check the progress of a running one.
 * @param {{ status: string, progress?: number }} recording recording data
 * @returns {{ label: string, className: string, iconPaths: string[] | null }} the details
 * @throws {RangeError} when the status is unknown, or a transcribing recording has progress
 *   outside 0 to 1
 */
function getStatusDetails(recording) {
  if (!Object.hasOwn(statusDetails, recording?.status)) {
    throw new RangeError(`unknown recording status ${String(recording?.status)}`)
  }
  if (recording.status === 'transcribing') {
    const progress = recording.progress
    if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) {
      throw new RangeError(`progress must be a number from 0 to 1, got ${String(progress)}`)
    }
  }
  return statusDetails[recording.status]
}

/**
 * turn a progress fraction into a whole percent.
 * @param {number} progress progress from 0 to 1
 * @returns {number} percent from 0 to 100
 */
function toPercent(progress) {
  return Math.round(progress * 100)
}

/**
 * build the status cell content for a table: a word with an optional icon, a progress bar
 * while transcribing, and the error message under Failed when there is one.
 * @param {{ title: string, status: string, progress?: number, errorMessage?: string | null }}
 *   recording recording data
 * @returns {HTMLElement} the status content
 * @throws {RangeError} when the status is unknown or progress is outside 0 to 1
 */
export function renderRecordingStatus(recording) {
  const { label, className, iconPaths } = getStatusDetails(recording)

  // a native looking bar with progressbar semantics and the percent as text beside it
  if (recording.status === 'transcribing') {
    const percent = toPercent(recording.progress)
    const fill = createElement('span', { className: 'recording-progress-fill' })
    fill.style.width = `${percent}%`
    return createElement('span', { className: `recording-status ${className}` }, [
      createElement(
        'span',
        {
          className: 'recording-progress',
          role: 'progressbar',
          'aria-label': `Transcribing ${recording.title}`,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': percent,
        },
        [fill]
      ),
      createElement('span', { className: 'recording-progress-text', text: `${percent}%` }),
    ])
  }

  const status = createElement('span', { className: `recording-status ${className}` }, [
    iconPaths && createIcon(iconPaths, { size: 16 }),
    label,
  ])
  // a failed row says why on one line, cut short, with the full text on hover
  const hasErrorMessage =
    recording.status === 'failed' &&
    typeof recording.errorMessage === 'string' &&
    recording.errorMessage.trim() !== ''
  if (!hasErrorMessage) return status
  return createElement('span', { className: 'recording-status-stack' }, [
    status,
    createElement('span', {
      className: 'recording-status-message',
      text: recording.errorMessage,
      title: recording.errorMessage,
    }),
  ])
}

/**
 * build the small status badge for a recording card. summarized is the finished state, so it
 * shows no badge, as in the mock.
 * @param {{ status: string, progress?: number }} recording recording data
 * @returns {HTMLElement | null} the badge, or null for a summarized recording
 * @throws {RangeError} when the status is unknown or progress is outside 0 to 1
 */
export function renderStatusBadge(recording) {
  const { label, className, iconPaths } = getStatusDetails(recording)
  if (recording.status === 'summarized') return null
  const text =
    recording.status === 'transcribing' ? `${label} ${toPercent(recording.progress)}%` : label
  return createElement('span', { className: `status-badge ${className}` }, [
    iconPaths && createIcon(iconPaths, { size: 14 }),
    text,
  ])
}
