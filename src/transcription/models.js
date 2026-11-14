// the three whisper model choices offered when a recording is transcribed

/**
 * each choice names its hugging face model, the label shown in the ui, the model name shown
 * under it, the size of its q8 download in megabytes, and how many seconds of work one second
 * of audio takes. the speed factors are first guesses for the browser, tuned once real files
 * run there.
 */
export const transcriptionModels = Object.freeze({
  fast: Object.freeze({
    key: 'fast',
    downloadMegabytes: 41,
    name: 'Whisper tiny',
    label: 'Fast',
    modelId: 'onnx-community/whisper-tiny',
    secondsPerAudioSecond: 0.15,
  }),
  balanced: Object.freeze({
    key: 'balanced',
    downloadMegabytes: 80,
    name: 'Whisper base',
    label: 'Balanced',
    modelId: 'onnx-community/whisper-base',
    secondsPerAudioSecond: 0.3,
  }),
  accurate: Object.freeze({
    key: 'accurate',
    downloadMegabytes: 250,
    name: 'Whisper small',
    label: 'Accurate',
    modelId: 'onnx-community/whisper-small',
    secondsPerAudioSecond: 0.9,
  }),
})

/** the model used when a recording does not name one */
export const defaultModelKey = 'balanced'

/**
 * look up one model choice by its key.
 * @param {string} key `fast`, `balanced`, or `accurate`
 * @returns {{ key: string, label: string, name: string, modelId: string,
 *   downloadMegabytes: number, secondsPerAudioSecond: number }}
 *   the model choice
 * @throws {RangeError} when the key is not one of the three choices
 */
export function getModel(key) {
  if (!Object.hasOwn(transcriptionModels, key)) {
    const keys = Object.keys(transcriptionModels).join(', ')
    throw new RangeError(`model must be one of ${keys}, got ${String(key)}`)
  }
  return transcriptionModels[key]
}
