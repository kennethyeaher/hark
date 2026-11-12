/*
  sample courses and recordings from the home and course mocks. the indexeddb
  store replaces this file in milestone 2. dates are stored as days before now
  so Today and Yesterday stay true whenever the app runs.

  recordingCount and totalSeconds on each course match the mocks. they include
  older recordings that are not listed here, the way a real library would.
*/

export const sampleCourses = [
  {
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
    recordingCount: 12,
    totalSeconds: 9 * 3600 + 40 * 60,
  },
  {
    id: 'inst360',
    code: 'INST 360',
    name: 'Intro to Machine Learning Apps',
    color: 'teal',
    recordingCount: 9,
    totalSeconds: 7 * 3600 + 25 * 60,
  },
  {
    id: 'inst737',
    code: 'INST 737',
    name: 'Ethics of Design',
    color: 'orange',
    recordingCount: 11,
    totalSeconds: 8 * 3600 + 50 * 60,
  },
  {
    id: 'inst711',
    code: 'INST 711',
    name: 'Information Policy',
    color: 'pink',
    recordingCount: 6,
    totalSeconds: 5 * 3600 + 10 * 60,
  },
]

// one entry per recording in the mocks: id, title, course, minutes, and days before now
const recordingRows = [
  ['week9-thematic-analysis', 'Week 9 · Thematic analysis', 'hcim605', 74, 0],
  ['lecture17-client-side-ml', 'Lecture 17 · Client-side ML', 'inst360', 52, 0],
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

// the recordings that are starred or have notes, so every filter chip has results
const starredIds = new Set(['week9-thematic-analysis', 'week6-ethics-and-consent'])
const notedIds = new Set([
  'week9-thematic-analysis',
  'week8-interview-protocols',
  'week4-research-questions',
])

/**
 * Get a time on a day before now, at a fixed hour, never later than now.
 * @param {Date} now the current time
 * @param {number} daysBefore whole days before today
 * @param {number} hour local hour on that day
 * @returns {Date} the new date
 */
function dateBefore(now, daysBefore, hour) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBefore, hour)
  return date > now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : date
}

/**
 * Build the sample recordings with dates relative to now.
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {object[]} recordings, newest first
 * @throws {TypeError} when now is not a valid date
 */
export function buildSampleRecordings(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`buildSampleRecordings needs a valid date, and got ${String(now)}`)
  }
  return recordingRows.map(([id, title, courseId, minutes, daysBefore], index) => {
    const isTranscribing = id === 'lecture17-client-side-ml'
    return {
      id,
      title,
      courseId,
      durationSeconds: minutes * 60,
      // later rows on the same day get an earlier hour so the order matches the mock
      recordedAt: dateBefore(now, daysBefore, Math.max(0, 11 - index)),
      status: isTranscribing ? 'transcribing' : 'summarized',
      progress: isTranscribing ? 0.64 : 1,
      isStarred: starredIds.has(id),
      hasNotes: notedIds.has(id),
    }
  })
}
