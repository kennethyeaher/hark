import { describe, expect, it, vi } from 'vitest'
import { createTranscriber, windowSeconds } from '../../src/transcription/transcriber.js'
import { whisperSampleRate } from '../../src/transcription/decode.js'

/**
 * build a fake whisper pipeline that returns two chunks per call and records its calls.
 * @returns {Function} the fake pipeline, with vitest mock tracking
 */
function makeFakePipeline() {
  return vi.fn(async (samples) => {
    const seconds = samples.length / whisperSampleRate
    return {
      text: ' Hello there. General notes.',
      chunks: [
        { timestamp: [0, seconds / 2], text: ' Hello there.' },
        { timestamp: [seconds / 2, null], text: ' General notes.' },
      ],
    }
  })
}

/**
 * build a transcriber with a fake loader that sends two download events before resolving.
 * @param {{ failFirstLoad?: boolean }} [options] true to make the first load reject
 * @returns {{ transcriber: object, posted: object[], loadPipeline: Function,
 *   fakePipeline: Function }} the transcriber and what it posted
 */
function setup({ failFirstLoad = false } = {}) {
  const posted = []
  const fakePipeline = makeFakePipeline()
  let loadCount = 0
  const loadPipeline = vi.fn(async (modelId, options) => {
    loadCount += 1
    options.progress_callback({ status: 'initiate', name: modelId, file: 'model.onnx' })
    options.progress_callback({
      status: 'progress',
      name: modelId,
      file: 'model.onnx',
      loaded: 50,
      total: 100,
    })
    options.progress_callback({
      status: 'progress',
      name: modelId,
      file: 'model.onnx',
      loaded: 100,
      total: 100,
    })
    if (failFirstLoad && loadCount === 1) throw new Error('network down')
    return fakePipeline
  })
  const transcriber = createTranscriber({ loadPipeline, post: (message) => posted.push(message) })
  return { transcriber, posted, loadPipeline, fakePipeline }
}

/**
 * make silent samples of a given length.
 * @param {number} seconds audio length
 * @returns {Float32Array} samples at 16 kHz
 */
function silence(seconds) {
  return new Float32Array(Math.round(seconds * whisperSampleRate))
}

describe('createTranscriber', () => {
  it('posts download, ready, chunk, and done in order for a short file', async () => {
    const { transcriber, posted, loadPipeline } = setup()
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 1,
      samples: silence(20),
      modelKey: 'balanced',
    })
    expect(posted.map((message) => message.type)).toEqual([
      'download',
      'download',
      'download',
      'ready',
      'chunk',
      'done',
    ])
    expect(loadPipeline).toHaveBeenCalledWith('onnx-community/whisper-base', expect.any(Object))
    expect(loadPipeline.mock.calls[0][1].device).toBe('wasm')
    expect(posted[2]).toMatchObject({ fraction: 1, loadedBytes: 100, totalBytes: 100 })
    expect(posted[4]).toMatchObject({ type: 'chunk', jobId: 1, processedSeconds: 20 })
    expect(posted[5]).toEqual({
      type: 'done',
      jobId: 1,
      segments: [
        { index: 0, startSeconds: 0, endSeconds: 10, text: 'Hello there.' },
        { index: 1, startSeconds: 10, endSeconds: 20, text: 'General notes.' },
      ],
    })
  })

  it('passes the whisper chunking options to the pipeline', async () => {
    const { transcriber, fakePipeline } = setup()
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 1,
      samples: silence(5),
      modelKey: 'fast',
    })
    expect(fakePipeline.mock.calls[0][1]).toEqual({
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })
  })

  it('plans windows with context, offsets their times, and posts the transcript after each', async () => {
    const { transcriber, posted, fakePipeline } = setup()
    // silence is quiet everywhere, so each cut lands on the first frame of its search, 8 s early
    const seconds = windowSeconds * 2 + 60
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 'job',
      samples: silence(seconds),
      modelKey: 'balanced',
    })
    // audio ranges 0 to 297, 287 to 597, and 587 to 660
    expect(fakePipeline.mock.calls.map(([samples]) => samples.length / whisperSampleRate)).toEqual([
      297, 310, 73,
    ])
    const chunks = posted.filter((message) => message.type === 'chunk')
    expect(chunks.map((chunk) => chunk.processedSeconds)).toEqual([292, 592, 660])
    // each chunk carries the whole transcript so far
    expect(chunks.map((chunk) => chunk.segments.length)).toEqual([2, 4, 6])
    expect(chunks[1].segments.map((segment) => segment.index)).toEqual([0, 1, 2, 3])
    expect(chunks[1].segments[2].startSeconds).toBe(287)
    const done = posted.at(-1)
    expect(done.segments.map((segment) => segment.startSeconds)).toEqual([
      0, 148.5, 287, 442, 587, 623.5,
    ])
    expect(done.segments.at(-1).endSeconds).toBe(660)
  })

  it('keeps only the segments each window owns at its edges', async () => {
    const { transcriber, posted, fakePipeline } = setup()
    // a short segment at each end of every window's audio, so the context parts are easy to see
    fakePipeline.mockImplementation(async (samples) => {
      const seconds = samples.length / whisperSampleRate
      return {
        chunks: [
          { timestamp: [0, 3], text: ' Head.' },
          { timestamp: [3, seconds - 3], text: ' Body.' },
          { timestamp: [seconds - 3, null], text: ' Tail.' },
        ],
      }
    })
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 'job',
      samples: silence(windowSeconds * 2 + 60),
      modelKey: 'balanced',
    })
    const done = posted.at(-1)
    // the first head and the last tail are real edges of the file, every other one is context
    expect(done.segments.map((segment) => segment.text)).toEqual([
      'Head.',
      'Body.',
      'Body.',
      'Body.',
      'Tail.',
    ])
    expect(done.segments.map((segment) => segment.index)).toEqual([0, 1, 2, 3, 4])
    expect(done.segments.at(-1)).toMatchObject({ startSeconds: 657, endSeconds: 660 })
  })

  it('drops a sentence whisper repeats across a window edge', async () => {
    const { transcriber, posted, fakePipeline } = setup()
    const sentences = [
      'The data goes to the company servers.',
      'the data goes to the company servers',
      'First, large language models.',
    ]
    let call = 0
    fakePipeline.mockImplementation(async (samples) => {
      const seconds = samples.length / whisperSampleRate
      const text = sentences[call]
      call += 1
      return { chunks: [{ timestamp: [0, seconds], text }] }
    })
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 'job',
      samples: silence(windowSeconds * 2 + 60),
      modelKey: 'balanced',
    })
    const chunks = posted.filter((message) => message.type === 'chunk')
    expect(chunks.map((chunk) => chunk.segments.length)).toEqual([1, 1, 2])
    expect(posted.at(-1).segments).toEqual([
      { index: 0, startSeconds: 0, endSeconds: 297, text: sentences[0] },
      { index: 1, startSeconds: 587, endSeconds: 660, text: sentences[2] },
    ])
  })

  it('loads each model once and reuses it', async () => {
    const { transcriber, posted, loadPipeline } = setup()
    const job = { type: 'transcribe', samples: silence(1), modelKey: 'balanced' }
    await transcriber.handleMessage({ ...job, jobId: 1 })
    await transcriber.handleMessage({ ...job, jobId: 2, samples: silence(1) })
    await transcriber.handleMessage({ type: 'load', modelKey: 'balanced' })
    expect(loadPipeline).toHaveBeenCalledTimes(1)
    await transcriber.handleMessage({ type: 'load', modelKey: 'accurate' })
    expect(loadPipeline).toHaveBeenCalledTimes(2)
    expect(loadPipeline.mock.calls[1][0]).toBe('onnx-community/whisper-small')
    // a cached model still answers a load with ready
    expect(posted.filter((message) => message.type === 'ready')).toHaveLength(4)
  })

  it('runs messages one at a time in arrival order', async () => {
    const { transcriber, posted } = setup()
    const first = transcriber.handleMessage({
      type: 'transcribe',
      jobId: 1,
      samples: silence(1),
      modelKey: 'fast',
    })
    const second = transcriber.handleMessage({
      type: 'transcribe',
      jobId: 2,
      samples: silence(1),
      modelKey: 'fast',
    })
    await Promise.all([first, second])
    const doneIds = posted.filter((message) => message.type === 'done').map((done) => done.jobId)
    expect(doneIds).toEqual([1, 2])
  })

  it('posts an error instead of throwing when the pipeline fails', async () => {
    const { transcriber, posted, fakePipeline } = setup()
    fakePipeline.mockRejectedValueOnce(new Error('out of memory'))
    await expect(
      transcriber.handleMessage({
        type: 'transcribe',
        jobId: 7,
        samples: silence(1),
        modelKey: 'balanced',
      })
    ).resolves.toBeUndefined()
    expect(posted.at(-1)).toEqual({ type: 'error', jobId: 7, message: 'out of memory' })
  })

  it('forgets a failed load so the next message tries again', async () => {
    const { transcriber, posted, loadPipeline } = setup({ failFirstLoad: true })
    await transcriber.handleMessage({ type: 'load', modelKey: 'fast' })
    expect(posted.at(-1)).toEqual({ type: 'error', jobId: null, message: 'network down' })
    await transcriber.handleMessage({ type: 'load', modelKey: 'fast' })
    expect(loadPipeline).toHaveBeenCalledTimes(2)
    expect(posted.at(-1)).toEqual({ type: 'ready', jobId: null, modelKey: 'fast' })
  })

  it('posts an error for an unknown model key without loading anything', async () => {
    const { transcriber, posted, loadPipeline } = setup()
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 3,
      samples: silence(1),
      modelKey: 'large',
    })
    expect(loadPipeline).not.toHaveBeenCalled()
    expect(posted).toEqual([
      {
        type: 'error',
        jobId: 3,
        message: 'model must be one of fast, balanced, accurate, got large',
      },
    ])
  })

  it('posts errors for bad samples and unknown message types', async () => {
    const { transcriber, posted } = setup()
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 4,
      samples: [0, 0],
      modelKey: 'fast',
    })
    await transcriber.handleMessage({ type: 'dance' })
    await transcriber.handleMessage(null)
    expect(posted.map((message) => message.message)).toEqual([
      'samples must be a Float32Array, got 0,0',
      'unknown message type dance',
      'unknown message type undefined',
    ])
  })

  it('finishes empty audio with no segments', async () => {
    const { transcriber, posted, fakePipeline } = setup()
    await transcriber.handleMessage({
      type: 'transcribe',
      jobId: 5,
      samples: new Float32Array(0),
      modelKey: 'fast',
    })
    expect(fakePipeline).not.toHaveBeenCalled()
    expect(posted.at(-1)).toEqual({ type: 'done', jobId: 5, segments: [] })
  })

  it('needs loadPipeline and post functions', () => {
    expect(() => createTranscriber({ loadPipeline: null, post: () => {} })).toThrow(
      /needs loadPipeline and post functions/
    )
  })
})
