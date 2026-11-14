import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import {
  getCourse,
  listCourses,
  nextCourseColor,
  normalizeCourse,
  saveCourse,
} from '../../src/data/courses.js'

const course = {
  id: 'hcim605',
  code: 'HCIM 605',
  name: 'Qualitative Research Methods',
  color: 'indigo',
}

beforeEach(useFreshDatabase)

describe('saveCourse', () => {
  it('saves a course and reads it back', async () => {
    await saveCourse(course)
    expect(await getCourse('hcim605')).toEqual(course)
    expect(await listCourses()).toEqual([course])
  })

  it('gives a course without an id a new uuid', async () => {
    const saved = await saveCourse({ ...course, id: undefined })
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await getCourse(saved.id)).toEqual(saved)
  })

  it('keeps only the stored fields, never counts or totals', async () => {
    const saved = await saveCourse({ ...course, recordingCount: 12, totalSeconds: 60 })
    expect(saved).toEqual(course)
    expect(await getCourse('hcim605')).toEqual(course)
  })

  it('replaces a course with the same id', async () => {
    await saveCourse(course)
    await saveCourse({ ...course, color: 'teal' })
    expect((await listCourses()).map((stored) => stored.color)).toEqual(['teal'])
  })

  it('returns undefined for a course that does not exist', async () => {
    expect(await getCourse('missing')).toBeUndefined()
  })
})

describe('course validation', () => {
  it.each([
    [null, /course must be an object/],
    [{ ...course, code: '' }, /code must be a non empty string/],
    [{ ...course, name: '   ' }, /name must be a non empty string/],
    [{ ...course, color: 'blue' }, /color must be one of indigo, teal, orange, pink, got blue/],
    [{ ...course, color: undefined }, /color must be one of/],
  ])('rejects %j', async (input, message) => {
    expect(() => normalizeCourse(input)).toThrow(message)
    await expect(saveCourse(input)).rejects.toThrow(message)
    expect(await listCourses()).toEqual([])
  })

  it('rejects a blank id when reading', async () => {
    await expect(getCourse('')).rejects.toThrow(/course id must be a non empty string/)
  })
})

describe('nextCourseColor', () => {
  it('gives the first color when there are no courses', () => {
    expect(nextCourseColor([])).toBe('indigo')
  })

  it('gives the first color no course uses yet', () => {
    expect(nextCourseColor([{ color: 'indigo' }, { color: 'orange' }])).toBe('teal')
    expect(nextCourseColor([{ color: 'teal' }])).toBe('indigo')
  })

  it('ignores courses that are deleted', () => {
    const courses = [{ color: 'indigo' }, { color: 'teal', deletedAt: new Date(2026, 10, 1) }]
    expect(nextCourseColor(courses)).toBe('teal')
  })

  it('cycles from the start once every color is used', () => {
    const four = [{ color: 'indigo' }, { color: 'teal' }, { color: 'orange' }, { color: 'pink' }]
    expect(nextCourseColor(four)).toBe('indigo')
    expect(nextCourseColor([...four, { color: 'indigo' }])).toBe('teal')
    expect(nextCourseColor([...four, ...four])).toBe('indigo')
  })

  it('rejects input that is not an array', () => {
    expect(() => nextCourseColor(null)).toThrow(/needs an array of courses, got null/)
  })
})
