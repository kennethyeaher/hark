// the Summary card at the top of the rail. Milestone 5 fills it; for now it says what is coming

import { createElement, createIcon } from '../lib/dom.js'

const sparkleIconPaths = ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8 -5.2L5 10l5.2 -1.8z']

/** the line the card shows until summaries exist */
export const summaryPlaceholder =
  'Summary arrives in a later version. It will be written on this device.'

/**
 * render the Summary card. Milestone 5 replaces the body slot with the summary and key points.
 * @returns {HTMLElement} the card, with its body in `.summary-body`
 */
export function renderSummaryPanel() {
  return createElement(
    'section',
    { className: 'rail-card rail-card-grouped summary-panel', 'aria-labelledby': 'summary-title' },
    [
      createElement('h2', { className: 'rail-card-title' }, [
        createIcon(sparkleIconPaths, { size: 16, className: 'icon rail-card-icon-blue' }),
        createElement('span', { id: 'summary-title', text: 'Summary' }),
      ]),
      createElement('div', { className: 'summary-body' }, [
        createElement('p', { className: 'rail-card-note', text: summaryPlaceholder }),
      ]),
    ]
  )
}
