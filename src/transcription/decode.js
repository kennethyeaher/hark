// turns an uploaded audio file into the 16 kHz mono samples whisper expects

/** the sample rate every whisper model is trained on */
export const whisperSampleRate = 16000

/** thrown when the browser cannot read a file as audio, so the ui can show the unsupported message */
export class AudioDecodeError extends Error {
  /**
   * create the error for one file.
   * @param {string} message what went wrong, naming the file and its type
   * @param {{ cause?: unknown }} [options] the browser error underneath, when there is one
   */
  constructor(message, options) {
    super(message, options)
    this.name = 'AudioDecodeError'
  }
}

/**
 * average several channels into one, sample by sample.
 * @param {Float32Array[]} channelArrays one array per channel, all the same length
 * @returns {Float32Array} a new mono array. a single channel is copied, not shared.
 * @throws {TypeError} when there are no channels, a channel is not a Float32Array, or the
 *   lengths differ
 */
export function mixToMono(channelArrays) {
  if (!Array.isArray(channelArrays) || channelArrays.length === 0) {
    throw new TypeError('mixToMono needs at least one channel')
  }
  if (!channelArrays.every((channel) => channel instanceof Float32Array)) {
    throw new TypeError('mixToMono needs every channel to be a Float32Array')
  }
  const length = channelArrays[0].length
  if (!channelArrays.every((channel) => channel.length === length)) {
    throw new TypeError('mixToMono needs every channel to have the same length')
  }

  const mono = new Float32Array(length)
  for (const channel of channelArrays) {
    for (let index = 0; index < length; index += 1) mono[index] += channel[index]
  }
  if (channelArrays.length > 1) {
    for (let index = 0; index < length; index += 1) mono[index] /= channelArrays.length
  }
  return mono
}

/**
 * describe a file for error messages by its name and type.
 * @param {Blob} file the file
 * @returns {string} for example `lecture.m4a (audio/mp4)`
 */
function describeFile(file) {
  const name = typeof file.name === 'string' && file.name !== '' ? file.name : 'the file'
  return `${name} (${file.type || 'unknown type'})`
}

/**
 * read an audio file and resample it to 16 kHz mono for whisper.
 * the browser decodes the file at its default rate, the channels are mixed with `mixToMono`,
 * and an OfflineAudioContext resamples the result.
 * @param {Blob} file the uploaded File
 * @returns {Promise<{ samples: Float32Array, durationSeconds: number }>} mono samples at 16 kHz
 *   and the length of the audio
 * @throws {TypeError} when file is not a Blob
 * @throws {AudioDecodeError} when the browser cannot decode the file or it holds no audio
 */
export async function decodeAudioFile(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError(`decodeAudioFile needs a File or Blob, got ${String(file)}`)
  }
  const bytes = await file.arrayBuffer()

  // decode to the context's rate, usually 44.1 or 48 kHz. the context is only used for decoding,
  // so close it after.
  const context = new AudioContext()
  let decoded
  try {
    decoded = await context.decodeAudioData(bytes)
  } catch (error) {
    throw new AudioDecodeError(`could not read ${describeFile(file)} as audio`, { cause: error })
  } finally {
    await context.close()
  }
  if (decoded.length === 0) {
    throw new AudioDecodeError(`${describeFile(file)} has no audio in it`)
  }

  // mix to one channel at the original rate, then let an offline context resample it
  const channels = []
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    channels.push(decoded.getChannelData(channel))
  }
  const mono = mixToMono(channels)
  const length = Math.ceil(decoded.duration * whisperSampleRate)
  const offline = new OfflineAudioContext(1, length, whisperSampleRate)
  const monoBuffer = offline.createBuffer(1, mono.length, decoded.sampleRate)
  monoBuffer.copyToChannel(mono, 0)
  const source = offline.createBufferSource()
  source.buffer = monoBuffer
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()

  return { samples: rendered.getChannelData(0), durationSeconds: decoded.duration }
}
