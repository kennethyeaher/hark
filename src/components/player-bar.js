// the player card: skip back, play or pause, skip forward, the time, the waveform, and the speed

import { createElement, createIcon } from '../lib/dom.js'
import { formatClock } from '../lib/format.js'
import { playbackRates } from '../player/player.js'
import { renderPlayerWaveform } from './player-waveform.js'

const skipSeconds = 15
const skipBackIconPaths = ['M6 5v14', 'M18 5.5L9 12l9 6.5z']
const skipForwardIconPaths = ['M18 5v14', 'M6 5.5L15 12l-9 6.5z']
const playIconPaths = ['M8 5.5v13l10.5 -6.5z']
const pauseIconPaths = ['M7 5h3.5v14H7z', 'M13.5 5H17v14h-3.5z']

/**
 * build a filled icon, used for the play and pause shapes.
 * @param {string[]} pathData one `d` string per path
 * @returns {SVGSVGElement} the icon
 */
function createFilledIcon(pathData) {
  const icon = createIcon(pathData, { size: 18 })
  icon.setAttribute('fill', 'currentColor')
  icon.setAttribute('stroke', 'none')
  return icon
}

/**
 * format a rate for the speed menu, such as `1.25×`.
 * @param {number} rate the playback rate
 * @returns {string} the label
 */
function formatRate(rate) {
  return `${rate}×`
}

/**
 * render the player card. it shows what the player state says and calls back for every action,
 * so it never touches the audio itself.
 * @param {{ durationSeconds: number, peaks?: number[] | null, seed: string, rate: number,
 *   unavailableMessage?: string | null, onToggle: () => void, onSkip: (seconds: number) => void,
 *   onSeek: (seconds: number) => void, onRate: (rate: number) => void }} options the length,
 *   waveform data, starting speed, the reason controls are off when there is no audio, and
 *   the action callbacks
 * @returns {{ element: HTMLElement, update: (state: { currentTime: number, duration: number,
 *   isPlaying: boolean, rate: number, errorMessage: string }) => void,
 *   setPeaks: (peaks: number[]) => void, destroy: () => void }} the card and its updates
 */
export function renderPlayerBar({
  durationSeconds,
  peaks = null,
  seed,
  rate,
  unavailableMessage = null,
  onToggle,
  onSkip,
  onSeek,
  onRate,
}) {
  const isUnavailable = Boolean(unavailableMessage)
  let isPlaying = false

  const backButton = createElement(
    'button',
    { type: 'button', className: 'player-skip', 'aria-label': `Back ${skipSeconds} seconds` },
    [createIcon(skipBackIconPaths, { size: 18 })]
  )
  const playButton = createElement(
    'button',
    { type: 'button', className: 'player-play', 'aria-label': 'Play' },
    [createFilledIcon(playIconPaths)]
  )
  const forwardButton = createElement(
    'button',
    { type: 'button', className: 'player-skip', 'aria-label': `Forward ${skipSeconds} seconds` },
    [createIcon(skipForwardIconPaths, { size: 18 })]
  )
  const currentText = createElement('span', {
    className: 'player-time player-time-current',
    text: formatClock(0),
  })
  const totalText = createElement('span', {
    className: 'player-time player-time-total',
    text: formatClock(durationSeconds),
  })
  const waveform = renderPlayerWaveform({ peaks, seed, durationSeconds, onSeek })

  // a native select keeps the speed menu reachable and readable with no extra keyboard code
  const speedSelect = createElement(
    'select',
    { className: 'player-speed', 'aria-label': 'Playback speed' },
    playbackRates.map((value) =>
      createElement('option', { value, text: formatRate(value), selected: value === rate })
    )
  )

  backButton.addEventListener('click', () => onSkip(-skipSeconds))
  forwardButton.addEventListener('click', () => onSkip(skipSeconds))
  playButton.addEventListener('click', () => onToggle())
  speedSelect.addEventListener('change', () => onRate(Number(speedSelect.value)))

  const message = createElement('p', {
    className: 'player-message',
    role: 'status',
    text: unavailableMessage ?? '',
  })
  message.hidden = !isUnavailable

  const element = createElement(
    'section',
    { className: 'player-card', 'aria-label': 'Audio player' },
    [
      createElement('div', { className: 'player-row' }, [
        createElement('div', { className: 'player-buttons' }, [
          backButton,
          playButton,
          forwardButton,
        ]),
        currentText,
        waveform.element,
        totalText,
        speedSelect,
      ]),
      message,
    ]
  )

  if (isUnavailable) {
    for (const control of [backButton, playButton, forwardButton, speedSelect]) {
      control.disabled = true
    }
    waveform.setDisabled(true)
  }

  return {
    element,

    /**
     * show a player state.
     * @param {{ currentTime: number, duration: number, isPlaying: boolean, rate: number,
     *   errorMessage: string }} state the player state
     * @returns {void}
     */
    update(state) {
      waveform.setDuration(state.duration)
      waveform.setTime(state.currentTime)
      currentText.textContent = formatClock(state.currentTime)
      if (state.duration > 0) totalText.textContent = formatClock(state.duration)
      if (state.isPlaying !== isPlaying) {
        isPlaying = state.isPlaying
        playButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play')
        playButton.replaceChildren(createFilledIcon(isPlaying ? pauseIconPaths : playIconPaths))
      }
      if (String(state.rate) !== speedSelect.value) speedSelect.value = String(state.rate)
      if (!isUnavailable) {
        message.textContent = state.errorMessage
        message.hidden = state.errorMessage === ''
      }
    },

    setPeaks: waveform.setPeaks,
    destroy: waveform.destroy,
  }
}
