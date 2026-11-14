import { describe, expect, it } from 'vitest'
import { createDownloadTracker } from '../../src/transcription/progress.js'

const model = 'onnx-community/whisper-base'

// events in the order and shape transformers.js 3.8 sends them while loading whisper base,
// cut down to three files
const recordedEvents = [
  { status: 'initiate', name: model, file: 'config.json' },
  { status: 'download', name: model, file: 'config.json' },
  {
    status: 'progress',
    name: model,
    file: 'config.json',
    progress: 100,
    loaded: 2000,
    total: 2000,
  },
  { status: 'done', name: model, file: 'config.json' },
  { status: 'initiate', name: model, file: 'onnx/encoder_model.onnx' },
  { status: 'initiate', name: model, file: 'onnx/decoder_model_merged.onnx' },
  { status: 'download', name: model, file: 'onnx/encoder_model.onnx' },
  { status: 'download', name: model, file: 'onnx/decoder_model_merged.onnx' },
  {
    status: 'progress',
    name: model,
    file: 'onnx/encoder_model.onnx',
    progress: 50,
    loaded: 41000,
    total: 82000,
  },
  {
    status: 'progress',
    name: model,
    file: 'onnx/decoder_model_merged.onnx',
    progress: 25,
    loaded: 29000,
    total: 116000,
  },
  {
    status: 'progress',
    name: model,
    file: 'onnx/encoder_model.onnx',
    progress: 100,
    loaded: 82000,
    total: 82000,
  },
  { status: 'done', name: model, file: 'onnx/encoder_model.onnx' },
  {
    status: 'progress',
    name: model,
    file: 'onnx/decoder_model_merged.onnx',
    progress: 100,
    loaded: 116000,
    total: 116000,
  },
  { status: 'done', name: model, file: 'onnx/decoder_model_merged.onnx' },
  { status: 'ready', task: 'automatic-speech-recognition', model },
]

/**
 * feed events to a new tracker and keep every snapshot.
 * @param {object[]} events progress events in order
 * @returns {object[]} the snapshot after each event
 */
function replay(events) {
  const tracker = createDownloadTracker()
  return events.map((event) => tracker.update(event))
}

describe('createDownloadTracker', () => {
  it('starts empty', () => {
    expect(createDownloadTracker().getSnapshot()).toEqual({
      loadedBytes: 0,
      totalBytes: 0,
      fraction: 0,
      isReady: false,
    })
  })

  it('adds up every file across a recorded load', () => {
    const snapshots = replay(recordedEvents)
    expect(snapshots[2]).toMatchObject({ loadedBytes: 2000, totalBytes: 2000, fraction: 1 })
    // config done, encoder half, decoder a quarter
    expect(snapshots[9]).toMatchObject({ loadedBytes: 72000, totalBytes: 200000 })
    expect(snapshots[9].fraction).toBeCloseTo(0.36)
    expect(snapshots[9].isReady).toBe(false)
    expect(snapshots.at(-1)).toEqual({
      loadedBytes: 200000,
      totalBytes: 200000,
      fraction: 1,
      isReady: true,
    })
  })

  it('never moves past 1 or below 0 during the load', () => {
    for (const snapshot of replay(recordedEvents)) {
      expect(snapshot.fraction).toBeGreaterThanOrEqual(0)
      expect(snapshot.fraction).toBeLessThanOrEqual(1)
    }
  })

  it('leaves files with unknown totals out instead of dividing by zero', () => {
    const snapshots = replay([
      { status: 'initiate', name: model, file: 'tokenizer.json' },
      { status: 'progress', name: model, file: 'tokenizer.json', loaded: 5000, total: 0 },
      { status: 'progress', name: model, file: 'vocab.json', loaded: 300 },
      { status: 'done', name: model, file: 'tokenizer.json' },
    ])
    for (const snapshot of snapshots) {
      expect(snapshot).toEqual({ loadedBytes: 0, totalBytes: 0, fraction: 0, isReady: false })
    }
  })

  it('counts a done file as fully loaded even if the last progress event was missed', () => {
    const snapshots = replay([
      { status: 'progress', name: model, file: 'a.onnx', loaded: 10, total: 100 },
      { status: 'done', name: model, file: 'a.onnx' },
    ])
    expect(snapshots[1]).toMatchObject({ loadedBytes: 100, fraction: 1 })
  })

  it('reports ready as complete when every file came from the cache with no sizes', () => {
    const snapshots = replay([
      { status: 'initiate', name: model, file: 'config.json' },
      { status: 'done', name: model, file: 'config.json' },
      { status: 'ready', task: 'automatic-speech-recognition', model },
    ])
    expect(snapshots.at(-1)).toMatchObject({ fraction: 1, isReady: true })
  })

  it('ignores statuses it does not know', () => {
    const tracker = createDownloadTracker()
    expect(tracker.update({ status: 'progress_total', progress: 50 }).fraction).toBe(0)
  })

  it.each([null, 'progress', {}, { status: 4 }])('rejects the event %j', (event) => {
    expect(() => createDownloadTracker().update(event)).toThrow(
      /progress event must be an object with a status/
    )
  })
})
