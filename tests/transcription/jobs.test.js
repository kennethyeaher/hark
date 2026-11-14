import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFreshDatabase } from '../data/fresh-database.js'
import { saveCourse } from '../../src/data/courses.js'
import { getAudio, saveAudio } from '../../src/data/audio.js'
import {
  deleteRecordingForever,
  getRecording,
  listRecordings,
  saveRecording,
  updateRecordingStatus,
} from '../../src/data/recordings.js'
import { listSegmentsForRecording, saveSegments } from '../../src/data/segments.js'
import { AudioDecodeError } from '../../src/transcription/decode.js'
import {
  createTranscriptionJobs,
  missingAudioMessage,
  unreadableAudioMessage,
} from '../../src/transcription/jobs.js'

/**
 * build a fake client whose jobs the test drives by hand.
 * @returns {{ client: object, calls: object[], cancelCount: () => number }} the client, every
 *   transcribe call with its callbacks and resolve and reject functions, and the cancel count
 */
function createFakeClient() {
  const calls = []
  let cancels = 0
  const client = {
    transcribe(options) {
      return new Promise((resolve, reject) => {
        calls.push({ ...options, resolve, reject })
      })
    },
    cancel() {
      cancels += 1
      const call = calls.at(-1)
      call?.reject(new DOMException('the transcription was cancelled', 'AbortError'))
    },
  }
  return { client, calls, cancelCount: () => cancels }
}

/**
 * build a segment list of a given length.
 * @param {number} count number of segments
 * @returns {object[]} segments ten seconds long each
 */
function makeSegments(count) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    startSeconds: index * 10,
    endSeconds: index * 10 + 10,
    text: `Line ${index + 1}.`,
  }))
}

/**
 * wait until every pending promise callback has run.
 * @returns {Promise<void>} resolves after a macrotask
 */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * poll until a condition holds, failing after a short while.
 * @param {() => boolean | Promise<boolean>} condition the condition
 * @returns {Promise<void>} resolves once the condition is true
 */
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return
    await settle()
  }
  throw new Error('condition never became true')
}

let fake
let decode
let statusLog
let segmentWrites
let jobs
let clock

/**
 * add a queued recording with audio.
 * @param {string} id recording id
 * @param {{ createdAt?: Date, hasAudio?: boolean, status?: string, model?: string }} [options]
 *   when it was created, whether audio is saved, its status, and its model
 * @returns {Promise<void>} resolves once it is stored
 */
async function addRecording(id, { createdAt, hasAudio = true, status = 'queued', model } = {}) {
  await saveRecording({
    id,
    title: id,
    courseId: 'inst630',
    durationSeconds: 600,
    createdAt: createdAt ?? new Date(2026, 10, 1),
    status,
    progress: status === 'transcribing' ? 0.5 : 0,
    model,
  })
  if (hasAudio) {
    const blob = new File([new Uint8Array([1, 2, 3])], `${id}.wav`, { type: 'audio/wav' })
    await saveAudio({ recordingId: id, blob })
  }
}

beforeEach(async () => {
  await useFreshDatabase()
  await saveCourse({ id: 'inst630', code: 'INST 630', name: 'Information Ethics', color: 'teal' })
  fake = createFakeClient()
  decode = vi.fn(async () => ({ samples: new Float32Array(16), durationSeconds: 600 }))
  statusLog = []
  segmentWrites = []
  clock = 0
  jobs = createTranscriptionJobs({
    client: fake.client,
    decode,
    now: () => clock,
    reportError: (error) => {
      throw error
    },
    store: {
      getRecording,
      getAudio,
      listRecordings,
      deleteRecordingForever,
      updateRecordingStatus: async (id, changes) => {
        statusLog.push([id, changes.status ?? null])
        return updateRecordingStatus(id, changes)
      },
      saveSegments: async (id, segments, changes) => {
        segmentWrites.push({ id, count: segments.length, changes })
        if (changes?.status) statusLog.push([id, changes.status])
        return saveSegments(id, segments, changes)
      },
    },
  })
})

describe('createTranscriptionJobs', () => {
  it('rejects missing collaborators', () => {
    expect(() => createTranscriptionJobs({ decode, store: {} })).toThrow(/client/)
    expect(() => createTranscriptionJobs({ client: fake.client, store: {} })).toThrow(/decode/)
    expect(() => createTranscriptionJobs({ client: fake.client, decode, store: {} })).toThrow(
      /store.getRecording/
    )
  })
})

describe('one job', () => {
  it('moves from queued to transcribing to transcribed and saves segments per chunk', async () => {
    await addRecording('lecture1', { model: 'fast' })
    const states = []
    jobs.subscribe((state) => states.push(state))

    await jobs.enqueueRecording('lecture1')
    await waitFor(() => fake.calls.length === 1)
    const call = fake.calls[0]
    expect(call.modelKey).toBe('fast')
    expect(call.durationSeconds).toBe(600)
    expect((await getRecording('lecture1')).status).toBe('transcribing')

    call.onDownload({ fraction: 0.5, loadedBytes: 40, totalBytes: 80 })
    expect(states.at(-1)).toMatchObject({
      phase: 'downloading',
      isModelCached: false,
      downloadFraction: 0.5,
      downloadedBytes: 40,
    })

    clock = 1000
    call.onReady()
    expect(states.at(-1).phase).toBe('transcribing')

    // 300 seconds of audio done in 60 seconds, so 300 more seconds of audio take 60 more
    clock = 61000
    call.onChunk({ processedSeconds: 300, fraction: 0.5, segments: makeSegments(3) })
    expect(states.at(-1)).toMatchObject({
      processedSeconds: 300,
      fraction: 0.5,
      remainingSeconds: 60,
      segmentCount: 3,
    })
    expect(states.at(-1).latestSegments.map((segment) => segment.text)).toEqual([
      'Line 2.',
      'Line 3.',
    ])
    await waitFor(async () => (await listSegmentsForRecording('lecture1')).length === 3)
    expect((await getRecording('lecture1')).progress).toBe(0.5)

    call.onChunk({ processedSeconds: 600, fraction: 1, segments: makeSegments(5) })
    call.resolve(makeSegments(5))
    await waitFor(() => states.at(-1).phase === 'done')

    const stored = await getRecording('lecture1')
    expect(stored.status).toBe('transcribed')
    expect(stored.progress).toBe(1)
    expect(await listSegmentsForRecording('lecture1')).toHaveLength(5)
    expect(statusLog).toEqual([
      ['lecture1', 'transcribing'],
      ['lecture1', 'transcribed'],
    ])
    // one write per chunk, then the final write
    expect(segmentWrites.map((write) => write.count)).toEqual([3, 5, 5])
  })

  it('uses the fixed rule for time left before the first chunk', async () => {
    await addRecording('lecture1')
    await jobs.enqueueRecording('lecture1')
    // balanced is 600 seconds times the balanced factor
    const { remainingSeconds } = jobs.getJobState('lecture1')
    expect(remainingSeconds).toBeGreaterThan(0)
    await waitFor(() => fake.calls.length === 1)
    expect(jobs.getJobState('lecture1').remainingSeconds).toBe(remainingSeconds)
  })

  it('reports a cached model when no download events arrive', async () => {
    await addRecording('lecture1')
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => fake.calls.length === 1)
    fake.calls[0].onReady()
    expect(jobs.getJobState('lecture1').isModelCached).toBe(true)
  })

  it('fails with a plain message when the audio cannot be decoded', async () => {
    await addRecording('lecture1')
    decode.mockRejectedValueOnce(new AudioDecodeError('could not read lecture1.wav as audio'))
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => jobs.getJobState('lecture1').phase === 'failed')
    const stored = await getRecording('lecture1')
    expect(stored.status).toBe('failed')
    expect(stored.errorMessage).toBe(unreadableAudioMessage)
    expect(fake.calls).toHaveLength(0)
  })

  it('fails with the error message when transcription throws', async () => {
    await addRecording('lecture1')
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => fake.calls.length === 1)
    fake.calls[0].reject(new Error('the transcription worker stopped: out of memory'))
    await waitFor(() => jobs.getJobState('lecture1').phase === 'failed')
    expect((await getRecording('lecture1')).errorMessage).toBe(
      'the transcription worker stopped: out of memory'
    )
    expect(statusLog).toEqual([
      ['lecture1', 'transcribing'],
      ['lecture1', 'failed'],
    ])
  })

  it('fails with the missing audio message when the audio is gone', async () => {
    await addRecording('lecture1', { hasAudio: false })
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => jobs.getJobState('lecture1').phase === 'failed')
    expect((await getRecording('lecture1')).errorMessage).toBe(missingAudioMessage)
    expect(decode).not.toHaveBeenCalled()
  })

  it('stops the worker and fails when a chunk cannot be saved', async () => {
    await addRecording('lecture1')
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => fake.calls.length === 1)
    // a segment with no text fails validation in saveSegments
    fake.calls[0].onChunk({
      processedSeconds: 300,
      fraction: 0.5,
      segments: [{ index: 0, startSeconds: 0, endSeconds: 1, text: '' }],
    })
    await waitFor(() => jobs.getJobState('lecture1').phase === 'failed')
    expect(fake.cancelCount()).toBe(1)
    expect((await getRecording('lecture1')).errorMessage).toMatch(/text must be a non empty/)
  })

  it('rejects an unknown recording id', async () => {
    await expect(jobs.enqueueRecording('missing')).rejects.toThrow('no recording with id missing')
    await expect(jobs.enqueueRecording('')).rejects.toThrow(TypeError)
  })
})

describe('the queue', () => {
  it('runs one recording at a time, oldest createdAt first', async () => {
    await addRecording('first', { createdAt: new Date(2026, 10, 1) })
    await addRecording('third', { createdAt: new Date(2026, 10, 3) })
    await addRecording('second', { createdAt: new Date(2026, 10, 2) })

    await jobs.enqueueRecording('first')
    await jobs.enqueueRecording('third')
    await jobs.enqueueRecording('second')
    await waitFor(() => fake.calls.length === 1)
    expect(jobs.getJobState('second')).toMatchObject({ phase: 'waiting', recordingsAhead: 1 })
    expect(jobs.getJobState('third')).toMatchObject({ phase: 'waiting', recordingsAhead: 2 })

    fake.calls[0].resolve(makeSegments(1))
    await waitFor(() => fake.calls.length === 2)
    expect(jobs.getJobState('third').recordingsAhead).toBe(1)
    fake.calls[1].resolve(makeSegments(1))
    await waitFor(() => fake.calls.length === 3)
    fake.calls[2].resolve(makeSegments(1))
    await waitFor(() => jobs.getJobState('third').phase === 'done')

    const order = statusLog.filter(([, status]) => status === 'transcribing').map(([id]) => id)
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('starts the next recording after one fails', async () => {
    await addRecording('first', { createdAt: new Date(2026, 10, 1) })
    await addRecording('second', { createdAt: new Date(2026, 10, 2) })
    decode.mockRejectedValueOnce(new AudioDecodeError('bad'))
    await jobs.enqueueRecording('first')
    await jobs.enqueueRecording('second')
    await waitFor(() => fake.calls.length === 1)
    expect((await getRecording('first')).status).toBe('failed')
  })

  it('ignores a recording that is already in line', async () => {
    await addRecording('first')
    await jobs.enqueueRecording('first')
    await jobs.enqueueRecording('first')
    await waitFor(() => fake.calls.length === 1)
    fake.calls[0].resolve(makeSegments(1))
    await waitFor(() => jobs.getJobState('first').phase === 'done')
    expect(fake.calls).toHaveLength(1)
  })
})

describe('resumeQueuedRecordings', () => {
  it('turns transcribing back into queued and runs every queued recording again', async () => {
    await addRecording('paused', { status: 'transcribing', createdAt: new Date(2026, 10, 1) })
    await addRecording('waiting', { createdAt: new Date(2026, 10, 2) })
    await addRecording('finished', { status: 'transcribed' })

    await jobs.resumeQueuedRecordings()
    await waitFor(() => fake.calls.length === 1)
    expect(statusLog.slice(0, 2)).toEqual([
      ['paused', 'queued'],
      ['paused', 'transcribing'],
    ])
    expect(jobs.getJobState('waiting')).toMatchObject({ phase: 'waiting', recordingsAhead: 1 })
    expect(jobs.getJobState('finished')).toBeNull()

    fake.calls[0].resolve(makeSegments(2))
    await waitFor(() => fake.calls.length === 2)
    fake.calls[1].resolve(makeSegments(2))
    await waitFor(() => jobs.getJobState('waiting').phase === 'done')
    expect((await getRecording('paused')).status).toBe('transcribed')
  })

  it('marks a queued recording without audio as failed', async () => {
    await addRecording('orphan', { hasAudio: false })
    await jobs.resumeQueuedRecordings()
    const stored = await getRecording('orphan')
    expect(stored.status).toBe('failed')
    expect(stored.errorMessage).toBe(missingAudioMessage)
    expect(fake.calls).toHaveLength(0)
  })
})

describe('cancelRecording', () => {
  it('cancels the running job and deletes the recording, audio, and segments', async () => {
    await addRecording('lecture1')
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => fake.calls.length === 1)
    fake.calls[0].onChunk({ processedSeconds: 300, fraction: 0.5, segments: makeSegments(3) })
    await waitFor(async () => (await listSegmentsForRecording('lecture1')).length === 3)

    await jobs.cancelRecording('lecture1')
    await settle()
    expect(fake.cancelCount()).toBe(1)
    expect(await getRecording('lecture1')).toBeUndefined()
    expect(await getAudio('lecture1')).toBeUndefined()
    expect(await listSegmentsForRecording('lecture1')).toEqual([])
    expect(jobs.getJobState('lecture1')).toBeNull()
    expect(statusLog.map(([, status]) => status)).not.toContain('failed')
  })

  it('removes a waiting recording without touching the running one', async () => {
    await addRecording('first', { createdAt: new Date(2026, 10, 1) })
    await addRecording('second', { createdAt: new Date(2026, 10, 2) })
    await addRecording('third', { createdAt: new Date(2026, 10, 3) })
    await jobs.enqueueRecording('first')
    await jobs.enqueueRecording('second')
    await jobs.enqueueRecording('third')
    await waitFor(() => fake.calls.length === 1)

    await jobs.cancelRecording('second')
    expect(fake.cancelCount()).toBe(0)
    expect(await getRecording('second')).toBeUndefined()
    expect(jobs.getJobState('third').recordingsAhead).toBe(1)

    fake.calls[0].resolve(makeSegments(1))
    await waitFor(() => fake.calls.length === 2)
    expect(statusLog.filter(([id]) => id === 'second')).toEqual([])
  })

  it('starts the next recording once the cancelled one winds down', async () => {
    await addRecording('first', { createdAt: new Date(2026, 10, 1) })
    await addRecording('second', { createdAt: new Date(2026, 10, 2) })
    await jobs.enqueueRecording('first')
    await jobs.enqueueRecording('second')
    await waitFor(() => fake.calls.length === 1)
    await jobs.cancelRecording('first')
    await waitFor(() => fake.calls.length === 2)
    expect((await getRecording('second')).status).toBe('transcribing')
  })

  it('cancels a job that is still decoding without starting the worker', async () => {
    await addRecording('lecture1')
    let finishDecode
    decode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDecode = resolve
        })
    )
    await jobs.enqueueRecording('lecture1')
    await waitFor(() => finishDecode !== undefined)
    await jobs.cancelRecording('lecture1')
    finishDecode({ samples: new Float32Array(16), durationSeconds: 600 })
    await settle()
    expect(fake.calls).toHaveLength(0)
    expect(await getRecording('lecture1')).toBeUndefined()
  })
})
