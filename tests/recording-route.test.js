// @vitest-environment jsdom
// the Recording page through the real router and the seeded store, from every way in
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFreshDatabase } from './data/fresh-database.js'
import { mountApp } from '../src/app/app.js'
import { seedSampleLibrary } from '../src/data/seed.js'
import { loadLibrary } from '../src/data/library.js'
import { renderTranscribing } from '../src/pages/transcribing.js'

const week9 = 'week9-thematic-analysis'

/**
 * change the hash and wait for the router to show the route.
 * @param {string} hash the target, such as `#/`
 * @returns {Promise<void>} resolves after the hashchange event has run
 */
async function go(hash) {
  window.location.hash = hash
  await new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }))
}

describe('opening a recording', () => {
  let app
  let library

  beforeEach(async () => {
    await useFreshDatabase()
    await seedSampleLibrary(new Date(2026, 10, 14, 12, 0))
    library = await loadLibrary()
    document.body.innerHTML = '<div id="app"></div>'
    app = mountApp(document.querySelector('#app'), library)
    await go('#/')
  })

  afterEach(async () => {
    await go('#/done')
    app.stopRouter()
  })

  it('shows the seeded sample with its transcript, note, and moments, titled for the page', async () => {
    await go(`#/recording/${week9}`)
    const heading = app.content.querySelector('h1')
    expect(heading.textContent).toBe('Week 9 · Thematic analysis')
    expect(document.title).toBe('Week 9 · Thematic analysis · Hark')
    expect(document.activeElement).toBe(heading)
    await vi.waitFor(() => expect(app.content.querySelectorAll('.transcript-row')).toHaveLength(10))
    await vi.waitFor(() => expect(app.content.querySelectorAll('.moment-row')).toHaveLength(3))
    await vi.waitFor(() =>
      expect(app.content.querySelector('.notes-field')?.value).toContain('NVivo')
    )
    expect(app.content.querySelector('.player-message').textContent).toBe(
      'Audio for sample lectures is not on this device.'
    )
  })

  it('lands here from a recording card and from a table row', async () => {
    const cardLink = app.content.querySelector(`a[href="#/recording/${week9}"]`)
    expect(cardLink).not.toBeNull()
    cardLink.click()
    await vi.waitFor(() =>
      expect(app.content.querySelector('.recording-title')?.textContent).toBe(
        'Week 9 · Thematic analysis'
      )
    )

    await go('#/course/hcim605')
    const links = [...app.content.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(links).toContain(`#/recording/${week9}`)
  })

  it('lands here from the Transcribing card of a finished recording', () => {
    const page = renderTranscribing({ id: week9 }, { ...library, countSegments: async () => 10 })
    expect(page.querySelector('a.button-primary').getAttribute('href')).toBe(`#/recording/${week9}`)
  })

  it('keeps the same page through a library reload and shows the new star', async () => {
    await go(`#/recording/${week9}`)
    const page = app.content.firstElementChild
    const next = library.recordings.map((recording) =>
      recording.id === week9 ? { ...recording, isStarred: false } : recording
    )
    app.updateData({ courses: library.courses, recordings: next })
    expect(app.content.firstElementChild).toBe(page)
    expect(page.querySelector('.recording-star').getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the not found page for an id that is not in the store', async () => {
    await go('#/recording/nope')
    await vi.waitFor(() => expect(app.content.textContent).toMatch(/not found/i))
  })
})
