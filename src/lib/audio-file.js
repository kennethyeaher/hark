// helpers for a picked audio file: whether hark takes it, its length from the browser's metadata,
// and a title from its name

/** the extensions the picker lists, for files the browser gives no audio type */
export const audioExtensions = ['.m4a', '.mp3', '.wav', '.webm', '.ogg']

/** the longest recording hark takes, in seconds */
export const maxAudioSeconds = 3 * 60 * 60

/**
 * describe the length limit in words for the sheet.
 * @param {number} [seconds] the limit in seconds
 * @returns {string} for example `3 hours` or `90 minutes`
 * @throws {RangeError} when seconds is not a positive whole number of minutes
 */
export function describeAudioLimit(seconds = maxAudioSeconds) {
  if (!Number.isInteger(seconds / 60) || seconds <= 0) {
    throw new RangeError(`the limit must be a positive whole number of minutes, got ${seconds}`)
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${seconds / 60} minutes`
}

/**
 * check whether a file looks like audio, by its type or, when the browser gives no audio type,
 * by its extension.
 * @param {{ name: string, type: string }} file the picked file
 * @returns {boolean} true when the type starts with audio/ or the name ends in a listed extension
 * @throws {TypeError} when file has no string name or type
 */
export function isAudioFile(file) {
  if (typeof file?.name !== 'string' || typeof file?.type !== 'string') {
    throw new TypeError(`isAudioFile needs a file with a name and type, got ${String(file)}`)
  }
  if (file.type.startsWith('audio/')) return true
  const name = file.name.toLowerCase()
  return audioExtensions.some((extension) => name.endsWith(extension))
}

/**
 * turn a file name into a recording title: the extension goes, and dashes and underscores
 * become spaces.
 * @param {string} fileName name such as `lecture-18_qualitative-coding.m4a`
 * @returns {string} a title such as `lecture 18 qualitative coding`, or `Untitled recording`
 *   when nothing is left
 * @throws {TypeError} when fileName is not a string
 */
export function buildRecordingTitle(fileName) {
  if (typeof fileName !== 'string') {
    throw new TypeError(`buildRecordingTitle needs a file name, got ${String(fileName)}`)
  }
  // a leading dot is a hidden file name, not an extension
  const extensionIndex = fileName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const title = baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return title === '' ? 'Untitled recording' : title
}

/**
 * read the length of an audio file from an audio element's metadata, without decoding it.
 * the object url is revoked once the length is known or reading fails.
 * @param {Blob} file the picked file
 * @param {{ createAudioElement?: () => HTMLAudioElement, timeoutMilliseconds?: number }}
 *   [options] how to make the audio element, and how long to wait for metadata
 * @returns {Promise<number>} the length in seconds
 * @throws {TypeError} when file is not a Blob
 * @throws {Error} when the browser cannot read the metadata, the length is not a positive
 *   number, or reading takes longer than the timeout
 */
export function readAudioDuration(
  file,
  { createAudioElement = () => document.createElement('audio'), timeoutMilliseconds = 15000 } = {}
) {
  if (!(file instanceof Blob)) {
    throw new TypeError(`readAudioDuration needs a File or Blob, got ${String(file)}`)
  }
  return new Promise((resolve, reject) => {
    const audio = createAudioElement()
    const url = URL.createObjectURL(file)
    let isDone = false

    /**
     * settle once, then release the element and the object url.
     * @param {Error | null} error the failure, or null on success
     * @param {number} [seconds] the length on success
     * @returns {void}
     */
    const finish = (error, seconds) => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve(seconds)
    }

    /**
     * accept the length when it is a real positive number.
     * @returns {boolean} true when the length was accepted
     */
    const acceptDuration = () => {
      if (!Number.isFinite(audio.duration)) return false
      if (audio.duration > 0) finish(null, audio.duration)
      else finish(new Error('the file reports a length of zero'))
      return true
    }

    const timer = setTimeout(
      () => finish(new Error('the browser took too long to read the file length')),
      timeoutMilliseconds
    )
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      if (acceptDuration()) return
      // files from some recorders report an endless length until the browser seeks to the end
      audio.addEventListener('durationchange', acceptDuration)
      audio.currentTime = Number.MAX_SAFE_INTEGER
    })
    audio.addEventListener('error', () => {
      finish(new Error(`the browser could not read the file: ${audio.error?.message || 'unknown'}`))
    })
    audio.src = url
  })
}
