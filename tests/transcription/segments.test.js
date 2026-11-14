import { describe, expect, it } from 'vitest'
import { buildSegments } from '../../src/transcription/segments.js'

// shaped like the chunks the transformers.js whisper pipeline returns with return_timestamps
const pipelineChunks = [
  { timestamp: [0, 4.52], text: ' Good morning, everyone.' },
  { timestamp: [4.52, 9.8], text: ' Today we look at privacy by design.' },
  { timestamp: [9.8, 10.1], text: ' ' },
  { timestamp: [10.1, 15.36], text: ' It starts with what data you collect at all.' },
  { timestamp: [15.36, null], text: ' So let us begin' },
]

describe('buildSegments', () => {
  it('trims text, drops empty chunks, and numbers the rest from 0', () => {
    const segments = buildSegments(pipelineChunks, { durationSeconds: 17 })
    expect(segments.map((segment) => segment.text)).toEqual([
      'Good morning, everyone.',
      'Today we look at privacy by design.',
      'It starts with what data you collect at all.',
      'So let us begin',
    ])
    expect(segments.map((segment) => segment.index)).toEqual([0, 1, 2, 3])
    expect(segments[1]).toEqual({
      index: 1,
      startSeconds: 4.52,
      endSeconds: 9.8,
      text: 'Today we look at privacy by design.',
    })
  })

  it('fills a missing last end with the audio duration', () => {
    const segments = buildSegments(pipelineChunks, { durationSeconds: 17 })
    expect(segments.at(-1)).toMatchObject({ startSeconds: 15.36, endSeconds: 17 })
  })

  it('fills a missing end in the middle with the next start', () => {
    const chunks = [
      { timestamp: [0, null], text: 'First.' },
      { timestamp: [3.2, 6], text: 'Second.' },
    ]
    expect(buildSegments(chunks)[0].endSeconds).toBe(3.2)
  })

  it('adds the window offset to every time', () => {
    const segments = buildSegments(pipelineChunks, { offsetSeconds: 300, durationSeconds: 17 })
    expect(segments[0]).toMatchObject({ startSeconds: 300, endSeconds: 304.52 })
    expect(segments.at(-1)).toMatchObject({ startSeconds: 315.36, endSeconds: 317 })
  })

  it('moves an end that lands before its start up to the start', () => {
    const segments = buildSegments([{ timestamp: [8, 7.9], text: 'Hmm.' }])
    expect(segments[0]).toMatchObject({ startSeconds: 8, endSeconds: 8 })
  })

  it('returns an empty list for silence', () => {
    expect(buildSegments([])).toEqual([])
    expect(buildSegments([{ timestamp: [0, null], text: '  ' }])).toEqual([])
  })

  it.each([
    [null, {}, /chunks must be an array/],
    [[{ text: 'x' }], {}, /chunk 0 must have a timestamp array/],
    [[{ timestamp: [0, 1], text: 4 }], {}, /chunk 0 text must be a string/],
    [[{ timestamp: [-1, 1], text: 'x' }], {}, /chunk 0 start must be a finite number/],
    [[{ timestamp: [null, 1], text: 'x' }], {}, /chunk 0 start must be a finite number/],
    [[{ timestamp: [0, null], text: 'x' }], {}, /no end time and no durationSeconds/],
    [[], { offsetSeconds: -5 }, /offsetSeconds must be a finite number/],
  ])('rejects %j with %j', (chunks, options, message) => {
    expect(() => buildSegments(chunks, options)).toThrow(message)
  })
})
