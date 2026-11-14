import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// the onnx runtime files ship inside transformers.js, but its package exports block a direct
// import, so each file gets an alias that points at the dist folder
const transformersDist = fileURLToPath(
  new URL('./node_modules/@huggingface/transformers/dist/', import.meta.url)
)

// github pages serves the site from /hark/, so every asset path needs that prefix
export default defineConfig({
  base: '/hark/',
  resolve: {
    alias: [
      {
        find: /^onnx-runtime-wasm(?=\?|$)/,
        replacement: `${transformersDist}ort-wasm-simd-threaded.jsep.wasm`,
      },
      {
        find: /^onnx-runtime-loader(?=\?|$)/,
        replacement: `${transformersDist}ort-wasm-simd-threaded.jsep.mjs`,
      },
    ],
  },
})
