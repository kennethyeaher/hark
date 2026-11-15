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
