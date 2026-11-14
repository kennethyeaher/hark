import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { saveRecording } from '../../src/data/recordings.js'
import {
  deleteAudio,
  getAudio,
  listAudio,
  normalizeAudio,
  saveAudio,
} from '../../src/data/audio.js'

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({ id: 'inst630', code: 'INST 630', name: 'Information Ethics', color: 'teal' })
  await saveRecording({ id: 'lecture17', title: 'Lecture 17', courseId: 'inst630' })
})

/**
 * build a small audio File like the one a user picks in the upload sheet.
 * @param {string} [name] file name
 * @returns {File} the file
 */
function makeFile(name = 'lecture17.m4a') {
  return new File([new Uint8Array([1, 2, 3, 4, 5])], name, { type: 'audio/mp4' })
}

describe('audio', () => {
  it('saves a File and reads back the blob, name, type, and size', async () => {
    const saved = await saveAudio({ recordingId: 'lecture17', blob: makeFile() })
    expect(saved).toMatchObject({
      recordingId: 'lecture17',
      name: 'lecture17.m4a',
      type: 'audio/mp4',
      size: 5,
    })
    const stored = await getAudio('lecture17')
    expect(stored).toMatchObject({ name: 'lecture17.m4a', type: 'audio/mp4', size: 5 })
    expect(stored.blob).toBeInstanceOf(Blob)
    expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('keeps one entry per recording and lists them', async () => {
    await saveAudio({ recordingId: 'lecture17', blob: makeFile('first.wav') })
    await saveAudio({ recordingId: 'lecture17', blob: makeFile('second.wav') })
    const entries = await listAudio()
    expect(entries.map((entry) => entry.name)).toEqual(['second.wav'])
  })

  it('accepts a plain Blob with an empty type when a name is given', () => {
    const blob = new Blob([new Uint8Array([1])])
    expect(normalizeAudio({ recordingId: 'lecture17', blob, name: 'clip' })).toMatchObject({
      name: 'clip',
      type: '',
      size: 1,
    })
  })

  it('deletes audio, and deleting missing audio does nothing', async () => {
    await saveAudio({ recordingId: 'lecture17', blob: makeFile() })
    await deleteAudio('lecture17')
    expect(await getAudio('lecture17')).toBeUndefined()
    await expect(deleteAudio('lecture17')).resolves.toBeUndefined()
  })

  it('rejects audio for a recording that does not exist and writes nothing', async () => {
    await expect(saveAudio({ recordingId: 'missing', blob: makeFile() })).rejects.toThrow(
      /recording missing, which does not exist/
    )
    expect(await listAudio()).toEqual([])
  })

  it.each([
    [{ blob: makeFile() }, /audio recordingId must be a non empty string/],
    [{ recordingId: 'lecture17', blob: 'bytes' }, /blob must be a Blob or File/],
    [{ recordingId: 'lecture17', blob: new Blob([]) }, /name must be a non empty string/],
    [{ recordingId: 'lecture17', blob: makeFile(), type: 4 }, /type must be a string/],
    [{ recordingId: 'lecture17', blob: makeFile(), size: 9 }, /size is 9 but the blob has 5/],
  ])('rejects %j', (audio, message) => {
    expect(() => normalizeAudio(audio)).toThrow(message)
  })
})
