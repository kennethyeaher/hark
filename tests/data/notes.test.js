import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { saveRecording } from '../../src/data/recordings.js'
import { deleteNote, getNote, listNotes, saveNote } from '../../src/data/notes.js'

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
  })
  await saveRecording({ id: 'week9', title: 'Week 9', courseId: 'hcim605' })
  await saveRecording({ id: 'week8', title: 'Week 8', courseId: 'hcim605' })
})

describe('notes', () => {
  it('saves a note and reads it back with updatedAt as a Date', async () => {
    const updatedAt = new Date(2026, 9, 28, 13)
    await saveNote({ recordingId: 'week9', body: 'themes', updatedAt })
    const stored = await getNote('week9')
    expect(stored).toEqual({ recordingId: 'week9', body: 'themes', updatedAt })
    expect(stored.updatedAt).toBeInstanceOf(Date)
  })

  it('fills updatedAt and keeps one note per recording', async () => {
    await saveNote({ recordingId: 'week9', body: 'first' })
    const saved = await saveNote({ recordingId: 'week9', body: 'second' })
    expect(saved.updatedAt).toBeInstanceOf(Date)
    expect(await listNotes()).toEqual([saved])
  })

  it('allows an empty body', async () => {
    await saveNote({ recordingId: 'week9', body: '' })
    expect((await getNote('week9')).body).toBe('')
  })

  it('lists notes across recordings', async () => {
    await saveNote({ recordingId: 'week9', body: 'a' })
    await saveNote({ recordingId: 'week8', body: 'b' })
    expect((await listNotes()).map((note) => note.recordingId).sort()).toEqual(['week8', 'week9'])
  })

  it('deletes a note, and deleting a missing note does nothing', async () => {
    await saveNote({ recordingId: 'week9', body: 'a' })
    await deleteNote('week9')
    expect(await getNote('week9')).toBeUndefined()
    await expect(deleteNote('week9')).resolves.toBeUndefined()
  })

  it.each([
    [{ body: 'a' }, /note recordingId must be a non empty string/],
    [{ recordingId: 'week9', body: 4 }, /body must be a string, got 4/],
    [{ recordingId: 'week9', body: 'a', updatedAt: 'today' }, /updatedAt must be a valid Date/],
  ])('rejects %j', async (note, message) => {
    await expect(saveNote(note)).rejects.toThrow(message)
    expect(await listNotes()).toEqual([])
  })

  it('rejects a note whose recording does not exist', async () => {
    await expect(saveNote({ recordingId: 'missing', body: 'a' })).rejects.toThrow(
      'note points to recording missing, which does not exist'
    )
    expect(await listNotes()).toEqual([])
  })
})
