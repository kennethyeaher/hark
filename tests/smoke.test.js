// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
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

  it('redraws the sidebar and page with new data without moving focus', () => {
    const root = document.querySelector('#app')
    const course = {
      id: 'hcim605',
      code: 'HCIM 605',
      name: 'Qualitative Research Methods',
      color: 'indigo',
      recordingCount: 0,
      totalSeconds: 0,
    }
    app = mountApp(root, { courses: [course], recordings: [] })
    app.showRoute({ name: 'home', params: {}, query: {} })
    root.querySelector('.app-sidebar a[href="#/course/hcim605"]').focus()

    app.updateData({ courses: [{ ...course, recordingCount: 3 }], recordings: [] })

    const link = root.querySelector('.app-sidebar a[href="#/course/hcim605"]')
    expect(link.textContent).toContain('3')
    expect(document.activeElement).toBe(link)
    expect(root.querySelector('.course-folder').textContent).toContain('3 recordings')
    expect(link.getAttribute('aria-current')).toBeNull()
  })

  it('moves focus to the content when the focused element is gone after a redraw', () => {
    const root = document.querySelector('#app')
    app = mountApp(root, { onLoadSamples: async () => {} })
    app.showRoute({ name: 'home', params: {}, query: {} })
    app.content.querySelector('button').focus()

    app.updateData({
      courses: [
        {
          id: 'hcim605',
          code: 'HCIM 605',
          name: 'Qualitative Research Methods',
          color: 'indigo',
          recordingCount: 0,
          totalSeconds: 0,
        },
      ],
      recordings: [],
    })

    expect(app.content.textContent).not.toContain('No lectures yet')
    expect(document.activeElement).toBe(app.content)
  })

  it('rejects updateData without arrays', () => {
    app = mountApp(document.querySelector('#app'))
    expect(() => app.updateData({ courses: [] })).toThrow(/arrays/)
  })

  it('throws a clear error when the root is missing', () => {
    expect(() => mountApp(null)).toThrow(/root element/)
  })

  it('rejects a value that is not an element', () => {
    expect(() => mountApp('#app')).toThrow(/got #app/)
  })
})

// jsdom has no showModal, so the sheet tests stand in for it with the open attribute
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close() {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

describe('the new recording sheet route', () => {
  let app
  const course = {
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
    recordingCount: 0,
    totalSeconds: 0,
  }
  const newRoute = { name: 'new', params: {}, query: {} }

  beforeEach(() => {
    window.location.hash = '#/trash'
    document.body.innerHTML = '<div id="app"></div>'
  })

  afterEach(() => {
    app?.stopRouter()
    app = undefined
  })

  it('opens over the page that was showing and marks the New button current', () => {
    app = mountApp(document.querySelector('#app'), { courses: [course] })
    const page = app.content.firstElementChild

    const sheet = app.showRoute(newRoute)
    expect(sheet.tagName).toBe('DIALOG')
    expect(sheet.open).toBe(true)
    expect(app.content.firstElementChild).toBe(page)
    expect(app.content.querySelector('h1').textContent).toBe('Trash')
    expect(document.querySelector('.sidebar-new-button').getAttribute('aria-current')).toBe('page')
    expect(document.title).toBe('New recording · Hark')
  })

  it('shows Home under the sheet on a first load at the new route', () => {
    window.location.hash = '#/new'
    app = mountApp(document.querySelector('#app'), { courses: [course] })
    expect(document.querySelector('dialog.sheet').open).toBe(true)
    expect(app.content.querySelector('.page-home, h1')).not.toBeNull()
  })

  it('preselects the course named in the route', () => {
    app = mountApp(document.querySelector('#app'), {
      courses: [course, { ...course, id: 'inst630', code: 'INST 630', color: 'teal' }],
    })
    const sheet = app.showRoute({ name: 'new', params: {}, query: { course: 'inst630' } })
    const checked = sheet.querySelector('input[name="new-recording-course"]:checked')
    expect(checked.value).toBe('inst630')
  })

  it('goes back to the page under it when dismissed and returns focus to New', () => {
    const navigate = vi.fn()
    app = mountApp(document.querySelector('#app'), { courses: [course], navigate })
    const sheet = app.showRoute(newRoute)

    sheet.querySelector('.sheet-close').click()
    expect(navigate).toHaveBeenCalledWith('#/trash')

    // the router follows the hash change back to the page under the sheet
    app.showRoute({ name: 'trash', params: {}, query: {} })
    expect(document.querySelector('dialog.sheet')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('.sidebar-new-button'))
    expect(document.querySelector('.sidebar-new-button').hasAttribute('aria-current')).toBe(false)
  })

  it('treats a close by the browser as a dismissal', () => {
    const navigate = vi.fn()
    app = mountApp(document.querySelector('#app'), { courses: [course], navigate })
    app.showRoute(newRoute).close()
    expect(navigate).toHaveBeenCalledWith('#/trash')
  })

  it('closes without moving focus to New when another route takes over', () => {
    app = mountApp(document.querySelector('#app'), { courses: [course], navigate: vi.fn() })
    app.showRoute(newRoute)
    app.showRoute({ name: 'settings', params: {}, query: {} })
    expect(document.querySelector('dialog.sheet')).toBeNull()
    expect(document.activeElement).toBe(app.content.querySelector('h1'))
  })

  it('keeps the sheet and its state when the data reloads', () => {
    app = mountApp(document.querySelector('#app'), { courses: [course], navigate: vi.fn() })
    const sheet = app.showRoute(newRoute)
    app.updateData({ courses: [{ ...course, recordingCount: 1 }], recordings: [] })
    expect(document.querySelector('dialog.sheet')).toBe(sheet)
    expect(document.querySelector('.sidebar-new-button').getAttribute('aria-current')).toBe('page')
  })
})
