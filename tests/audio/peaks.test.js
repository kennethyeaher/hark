import { describe, expect, it } from 'vitest'
import { buildPeaks, peakFloor } from '../../src/audio/peaks.js'

describe('buildPeaks', () => {
  it('takes the loudest absolute sample per bucket and scales the loudest bucket to 1', () => {
    const samples = new Float32Array([0.1, -0.2, 0.5, -1, 0.25, 0.05, 0.4, 0.5])
    const peaks = buildPeaks(samples, 4)
    expect(peaks).toHaveLength(4)
    expect(peaks[0]).toBeCloseTo(0.2)
    expect(peaks[1]).toBeCloseTo(1)
    expect(peaks[2]).toBeCloseTo(0.25)
    expect(peaks[3]).toBeCloseTo(0.5)
  })

  it('raises quiet buckets to the floor', () => {
    const peaks = buildPeaks(new Float32Array([1, 0.001, 0, 0]), 4)
    expect(peaks).toEqual([1, peakFloor, peakFloor, peakFloor])
    expect(peakFloor).toBe(0.08)
  })

  it('gives silence the floor on every bar', () => {
    expect(buildPeaks(new Float32Array(100), 5)).toEqual(new Array(5).fill(peakFloor))
  })

  it('stretches samples shorter than barCount across the bars', () => {
    const peaks = buildPeaks(new Float32Array([0.5, 1]), 6)
    expect(peaks).toHaveLength(6)
    expect(peaks.every((value) => value >= peakFloor && value <= 1)).toBe(true)
    expect(Math.max(...peaks)).toBe(1)
  })

  it('handles one sample and one bar', () => {
    expect(buildPeaks(new Float32Array([-0.3]), 1)).toEqual([1])
    expect(buildPeaks(new Float32Array([-0.3]), 3)).toEqual([1, 1, 1])
  })

  it('keeps every value between the floor and 1 for uneven buckets', () => {
    const samples = Float32Array.from({ length: 1003 }, (_, index) => Math.sin(index / 7))
    const peaks = buildPeaks(samples, 120)
    expect(peaks).toHaveLength(120)
    expect(peaks.every((value) => value >= peakFloor && value <= 1)).toBe(true)
  })

  it('rejects bad input with specific errors', () => {
    expect(() => buildPeaks([0.1, 0.2], 4)).toThrow(/Float32Array/)
    expect(() => buildPeaks(new Float32Array(4), 2.5)).toThrow(/whole number/)
    expect(() => buildPeaks(new Float32Array(4), 0)).toThrow(/1 or more/)
    expect(() => buildPeaks(new Float32Array(0), 4)).toThrow(/empty/)
    expect(() => buildPeaks(new Float32Array([0.1, Number.NaN]), 2)).toThrow(/finite/)
  })
})
