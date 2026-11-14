// the three whisper model choices offered when a recording is transcribed

/**
 * each choice names its hugging face model, the label shown in the ui, the model name shown
 * under it, the size of its q8 download in megabytes, and how many seconds of work one second
 * of audio takes. the speed factors were measured in headless chrome on a mac from the moment
 * the model is ready, rounded up so the estimate leans long: balanced on a 52 minute librivox
 * recording, fast and accurate on a 50 second file.
 */
export const transcriptionModels = Object.freeze({
  fast: Object.freeze({
    key: 'fast',
    downloadMegabytes: 45,
    name: 'Whisper tiny',
    label: 'Fast',
    modelId: 'onnx-community/whisper-tiny',
    secondsPerAudioSecond: 0.09,
  }),
  balanced: Object.freeze({
    key: 'balanced',
    downloadMegabytes: 80,
    name: 'Whisper base',
    label: 'Balanced',
    modelId: 'onnx-community/whisper-base',
    secondsPerAudioSecond: 0.15,
  }),
  accurate: Object.freeze({
    key: 'accurate',
    downloadMegabytes: 253,
    name: 'Whisper small',
    label: 'Accurate',
    modelId: 'onnx-community/whisper-small',
    secondsPerAudioSecond: 0.61,
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
