// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHome } from '../src/pages/home.js'
import { renderRecordingTable } from '../src/components/recording-table.js'
import { renderRecordingStatus } from '../src/components/recording-status.js'
import { buildSampleView } from './sample-library.js'

// a fixed afternoon so every sample date lands on a known label
const now = new Date(2026, 9, 28, 15)
const { courses: sampleCourses, recordings } = buildSampleView(now)
const context = { courses: sampleCourses, recordings, now }

/**
 * get the trimmed text of every element that matches a selector.
 * @param {ParentNode} root where to search
 * @param {string} selector css selector
 * @returns {string[]} text content of each match
 */
function textsOf(root, selector) {
  return [...root.querySelectorAll(selector)].map((element) => element.textContent.trim())
}

describe('renderHome in grid view', () => {
  const page = renderHome({}, { ...context, view: 'grid' })

  it('has one h1 and the three section headings', () => {
    expect(textsOf(page, 'h1')).toEqual(['Home'])
    expect(textsOf(page, 'h2')).toEqual(['Quick access', 'Courses', 'Recent'])
  })

  it('shows the four most recent recordings as cards', () => {
    expect(textsOf(page, '.recording-card-title')).toEqual([
      'Week 9 · Thematic analysis',
      'Lecture 17 · Client-side ML',
      'Guest talk · Design ethics',
      'Week 8 · Interview protocols',
    ])
  })

  it('links See all and Manage with names that make sense alone', () => {
    const [seeAll, manage] = page.querySelectorAll('.section-link')
    expect(seeAll.getAttribute('href')).toBe('#/recordings')
    expect(seeAll.textContent).toBe('See all recordings')
    expect(manage.getAttribute('href')).toBe('#/settings')
    expect(manage.textContent).toBe('Manage courses')
  })

  it('shows one folder per course', () => {
    expect(page.querySelectorAll('.course-folder')).toHaveLength(4)
  })

  it('lists the six most recent recordings in a captioned table with the mock columns', () => {
    const table = page.querySelector('.home-section:last-child table')
    expect(table.querySelector('caption').textContent).toBe('Recent recordings')
    expect(textsOf(table, 'thead th')).toEqual(['Name', 'Course', 'Length', 'Date', 'Status'])
    expect(table.querySelectorAll('tbody tr')).toHaveLength(6)

    const firstRow = textsOf(table, 'tbody tr:first-child > *')
    expect(firstRow).toEqual([
      'Week 9 · Thematic analysis',
      'HCIM 605',
      '1 hr 14 min',
      'Today',
      'Summarized',
    ])
    expect(textsOf(table, 'tbody tr:nth-child(3) td')[2]).toBe('Yesterday')
    expect(textsOf(table, 'tbody tr:nth-child(4) td')[2]).toBe('Oct 21')
  })

  it('shows the transcribed sample as a status with no progress bar', () => {
    const table = page.querySelector('.home-section:last-child table')
    expect(table.querySelector('[role="progressbar"]')).toBeNull()
    const row = [...table.querySelectorAll('tbody tr')].find((tableRow) =>
      tableRow.textContent.includes('Lecture 17 · Client-side ML')
    )
    expect(row.lastElementChild.textContent).toBe('Transcribed')
  })
})

describe('renderHome in list view', () => {
  it('shows quick access as table rows instead of cards', () => {
    const page = renderHome({}, { ...context, view: 'list' })
    expect(page.querySelector('.recording-card')).toBeNull()
    const quickTable = page.querySelectorAll('.home-section')[0].querySelector('table')
    expect(quickTable.querySelector('caption').textContent).toBe('Quick access recordings')
    expect(quickTable.querySelectorAll('tbody tr')).toHaveLength(4)
  })
})

describe('renderHome with no data', () => {
  /**
   * render the empty home page with an optional sample action.
   * @param {() => Promise<void>} [onLoadSamples] action behind the sample button
   * @returns {HTMLElement} the page
   */
  function renderEmpty(onLoadSamples) {
    return renderHome({}, { courses: [], recordings: [], view: 'grid', now, onLoadSamples })
  }

  it('shows one visible heading, the storage line, and the sample button', () => {
    const page = renderEmpty(async () => {})
    expect(textsOf(page, 'h2')).toEqual(['No lectures yet'])
    expect(page.querySelector('h1').className).toBe('visually-hidden')
    expect(page.textContent).toContain('Recordings stay in this browser')
    const button = page.querySelector('button')
    expect(button.textContent).toBe('Try with sample lectures')
    expect(button.getAttribute('type')).toBe('button')
    expect(page.querySelectorAll('.recording-card, .course-folder, table')).toHaveLength(0)
  })

  it('calls the sample action once, even on a double click', async () => {
    let finish
    const onLoadSamples = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const page = renderEmpty(onLoadSamples)
    const button = page.querySelector('button')
    button.click()
    button.click()
    expect(onLoadSamples).toHaveBeenCalledTimes(1)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(page.querySelector('[role="status"]').textContent).toContain('Adding')
    finish()
    await vi.waitFor(() => expect(button.hasAttribute('aria-disabled')).toBe(false))
    expect(page.querySelector('[role="status"]').textContent).toBe('')
  })

  it('shows the reason on screen when the samples fail to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const page = renderEmpty(() => Promise.reject(new Error('quota exceeded')))
    page.querySelector('button').click()
    const status = page.querySelector('[role="status"]')
    await vi.waitFor(() => expect(status.textContent).toContain('quota exceeded'))
    expect(status.classList.contains('is-error')).toBe(true)
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('shows the full page when there are courses but no recordings', () => {
    const page = renderHome({}, { courses: sampleCourses, recordings: [], view: 'grid', now })
    expect(page.querySelectorAll('.course-folder')).toHaveLength(4)
    expect(page.textContent).not.toContain('No lectures yet')
  })

  it('rejects missing arrays and an action that is not a function', () => {
    expect(() => renderHome({}, { view: 'grid' })).toThrow(/arrays/)
    expect(() => renderEmpty('seed')).toThrow(/onLoadSamples to be a function/)
  })
})

describe('recording table', () => {
  it('links each name to its recording and hides the icon and dot', () => {
    const table = renderRecordingTable({
      recordings: recordings.slice(0, 1),
      courses: sampleCourses,
      caption: 'Test',
      now,
    })
    const link = table.querySelector('tbody a')
    expect(link.getAttribute('href')).toBe('#/recording/week9-thematic-analysis')
    expect(table.querySelector('.recording-icon').getAttribute('aria-hidden')).toBe('true')
    expect(table.querySelector('.recording-table-dot').getAttribute('aria-hidden')).toBe('true')
  })

  it('throws when a recording points to a missing course', () => {
    expect(() => renderRecordingTable({ recordings, courses: [], caption: 'Test', now })).toThrow(
      /missing course hcim605/
    )
  })

  it('needs a caption', () => {
    expect(() => renderRecordingTable({ recordings: [], courses: [], caption: ' ' })).toThrow(
      /caption/
    )
  })

  it('rejects an unknown status and progress outside 0 to 1', () => {
    expect(() => renderRecordingStatus({ title: 'x', status: 'archived' })).toThrow(/unknown/)
    expect(() =>
      renderRecordingStatus({ title: 'x', status: 'transcribing', progress: 1.5 })
    ).toThrow(/0 to 1/)
  })
})
