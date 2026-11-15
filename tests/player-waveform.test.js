// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  describePosition,
  renderPlayerWaveform,
  resamplePeaks,
} from '../src/components/player-waveform.js'

/**
 * render a waveform with a spy for seeks.
 * @param {object} [overrides] options to replace
 * @returns {{ waveform: object, onSeek: import('vitest').Mock }} the waveform and the spy
 */
function setup(overrides = {}) {
  const onSeek = vi.fn()
  const waveform = renderPlayerWaveform({
    peaks: [0.2, 1, 0.5, 0.1],
    seed: 'week9',
    durationSeconds: 4440,
    onSeek,
    ...overrides,
  })
  return { waveform, onSeek }
}

/**
 * press a key on the slider.
 * @param {HTMLElement} element the slider
 * @param {string} key the key name
 * @returns {KeyboardEvent} the event, to check whether it was handled
 */
function press(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe('resamplePeaks', () => {
  it('keeps the loudest value in each bucket', () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.3, 0.8, 0.1], 3)).toEqual([0.9, 0.3, 0.8])
  })

  it('copies a list that already fits', () => {
    const peaks = [0.1, 0.2]
    const result = resamplePeaks(peaks, 5)
    expect(result).toEqual(peaks)
    expect(result).not.toBe(peaks)
  })

  it('handles counts that do not divide evenly', () => {
    expect(resamplePeaks([0.1, 0.2, 0.3, 0.4, 0.5], 2)).toEqual([0.2, 0.5])
  })

  it('rejects bad input', () => {
    expect(() => resamplePeaks('peaks', 2)).toThrow(TypeError)
    expect(() => resamplePeaks([0.1], 0)).toThrow(RangeError)
  })
})

describe('describePosition', () => {
  it('reads the position and the length in words', () => {
    expect(describePosition(795, 4440)).toBe('13 minutes 15 seconds of 1 hour 14 minutes')
  })
})

describe('renderPlayerWaveform', () => {
  it('is a labeled slider with values in seconds', () => {
    const { waveform } = setup()
    waveform.setTime(795)
    const { element } = waveform
    expect(element.getAttribute('role')).toBe('slider')
    expect(element.getAttribute('aria-label')).toBe('Playback position')
    expect(element.getAttribute('aria-valuemax')).toBe('4440')
    expect(element.getAttribute('aria-valuenow')).toBe('795')
    expect(element.getAttribute('aria-valuetext')).toBe(
      '13 minutes 15 seconds of 1 hour 14 minutes'
    )
  })

  it('draws one bar per peak and marks the played ones', () => {
    const { waveform } = setup()
    expect(waveform.element.querySelectorAll('.player-waveform-bar')).toHaveLength(4)
    waveform.setTime(2220)
    expect(waveform.element.querySelectorAll('.is-played')).toHaveLength(2)
    waveform.setTime(0)
    expect(waveform.element.querySelectorAll('.is-played')).toHaveLength(0)
  })

  it('shows placeholder bars until peaks arrive', () => {
    const { waveform } = setup({ peaks: null })
    expect(waveform.element.classList.contains('is-pending')).toBe(true)
    expect(waveform.element.querySelectorAll('.player-waveform-bar')).toHaveLength(120)
    waveform.setPeaks([0.5, 1])
    expect(waveform.element.classList.contains('is-pending')).toBe(false)
    expect(waveform.element.querySelectorAll('.player-waveform-bar')).toHaveLength(2)
  })

  it('moves 5 s on arrows, 30 s on page keys, and to the ends on Home and End', () => {
    const { waveform, onSeek } = setup()
    waveform.setTime(100)
    expect(press(waveform.element, 'ArrowRight').defaultPrevented).toBe(true)
    expect(onSeek).toHaveBeenLastCalledWith(105)
    press(waveform.element, 'ArrowDown')
    expect(onSeek).toHaveBeenLastCalledWith(100)
    press(waveform.element, 'PageUp')
    expect(onSeek).toHaveBeenLastCalledWith(130)
    press(waveform.element, 'PageDown')
    expect(onSeek).toHaveBeenLastCalledWith(100)
    press(waveform.element, 'End')
    expect(onSeek).toHaveBeenLastCalledWith(4440)
    press(waveform.element, 'Home')
    expect(onSeek).toHaveBeenLastCalledWith(0)
    press(waveform.element, 'ArrowLeft')
    expect(onSeek).toHaveBeenLastCalledWith(0)
  })

  it('leaves other keys alone', () => {
    const { waveform, onSeek } = setup()
    expect(press(waveform.element, 'Tab').defaultPrevented).toBe(false)
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('seeks to the point under the pointer', () => {
    const { waveform, onSeek } = setup()
    const bars = waveform.element.querySelector('.player-waveform-bars')
    bars.getBoundingClientRect = () => ({ left: 100, width: 400 })
    waveform.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 200, button: 0, bubbles: true })
    )
    expect(onSeek).toHaveBeenLastCalledWith(1110)
  })

  it('ignores keys and pointers when disabled', () => {
    const { waveform, onSeek } = setup()
    waveform.setDisabled(true)
    expect(waveform.element.getAttribute('aria-disabled')).toBe('true')
    expect(waveform.element.tabIndex).toBe(-1)
    press(waveform.element, 'ArrowRight')
    waveform.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 1, button: 0 }))
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('needs an onSeek function', () => {
    expect(() => renderPlayerWaveform({ seed: 'a', durationSeconds: 1 })).toThrow(TypeError)
  })
})
