import { describe, it, expect } from 'vitest'
import { filterRecordings, sortRecordings, recordingFilters } from '../src/lib/filters.js'

// a fixed now so the week boundary is stable: wednesday 2026-10-28 at 15:00 local
const now = new Date(2026, 9, 28, 15)

/**
 * build a recording with defaults for the fields a test does not care about.
 * @param {object} fields fields to override
 * @returns {object} the recording
 */
function makeRecording(fields) {
  return {
    id: 'rec',
    recordedAt: now,
    status: 'summarized',
    isStarred: false,
    hasNotes: false,
    ...fields,
  }
}

const recordings = [
  makeRecording({ id: 'today', isStarred: true, hasNotes: true }),
  makeRecording({ id: 'six-days', recordedAt: new Date(2026, 9, 22, 0, 0) }),
  makeRecording({ id: 'seven-days', recordedAt: new Date(2026, 9, 21, 23, 59) }),
  makeRecording({ id: 'transcribing', status: 'transcribing', hasNotes: true }),
]

/**
 * list the ids of a set of recordings.
 * @param {object[]} list recordings
 * @returns {string[]} their ids in order
 */
function ids(list) {
  return list.map((recording) => recording.id)
}

describe('filterRecordings', () => {
  it('keeps everything for All', () => {
    expect(ids(filterRecordings(recordings, 'all', now))).toEqual(ids(recordings))
  })

  it('keeps the last seven calendar days for This week', () => {
    expect(ids(filterRecordings(recordings, 'thisWeek', now))).toEqual([
      'today',
      'six-days',
      'transcribing',
    ])
  })

  it('filters by status, star, and notes', () => {
    expect(ids(filterRecordings(recordings, 'summarized', now))).not.toContain('transcribing')
    expect(ids(filterRecordings(recordings, 'starred', now))).toEqual(['today'])
    expect(ids(filterRecordings(recordings, 'hasNotes', now))).toEqual(['today', 'transcribing'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterRecordings([makeRecording({})], 'starred', now)).toEqual([])
  })

  it('does not change the input', () => {
    const copy = [...recordings]
    filterRecordings(recordings, 'starred', now)
    expect(recordings).toEqual(copy)
  })

  it('has one chip per filter with the labels from the mock', () => {
    expect(recordingFilters.map((filter) => filter.label)).toEqual([
      'All',
      'This week',
      'Summarized',
      'Starred',
      'Has notes',
    ])
  })

  it('rejects bad input', () => {
    expect(() => filterRecordings(recordings, 'recent', now)).toThrow(/unknown filter recent/)
    expect(() => filterRecordings(null, 'all', now)).toThrow(/array of recordings/)
    expect(() => filterRecordings([{ id: 'x' }], 'all', now)).toThrow(/recording x needs/)
    expect(() => filterRecordings(recordings, 'all', new Date('nope'))).toThrow(/valid now/)
  })
})

describe('sortRecordings', () => {
  const unsorted = [
    makeRecording({ id: 'middle', recordedAt: new Date(2026, 9, 20) }),
    makeRecording({ id: 'newest', recordedAt: new Date(2026, 9, 27) }),
    makeRecording({ id: 'oldest', recordedAt: new Date(2026, 8, 1) }),
  ]

  it('sorts newest first and oldest first', () => {
    expect(ids(sortRecordings(unsorted, 'newest'))).toEqual(['newest', 'middle', 'oldest'])
    expect(ids(sortRecordings(unsorted, 'oldest'))).toEqual(['oldest', 'middle', 'newest'])
  })

  it('returns a new array and leaves the input alone', () => {
    const sorted = sortRecordings(unsorted, 'newest')
    expect(sorted).not.toBe(unsorted)
    expect(ids(unsorted)).toEqual(['middle', 'newest', 'oldest'])
  })

  it('rejects an unknown sort', () => {
    expect(() => sortRecordings(unsorted, 'title')).toThrow(/unknown sort title/)
  })
})
