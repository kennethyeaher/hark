import { beforeEach, describe, expect, it } from 'vitest'
import { useFreshDatabase } from './fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { saveRecording } from '../../src/data/recordings.js'
import {
  deleteAudio,
  getAudio,
  listAudio,
  maxPeakCount,
  normalizeAudio,
  saveAudio,
  saveAudioPeaks,
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

  describe('peaks', () => {
    it('keeps valid peaks through normalizeAudio and omits them when absent', () => {
      const blob = makeFile()
      expect(normalizeAudio({ recordingId: 'lecture17', blob, peaks: [0, 0.5, 1] }).peaks).toEqual([
        0, 0.5, 1,
      ])
      expect('peaks' in normalizeAudio({ recordingId: 'lecture17', blob })).toBe(false)
    })

    it('rejects peaks that are not an array, too long, or out of range', () => {
      const blob = makeFile()
      const check = (peaks) => normalizeAudio({ recordingId: 'lecture17', blob, peaks })
      expect(() => check('loud')).toThrow(/peaks must be an array/)
      expect(() => check(new Array(maxPeakCount + 1).fill(0.5))).toThrow(/at most 400/)
      expect(() => check([0.5, 1.2])).toThrow(/peak 1 must be a number from 0 to 1/)
      expect(() => check([-0.1])).toThrow(/peak 0/)
      expect(() => check([Number.NaN])).toThrow(/peak 0/)
      expect(() => check(['0.5'])).toThrow(/peak 0/)
      expect(check(new Array(maxPeakCount).fill(0.5))).toBeTruthy()
    })

    it('saves peaks on the existing audio and keeps the blob', async () => {
      await saveAudio({ recordingId: 'lecture17', blob: makeFile() })
      await saveAudioPeaks('lecture17', [0.1, 0.9])
      const audio = await getAudio('lecture17')
      expect(audio.peaks).toEqual([0.1, 0.9])
      expect(audio.size).toBe(5)
      expect(audio.blob.size).toBe(5)
    })

    it('throws when the recording has no audio, and when the peaks are bad', async () => {
      await expect(saveAudioPeaks('lecture17', [0.5])).rejects.toThrow(/no audio/)
      expect(await getAudio('lecture17')).toBeUndefined()
      await saveAudio({ recordingId: 'lecture17', blob: makeFile() })
      await expect(saveAudioPeaks('lecture17', [2])).rejects.toThrow(/peak 0/)
      expect((await getAudio('lecture17')).peaks).toBeUndefined()
    })
  })
})
