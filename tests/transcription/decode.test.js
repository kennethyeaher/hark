import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudioDecodeError,
  decodeAudioFile,
  mixToMono,
  whisperSampleRate,
} from '../../src/transcription/decode.js'

describe('mixToMono', () => {
  it('averages two channels sample by sample', () => {
    const left = new Float32Array([1, 0.5, -1])
    const right = new Float32Array([0, 0.5, 1])
    expect([...mixToMono([left, right])]).toEqual([0.5, 0.5, 0])
  })

  it('averages more than two channels', () => {
    const channels = [new Float32Array([0.3]), new Float32Array([0.6]), new Float32Array([0.9])]
    expect(mixToMono(channels)[0]).toBeCloseTo(0.6)
  })

  it('copies a single channel instead of sharing it', () => {
    const only = new Float32Array([0.25, -0.25])
    const mono = mixToMono([only])
    expect([...mono]).toEqual([0.25, -0.25])
    expect(mono).not.toBe(only)
  })

  it('handles empty channels', () => {
    expect(mixToMono([new Float32Array(0), new Float32Array(0)])).toHaveLength(0)
  })

  it.each([
    [[], /at least one channel/],
    [null, /at least one channel/],
    [[[0, 1]], /every channel to be a Float32Array/],
    [[new Float32Array(2), new Float32Array(3)], /same length/],
  ])('rejects %j', (channels, message) => {
    expect(() => mixToMono(channels)).toThrow(message)
  })
})

/**
 * stub OfflineAudioContext with a fake that decodes to a fixed stereo buffer at its own rate,
 * the way a browser resamples while decoding.
 * @param {{ shouldFail?: boolean, length?: number }} [options] true to make decoding fail, and
 *   how many samples per channel the decoded buffer has
 * @returns {{ contexts: object[] }} every context the code created
 */
function stubWebAudio({ shouldFail = false, length = whisperSampleRate } = {}) {
  const contexts = []
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      /**
       * keep the requested shape so the test can check it.
       * @param {number} channels channel count
       * @param {number} outputLength output sample count
       * @param {number} sampleRate context rate
       */
      constructor(channels, outputLength, sampleRate) {
        this.channels = channels
        this.outputLength = outputLength
        this.sampleRate = sampleRate
        contexts.push(this)
      }

      /**
       * decode bytes at the context rate, or fail like a browser given an unsupported file.
       * @returns {Promise<object>} the decoded buffer
       */
      async decodeAudioData() {
        if (shouldFail) throw new DOMException('Unable to decode audio data', 'EncodingError')
        return {
          length,
          duration: length / this.sampleRate,
          sampleRate: this.sampleRate,
          numberOfChannels: 2,
          getChannelData: (channel) => new Float32Array(length).fill(channel === 0 ? 1 : 0),
        }
      }
    }
  )
  return { contexts }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decodeAudioFile', () => {
  it('returns 16 kHz mono samples and the duration', async () => {
    const seen = stubWebAudio()
    const file = new File([new Uint8Array(8)], 'lecture.wav', { type: 'audio/wav' })
    const { samples, durationSeconds } = await decodeAudioFile(file)
    expect(durationSeconds).toBe(1)
    expect(samples).toBeInstanceOf(Float32Array)
    expect(samples).toHaveLength(whisperSampleRate)
    // the stereo channels were mixed into one
    expect(samples[0]).toBe(0.5)
    // one offline context at 16 kHz did the decoding, with no second resampling pass
    expect(seen.contexts).toHaveLength(1)
    expect(seen.contexts[0].sampleRate).toBe(whisperSampleRate)
    expect(seen.contexts[0].channels).toBe(1)
  })

  it('names the file and its type when decoding fails', async () => {
    stubWebAudio({ shouldFail: true })
    const file = new File([new Uint8Array(8)], 'notes.pdf', { type: 'application/pdf' })
    const error = await decodeAudioFile(file).catch((caught) => caught)
    expect(error).toBeInstanceOf(AudioDecodeError)
    expect(error.name).toBe('AudioDecodeError')
    expect(error.message).toBe('could not read notes.pdf (application/pdf) as audio')
    expect(error.cause.name).toBe('EncodingError')
  })

  it('says unknown type when the browser gives none', async () => {
    stubWebAudio({ shouldFail: true })
    const file = new File([new Uint8Array(8)], 'lecture.xyz')
    await expect(decodeAudioFile(file)).rejects.toThrow('lecture.xyz (unknown type)')
  })

  it('rejects a file that decodes to no audio', async () => {
    stubWebAudio({ length: 0 })
    const file = new File([new Uint8Array(8)], 'empty.wav', { type: 'audio/wav' })
    await expect(decodeAudioFile(file)).rejects.toThrow('empty.wav (audio/wav) has no audio in it')
  })

  it('rejects input that is not a file', async () => {
    await expect(decodeAudioFile('lecture.wav')).rejects.toThrow(/needs a File or Blob/)
  })
})
