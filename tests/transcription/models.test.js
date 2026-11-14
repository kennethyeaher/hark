import { describe, expect, it } from 'vitest'
import { defaultModelKey, getModel, transcriptionModels } from '../../src/transcription/models.js'
import { recordingModels } from '../../src/data/recordings.js'

describe('transcription models', () => {
  it('maps each choice to its whisper model', () => {
    expect(getModel('fast').modelId).toBe('onnx-community/whisper-tiny')
    expect(getModel('balanced').modelId).toBe('onnx-community/whisper-base')
    expect(getModel('accurate').modelId).toBe('onnx-community/whisper-small')
  })

  it('gives each choice a label and a speed factor that grows with model size', () => {
    expect(Object.values(transcriptionModels).map((model) => model.label)).toEqual([
      'Fast',
      'Balanced',
      'Accurate',
    ])
    expect(Object.values(transcriptionModels).map((model) => model.name)).toEqual([
      'Whisper tiny',
      'Whisper base',
      'Whisper small',
    ])
    const factors = ['fast', 'balanced', 'accurate'].map(
      (key) => getModel(key).secondsPerAudioSecond
    )
    expect(factors).toEqual([0.09, 0.15, 0.61])
  })

  it('matches the model keys a recording can store, with balanced as the default', () => {
    expect(Object.keys(transcriptionModels)).toEqual(recordingModels)
    expect(defaultModelKey).toBe('balanced')
  })

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(transcriptionModels)).toBe(true)
    expect(Object.isFrozen(getModel('fast'))).toBe(true)
  })

  it.each(['large', '', undefined, 'toString'])('throws on the unknown key %j', (key) => {
    expect(() => getModel(key)).toThrow(RangeError)
    expect(() => getModel(key)).toThrow(/model must be one of fast, balanced, accurate/)
  })
})
