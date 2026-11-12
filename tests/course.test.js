// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderCourse } from '../src/pages/course.js'
import { sampleCourses, buildSampleRecordings } from '../src/data/sample.js'

// a fixed afternoon so the week filter and the dates are stable
const now = new Date(2026, 9, 28, 15)
const context = { courses: sampleCourses, recordings: buildSampleRecordings(now), now }

/**
 * Render the HCIM 605 page in a view.
 * @param {'grid' | 'list'} view grid or list
 * @returns {HTMLElement} the page
 */
function renderHcim(view = 'grid') {
  return renderCourse({ id: 'hcim605' }, { ...context, view })
}

/**
 * Get the titles of the cards on a page, in order.
 * @param {HTMLElement} page the course page
 * @returns {string[]} card titles
 */
function cardTitles(page) {
  return [...page.querySelectorAll('.recording-card-title')].map((title) => title.textContent)
}

/**
 * Click the chip with the given label.
 * @param {HTMLElement} page the course page
 * @param {string} label chip text
 * @returns {HTMLButtonElement} the chip
 */
function clickChip(page, label) {
  const chip = [...page.querySelectorAll('.chip')].find((button) => button.textContent === label)
  chip.click()
  return chip
}

describe('course header', () => {
  const page = renderHcim()

  it('shows the code as the h1 with the name, count, and total length', () => {
    expect(page.querySelector('h1').textContent).toBe('HCIM 605')
    const meta = page.querySelector('.course-header-meta').textContent
    expect(meta).toContain('Qualitative Research Methods')
    expect(meta).toContain('12 recordings')
    expect(meta).toContain('9 hr 40 min')
  })

  it('links New recording to the new route', () => {
    const button = page.querySelector('.button-primary')
    expect(button.getAttribute('href')).toBe('#/new')
    expect(button.textContent).toBe('New recording')
  })
})

describe('course recordings', () => {
  it('shows only this course, newest first, with dates in the meta line', () => {
    const page = renderHcim()
    const titles = cardTitles(page)
    expect(titles).toHaveLength(8)
    expect(titles[0]).toBe('Week 9 · Thematic analysis')
    expect(titles.at(-1)).toBe('Week 3 · Literature review')
    expect(titles).not.toContain('Lecture 17 · Client-side ML')
    expect(page.querySelector('.recording-card-meta').textContent).toContain('Today')
  })

  it('has five chips in a labeled group with All pressed', () => {
    const page = renderHcim()
    const group = page.querySelector('[role="group"]')
    expect(group.getAttribute('aria-label')).toBe('Filter recordings')
    const pressed = [...group.querySelectorAll('[aria-pressed="true"]')]
    expect(pressed.map((chip) => chip.textContent)).toEqual(['All'])
    expect(group.querySelectorAll('button')).toHaveLength(5)
  })

  it('keeps exactly one chip pressed and filters the cards', () => {
    const page = renderHcim()
    const starred = clickChip(page, 'Starred')
    expect(starred.getAttribute('aria-pressed')).toBe('true')
    expect(page.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(1)
    expect(cardTitles(page)).toEqual(['Week 9 · Thematic analysis', 'Week 6 · Ethics and consent'])

    clickChip(page, 'This week')
    expect(cardTitles(page)).toEqual(['Week 9 · Thematic analysis'])

    clickChip(page, 'Has notes')
    expect(cardTitles(page)).toHaveLength(3)
  })

  it('announces the count in a status region', () => {
    const page = renderHcim()
    clickChip(page, 'Starred')
    expect(page.querySelector('[role="status"]').textContent).toBe('2 recordings shown')
  })

  it('sorts oldest first when the sort changes', () => {
    const page = renderHcim()
    const select = page.querySelector('select')
    expect(page.querySelector(`label[for="${select.id}"]`).textContent).toBe('Sort:')
    select.value = 'oldest'
    select.dispatchEvent(new Event('change'))
    expect(cardTitles(page)[0]).toBe('Week 3 · Literature review')
  })

  it('shows one plain line when a filter matches nothing', () => {
    const page = renderCourse({ id: 'inst711' }, { ...context, view: 'grid' })
    clickChip(page, 'Starred')
    expect(page.querySelector('.course-results').textContent).toBe(
      'No recordings match this filter.'
    )
  })

  it('uses the recording table in list view', () => {
    const page = renderHcim('list')
    expect(page.querySelector('.recording-card')).toBeNull()
    expect(page.querySelector('caption').textContent).toBe('HCIM 605 recordings')
    expect(page.querySelectorAll('tbody tr')).toHaveLength(8)
  })
})

describe('unknown course', () => {
  it('renders the not found page', () => {
    const page = renderCourse({ id: 'math101' }, { ...context, view: 'grid' })
    expect(page.querySelector('h1').textContent).toBe('Page not found')
    expect(page.textContent).toContain('/course/math101')
  })

  it('rejects missing arrays', () => {
    expect(() => renderCourse({ id: 'hcim605' }, { view: 'grid' })).toThrow(/arrays/)
  })
})
