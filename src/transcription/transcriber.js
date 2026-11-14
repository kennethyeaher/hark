/*
  the transcription worker's logic, kept apart from the worker so tests can drive it with a
  fake pipeline.

  long files are cut into 5 minute windows. each window runs through the whisper pipeline,
  which does its own 30 second chunking inside, and a `chunk` message goes out after every
  window. transformers.js 3.8 has a WhisperTextStreamer with chunk callbacks, but its times are
  relative to each 30 second piece and the overlaps are only merged after the whole call ends,
  so it cannot give final segments part way through. windows can.
*/

import { getModel } from './models.js'
import { whisperSampleRate } from './decode.js'
import { createDownloadTracker } from './progress.js'
import { buildSegments, mergeSegments } from './segments.js'

/** length of one window of audio sent to the pipeline at a time */
export const windowSeconds = 300

// whisper settings: 30 second chunks that overlap by 5 seconds on each side, with timestamps
const transcribeOptions = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true }

// models run on wasm with their default dtype. webgpu is a later option.
const loadOptions = { device: 'wasm' }

/**
 * create the message handler that loads whisper models and transcribes audio.
 * @param {{ loadPipeline: (modelId: string, options: object) => Promise<Function>,
 *   post: (message: object) => void }} options `loadPipeline` builds a speech recognition
 *   pipeline for a model id, `post` sends a message back to the page
 * @returns {{ handleMessage: (message: object) => Promise<void> }} handles one message from the
 *   page. it never rejects; every failure is posted as an `error` message instead.
 * @throws {TypeError} when loadPipeline or post is not a function
 */
export function createTranscriber({ loadPipeline, post }) {
  if (typeof loadPipeline !== 'function' || typeof post !== 'function') {
    throw new TypeError('createTranscriber needs loadPipeline and post functions')
  }
  // one loading or loaded pipeline per model key
  const pipelines = new Map()
  // messages run one at a time, in the order they arrive
  let queue = Promise.resolve()

  /**
   * get the pipeline for a model, loading it on first use and posting download progress.
   * every caller posts its own `ready` once this resolves.
   * @param {string} modelKey model choice
   * @returns {Promise<Function>} the pipeline
   * @throws {RangeError} when the model key is unknown
   */
  function getPipeline(modelKey) {
    const model = getModel(modelKey)
    if (pipelines.has(modelKey)) return pipelines.get(modelKey)

    const tracker = createDownloadTracker()
    let lastPercent = -1
    const loading = loadPipeline(model.modelId, {
      ...loadOptions,
      /**
       * pass each download event to the tracker and post when the whole percent changes.
       * @param {object} event a transformers.js progress event
       * @returns {void}
       */
      progress_callback(event) {
        const snapshot = tracker.update(event)
        const percent = Math.floor(snapshot.fraction * 100)
        if (percent === lastPercent) return
        lastPercent = percent
        post({ type: 'download', modelKey, ...snapshot })
      },
    })
    pipelines.set(modelKey, loading)
    // a failed load is forgotten so the next message can try again. callers still get the error.
    loading.catch(() => {
      if (pipelines.get(modelKey) === loading) pipelines.delete(modelKey)
    })
    return loading
  }

  /**
   * transcribe audio window by window, posting a chunk after each window and done at the end.
   * @param {{ jobId: string | number, samples: Float32Array, modelKey: string }} message job
   * @returns {Promise<void>} resolves once done is posted
   * @throws {TypeError} when samples is not a Float32Array
   * @throws {RangeError} when the model key is unknown
   */
  async function transcribe({ jobId, samples, modelKey }) {
    if (!(samples instanceof Float32Array)) {
      throw new TypeError(`samples must be a Float32Array, got ${String(samples)}`)
    }
    const pipeline = await getPipeline(modelKey)
    post({ type: 'ready', jobId, modelKey })
    const windowLength = windowSeconds * whisperSampleRate

    const windows = []
    for (let start = 0; start < samples.length; start += windowLength) {
      const windowSamples = samples.subarray(start, start + windowLength)
      const output = await pipeline(windowSamples, transcribeOptions)
      const offsetSeconds = start / whisperSampleRate
      windows.push(
        buildSegments(output.chunks ?? [], {
          offsetSeconds,
          durationSeconds: windowSamples.length / whisperSampleRate,
        })
      )
      // the new window's segments, numbered within the whole transcript
      const merged = mergeSegments(windows)
      post({
        type: 'chunk',
        jobId,
        processedSeconds: offsetSeconds + windowSamples.length / whisperSampleRate,
        segments: merged.slice(merged.length - windows.at(-1).length),
      })
    }
    post({ type: 'done', jobId, segments: mergeSegments(windows) })
  }

  /**
   * run one message and post an error message when it fails, so nothing throws out of the worker.
   * @param {{ type: string, jobId?: string | number, modelKey?: string }} message from the page
   * @returns {Promise<void>} resolves once the message is handled
   */
  async function runMessage(message) {
    const jobId = message?.jobId ?? null
    try {
      if (message?.type === 'load') {
        await getPipeline(message.modelKey)
        // a model that was already loaded still answers, so the page always hears back
        post({ type: 'ready', jobId, modelKey: message.modelKey })
      } else if (message?.type === 'transcribe') {
        await transcribe(message)
      } else {
        throw new TypeError(`unknown message type ${String(message?.type)}`)
      }
    } catch (error) {
      post({ type: 'error', jobId, message: error?.message ?? String(error) })
    }
  }

  /**
   * queue one message from the page behind any message still running.
   * @param {object} message from the page
   * @returns {Promise<void>} resolves once this message is handled
   */
  function handleMessage(message) {
    queue = queue.then(() => runMessage(message))
    return queue
  }

  return { handleMessage }
}
