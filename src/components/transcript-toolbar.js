// the row above the transcript: the Auto-scroll switch

import { createElement } from '../lib/dom.js'

/**
 * render the transcript toolbar.
 * @param {{ isAutoScrollOn: boolean, onAutoScroll: (isOn: boolean) => void }} options the
 *   starting switch state and what to call when it flips
 * @returns {{ element: HTMLElement }} the toolbar
 */
export function renderTranscriptToolbar({ isAutoScrollOn, onAutoScroll }) {
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

  const element = createElement('div', { className: 'transcript-toolbar' }, [
    createElement('div', { className: 'transcript-autoscroll' }, [
      createElement('span', { id: 'transcript-autoscroll-label', text: 'Auto-scroll' }),
      switchButton,
    ]),
  ])
  return { element }
}
