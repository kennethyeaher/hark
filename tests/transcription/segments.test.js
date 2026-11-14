import { describe, expect, it } from 'vitest'
import {
  buildSegments,
  collapseRepeatedPhrases,
  dropRepeatedSegments,
} from '../../src/transcription/segments.js'

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

describe('collapseRepeatedPhrases', () => {
  it('collapses the whisper loop shape to one occurrence', () => {
    const loop = Array.from({ length: 90 }, () => 'who is a person').join(' ')
    expect(
      collapseRepeatedPhrases(`In fact, if you are a person ${loop} I think there are cases.`)
    ).toBe('In fact, if you are a person who is a person I think there are cases.')
  })

  it('keeps the casing and punctuation of the first occurrence', () => {
    expect(
      collapseRepeatedPhrases('The United States, the united states. THE UNITED STATES! Next.')
    ).toBe('The United States, Next.')
  })

  it('keeps a phrase repeated exactly twice', () => {
    const text = 'It is very, very good, and very, very cheap.'
    expect(collapseRepeatedPhrases(text)).toBe(text)
    expect(collapseRepeatedPhrases('Thank you. Thank you.')).toBe('Thank you. Thank you.')
  })

  it('keeps an ordinary list and single repeated words', () => {
    expect(collapseRepeatedPhrases('one, two, three, four')).toBe('one, two, three, four')
    expect(collapseRepeatedPhrases('No, no, no, no.')).toBe('No, no, no, no.')
  })

  it('leaves empty text and punctuation alone', () => {
    expect(collapseRepeatedPhrases('')).toBe('')
    expect(collapseRepeatedPhrases('- - - - - -')).toBe('- - - - - -')
  })

  it('rejects text that is not a string', () => {
    expect(() => collapseRepeatedPhrases(null)).toThrow(/text must be a string/)
  })
})

describe('dropRepeatedSegments', () => {
  /**
   * make numbered segments from a list of texts, one second each.
   * @param {string[]} texts segment texts
   * @returns {Array<{ index: number, startSeconds: number, endSeconds: number, text: string }>}
   *   segments in order
   */
  function makeSegments(texts) {
    return texts.map((text, index) => ({ index, startSeconds: index, endSeconds: index + 1, text }))
  }

  it('drops a repeat of the segment before it and numbers the rest again', () => {
    const segments = makeSegments([
      'Hello there.',
      'The United States is a very important source.',
      'the United States, is a very important  source',
      'THE UNITED STATES IS A VERY IMPORTANT SOURCE!',
      'First, large language models.',
    ])
    expect(dropRepeatedSegments(segments)).toEqual([
      { index: 0, startSeconds: 0, endSeconds: 1, text: 'Hello there.' },
      {
        index: 1,
        startSeconds: 1,
        endSeconds: 2,
        text: 'The United States is a very important source.',
      },
      { index: 2, startSeconds: 4, endSeconds: 5, text: 'First, large language models.' },
    ])
  })

  it('keeps short repeats and repeats that are not next to each other', () => {
    const texts = ['Yes.', 'Yes.', 'One two three.', 'One two three.', 'Let us go on.', 'Okay.']
    const withGap = ['Four words in here.', 'Something else.', 'Four words in here.']
    expect(dropRepeatedSegments(makeSegments(texts))).toHaveLength(6)
    expect(dropRepeatedSegments(makeSegments(withGap))).toHaveLength(3)
  })

  it('compares letters and digits in any script', () => {
    const texts = [
      'Ünïcode wörds 42 and more.',
      'ünïcode wörds 42 and more',
      'ünïcode wörds 43 and more',
    ]
    expect(dropRepeatedSegments(makeSegments(texts)).map((segment) => segment.index)).toEqual([
      0, 1,
    ])
  })

  it('does not change the segments it was given', () => {
    const segments = makeSegments(['a b c d', 'a b c d', 'e'])
    dropRepeatedSegments(segments)
    expect(segments.map((segment) => segment.index)).toEqual([0, 1, 2])
  })

  it('rejects input that is not a list of segments with text', () => {
    expect(() => dropRepeatedSegments(null)).toThrow(/segments must be an array/)
    expect(() => dropRepeatedSegments([{ text: 3 }])).toThrow(/segment 0 text must be a string/)
  })
})
