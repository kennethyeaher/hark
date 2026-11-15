import { describe, expect, it } from 'vitest'
import { findMatches } from '../../src/player/find.js'

const seg = (text) => ({ text, startSeconds: 0, endSeconds: 1 })

describe('findMatches', () => {
  it('finds matches ignoring case', () => {
    expect(findMatches([seg('Cache the cache')], 'CACHE')).toEqual([
      { segmentIndex: 0, start: 0, end: 5 },
      { segmentIndex: 0, start: 10, end: 15 },
    ])
  })

  it('reports the segment index', () => {
    const result = findMatches([seg('nothing'), seg('a model here')], 'model')
    expect(result).toEqual([{ segmentIndex: 1, start: 2, end: 7 }])
  })

  it('ignores accents in text and query', () => {
    expect(findMatches([seg('un café noir')], 'cafe')).toEqual([
      { segmentIndex: 0, start: 3, end: 7 },
    ])
    expect(findMatches([seg('cafe')], 'café')).toHaveLength(1)
  })

  it('maps offsets back when the text uses combining marks', () => {
    // "e" plus a combining accent is two code units in the original
    const text = 'café au lait'
    const [match] = findMatches([seg(text)], 'cafe')
    expect(text.slice(match.start, match.end)).toBe('café')
  })

  it('maps offsets when a character expands or has a surrogate pair', () => {
    const text = '\u{1F600} İstanbul'
    const [match] = findMatches([seg(text)], 'stanbul')
    expect(text.slice(match.start, match.end)).toBe('stanbul')
  })

  it('does not overlap matches', () => {
    expect(findMatches([seg('aaaa')], 'aaa')).toEqual([{ segmentIndex: 0, start: 0, end: 3 }])
  })

  it('ignores short queries', () => {
    expect(findMatches([seg('a b c')], 'a')).toEqual([])
    expect(findMatches([seg('a b c')], '  a  ')).toEqual([])
    expect(findMatches([seg('a b c')], '')).toEqual([])
  })

  it('trims the query', () => {
    expect(findMatches([seg('hello world')], '  world ')).toHaveLength(1)
  })

  it('returns nothing when there is no match', () => {
    expect(findMatches([seg('hello')], 'xyz')).toEqual([])
  })

  it('validates its inputs', () => {
    expect(() => findMatches(null, 'ab')).toThrow(TypeError)
    expect(() => findMatches([], 5)).toThrow(TypeError)
  })
})
