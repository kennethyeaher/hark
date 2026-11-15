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
import { normalizeSegment } from './segments.js'
import { normalizeMoment } from './moments.js'

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
    'Ask about NVivo vs a spreadsheet for the codebook\nCompare with Braun and Clarke six phases before Thursday',
  ],
  ['week8-interview-protocols', 'Pilot the protocol with one person first. Keep probes neutral.'],
  [
    'week4-research-questions',
    'A good question is open, answerable with the data, and narrow enough.',
  ],
])

// the Week 9 transcript from the Recording mock: start in seconds and text. each segment
// ends where the next one starts, and the last one runs to 1030 seconds
const week9Lines = [
  [
    724,
    'So when we talk about thematic coding, the first pass is always descriptive. You are not interpreting yet, you are labeling what is literally in the transcript.',
  ],
  [
    758,
    'A lot of students jump to themes too early. Resist that. Your codebook should grow out of the data, not out of what you expected to find.',
  ],
  [
    795,
    'Let me show you an example from last semester. One team coded 24 interviews and ended up with 140 initial codes before collapsing them.',
  ],
  [
    832,
    'The collapsing step is where inter-rater reliability matters. Two people code the same three transcripts independently, then compare.',
  ],
  [
    870,
    'If your agreement is under about 80 percent, that is a signal the code definitions are ambiguous, not that one coder is wrong.',
  ],
  [
    907,
    'For your final projects, I want to see the codebook as an appendix. Include the code name, a one sentence definition, and one example quote.',
  ],
  [
    949,
    'Questions so far? Okay. Let us move to how you group codes into candidate themes, which is where the interpretive work starts.',
  ],
  [
    986,
    'A candidate theme is a pattern across codes, not a pile of them. Ask what story the codes tell together, and what does not fit.',
  ],
  [
    1021,
    'Take five minutes with a partner and group the codes from the handout. Write down one theme name and the codes under it.',
  ],
  [1064, 'Okay, let us hear from a few pairs. Which theme did you find hardest to name, and why?'],
]
const week9EndSeconds = 1090

// moments from the Moments rail, each inside one of the segments above. the mock's yellow,
// red, and green are not course colors, so they map to orange, pink, and teal
const week9Moments = [
  { id: 'week9-moment-exam-hint', atSeconds: 758, label: 'Exam hint', color: 'orange' },
  { id: 'week9-moment-ask', atSeconds: 852, label: 'Ask about this', color: 'pink' },
  { id: 'week9-moment-quote', atSeconds: 917, label: 'Good quote', color: 'teal' },
]

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
 * build the sample courses, recordings, notes, and the Week 9 transcript and moments as the store keeps them, with dates relative to now.
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {{ courses: object[], recordings: object[], notes: object[], segments: object[],
 *   moments: object[] }} rows ready to write
 * @throws {TypeError} when now is not a valid date
 */
export function buildSampleLibrary(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`buildSampleLibrary needs a valid date, got ${String(now)}`)
  }
  const courses = sampleCourses.map((course) => normalizeCourse(course))
  const recordings = recordingRows.map(([id, title, courseId, minutes, daysBefore], index) => {
    // later rows on the same day get an earlier hour so the order matches the mock
    const recordedAt = dateBefore(now, daysBefore, Math.max(0, 11 - index))
    return normalizeRecording({
      id,
      title,
      courseId,
      durationSeconds: minutes * 60,
      recordedAt,
      createdAt: recordedAt,
      // samples have no audio, so none may be left mid job: resume would mark it failed
      status: id === 'lecture17-client-side-ml' ? 'transcribed' : 'summarized',
      progress: 1,
      isStarred: starredIds.has(id),
    })
  })
  const notes = [...noteBodies].map(([recordingId, body]) =>
    normalizeNote({ recordingId, body, updatedAt: now })
  )
  const recordingId = 'week9-thematic-analysis'
  const segments = week9Lines.map(([startSeconds, text], index) =>
    normalizeSegment({
      id: `${recordingId}-${index}`,
      recordingId,
      index,
      startSeconds,
      endSeconds: week9Lines[index + 1]?.[0] ?? week9EndSeconds,
      text,
    })
  )
  const moments = week9Moments.map((moment) => normalizeMoment({ recordingId, ...moment }))
  return { courses, recordings, notes, segments, moments }
}

/**
 * write the sample courses, recordings, notes, segments, and moments in one transaction, but only into an empty
 * library. a library with any course or recording, even one in Trash, is left as it is.
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {Promise<boolean>} true when the samples were written, false when the library was not empty
 * @throws {Error} when the database cannot open or the write fails, in which case nothing is written
 */
export async function seedSampleLibrary(now = new Date()) {
  const { courses, recordings, notes, segments, moments } = buildSampleLibrary(now)
  const database = await openDatabase()
  const transaction = database.transaction(
    ['courses', 'recordings', 'notes', 'segments', 'moments'],
    'readwrite'
  )
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
    ...segments.map((segment) => transaction.objectStore('segments').put(segment)),
    ...moments.map((moment) => transaction.objectStore('moments').put(moment)),
    transaction.done,
  ])
  announceChange('library')
  return true
}
