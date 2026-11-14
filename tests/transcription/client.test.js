import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranscriptionClient } from '../../src/transcription/client.js'

// every fake worker the client starts, newest last
let workers = []

/** a stand in for the browser Worker that records messages and lets a test reply */
class FakeWorker {
  /**
   * record the worker url and options the client used.
   * @param {URL} url worker script url
   * @param {object} options worker options
   */
  constructor(url, options) {
    this.url = url
    this.options = options
    this.sent = []
    this.isTerminated = false
    this.onmessage = null
    this.onerror = null
    workers.push(this)
  }

  /**
   * record a message and move its transfer list the way a real worker does.
   * @param {object} message message from the page
   * @param {Transferable[]} [transfer] buffers to move
   * @returns {void}
   */
  postMessage(message, transfer = []) {
    this.sent.push({ message, transfer })
    // structuredClone with a transfer list detaches the buffers, like postMessage
    structuredClone(null, { transfer })
  }

  /**
   * mark the worker as stopped.
   * @returns {void}
   */
  terminate() {
    this.isTerminated = true
  }

  /**
   * send a message to the page as if the worker posted it.
   * @param {object} data message data
   * @returns {void}
   */
  reply(data) {
    this.onmessage?.({ data })
  }
}

beforeEach(() => {
  workers = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * make silent samples.
 * @param {number} [length] sample count
 * @returns {Float32Array} samples
 */
function samples(length = 16000) {
  return new Float32Array(length)
}

describe('createTranscriptionClient', () => {
  it('does not start a worker until the first job', () => {
    createTranscriptionClient()
    expect(workers).toHaveLength(0)
  })

  it('starts a module worker and transfers the samples buffer', async () => {
    const client = createTranscriptionClient()
    const audio = samples()
    const job = client.transcribe({ samples: audio, durationSeconds: 1, modelKey: 'fast' })
    const [worker] = workers
    expect(worker.options).toEqual({ type: 'module' })
    expect(String(worker.url)).toMatch(/worker\.js$/)
    const [{ message, transfer }] = worker.sent
    expect(message).toMatchObject({ type: 'transcribe', jobId: 1, modelKey: 'fast' })
    expect(transfer).toEqual([message.samples.buffer])
    // the page copy is detached, so nothing was copied
    expect(audio.length).toBe(0)
    worker.reply({ type: 'done', jobId: 1, segments: [] })
    await expect(job).resolves.toEqual([])
  })

  it('passes download, ready, and chunk progress to the callbacks, then resolves', async () => {
    const client = createTranscriptionClient()
    const onDownload = vi.fn()
    const onReady = vi.fn()
    const onChunk = vi.fn()
    const segment = { index: 0, startSeconds: 0, endSeconds: 2, text: 'Hi.' }
    const job = client.transcribe({
      samples: samples(),
      durationSeconds: 600,
      onDownload,
      onReady,
      onChunk,
    })
    const [worker] = workers
    expect(worker.sent[0].message.modelKey).toBe('balanced')
    worker.reply({
      type: 'download',
      modelKey: 'balanced',
      fraction: 0.5,
      loadedBytes: 5,
      totalBytes: 10,
      isReady: false,
    })
    worker.reply({ type: 'ready', jobId: 1, modelKey: 'balanced' })
    worker.reply({ type: 'chunk', jobId: 1, processedSeconds: 300, segments: [segment] })
    worker.reply({ type: 'done', jobId: 1, segments: [segment] })

    await expect(job).resolves.toEqual([segment])
    expect(onDownload).toHaveBeenCalledWith({ fraction: 0.5, loadedBytes: 5, totalBytes: 10 })
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith({
      processedSeconds: 300,
      fraction: 0.5,
      segments: [segment],
    })
  })

  it('rejects with the worker error message', async () => {
    const client = createTranscriptionClient()
    const job = client.transcribe({ samples: samples(), durationSeconds: 1 })
    workers[0].reply({ type: 'error', jobId: 1, message: 'out of memory' })
    await expect(job).rejects.toThrow('out of memory')
  })

  it('cancel ends the worker, rejects with an AbortError, and the next job gets a fresh worker', async () => {
    const client = createTranscriptionClient()
    const job = client.transcribe({ samples: samples(), durationSeconds: 1 })
    client.cancel()
    await expect(job).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].isTerminated).toBe(true)

    const next = client.transcribe({ samples: samples(), durationSeconds: 1 })
    expect(workers).toHaveLength(2)
    expect(workers[1].sent[0].message.jobId).toBe(2)
    // a late message from the first job is ignored
    workers[0].reply({ type: 'done', jobId: 1, segments: ['stale'] })
    workers[1].reply({ type: 'done', jobId: 2, segments: [] })
    await expect(next).resolves.toEqual([])
  })

  it('does nothing when cancel is called with no job running', () => {
    const client = createTranscriptionClient()
    expect(() => client.cancel()).not.toThrow()
  })

  it('rejects a second job while one is running', async () => {
    const client = createTranscriptionClient()
    client.transcribe({ samples: samples(), durationSeconds: 1 })
    await expect(client.transcribe({ samples: samples(), durationSeconds: 1 })).rejects.toThrow(
      /already running/
    )
  })

  it('replaces a worker that crashes and rejects its job', async () => {
    const client = createTranscriptionClient()
    const job = client.transcribe({ samples: samples(), durationSeconds: 1 })
    workers[0].onerror({ message: 'script failed to load' })
    await expect(job).rejects.toThrow('the transcription worker stopped: script failed to load')
    expect(workers[0].isTerminated).toBe(true)
    client.transcribe({ samples: samples(), durationSeconds: 1 })
    expect(workers).toHaveLength(2)
  })

  it.each([
    [{ samples: [0, 1], durationSeconds: 1 }, /samples must be a Float32Array/],
    [{ samples: samples(), durationSeconds: -1 }, /durationSeconds must be a finite number/],
    [{ samples: samples(), durationSeconds: 1, modelKey: 'large' }, /model must be one of/],
    [{ samples: samples(), durationSeconds: 1, onChunk: 'x' }, /onChunk must be a function/],
  ])('rejects bad input %#', async (options, message) => {
    const client = createTranscriptionClient()
    await expect(client.transcribe(options)).rejects.toThrow(message)
    expect(workers).toHaveLength(0)
  })
})

describe('createTranscriptionClient when a job cannot start', () => {
  it('clears the job when the post throws, so the next call can run', async () => {
    const client = createTranscriptionClient()
    // a buffer that already moved cannot be transferred again, so the post throws
    const moved = new Float32Array(4)
    structuredClone(null, { transfer: [moved.buffer] })
    await expect(client.transcribe({ samples: moved, durationSeconds: 1 })).rejects.toMatchObject({
      name: 'DataCloneError',
    })
    const next = client.transcribe({ samples: samples(), durationSeconds: 1 })
    workers[0].reply({ type: 'done', jobId: 2, segments: [] })
    await expect(next).resolves.toEqual([])
  })

  it('copies a view into a larger buffer instead of moving the whole buffer', async () => {
    const client = createTranscriptionClient()
    const whole = new Float32Array(10)
    const view = whole.subarray(2, 6)
    const job = client.transcribe({ samples: view, durationSeconds: 1 })
    const [{ transfer }] = workers[0].sent
    expect(transfer[0]).not.toBe(whole.buffer)
    expect(whole).toHaveLength(10)
    workers[0].reply({ type: 'done', jobId: 1, segments: [] })
    await job
  })
})
