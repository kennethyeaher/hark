import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { buildSampleLibrary, seedSampleLibrary } from '../../src/data/seed.js'
import { buildLibrary, loadLibrary } from '../../src/data/library.js'
import { saveCourse } from '../../src/data/courses.js'
import { listRecordings } from '../../src/data/recordings.js'
import { listNotes } from '../../src/data/notes.js'

// a fixed afternoon so every sample date lands on a known day
const now = new Date(2026, 9, 28, 15)

describe('buildSampleLibrary', () => {
  it('has the four courses with their real names', () => {
    const { courses } = buildSampleLibrary(now)
    expect(courses.map((course) => [course.code, course.name])).toEqual([
      ['HCIM 605', 'Qualitative Research Methods'],
      ['INST 630', 'Programming Human-Centered Interfaces'],
      ['INST 737', 'Data Science Techniques'],
      ['INST 711', 'Interaction Design Studio'],
    ])
    expect(courses.every((course) => !('recordingCount' in course))).toBe(true)
  })

  it('keeps Today and Yesterday true whatever time it runs', () => {
    for (const time of [new Date(2026, 9, 28, 0, 5), new Date(2026, 9, 28, 23, 55)]) {
      const [week9, lecture17, guestTalk] = buildSampleLibrary(time).recordings
      expect(week9.recordedAt.getDate()).toBe(28)
      expect(lecture17.recordedAt.getDate()).toBe(28)
      expect(week9.recordedAt <= time).toBe(true)
      expect(guestTalk.recordedAt.getDate()).toBe(27)
    }
  })

  it('keeps the mock order just after midnight, when the sample hours have not come yet', () => {
    const justAfterMidnight = new Date(2026, 9, 28, 0, 5)
    const { recordings, courses, notes } = buildSampleLibrary(justAfterMidnight)
    const [week9, lecture17] = recordings
    expect(week9.recordedAt > lecture17.recordedAt).toBe(true)
    const library = buildLibrary({ courses, recordings, notes })
    expect(library.recordings.slice(0, 2).map((recording) => recording.id)).toEqual([
      'week9-thematic-analysis',
      'lecture17-client-side-ml',
    ])
    expect(library.courses[0].id).toBe('hcim605')
  })

  it('leaves no sample mid job, since samples have no audio to resume from', () => {
    const { recordings } = buildSampleLibrary(now)
    const lecture17 = recordings.find((recording) => recording.id === 'lecture17-client-side-ml')
    expect(lecture17).toMatchObject({ status: 'transcribed', progress: 1 })
    const statuses = new Set(recordings.map((recording) => recording.status))
    expect([...statuses].sort()).toEqual(['summarized', 'transcribed'])
  })

  it('rejects an invalid date', () => {
    expect(() => buildSampleLibrary(new Date('nope'))).toThrow(/valid date/)
  })
})

describe('seedSampleLibrary', () => {
  beforeEach(useFreshDatabase)

  it('writes the courses, recordings, notes, and stars into an empty database', async () => {
    expect(await seedSampleLibrary(now)).toBe(true)
    const recordings = await listRecordings()
    expect(recordings).toHaveLength(11)
    expect(
      recordings.filter((recording) => recording.isStarred).map((recording) => recording.id)
    ).toEqual(['week9-thematic-analysis', 'week6-ethics-and-consent'])
    expect((await listNotes()).map((note) => note.recordingId).sort()).toEqual([
      'week4-research-questions',
      'week8-interview-protocols',
      'week9-thematic-analysis',
    ])
  })

  it('changes nothing when run a second time', async () => {
    await seedSampleLibrary(now)
    const before = await loadLibrary()
    expect(await seedSampleLibrary(new Date(2026, 10, 5))).toBe(false)
    expect(await loadLibrary()).toEqual(before)
  })

  it('does nothing when the library already has a course', async () => {
    await saveCourse({ id: 'mine', code: 'MATH 140', name: 'Calculus', color: 'teal' })
    expect(await seedSampleLibrary(now)).toBe(false)
    expect((await loadLibrary()).courses.map((course) => course.id)).toEqual(['mine'])
  })

  it('gives counts and totals computed from the seeded recordings', async () => {
    await seedSampleLibrary(now)
    const library = await loadLibrary()
    expect(library.droppedCount).toBe(0)
    expect(
      library.courses.map((course) => [course.code, course.recordingCount, course.totalSeconds])
    ).toEqual([
      ['HCIM 605', 8, 482 * 60],
      ['INST 630', 1, 52 * 60],
      ['INST 737', 1, 41 * 60],
      ['INST 711', 1, 58 * 60],
    ])
    const withNotes = library.recordings.filter((recording) => recording.hasNotes)
    expect(withNotes).toHaveLength(3)
  })
})
