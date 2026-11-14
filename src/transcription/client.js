// the page side of transcription: starts the worker, sends audio, and hands back the transcript

import { defaultModelKey, getModel } from './models.js'

/**
 * check that an optional callback is a function when it is given.
 * @param {unknown} callback value to check
 * @param {string} label name used in the error message
 * @returns {void}
 * @throws {TypeError} when callback is given and is not a function
 */
function assertOptionalFunction(callback, label) {
  if (callback !== undefined && typeof callback !== 'function') {
    throw new TypeError(`${label} must be a function, got ${String(callback)}`)
  }
}

/**
 * create a client that runs one transcription at a time in a module worker.
 * the worker starts on the first call, so nothing loads until audio is sent.
 * @returns {{ transcribe: Function, cancel: Function }} the client
 */
export function createTranscriptionClient() {
  let worker = null
  let pending = null
  let nextJobId = 1

  /**
   * end the pending job, if there is one, with an error.
   * @param {Error} error error to reject with
   * @returns {void}
   */
  function rejectPending(error) {
    const job = pending
    pending = null
    job?.reject(error)
  }

  /**
   * route one message from the worker to the pending job.
   * @param {MessageEvent} event message from the worker
   * @returns {void}
   */
  function handleWorkerMessage(event) {
    const message = event.data
    // messages from a job that was cancelled or already finished are ignored
    if (!pending || (message.jobId != null && message.jobId !== pending.jobId)) return

    switch (message.type) {
      case 'download':
        pending.onDownload?.({
          fraction: message.fraction,
          loadedBytes: message.loadedBytes,
          totalBytes: message.totalBytes,
        })
        break
      case 'ready':
        pending.onReady?.()
        break
      case 'chunk':
        pending.onChunk?.({
          processedSeconds: message.processedSeconds,
          fraction:
            pending.durationSeconds > 0
              ? Math.min(1, message.processedSeconds / pending.durationSeconds)
              : 1,
          segments: message.segments,
        })
        break
      case 'done': {
        const job = pending
        pending = null
        job.resolve(message.segments)
        break
      }
      case 'error':
        rejectPending(new Error(message.message))
        break
    }
  }

  /**
   * start the worker if it is not running.
   * @returns {Worker} the running worker
   */
  function ensureWorker() {
    if (worker) return worker
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = handleWorkerMessage
    /**
     * a worker that crashes cannot be trusted with the next job, so it is dropped and the
     * pending job rejects.
     * @param {ErrorEvent} event the error from the worker
     * @returns {void}
     */
    worker.onerror = (event) => {
      worker?.terminate()
      worker = null
      rejectPending(
        new Error(`the transcription worker stopped: ${event.message ?? 'unknown error'}`)
      )
    }
    return worker
  }

  /**
   * transcribe 16 kHz mono samples. the samples buffer moves to the worker and is empty here
   * afterward, unless samples is a view into a larger buffer, which is copied instead.
   * @param {{ samples: Float32Array, durationSeconds: number, modelKey?: string,
   *   onDownload?: (progress: { fraction: number, loadedBytes: number, totalBytes: number }) => void,
   *   onReady?: () => void,
   *   onChunk?: (chunk: { processedSeconds: number, fraction: number, segments: object[] }) => void
   * }} options audio, its length, the model choice, and progress callbacks
   * @returns {Promise<object[]>} every segment of the transcript
   * @throws {TypeError} when an input is the wrong type
   * @throws {Error} when a job is already running
   * @throws {RangeError} when durationSeconds is negative or the model key is unknown
   * @throws {DOMException} an AbortError when `cancel` is called before the job ends
   */
  async function transcribe({
    samples,
    durationSeconds,
    modelKey = defaultModelKey,
    onDownload,
    onReady,
    onChunk,
  }) {
    if (!(samples instanceof Float32Array)) {
      throw new TypeError(`samples must be a Float32Array, got ${String(samples)}`)
    }
    if (
      typeof durationSeconds !== 'number' ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0
    ) {
      throw new RangeError(
        `durationSeconds must be a finite number of 0 or more, got ${String(durationSeconds)}`
      )
    }
    getModel(modelKey)
    assertOptionalFunction(onDownload, 'onDownload')
    assertOptionalFunction(onReady, 'onReady')
    assertOptionalFunction(onChunk, 'onChunk')
    if (pending) {
      throw new Error('a transcription is already running, cancel it first')
    }

    const jobId = nextJobId
    nextJobId += 1
    // a view into a larger buffer is copied first, so only these samples move to the worker
    const isWholeBuffer =
      samples.byteOffset === 0 && samples.byteLength === samples.buffer.byteLength
    const sendable = isWholeBuffer ? samples : samples.slice()
    return new Promise((resolve, reject) => {
      pending = { jobId, durationSeconds, onDownload, onReady, onChunk, resolve, reject }
      // a post that throws, for example on a buffer that already moved, must not leave a job
      // pending forever, or every later call would report one already running
      try {
        ensureWorker().postMessage({ type: 'transcribe', jobId, samples: sendable, modelKey }, [
          sendable.buffer,
        ])
      } catch (error) {
        pending = null
        throw error
      }
    })
  }

  /**
   * stop the running job by ending the worker. the pending promise rejects with an AbortError
   * and the next call starts a fresh worker. calling this with nothing running does nothing.
   * @returns {void}
   */
  function cancel() {
    worker?.terminate()
    worker = null
    rejectPending(new DOMException('the transcription was cancelled', 'AbortError'))
  }

  return { transcribe, cancel }
}
