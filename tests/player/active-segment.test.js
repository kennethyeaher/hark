import { describe, expect, it } from 'vitest'
import { findActiveSegmentIndex } from '../../src/player/active-segment.js'

const segments = [
  { startSeconds: 0, endSeconds: 4 },
  { startSeconds: 4, endSeconds: 9 },
  { startSeconds: 20, endSeconds: 25 },
]

describe('findActiveSegmentIndex', () => {
  it('returns the segment that contains the time', () => {
    expect(findActiveSegmentIndex(segments, 2)).toBe(0)
    expect(findActiveSegmentIndex(segments, 6)).toBe(1)
    expect(findActiveSegmentIndex(segments, 22)).toBe(2)
  })

  it('picks the later segment on a shared boundary', () => {
    expect(findActiveSegmentIndex(segments, 4)).toBe(1)
  })

  it('returns -1 before the first segment', () => {
    expect(findActiveSegmentIndex([{ startSeconds: 3, endSeconds: 5 }], 1)).toBe(-1)
  })

  it('keeps the segment for up to a second past its end', () => {
    expect(findActiveSegmentIndex(segments, 10)).toBe(1)
    expect(findActiveSegmentIndex(segments, 10.5)).toBe(-1)
  })

  it('returns -1 inside a long gap', () => {
    expect(findActiveSegmentIndex(segments, 15)).toBe(-1)
  })

  it('keeps the last segment shortly after the end and drops it later', () => {
    expect(findActiveSegmentIndex(segments, 25.5)).toBe(2)
    expect(findActiveSegmentIndex(segments, 40)).toBe(-1)
  })

  it('handles an empty list', () => {
    expect(findActiveSegmentIndex([], 5)).toBe(-1)
  })

  it('finds the right segment in a large list', () => {
    const many = Array.from({ length: 1000 }, (_, index) => ({
      startSeconds: index * 10,
      endSeconds: index * 10 + 8,
    }))
    expect(findActiveSegmentIndex(many, 5003)).toBe(500)
  })

  it('validates its inputs', () => {
    expect(() => findActiveSegmentIndex(null, 1)).toThrow(TypeError)
    expect(() => findActiveSegmentIndex(segments, NaN)).toThrow(TypeError)
  })
})
