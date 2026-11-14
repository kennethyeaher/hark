import { describe, expect, it } from 'vitest'
import { findQuietCuts, keepOwnedSegments, planWindows } from '../../src/transcription/windows.js'

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
    const cuts = findQuietCuts(makeAudio(301, [[300.8, 301]]), { sampleRate })
    expect(cuts[0]).toBeCloseTo(300.7, 6)
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
  })
})

describe('planWindows', () => {
  it('adds context on each side of the owned range and clamps it to the file', () => {
    expect(planWindows(660, [292, 592])).toEqual([
      { ownedStart: 0, ownedEnd: 292, audioStart: 0, audioEnd: 297, isLast: false },
      { ownedStart: 292, ownedEnd: 592, audioStart: 287, audioEnd: 597, isLast: false },
      { ownedStart: 592, ownedEnd: 660, audioStart: 587, audioEnd: 660, isLast: true },
    ])
  })

  it('clamps context that would reach past a short last window', () => {
    expect(planWindows(302, [300], { contextSeconds: 5 })[1]).toEqual({
      ownedStart: 300,
      ownedEnd: 302,
      audioStart: 295,
      audioEnd: 302,
      isLast: true,
    })
  })

  it('gives one window for audio with no cuts and none for empty audio', () => {
    expect(planWindows(20, [])).toEqual([
      { ownedStart: 0, ownedEnd: 20, audioStart: 0, audioEnd: 20, isLast: true },
    ])
    expect(planWindows(0, [])).toEqual([])
  })

  it('follows the context option', () => {
    expect(planWindows(600, [300], { contextSeconds: 0 })[1]).toMatchObject({
      audioStart: 300,
      audioEnd: 600,
    })
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

describe('keepOwnedSegments', () => {
  const window = { ownedStart: 300, ownedEnd: 600 }

  /**
   * make a segment with the given times.
   * @param {number} startSeconds start
   * @param {number} endSeconds end
   * @returns {{ index: number, startSeconds: number, endSeconds: number, text: string }} segment
   */
  function makeSegment(startSeconds, endSeconds) {
    return { index: 0, startSeconds, endSeconds, text: `${startSeconds}` }
  }

  it('keeps a midpoint at the owned start and drops one at the owned end', () => {
    const segments = [
      makeSegment(295, 299.9),
      makeSegment(298, 302),
      makeSegment(450, 460),
      makeSegment(598, 602),
      makeSegment(599, 605),
    ]
    expect(keepOwnedSegments(segments, window).map((segment) => segment.text)).toEqual([
      '298',
      '450',
    ])
  })

  it('keeps a midpoint on the end of the file in the last window', () => {
    const segments = [makeSegment(600, 600)]
    expect(keepOwnedSegments(segments, window)).toEqual([])
    expect(keepOwnedSegments(segments, { ...window, isLast: true })).toEqual(segments)
  })

  it('returns the same segment objects without changing them', () => {
    const segment = makeSegment(400, 410)
    expect(keepOwnedSegments([segment], window)[0]).toBe(segment)
  })

  it('rejects bad input', () => {
    expect(() => keepOwnedSegments(null, window)).toThrow(/segments must be an array/)
    expect(() => keepOwnedSegments([], { ownedStart: 10, ownedEnd: 5 })).toThrow(
      /must not come before/
    )
    expect(() => keepOwnedSegments([], {})).toThrow(/ownedStart/)
  })
})
