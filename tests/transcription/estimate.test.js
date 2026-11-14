import { describe, expect, it } from 'vitest'
import {
  estimateRemainingSeconds,
  estimateSeconds,
  formatEstimate,
} from '../../src/transcription/estimate.js'

describe('estimateSeconds', () => {
  it('multiplies audio length by the model factor', () => {
    expect(estimateSeconds({ durationSeconds: 600, modelKey: 'fast' })).toBeCloseTo(54)
    expect(estimateSeconds({ durationSeconds: 600, modelKey: 'balanced' })).toBeCloseTo(90)
    expect(estimateSeconds({ durationSeconds: 600, modelKey: 'accurate' })).toBeCloseTo(366)
  })

  it('gives 0 for a file with no length', () => {
    expect(estimateSeconds({ durationSeconds: 0, modelKey: 'balanced' })).toBe(0)
  })

  it('handles a very long file', () => {
    // a ten hour recording on the accurate model
    expect(estimateSeconds({ durationSeconds: 36000, modelKey: 'accurate' })).toBeCloseTo(21960)
  })

  it.each([
    [{ durationSeconds: -1, modelKey: 'fast' }, /durationSeconds must be a finite number/],
    [{ durationSeconds: Number.NaN, modelKey: 'fast' }, /durationSeconds/],
    [{ durationSeconds: Infinity, modelKey: 'fast' }, /durationSeconds/],
    [{ durationSeconds: '60', modelKey: 'fast' }, /durationSeconds/],
    [{ durationSeconds: 60, modelKey: 'huge' }, /model must be one of/],
  ])('rejects %j', (options, message) => {
    expect(() => estimateSeconds(options)).toThrow(message)
  })
})

describe('estimateRemainingSeconds', () => {
  const base = { durationSeconds: 3000, modelKey: 'balanced' }

  it('falls back to the fixed rule before any audio is processed', () => {
    const remaining = estimateRemainingSeconds({ ...base, processedSeconds: 0, elapsedSeconds: 40 })
    expect(remaining).toBeCloseTo(450)
  })

  it('uses the measured speed once audio is processed', () => {
    // 300 seconds of audio took 60 seconds, so 0.2 seconds per audio second for the 2700 left
    const remaining = estimateRemainingSeconds({
      ...base,
      processedSeconds: 300,
      elapsedSeconds: 60,
    })
    expect(remaining).toBeCloseTo(540)
  })

  it('gives 0 when processed audio passes the duration', () => {
    expect(estimateRemainingSeconds({ ...base, processedSeconds: 3010, elapsedSeconds: 500 })).toBe(
      0
    )
  })

  it('gives 0 for a file with no length', () => {
    expect(
      estimateRemainingSeconds({
        durationSeconds: 0,
        processedSeconds: 0,
        elapsedSeconds: 0,
        modelKey: 'fast',
      })
    ).toBe(0)
  })

  it('handles a very long file', () => {
    const remaining = estimateRemainingSeconds({
      durationSeconds: 36000,
      processedSeconds: 300,
      elapsedSeconds: 270,
      modelKey: 'accurate',
    })
    expect(remaining).toBeCloseTo(32130)
  })

  it.each([
    [{ processedSeconds: -5, elapsedSeconds: 1 }, /processedSeconds must be a finite number/],
    [{ processedSeconds: 5, elapsedSeconds: -1 }, /elapsedSeconds must be a finite number/],
    [{ processedSeconds: 5, elapsedSeconds: 1, modelKey: 'huge' }, /model must be one of/],
  ])('rejects %j', (overrides, message) => {
    expect(() => estimateRemainingSeconds({ ...base, ...overrides })).toThrow(message)
  })
})

describe('formatEstimate', () => {
  it.each([
    [0, 'less than a minute'],
    [29, 'less than a minute'],
    [30, 'about 1 minute'],
    [89, 'about 1 minute'],
    [90, 'about 2 minutes'],
    [600, 'about 10 minutes'],
    [32400, 'about 540 minutes'],
  ])('formats %d seconds as %s', (seconds, text) => {
    expect(formatEstimate(seconds)).toBe(text)
  })

  it.each([-1, Number.NaN, Infinity, '60'])('rejects %j', (seconds) => {
    expect(() => formatEstimate(seconds)).toThrow(/seconds must be a finite number/)
  })
})
