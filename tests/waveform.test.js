// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildBarHeights, renderWaveform } from '../src/components/waveform.js'

describe('buildBarHeights', () => {
  it('returns the same heights for the same seed', () => {
    expect(buildBarHeights('rec-week9', 32)).toEqual(buildBarHeights('rec-week9', 32))
  })

  it('returns different heights for different seeds', () => {
    expect(buildBarHeights('rec-a', 32)).not.toEqual(buildBarHeights('rec-b', 32))
  })

  it('keeps every height between 0.3 and 1', () => {
    for (const height of buildBarHeights('range check', 200)) {
      expect(height).toBeGreaterThanOrEqual(0.3)
      expect(height).toBeLessThanOrEqual(1)
    }
  })

  it('respects the bar count', () => {
    expect(buildBarHeights('x', 1)).toHaveLength(1)
    expect(buildBarHeights('x', 5)).toHaveLength(5)
  })

  it('throws for bad input', () => {
    expect(() => buildBarHeights('', 5)).toThrow(TypeError)
    expect(() => buildBarHeights(7, 5)).toThrow(TypeError)
    expect(() => buildBarHeights('x', 0)).toThrow(RangeError)
    expect(() => buildBarHeights('x', 201)).toThrow(RangeError)
    expect(() => buildBarHeights('x', 2.5)).toThrow(RangeError)
  })
})

describe('renderWaveform', () => {
  it('renders identical markup for the same seed', () => {
    const first = renderWaveform({ seed: 'rec-1', color: 'teal' })
    const second = renderWaveform({ seed: 'rec-1', color: 'teal' })
    expect(first.outerHTML).toBe(second.outerHTML)
  })

  it('renders different markup for different seeds', () => {
    const first = renderWaveform({ seed: 'rec-1', color: 'teal' })
    const second = renderWaveform({ seed: 'rec-2', color: 'teal' })
    expect(first.outerHTML).not.toBe(second.outerHTML)
  })

  it('draws one bar per count and hides itself from assistive tech', () => {
    const svg = renderWaveform({ seed: 'rec-1', color: 'pink', barCount: 12 })
    expect(svg.querySelectorAll('rect')).toHaveLength(12)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(svg.getAttribute('style')).toBe('color: var(--course-pink)')
    expect(svg.querySelector('rect').getAttribute('fill')).toBe('currentColor')
  })

  it('uses two opacities', () => {
    const svg = renderWaveform({ seed: 'rec-1', color: 'indigo' })
    const opacities = new Set(
      [...svg.querySelectorAll('rect')].map((bar) => bar.getAttribute('opacity'))
    )
    expect(opacities).toEqual(new Set(['1', '0.55']))
  })

  it('centers bars vertically', () => {
    const svg = renderWaveform({ seed: 'rec-1', color: 'orange', height: 40 })
    for (const bar of svg.querySelectorAll('rect')) {
      const top = Number(bar.getAttribute('y'))
      expect(top * 2 + Number(bar.getAttribute('height'))).toBeCloseTo(40)
    }
  })

  it('throws for bad input', () => {
    expect(() => renderWaveform({ seed: '', color: 'teal' })).toThrow(TypeError)
    expect(() => renderWaveform({ seed: 'a', color: 'blue' })).toThrow(TypeError)
    expect(() => renderWaveform({ seed: 'a', color: 'teal', barCount: 0 })).toThrow(RangeError)
    expect(() => renderWaveform({ seed: 'a', color: 'teal', height: 0 })).toThrow(RangeError)
  })
})
