// courses in the indexeddb store: read, list, and save

import { openDatabase } from './db.js'
import { announceChange } from './events.js'
import { courseColors } from '../lib/format.js'
import { assertObject, assertText } from './validate.js'

/**
 * check a course and copy only the fields the store keeps. counts and totals are left
 * out on purpose, since the library computes them from recordings.
 * @param {unknown} course course to check, with or without an id
 * @returns {{ id: string, code: string, name: string, color: string }} the course to store
 * @throws {TypeError} when a field is missing or the color is not a course color
 */
export function normalizeCourse(course) {
  assertObject(course, 'course')
  const id = course.id ?? crypto.randomUUID()
  assertText(id, 'course id')
  assertText(course.code, `course ${id} code`)
  assertText(course.name, `course ${id} name`)
  if (!courseColors.includes(course.color)) {
    throw new TypeError(
      `course ${id} color must be one of ${courseColors.join(', ')}, got ${String(course.color)}`
    )
  }
  return { id, code: course.code, name: course.name, color: course.color }
}

/**
 * list every course in the store.
 * @returns {Promise<object[]>} courses in id order
 */
export async function listCourses() {
  const database = await openDatabase()
  return database.getAll('courses')
}

/**
 * read one course by id.
 * @param {string} id course id
 * @returns {Promise<object | undefined>} the course, or undefined when there is none
 * @throws {TypeError} when id is not a non empty string
 */
export async function getCourse(id) {
  assertText(id, 'course id')
  const database = await openDatabase()
  return database.get('courses', id)
}

/**
 * add a course or replace the one with the same id. a course without an id gets a new one.
 * @param {object} course course with code, name, color, and an optional id
 * @returns {Promise<object>} the course as stored
 * @throws {TypeError} when the course fails validation
 */
export async function saveCourse(course) {
  const stored = normalizeCourse(course)
  const database = await openDatabase()
  await database.put('courses', stored)
  announceChange('courses', stored.id)
  return stored
}
