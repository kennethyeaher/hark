/*
  sample courses and recordings from the home and course mocks, written to the store for a
  first look at Hark. dates are kept as days before now so Today and Yesterday stay true
  whenever the samples are added.

  course counts are not stored. the library counts these recordings, so HCIM 605 shows 8
  recordings where the mock shows 12, since the mock counts older lectures that are not here.
*/

import { abortTransaction, openDatabase } from './db.js'
import { announceChange } from './events.js'
import { normalizeCourse } from './courses.js'
import { normalizeRecording } from './recordings.js'
import { normalizeNote } from './notes.js'

const sampleCourses = [
  { id: 'hcim605', code: 'HCIM 605', name: 'Qualitative Research Methods', color: 'indigo' },
  { id: 'inst630', code: 'INST 630', name: 'Programming Human-Centered Interfaces', color: 'teal' },
  { id: 'inst737', code: 'INST 737', name: 'Data Science Techniques', color: 'orange' },
  { id: 'inst711', code: 'INST 711', name: 'Interaction Design Studio', color: 'pink' },
]

// one entry per recording in the mocks: id, title, course, minutes, and days before now
const recordingRows = [
  ['week9-thematic-analysis', 'Week 9 · Thematic analysis', 'hcim605', 74, 0],
  ['lecture17-client-side-ml', 'Lecture 17 · Client-side ML', 'inst630', 52, 0],
  ['guest-talk-design-ethics', 'Guest talk · Design ethics', 'inst737', 41, 1],
  ['week8-interview-protocols', 'Week 8 · Interview protocols', 'hcim605', 68, 7],
  ['lecture12-policy-and-access', 'Lecture 12 · Policy and access', 'inst711', 58, 8],
  ['office-hours-final-project', 'Office hours · Final project', 'hcim605', 24, 10],
  ['week7-sampling-strategies', 'Week 7 · Sampling strategies', 'hcim605', 62, 14],
  ['week6-ethics-and-consent', 'Week 6 · Ethics and consent', 'hcim605', 58, 21],
  ['week5-field-notes', 'Week 5 · Field notes', 'hcim605', 65, 28],
  ['week4-research-questions', 'Week 4 · Research questions', 'hcim605', 71, 35],
  ['week3-literature-review', 'Week 3 · Literature review', 'hcim605', 60, 42],
]

// starred recordings and note text, so every filter chip has results
const starredIds = new Set(['week9-thematic-analysis', 'week6-ethics-and-consent'])
const noteBodies = new Map([
  [
    'week9-thematic-analysis',
    'Start with open codes, then group them into themes. Memo every merge.',
  ],
  ['week8-interview-protocols', 'Pilot the protocol with one person first. Keep probes neutral.'],
  [
    'week4-research-questions',
    'A good question is open, answerable with the data, and narrow enough.',
  ],
])

/**
 * get a time on a day before now, at a fixed hour, never later than now.
 * @param {Date} now the current time
 * @param {number} daysBefore whole days before today
 * @param {number} hour local hour on that day
 * @returns {Date} the new date
 */
function dateBefore(now, daysBefore, hour) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBefore, hour)
  if (date <= now) return date
  // early in the day the hour has not come yet, so squeeze the hours into the time since
  // midnight. a later hour still lands later, which keeps the mock order at any time of day
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return new Date(midnight.getTime() + ((now - midnight) * hour) / 24)
}

/**
 * build the sample courses, recordings, and notes as the store keeps them, with dates relative to now.
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {{ courses: object[], recordings: object[], notes: object[] }} rows ready to write
 * @throws {TypeError} when now is not a valid date
 */
export function buildSampleLibrary(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`buildSampleLibrary needs a valid date, got ${String(now)}`)
  }
  const courses = sampleCourses.map((course) => normalizeCourse(course))
  const recordings = recordingRows.map(([id, title, courseId, minutes, daysBefore], index) => {
    const isTranscribing = id === 'lecture17-client-side-ml'
    // later rows on the same day get an earlier hour so the order matches the mock
    const recordedAt = dateBefore(now, daysBefore, Math.max(0, 11 - index))
    return normalizeRecording({
      id,
      title,
      courseId,
      durationSeconds: minutes * 60,
      recordedAt,
      createdAt: recordedAt,
      status: isTranscribing ? 'transcribing' : 'summarized',
      progress: isTranscribing ? 0.64 : 1,
      isStarred: starredIds.has(id),
    })
  })
  const notes = [...noteBodies].map(([recordingId, body]) =>
    normalizeNote({ recordingId, body, updatedAt: now })
  )
  return { courses, recordings, notes }
}

/**
 * write the sample courses, recordings, and notes in one transaction, but only into an empty
 * library. a library with any course or recording, even one in Trash, is left as it is.
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {Promise<boolean>} true when the samples were written, false when the library was not empty
 * @throws {Error} when the database cannot open or the write fails, in which case nothing is written
 */
export async function seedSampleLibrary(now = new Date()) {
  const { courses, recordings, notes } = buildSampleLibrary(now)
  const database = await openDatabase()
  const transaction = database.transaction(['courses', 'recordings', 'notes'], 'readwrite')
  const [courseCount, recordingCount] = await Promise.all([
    transaction.objectStore('courses').count(),
    transaction.objectStore('recordings').count(),
  ])
  if (courseCount > 0 || recordingCount > 0) {
    await abortTransaction(transaction)
    return false
  }
  await Promise.all([
    ...courses.map((course) => transaction.objectStore('courses').put(course)),
    ...recordings.map((recording) => transaction.objectStore('recordings').put(recording)),
    ...notes.map((note) => transaction.objectStore('notes').put(note)),
    transaction.done,
  ])
  announceChange('library')
  return true
}
