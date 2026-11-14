import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { buildLibrary, loadLibrary } from '../../src/data/library.js'
import { dataEvents } from '../../src/data/events.js'
import { saveCourse } from '../../src/data/courses.js'
import {
  deleteRecordingForever,
  restoreRecording,
  saveRecording,
  trashRecording,
} from '../../src/data/recordings.js'
import { deleteNote, saveNote } from '../../src/data/notes.js'
import { deleteMoment, saveMoment } from '../../src/data/moments.js'

const hcim = {
  id: 'hcim605',
  code: 'HCIM 605',
  name: 'Qualitative Research Methods',
  color: 'indigo',
}
const inst = {
  id: 'inst630',
  code: 'INST 630',
  name: 'Programming Human-Centered Interfaces',
  color: 'teal',
}
const policy = { id: 'inst711', code: 'INST 711', name: 'Interaction Design Studio', color: 'pink' }

/**
 * build a stored recording row with fields a test can override.
 * @param {object} overrides fields to replace
 * @returns {object} the row
 */
function row(overrides) {
  return {
    title: 'Lecture',
    courseId: 'hcim605',
    durationSeconds: 600,
    recordedAt: new Date(2026, 9, 20),
    createdAt: new Date(2026, 9, 20),
    status: 'summarized',
    progress: 1,
    isStarred: false,
    deletedAt: null,
    ...overrides,
  }
}

describe('buildLibrary', () => {
  it('computes counts and totals from recordings that are not in Trash', () => {
    const library = buildLibrary({
      courses: [hcim, inst],
      recordings: [
        row({ id: 'a', durationSeconds: 600 }),
        row({ id: 'b', durationSeconds: 900 }),
        row({ id: 'c', durationSeconds: 300, deletedAt: new Date(2026, 9, 30) }),
        row({ id: 'd', courseId: 'inst630', durationSeconds: 120 }),
      ],
      notes: [],
    })
    const totals = Object.fromEntries(
      library.courses.map((course) => [course.id, [course.recordingCount, course.totalSeconds]])
    )
    expect(totals).toEqual({ hcim605: [2, 1500], inst630: [1, 120] })
    expect(library.recordings.map((recording) => recording.id).sort()).toEqual(['a', 'b', 'd'])
  })

  it('gives a course with no recordings zero counts', () => {
    const { courses } = buildLibrary({ courses: [policy], recordings: [], notes: [] })
    expect(courses).toEqual([{ ...policy, recordingCount: 0, totalSeconds: 0 }])
  })

  it('sets hasNotes only for a note with text that is not whitespace', () => {
    const { recordings } = buildLibrary({
      courses: [hcim],
      recordings: [row({ id: 'text' }), row({ id: 'blank' }), row({ id: 'none' })],
      notes: [
        { recordingId: 'text', body: 'themes', updatedAt: new Date() },
        { recordingId: 'blank', body: ' \n\t ', updatedAt: new Date() },
      ],
    })
    const hasNotes = Object.fromEntries(
      recordings.map((recording) => [recording.id, recording.hasNotes])
    )
    expect(hasNotes).toEqual({ text: true, blank: false, none: false })
  })

  it('leaves out recordings whose course is missing and counts them', () => {
    const library = buildLibrary({
      courses: [hcim],
      recordings: [
        row({ id: 'a' }),
        row({ id: 'lost', courseId: 'gone' }),
        row({ id: 'lost2', courseId: 'gone' }),
      ],
      notes: [],
    })
    expect(library.recordings.map((recording) => recording.id)).toEqual(['a'])
    expect(library.droppedCount).toBe(2)
  })

  it('does not count an orphan that is already in Trash as dropped', () => {
    const library = buildLibrary({
      courses: [],
      recordings: [row({ id: 'lost', courseId: 'gone', deletedAt: new Date() })],
      notes: [],
    })
    expect(library.droppedCount).toBe(0)
  })

  it('sorts recordings newest first and courses by their newest recording', () => {
    const library = buildLibrary({
      courses: [policy, inst, hcim],
      recordings: [
        row({ id: 'old', courseId: 'inst630', recordedAt: new Date(2026, 9, 1) }),
        row({ id: 'new', courseId: 'hcim605', recordedAt: new Date(2026, 9, 28) }),
      ],
      notes: [],
    })
    expect(library.recordings.map((recording) => recording.id)).toEqual(['new', 'old'])
    expect(library.courses.map((course) => course.id)).toEqual(['hcim605', 'inst630', 'inst711'])
  })

  it('rejects input that is not three arrays', () => {
    expect(() => buildLibrary({ courses: [], recordings: null, notes: [] })).toThrow(
      'buildLibrary needs courses, recordings, and notes arrays'
    )
  })
})

describe('loadLibrary', () => {
  beforeEach(useFreshDatabase)

  it('returns an empty library for a new database', async () => {
    expect(await loadLibrary()).toEqual({ courses: [], recordings: [], droppedCount: 0 })
  })

  it('reads what the stores hold in the shapes the pages use', async () => {
    await saveCourse(hcim)
    await saveRecording(row({ id: 'week9', durationSeconds: 4440 }))
    await saveRecording(row({ id: 'week8', durationSeconds: 4080 }))
    await saveNote({ recordingId: 'week9', body: 'themes' })
    await trashRecording('week8')

    const library = await loadLibrary()
    expect(library.courses).toEqual([{ ...hcim, recordingCount: 1, totalSeconds: 4440 }])
    expect(library.recordings).toHaveLength(1)
    expect(library.recordings[0]).toMatchObject({ id: 'week9', hasNotes: true, isStarred: false })
    expect(library.recordings[0].recordedAt).toBeInstanceOf(Date)
  })
})

describe('change events', () => {
  let listener

  beforeEach(async () => {
    await useFreshDatabase()
    listener = vi.fn()
    dataEvents.addEventListener('change', listener)
  })

  afterEach(() => {
    dataEvents.removeEventListener('change', listener)
  })

  /**
   * list the store and id of every change event so far, then forget them.
   * @returns {Array<[string, string]>} one pair per event
   */
  function takeChanges() {
    const changes = listener.mock.calls.map(([event]) => [event.detail.store, event.detail.id])
    listener.mockClear()
    return changes
  }

  it('fires once after every successful write', async () => {
    await saveCourse(hcim)
    await saveRecording(row({ id: 'week9' }))
    await trashRecording('week9')
    await restoreRecording('week9')
    await saveNote({ recordingId: 'week9', body: 'a' })
    await deleteNote('week9')
    await saveMoment({ id: 'm', recordingId: 'week9', atSeconds: 1, label: 'A', color: 'teal' })
    await deleteMoment('m')
    await deleteRecordingForever('week9')
    expect(takeChanges()).toEqual([
      ['courses', 'hcim605'],
      ['recordings', 'week9'],
      ['recordings', 'week9'],
      ['recordings', 'week9'],
      ['notes', 'week9'],
      ['notes', 'week9'],
      ['moments', 'm'],
      ['moments', 'm'],
      ['recordings', 'week9'],
    ])
  })

  it('does not fire when a write fails validation or its parent is missing', async () => {
    await expect(saveCourse({ ...hcim, color: 'blue' })).rejects.toThrow()
    await expect(saveRecording(row({ id: 'x', courseId: 'missing' }))).rejects.toThrow()
    await expect(trashRecording('missing')).rejects.toThrow()
    expect(takeChanges()).toEqual([])
  })
})
