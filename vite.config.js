import { defineConfig } from 'vite'

// github pages serves the site from /hark/, so every asset path needs that prefix
export default defineConfig({
  base: '/hark/',
})
