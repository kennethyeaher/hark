// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountApp } from '../src/app/app.js'

// smoke test: the shell mounts once and only the content region changes per route
describe('mountApp', () => {
  let app

  beforeEach(() => {
    window.location.hash = ''
    document.body.innerHTML = '<div id="app"></div>'
  })

  afterEach(() => {
    app?.stopRouter()
    app = undefined
  })

  it('builds the sidebar slot, top bar slot, and main content region', () => {
    const root = document.querySelector('#app')
    app = mountApp(root)

    expect(root.querySelector('.app-sidebar')).not.toBeNull()
    expect(root.querySelector('header.app-topbar')).not.toBeNull()
    expect(app.content.tagName).toBe('MAIN')
    expect(app.content.id).toBe('content')
  })

  it('replaces whatever was in the root before', () => {
    const root = document.querySelector('#app')
    root.innerHTML = '<p>old content</p>'
    app = mountApp(root)

    expect(root.children).toHaveLength(1)
    expect(root.textContent).not.toContain('old content')
  })

  it('swaps only the content when the route changes', () => {
    const root = document.querySelector('#app')
    app = mountApp(root)
    const sidebar = root.querySelector('.app-sidebar')

    app.showRoute({ name: 'settings', params: {}, query: {} })

    expect(root.querySelector('.app-sidebar')).toBe(sidebar)
    expect(app.content.querySelector('h1').textContent).toBe('Settings')
    expect(app.content.textContent).toContain('Coming in a later milestone.')
  })

  it('marks the sidebar link for the current route', () => {
    const root = document.querySelector('#app')
    app = mountApp(root, {
      courses: [
        {
          id: 'hcim605',
          code: 'HCIM 605',
          name: 'Qualitative Research Methods',
          color: 'indigo',
          recordingCount: 12,
          totalSeconds: 34800,
        },
      ],
    })
    app.showRoute({ name: 'course', params: { id: 'hcim605' }, query: {} })

    const current = root.querySelectorAll('.app-sidebar [aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('#/course/hcim605')
  })

  it('puts the search query in the top bar on a search route', () => {
    const root = document.querySelector('#app')
    app = mountApp(root)
    const input = root.querySelector('header [role="search"] input')

    app.showRoute({ name: 'search', params: {}, query: { q: 'bias' } })
    expect(input.value).toBe('bias')

    app.showRoute({ name: 'home', params: {}, query: {} })
    expect(input.value).toBe('')
  })

  it('sets the document title and focuses the page heading', () => {
    app = mountApp(document.querySelector('#app'))
    app.showRoute({ name: 'trash', params: {}, query: {} })

    const heading = app.content.querySelector('h1')
    expect(document.title).toBe('Trash · Hark')
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('leaves focus alone on first load', () => {
    app = mountApp(document.querySelector('#app'))
    expect(document.activeElement).toBe(document.body)
    expect(document.title).toBe('Home · Hark')
  })

  it('shows the not found page for an unknown route', () => {
    app = mountApp(document.querySelector('#app'))
    app.showRoute({ name: 'notFound', params: { path: '/nowhere' }, query: {} })

    expect(document.title).toBe('Page not found · Hark')
    expect(app.content.textContent).toContain('/nowhere')
  })

  it('follows real hash changes', () => {
    app = mountApp(document.querySelector('#app'))
    window.location.hash = '#/starred'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(app.content.querySelector('h1').textContent).toBe('Starred')
  })

  it('has a skip link that moves focus to main without changing the route', () => {
    window.location.hash = '#/trash'
    const root = document.querySelector('#app')
    app = mountApp(root)
    const skipLink = root.querySelector('.skip-link')

    expect(root.querySelector('.app-shell').firstElementChild).toBe(skipLink)
    skipLink.click()
    expect(document.activeElement).toBe(app.content)
    expect(window.location.hash).toBe('#/trash')
  })

  it('throws a clear error when the root is missing', () => {
    expect(() => mountApp(null)).toThrow(/root element/)
  })

  it('rejects a value that is not an element', () => {
    expect(() => mountApp('#app')).toThrow(/got #app/)
  })
})
