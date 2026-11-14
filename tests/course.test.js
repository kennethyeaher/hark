// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderCourse, clearCourseChoices } from '../src/pages/course.js'
import { buildSampleView } from './sample-library.js'

// a fixed afternoon so the week filter and the dates are stable
const now = new Date(2026, 9, 28, 15)
const { courses: sampleCourses, recordings } = buildSampleView(now)
const context = { courses: sampleCourses, recordings, now }

beforeEach(() => clearCourseChoices())

/**
 * render the HCIM 605 page in a view.
 * @param {'grid' | 'list'} view grid or list
 * @returns {HTMLElement} the page
 */
function renderHcim(view = 'grid') {
  return renderCourse({ id: 'hcim605' }, { ...context, view })
}

/**
 * get the titles of the cards on a page, in order.
 * @param {HTMLElement} page the course page
 * @returns {string[]} card titles
 */
function cardTitles(page) {
  return [...page.querySelectorAll('.recording-card-title')].map((title) => title.textContent)
}

/**
 * click the chip with the given label.
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

  it('shows the code as the h1 with the name, and the count and length computed from recordings', () => {
    expect(page.querySelector('h1').textContent).toBe('HCIM 605')
    const meta = page.querySelector('.course-header-meta').textContent
    expect(meta).toContain('Qualitative Research Methods')
    expect(meta).toContain('8 recordings')
    expect(meta).toContain('8 hr 02 min')
  })

  it('links New recording to the new route with this course picked', () => {
    const button = page.querySelector('.button-primary')
    expect(button.getAttribute('href')).toBe('#/new?course=hcim605')
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

describe('remembered choices and edge cases', () => {
  it('keeps the filter and sort when the page is drawn again for a view switch', () => {
    const gridPage = renderHcim('grid')
    clickChip(gridPage, 'Starred')
    const select = gridPage.querySelector('select')
    select.value = 'oldest'
    select.dispatchEvent(new Event('change'))

    const listPage = renderHcim('list')
    expect(listPage.querySelector('.chip[aria-pressed="true"]').textContent).toBe('Starred')
    expect(listPage.querySelector('select').value).toBe('oldest')
    expect(listPage.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('shows one line and no filters for a course with no recordings', () => {
    const emptyCourse = { ...sampleCourses[0], id: 'empty', recordingCount: 0 }
    const page = renderCourse(
      { id: 'empty' },
      { ...context, courses: [...sampleCourses, emptyCourse], view: 'grid' }
    )
    expect(page.querySelector('.chip')).toBeNull()
    expect(page.textContent).toContain('No recordings in this course yet.')
  })

  it('puts an h2 between the h1 and the card headings', () => {
    const page = renderHcim()
    expect([...page.querySelectorAll('h1, h2, h3')].slice(0, 3).map((h) => h.tagName)).toEqual([
      'H1',
      'H2',
      'H3',
    ])
  })

  it('rejects a course with a bad color or no total length', () => {
    const broken = [{ ...sampleCourses[0], color: 'blue' }]
    expect(() => renderCourse({ id: 'hcim605' }, { ...context, courses: broken })).toThrow(
      /color of/
    )
    const noTotal = [{ ...sampleCourses[0], totalSeconds: undefined }]
    expect(() => renderCourse({ id: 'hcim605' }, { ...context, courses: noTotal })).toThrow(
      /totalSeconds/
    )
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
