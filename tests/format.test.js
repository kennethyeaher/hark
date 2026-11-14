import { describe, expect, it } from 'vitest'
import {
  assertCourse,
  courseColors,
  formatDuration,
  formatRecordingCount,
  formatRelativeDate,
} from '../src/lib/format.js'

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [0.2, 'under 1 min'],
    [4, 'under 1 min'],
    [29, 'under 1 min'],
    [59.9, 'under 1 min'],
    [60, '1 min'],
    [89, '1 min'],
    [90, '2 min'],
    [3120, '52 min'],
    [3600, '1 hr 00 min'],
    [4080, '1 hr 08 min'],
    [4440, '1 hr 14 min'],
    [34800, '9 hr 40 min'],
    [37800, '10 hr 30 min'],
    [59 * 60 + 40, '1 hr 00 min'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('throws for values that are not numbers', () => {
    expect(() => formatDuration('60')).toThrow(TypeError)
    expect(() => formatDuration(undefined)).toThrow(TypeError)
    expect(() => formatDuration(NaN)).toThrow(TypeError)
  })

  it('throws for negative or infinite values', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError)
    expect(() => formatDuration(Infinity)).toThrow(RangeError)
  })
})

describe('formatRelativeDate', () => {
  const now = new Date(2026, 10, 11, 12, 0, 0)

  it('says Today for the same day at the start and end', () => {
    expect(formatRelativeDate(new Date(2026, 10, 11, 0, 0, 0), now)).toBe('Today')
    expect(formatRelativeDate(new Date(2026, 10, 11, 23, 59, 59), now)).toBe('Today')
  })

  it('says Yesterday across the midnight boundary', () => {
    const early = new Date(2026, 10, 11, 0, 0, 0)
    expect(formatRelativeDate(new Date(2026, 10, 10, 23, 59, 0), early)).toBe('Yesterday')
    expect(formatRelativeDate(new Date(2026, 10, 10, 0, 0, 0), now)).toBe('Yesterday')
  })

  it('uses the short month style for older dates', () => {
    expect(formatRelativeDate(new Date(2026, 10, 9), now)).toBe('Nov 9')
    expect(formatRelativeDate(new Date(2026, 9, 21), now)).toBe('Oct 21')
  })

  it('adds the year when it differs from now', () => {
    expect(formatRelativeDate(new Date(2025, 9, 21), now)).toBe('Oct 21, 2025')
  })

  it('uses the short style for future days', () => {
    expect(formatRelativeDate(new Date(2026, 10, 12), now)).toBe('Nov 12')
  })

  it('throws for invalid dates', () => {
    expect(() => formatRelativeDate(new Date('nope'), now)).toThrow(TypeError)
    expect(() => formatRelativeDate('2026-11-11', now)).toThrow(TypeError)
    expect(() => formatRelativeDate(now, new Date('nope'))).toThrow(TypeError)
    expect(() => formatRelativeDate(now, 5)).toThrow(TypeError)
  })
})

describe('courseColors', () => {
  it('lists the four course colors', () => {
    expect(courseColors).toEqual(['indigo', 'teal', 'orange', 'pink'])
  })
})

describe('formatRecordingCount', () => {
  it('uses the singular for one and separates thousands', () => {
    expect(formatRecordingCount(0)).toBe('0 recordings')
    expect(formatRecordingCount(1)).toBe('1 recording')
    expect(formatRecordingCount(12000)).toBe('12,000 recordings')
  })

  it('rejects counts that are not whole numbers of zero or more', () => {
    expect(() => formatRecordingCount(-1)).toThrow(RangeError)
    expect(() => formatRecordingCount(1.5)).toThrow(/whole number/)
  })
})

describe('assertCourse', () => {
  const course = { id: 'c1', code: 'INST 630', color: 'teal', recordingCount: 3 }

  it('accepts a complete course', () => {
    expect(() => assertCourse(course, 'test')).not.toThrow()
  })

  it('names the caller and the bad field', () => {
    expect(() => assertCourse(null, 'renderThing')).toThrow(/renderThing needs a course object/)
    expect(() => assertCourse({ ...course, code: '' }, 'test')).toThrow(/non empty code/)
    expect(() => assertCourse({ ...course, color: 'blue' }, 'test')).toThrow(/color of/)
    expect(() => assertCourse({ ...course, recordingCount: -2 }, 'test')).toThrow(/0 or more/)
  })
})
