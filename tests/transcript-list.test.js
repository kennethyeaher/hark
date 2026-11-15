// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { groupMomentsBySegment, renderTranscriptList } from '../src/components/transcript-list.js'

const segments = [
  { startSeconds: 0, endSeconds: 10, text: ' First line. ' },
  { startSeconds: 10, endSeconds: 20, text: 'Second line.' },
  { startSeconds: 40, endSeconds: 50, text: 'After a gap.' },
]

describe('groupMomentsBySegment', () => {
  it('puts each moment on the segment it falls in, and skips gaps', () => {
    const groups = groupMomentsBySegment(segments, [
      { atSeconds: 15, label: 'b' },
      { atSeconds: 12, label: 'a' },
      { atSeconds: 30, label: 'gap' },
      { atSeconds: 41, label: 'c' },
    ])
    expect([...groups.keys()]).toEqual([1, 2])
    expect(groups.get(1).map((moment) => moment.label)).toEqual(['a', 'b'])
  })
})

describe('renderTranscriptList', () => {
  it('builds one row per segment with trimmed text', () => {
    const list = renderTranscriptList({ segments, onSeek: vi.fn() })
    const rows = list.element.querySelectorAll('.transcript-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].querySelector('.transcript-text').textContent).toBe('First line.')
    expect(rows[2].querySelector('.transcript-time').textContent).toBe('0:40')
  })

  it('seeks to the start of a clicked row, including clicks on its text', () => {
    const onSeek = vi.fn()
    const list = renderTranscriptList({ segments, onSeek })
    list.element.querySelectorAll('.transcript-text')[1].click()
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('moves the active class without rebuilding rows', () => {
    const list = renderTranscriptList({ segments, onSeek: vi.fn() })
    const first = list.getRow(0)
    expect(list.setActiveIndex(0)).toBe(first)
    list.setActiveIndex(2)
    expect(first.classList.contains('is-active')).toBe(false)
    expect(list.getRow(2).classList.contains('is-active')).toBe(true)
    expect(list.getRow(0)).toBe(first)
    expect(list.setActiveIndex(-1)).toBeNull()
    expect(list.element.querySelector('.is-active')).toBeNull()
  })

  it('replaces moment dots when the moments change', () => {
    const list = renderTranscriptList({ segments, onSeek: vi.fn() })
    list.setMoments([{ atSeconds: 5, label: 'Hint', color: 'teal' }])
    expect(list.getRow(0).querySelectorAll('.transcript-moment-dot')).toHaveLength(1)
    list.setMoments([{ atSeconds: 45, label: 'Quote', color: 'pink' }])
    expect(list.getRow(0).querySelectorAll('.transcript-moment-dot')).toHaveLength(0)
    expect(list.getRow(2).querySelector('.transcript-moment-dot').style.background).toBe(
      'var(--course-pink)'
    )
  })

  it('rejects bad input', () => {
    expect(() => renderTranscriptList({ segments: null, onSeek: vi.fn() })).toThrow(TypeError)
    expect(() => renderTranscriptList({ segments })).toThrow(TypeError)
  })
})

describe('transcript find highlights', () => {
  const findSegments = [
    { startSeconds: 0, endSeconds: 10, text: 'Code the data. Code again.' },
    { startSeconds: 10, endSeconds: 20, text: 'No match here.' },
  ]

  it('wraps each match in a mark and puts plain text back on the next search', () => {
    const list = renderTranscriptList({ segments: findSegments, onSeek: vi.fn() })
    list.showMatches([
      { segmentIndex: 0, start: 0, end: 4 },
      { segmentIndex: 0, start: 15, end: 19 },
    ])
    const marks = list.element.querySelectorAll('mark')
    expect([...marks].map((mark) => mark.textContent)).toEqual(['Code', 'Code'])
    expect(list.getRow(0).querySelector('.transcript-text').textContent).toBe(
      'Code the data. Code again.'
    )
    list.showMatches([])
    expect(list.element.querySelector('mark')).toBeNull()
    expect(list.getRow(0).querySelector('.transcript-text').textContent).toBe(
      'Code the data. Code again.'
    )
  })

  it('marks the current match and returns its row', () => {
    const list = renderTranscriptList({ segments: findSegments, onSeek: vi.fn() })
    list.showMatches([
      { segmentIndex: 0, start: 0, end: 4 },
      { segmentIndex: 1, start: 0, end: 2 },
    ])
    expect(list.setCurrentMatch(1)).toBe(list.getRow(1))
    expect(list.element.querySelectorAll('mark.is-current')).toHaveLength(1)
    expect(list.getRow(1).querySelector('mark').classList.contains('is-current')).toBe(true)
    expect(list.setCurrentMatch(-1)).toBeNull()
    expect(list.element.querySelector('mark.is-current')).toBeNull()
  })
})

describe('transcript editing', () => {
  /**
   * build a list over fresh copies of the segments, since edits write segment text.
   * @returns {object} the list
   */
  const build = () =>
    renderTranscriptList({ segments: segments.map((segment) => ({ ...segment })), onSeek: vi.fn() })

  it('swaps rows for fields and back, keeping the same row buttons', () => {
    const list = build()
    const firstRow = list.getRow(0)
    list.setActiveIndex(0)
    list.startEditing()
    expect(list.element.querySelectorAll('.transcript-field')).toHaveLength(3)
    expect(list.getField(0).value).toBe('First line.')
    list.stopEditing()
    expect(list.element.querySelector('.transcript-field')).toBeNull()
    expect(list.element.querySelector('.transcript-row')).toBe(firstRow)
    expect(firstRow.classList.contains('is-active')).toBe(true)
  })

  it('reports only trimmed text that changed', () => {
    const list = build()
    expect(list.getChanges()).toEqual([])
    list.startEditing()
    expect(list.hasChanges()).toBe(false)
    list.getField(0).value = '  First line.  '
    list.getField(1).value = 'Second line, fixed.'
    expect(list.hasChanges()).toBe(true)
    expect(list.getChanges()).toEqual([{ index: 1, text: 'Second line, fixed.' }])
  })

  it('marks empty fields and clears the mark once fixed', () => {
    const list = build()
    list.startEditing()
    list.showEmptyErrors([1])
    expect(list.getField(1).getAttribute('aria-invalid')).toBe('true')
    expect(list.getField(0).hasAttribute('aria-invalid')).toBe(false)
    list.showEmptyErrors([])
    expect(list.getField(1).hasAttribute('aria-invalid')).toBe(false)
  })
})
