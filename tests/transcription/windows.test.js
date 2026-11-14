import { describe, expect, it } from 'vitest'
import { findQuietCuts, planWindows } from '../../src/transcription/windows.js'

// a low sample rate keeps the synthetic arrays small; the search works in whole samples anyway
const sampleRate = 100

/**
 * make loud constant audio with optional silent gaps.
 * @param {number} seconds audio length
 * @param {Array<[number, number]>} [gaps] silent stretches as [start, end] in seconds
 * @returns {Float32Array} samples at the test sample rate
 */
function makeAudio(seconds, gaps = []) {
  const samples = new Float32Array(Math.round(seconds * sampleRate)).fill(0.5)
  for (const [start, end] of gaps) {
    samples.fill(0, Math.round(start * sampleRate), Math.round(end * sampleRate))
  }
  return samples
}

describe('findQuietCuts', () => {
  it('moves a cut to a silent gap near the nominal cut', () => {
    const cuts = findQuietCuts(makeAudio(400, [[303, 304]]), { sampleRate })
    // the first frame wholly inside the gap is centered at 303.3
    expect(cuts).toHaveLength(1)
    expect(cuts[0]).toBeCloseTo(303.3, 6)
  })

  it('finds one cut per nominal cut and skips the end of the file', () => {
    const cuts = findQuietCuts(makeAudio(900, [[597, 598]]), { sampleRate })
    expect(cuts).toHaveLength(2)
    expect(cuts[1]).toBeCloseTo(597.3, 6)
  })

  it('ignores a silent gap outside the search range', () => {
    const cuts = findQuietCuts(makeAudio(400, [[289, 291.5]]), { sampleRate })
    // constant audio around the cut, so the first frame of the search wins
    expect(cuts[0]).toBeCloseTo(292, 6)
  })

  it('picks the first lowest frame in constant audio', () => {
    expect(findQuietCuts(makeAudio(700), { sampleRate })).toEqual([292, 592])
    expect(findQuietCuts(new Float32Array(700 * sampleRate), { sampleRate })).toEqual([292, 592])
  })

  it('keeps every frame inside the audio near the end of the file', () => {
    // the last 0.2 seconds are silent, but a frame may not reach past the end
    const cuts = findQuietCuts(makeAudio(301, [[300.8, 301]]), {
      sampleRate,
      shortestLastSeconds: 0,
    })
    expect(cuts[0]).toBeCloseTo(300.7, 6)
  })

  it('skips a last cut that would leave a very short window', () => {
    // a 300.2 second file would otherwise end in a window of about a quarter second
    expect(findQuietCuts(makeAudio(300.2), { sampleRate })).toEqual([])
    // the quiet gap pulls the cut late, leaving 6 seconds, so the tail joins the window before
    expect(findQuietCuts(makeAudio(613, [[606, 607]]), { sampleRate })).toEqual([292])
    // a tail of exactly 10 seconds is long enough to keep
    expect(findQuietCuts(makeAudio(310), { sampleRate })).toEqual([292])
    // constant audio cuts at 292, so a 301 second file would leave 9 seconds
    expect(findQuietCuts(makeAudio(301), { sampleRate })).toEqual([])
  })

  it('returns no cuts for audio no longer than one window', () => {
    expect(findQuietCuts(makeAudio(20), { sampleRate })).toEqual([])
    expect(findQuietCuts(makeAudio(300), { sampleRate })).toEqual([])
    expect(findQuietCuts(new Float32Array(0), { sampleRate })).toEqual([])
  })

  it('follows the window, search, frame, and step options', () => {
    const cuts = findQuietCuts(makeAudio(25, [[11, 12]]), {
      sampleRate,
      windowSeconds: 10,
      searchSeconds: 2,
      frameSeconds: 0.2,
      stepSeconds: 0.5,
      shortestLastSeconds: 2,
    })
    expect(cuts).toEqual([11.5, 18])
  })

  it('rejects samples that are not a Float32Array and bad options', () => {
    expect(() => findQuietCuts([0, 0], { sampleRate })).toThrow(/Float32Array/)
    expect(() => findQuietCuts(makeAudio(1))).toThrow(/sampleRate must be a finite number/)
    expect(() => findQuietCuts(makeAudio(1), { sampleRate, stepSeconds: 0 })).toThrow(
      /stepSeconds must be a finite number above 0/
    )
    expect(() => findQuietCuts(makeAudio(1), { sampleRate, searchSeconds: -1 })).toThrow(
      /searchSeconds must be a finite number of 0 or more/
    )
    expect(() => findQuietCuts(makeAudio(1), { sampleRate, shortestLastSeconds: -1 })).toThrow(
      /shortestLastSeconds must be a finite number of 0 or more/
    )
  })
})

describe('planWindows', () => {
  it('runs each window from one cut to the next', () => {
    expect(planWindows(660, [292, 592])).toEqual([
      { startSeconds: 0, endSeconds: 292 },
      { startSeconds: 292, endSeconds: 592 },
      { startSeconds: 592, endSeconds: 660 },
    ])
  })

  it('gives one window for audio with no cuts and none for empty audio', () => {
    expect(planWindows(20, [])).toEqual([{ startSeconds: 0, endSeconds: 20 }])
    expect(planWindows(0, [])).toEqual([])
  })

  it('rejects cuts out of order or outside the audio', () => {
    expect(() => planWindows(600, [400, 300])).toThrow(
      'cut 1 must be after 400 and before 600, got 300'
    )
    expect(() => planWindows(600, [600])).toThrow('cut 0 must be after 0 and before 600, got 600')
    expect(() => planWindows(600, [0])).toThrow('cut 0 must be after 0 and before 600, got 0')
    expect(() => planWindows(600, 'x')).toThrow(/cuts must be an array/)
    expect(() => planWindows(-1, [])).toThrow(/durationSeconds/)
  })
})
