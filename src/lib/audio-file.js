// helpers for a picked audio file: its length from the browser's metadata, and a title from its name

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
