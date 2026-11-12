// the library the pages read: courses with computed totals and recordings with hasNotes

import { openDatabase } from './db.js'

/**
 * check whether a note has a body with something other than whitespace in it.
 * @param {{ body?: unknown } | undefined} note the stored note, if any
 * @returns {boolean} true when the note has real text
 */
function hasNoteText(note) {
  return typeof note?.body === 'string' && note.body.trim() !== ''
}

/**
 * turn stored rows into the shapes the pages use. recordings in Trash and recordings
 * whose course is missing are left out; the second kind is counted in droppedCount.
 * courses are ordered by their newest recording, so the course you recorded last comes first.
 * @param {{ courses: object[], recordings: object[], notes: object[] }} rows rows read from the store
 * @returns {{ courses: object[], recordings: object[], droppedCount: number }} the library
 * @throws {TypeError} when courses, recordings, or notes is not an array
 */
export function buildLibrary({ courses, recordings, notes }) {
  if (!Array.isArray(courses) || !Array.isArray(recordings) || !Array.isArray(notes)) {
    throw new TypeError('buildLibrary needs courses, recordings, and notes arrays')
  }
  const noteByRecordingId = new Map(notes.map((note) => [note.recordingId, note]))
  const totalsByCourseId = new Map(
    courses.map((course) => [course.id, { recordingCount: 0, totalSeconds: 0, newestAt: null }])
  )

  // keep recordings that are not in Trash and belong to a course that exists
  let droppedCount = 0
  const shownRecordings = []
  for (const recording of recordings) {
    if (recording.deletedAt) continue
    const totals = totalsByCourseId.get(recording.courseId)
    if (!totals) {
      droppedCount += 1
      continue
    }
    totals.recordingCount += 1
    totals.totalSeconds += recording.durationSeconds
    if (!totals.newestAt || recording.recordedAt > totals.newestAt) {
      totals.newestAt = recording.recordedAt
    }
    shownRecordings.push({
      ...recording,
      hasNotes: hasNoteText(noteByRecordingId.get(recording.id)),
    })
  }
  shownRecordings.sort((first, second) => second.recordedAt - first.recordedAt)

  // newest recording first, then courses with no recordings by code
  const shownCourses = courses
    .map((course) => {
      const { recordingCount, totalSeconds, newestAt } = totalsByCourseId.get(course.id)
      return { course: { ...course, recordingCount, totalSeconds }, newestAt }
    })
    .sort((first, second) => {
      if (first.newestAt && second.newestAt) return second.newestAt - first.newestAt
      if (first.newestAt || second.newestAt) return first.newestAt ? -1 : 1
      return first.course.code.localeCompare(second.course.code)
    })
    .map(({ course }) => course)

  return { courses: shownCourses, recordings: shownRecordings, droppedCount }
}

/**
 * read courses, recordings, and notes in one transaction and build the library from them.
 * @returns {Promise<{ courses: object[], recordings: object[], droppedCount: number }>} the library
 * @throws {Error} when the database cannot open
 */
export async function loadLibrary() {
  const database = await openDatabase()
  const transaction = database.transaction(['courses', 'recordings', 'notes'])
  const [courses, recordings, notes] = await Promise.all([
    transaction.objectStore('courses').getAll(),
    transaction.objectStore('recordings').getAll(),
    transaction.objectStore('notes').getAll(),
    transaction.done,
  ])
  return buildLibrary({ courses, recordings, notes })
}
