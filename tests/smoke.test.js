// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mountApp } from '../src/app/app.js'

// smoke test: the app shell mounts into a real dom and shows the placeholder
describe('mountApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('renders a main element with the app name', () => {
    const root = document.querySelector('#app')
    const main = mountApp(root)

    expect(main.tagName).toBe('MAIN')
    expect(root.querySelector('main')?.textContent).toBe('Hark')
  })

  it('replaces whatever was in the root before', () => {
    const root = document.querySelector('#app')
    root.innerHTML = '<p>old content</p>'
    mountApp(root)

    expect(root.children).toHaveLength(1)
    expect(root.querySelector('p')).toBeNull()
  })

  it('throws a clear error when the root is missing', () => {
    expect(() => mountApp(null)).toThrow(/root element/)
  })

  it('rejects a value that is not an element', () => {
    expect(() => mountApp('#app')).toThrow(/got #app/)
  })
})
