// runs uploaded recordings through whisper one at a time, saves the transcript as it grows,
// and tells the ui how far each one has come

import { createTranscriptionClient } from './client.js'
import { AudioDecodeError, decodeAudioFile } from './decode.js'
import { estimateRemainingSeconds, estimateSeconds } from './estimate.js'
import { getAudio } from '../data/audio.js'
import {
  deleteRecordingForever,
  getRecording,
  listRecordings,
  updateRecordingStatus,
} from '../data/recordings.js'
import { saveSegments } from '../data/segments.js'
import { assertText } from '../data/validate.js'

/** the message saved on a recording whose file the browser cannot decode */
export const unreadableAudioMessage = 'This file could not be read as audio'

/** the message saved on a queued recording whose audio is gone */
export const missingAudioMessage = 'The audio for this recording is missing'

// the store functions a job runner needs, so tests can pass fakes
const storeFunctionNames = [
  'getRecording',
  'getAudio',
  'listRecordings',
  'updateRecordingStatus',
  'saveSegments',
  'deleteRecordingForever',
]

/**
 * build the starting live state of a recording that is waiting to run.
 * @param {{ id: string, durationSeconds: number, model: string }} recording the stored recording
 * @returns {object} the live state
 */
function createJobState(recording) {
  return {
    recordingId: recording.id,
    phase: 'waiting',
    recordingsAhead: 0,
    downloadFraction: 0,
    downloadedBytes: 0,
    isModelCached: true,
    processedSeconds: 0,
    fraction: 0,
    remainingSeconds: estimateSeconds({
      durationSeconds: recording.durationSeconds,
      modelKey: recording.model,
    }),
    latestSegments: [],
    segmentCount: 0,
    errorMessage: null,
  }
}

/**
 * create a runner that transcribes queued recordings one at a time with one shared client.
 * @param {{ client: { transcribe: Function, cancel: Function }, decode: (blob: Blob) =>
 *   Promise<{ samples: Float32Array, durationSeconds: number }>, store: object,
 *   now?: () => number, reportError?: (error: unknown) => void }} options the transcription
 *   client, the audio decoder, the data functions, a clock in milliseconds, and where errors
 *   that cannot be saved on a recording go
 * @returns {{ enqueueRecording: Function, cancelRecording: Function,
 *   resumeQueuedRecordings: Function, subscribe: Function, getJobState: Function }} the runner
 * @throws {TypeError} when the client, decode, a store function, or the clock is missing
 */
export function createTranscriptionJobs({
  client,
  decode,
  store,
  now = () => performance.now(),
  reportError = (error) => console.error('Hark could not finish a transcription job', error),
}) {
  if (typeof client?.transcribe !== 'function' || typeof client?.cancel !== 'function') {
    throw new TypeError('createTranscriptionJobs needs a client with transcribe and cancel')
  }
  if (typeof decode !== 'function') {
    throw new TypeError('createTranscriptionJobs needs a decode function')
  }
  for (const name of storeFunctionNames) {
    if (typeof store?.[name] !== 'function') {
      throw new TypeError(`createTranscriptionJobs needs store.${name} to be a function`)
    }
  }
  if (typeof now !== 'function' || typeof reportError !== 'function') {
    throw new TypeError('createTranscriptionJobs needs now and reportError to be functions')
  }

  const listeners = new Set()
  const stateById = new Map()
  // waiting recordings, oldest createdAt first
  const queue = []
  // the job that is running, if any: { id, isCancelled, writeError }
  let running = null

  /**
   * send a copy of one recording's live state to every listener.
   * @param {string} id recording id
   * @returns {void}
   */
  function announceState(id) {
    const state = stateById.get(id)
    if (!state) return
    for (const listener of [...listeners]) listener({ ...state })
  }

  /**
   * change fields on one recording's live state and announce it.
   * @param {string} id recording id
   * @param {object} changes fields to change
   * @returns {void}
   */
  function updateState(id, changes) {
    const state = stateById.get(id)
    if (!state) return
    Object.assign(state, changes)
    announceState(id)
  }

  /**
   * tell every waiting recording how many recordings are ahead of it.
   * @returns {void}
   */
  function announceQueue() {
    queue.forEach((item, index) => {
      updateState(item.id, { phase: 'waiting', recordingsAhead: index + (running ? 1 : 0) })
    })
  }

  /**
   * check whether a recording is running or waiting.
   * @param {string} id recording id
   * @returns {boolean} true when it is already in line
   */
  function isInLine(id) {
    return running?.id === id || queue.some((item) => item.id === id)
  }

  /**
   * mark a job failed in the store and in the live state.
   * @param {{ id: string }} job the job
   * @param {string} message the plain message to show
   * @returns {Promise<void>} resolves once the failed status is stored
   */
  async function failJob(job, message) {
    await store.updateRecordingStatus(job.id, { status: 'failed', errorMessage: message })
    updateState(job.id, { phase: 'failed', errorMessage: message, remainingSeconds: 0 })
  }

  /**
   * run one recording from stored audio to a saved transcript. every await is followed by a
   * cancel check, because cancelRecording deletes the recording while the job winds down.
   * @param {{ id: string, isCancelled: boolean, writeError: Error | null }} job the job
   * @returns {Promise<void>} resolves when the job is done, failed, or cancelled
   */
  async function runJob(job) {
    const { id } = job
    const recording = await store.getRecording(id)
    if (job.isCancelled || !recording) return
    if (!stateById.has(id)) stateById.set(id, createJobState(recording))
    updateState(id, { phase: 'downloading', recordingsAhead: 0 })

    try {
      const audio = await store.getAudio(id)
      if (job.isCancelled) return
      if (!audio) {
        await failJob(job, missingAudioMessage)
        return
      }
      const { samples, durationSeconds } = await decode(audio.blob)
      if (job.isCancelled) return
      await store.updateRecordingStatus(id, {
        status: 'transcribing',
        progress: 0,
        errorMessage: null,
      })
      if (job.isCancelled) return

      // the estimate timer starts at ready, so model download time does not count
      let readyAt = null
      // chunk writes run one after another, so a slow write never lands after a newer one
      let writes = Promise.resolve()
      const segments = await client.transcribe({
        samples,
        durationSeconds,
        modelKey: recording.model,
        onDownload: ({ fraction, loadedBytes }) => {
          updateState(id, {
            isModelCached: false,
            downloadFraction: fraction,
            downloadedBytes: loadedBytes,
          })
        },
        onReady: () => {
          readyAt = now()
          updateState(id, { phase: 'transcribing', downloadFraction: 1 })
        },
        onChunk: ({ processedSeconds, fraction, segments: segmentsSoFar }) => {
          const elapsedSeconds = readyAt === null ? 0 : Math.max(0, (now() - readyAt) / 1000)
          updateState(id, {
            phase: 'transcribing',
            processedSeconds,
            fraction,
            remainingSeconds: estimateRemainingSeconds({
              durationSeconds,
              processedSeconds,
              elapsedSeconds,
              modelKey: recording.model,
            }),
            latestSegments: segmentsSoFar.slice(-2),
            segmentCount: segmentsSoFar.length,
          })
          writes = writes
            .then(() => {
              if (job.isCancelled || job.writeError) return undefined
              return store.saveSegments(id, segmentsSoFar, { progress: fraction })
            })
            .catch((error) => {
              // a transcript that cannot be saved is not worth finishing, so stop the worker
              // and let the job fail with this error
              job.writeError = error
              client.cancel()
            })
        },
      })
      await writes
      if (job.writeError) throw job.writeError
      if (job.isCancelled) return

      await store.saveSegments(id, segments, {
        status: 'transcribed',
        progress: 1,
        errorMessage: null,
      })
      updateState(id, {
        phase: 'done',
        fraction: 1,
        processedSeconds: durationSeconds,
        remainingSeconds: 0,
        latestSegments: segments.slice(-2),
        segmentCount: segments.length,
      })
    } catch (error) {
      if (job.isCancelled) return
      const cause = job.writeError ?? error
      const message =
        cause instanceof AudioDecodeError ? unreadableAudioMessage : String(cause?.message ?? cause)
      await failJob(job, message)
    }
  }

  /**
   * start the next waiting recording when nothing is running.
   * @returns {void}
   */
  function startNextJob() {
    if (running || queue.length === 0) return
    const { id } = queue.shift()
    const job = { id, isCancelled: false, writeError: null }
    running = job
    announceQueue()
    runJob(job)
      .catch(reportError)
      .finally(() => {
        if (running === job) running = null
        startNextJob()
      })
  }

  /**
   * put a recording in line to be transcribed. a recording already in line is left as it is.
   * @param {string} id recording id
   * @returns {Promise<void>} resolves once the recording is in line
   * @throws {TypeError} when id is not a non empty string
   * @throws {Error} when there is no recording with that id
   */
  async function enqueueRecording(id) {
    assertText(id, 'recording id')
    if (isInLine(id)) return
    const recording = await store.getRecording(id)
    if (!recording) throw new Error(`no recording with id ${id}`)
    // another call may have queued it while the read was running
    if (isInLine(id)) return

    const item = { id, createdAt: recording.createdAt }
    const laterIndex = queue.findIndex((other) => other.createdAt > item.createdAt)
    if (laterIndex === -1) queue.push(item)
    else queue.splice(laterIndex, 0, item)
    stateById.set(id, createJobState(recording))
    announceQueue()
    startNextJob()
  }

  /**
   * stop a recording, running or waiting, and delete it with its audio and segments.
   * @param {string} id recording id
   * @returns {Promise<void>} resolves once the recording is deleted
   * @throws {TypeError} when id is not a non empty string
   */
  async function cancelRecording(id) {
    assertText(id, 'recording id')
    const queueIndex = queue.findIndex((item) => item.id === id)
    if (queueIndex !== -1) queue.splice(queueIndex, 1)
    if (running?.id === id) {
      running.isCancelled = true
      client.cancel()
    }
    stateById.delete(id)
    announceQueue()
    await store.deleteRecordingForever(id)
  }

  /**
   * pick up work left by a closed tab: recordings still marked transcribing go back to queued,
   * and every queued recording with audio runs again from the start, oldest first. a queued
   * recording without audio is marked failed.
   * @returns {Promise<void>} resolves once every recording is back in line or failed
   */
  async function resumeQueuedRecordings() {
    const recordings = await store.listRecordings()
    const unfinished = recordings
      .filter((recording) => recording.status === 'queued' || recording.status === 'transcribing')
      .sort((first, second) => first.createdAt - second.createdAt)
    for (const recording of unfinished) {
      if (isInLine(recording.id)) continue
      if (recording.status === 'transcribing') {
        await store.updateRecordingStatus(recording.id, { status: 'queued', progress: 0 })
      }
      const audio = await store.getAudio(recording.id)
      if (audio) {
        await enqueueRecording(recording.id)
      } else {
        await store.updateRecordingStatus(recording.id, {
          status: 'failed',
          errorMessage: missingAudioMessage,
        })
      }
    }
  }

  /**
   * listen for live state changes of any recording.
   * @param {(state: object) => void} listener called with a copy of one recording's state
   * @returns {() => void} a function that stops listening
   * @throws {TypeError} when listener is not a function
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /**
   * read the live state of one recording, for a page that opens part way through a job.
   * @param {string} id recording id
   * @returns {object | null} a copy of the state, or null when this tab has not run it
   */
  function getJobState(id) {
    const state = stateById.get(id)
    return state ? { ...state } : null
  }

  return { enqueueRecording, cancelRecording, resumeQueuedRecordings, subscribe, getJobState }
}

// the one runner the app uses, with the real worker client, decoder, and store
const appJobs = createTranscriptionJobs({
  client: createTranscriptionClient(),
  decode: decodeAudioFile,
  store: {
    getRecording,
    getAudio,
    listRecordings,
    updateRecordingStatus,
    saveSegments,
    deleteRecordingForever,
  },
})

export const { enqueueRecording, cancelRecording, resumeQueuedRecordings, subscribe, getJobState } =
  appJobs
