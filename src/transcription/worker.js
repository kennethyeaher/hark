// the module worker that runs whisper off the main thread. all logic lives in transcriber.js.

import { env, pipeline } from '@huggingface/transformers'
import { createTranscriber } from './transcriber.js'

// models come only from the hugging face hub and stay in the browser cache after the first visit
env.allowLocalModels = false
env.useBrowserCache = true

const transcriber = createTranscriber({
  /**
   * build a speech recognition pipeline for one model.
   * @param {string} modelId hugging face model id
   * @param {object} options pipeline options, including device and progress_callback
   * @returns {Promise<Function>} the pipeline
   */
  loadPipeline: (modelId, options) => pipeline('automatic-speech-recognition', modelId, options),
  /**
   * send a message to the page.
   * @param {object} message message to send
   * @returns {void}
   */
  post: (message) => self.postMessage(message),
})

self.onmessage = (event) => transcriber.handleMessage(event.data)
