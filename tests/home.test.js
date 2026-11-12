// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHome } from '../src/pages/home.js'
import { renderRecordingTable, renderRecordingStatus } from '../src/components/recording-table.js'
import { sampleCourses, buildSampleRecordings } from '../src/data/sample.js'

// a fixed afternoon so every sample date lands on a known label
const now = new Date(2026, 9, 28, 15)
const recordings = buildSampleRecordings(now)
const context = { courses: sampleCourses, recordings, now }

/**
 * Get the trimmed text of every element that matches a selector.
 * @param {ParentNode} root where to search
 * @param {string} selector css selector
 * @returns {string[]} text content of each match
 */
function textsOf(root, selector) {
  return [...root.querySelectorAll(selector)].map((element) => element.textContent.trim())
}

describe('sample data', () => {
  it('has the four courses from the mock with shape colors that exist', () => {
    expect(sampleCourses.map((course) => course.code)).toEqual([
      'HCIM 605',
      'INST 360',
      'INST 737',
      'INST 711',
    ])
    expect(sampleCourses.reduce((sum, course) => sum + course.recordingCount, 0)).toBe(38)
  })

  it('keeps Today and Yesterday true whatever time it runs', () => {
    for (const time of [new Date(2026, 9, 28, 0, 5), new Date(2026, 9, 28, 23, 55)]) {
      const [week9, lecture17, guestTalk] = buildSampleRecordings(time)
      expect(week9.recordedAt.getDate()).toBe(28)
      expect(lecture17.recordedAt.getDate()).toBe(28)
      expect(week9.recordedAt <= time).toBe(true)
      expect(guestTalk.recordedAt.getDate()).toBe(27)
    }
  })

  it('rejects an invalid date', () => {
    expect(() => buildSampleRecordings(new Date('nope'))).toThrow(/valid date/)
  })
})

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

  it('shows the transcribing recording as a progress bar at 64 percent', () => {
    const bar = page.querySelector('[role="progressbar"]')
    expect(bar.getAttribute('aria-valuenow')).toBe('64')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-label')).toBe('Transcribing Lecture 17 · Client-side ML')
    expect(bar.parentElement.textContent).toBe('64%')
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
  it('renders empty sections without throwing', () => {
    const page = renderHome({}, { courses: [], recordings: [], view: 'grid', now })
    expect(page.querySelectorAll('.recording-card')).toHaveLength(0)
    expect(page.querySelectorAll('tbody tr')).toHaveLength(0)
  })

  it('rejects missing arrays', () => {
    expect(() => renderHome({}, { view: 'grid' })).toThrow(/arrays/)
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
    expect(() => renderRecordingStatus({ title: 'x', status: 'queued' })).toThrow(/unknown/)
    expect(() =>
      renderRecordingStatus({ title: 'x', status: 'transcribing', progress: 1.5 })
    ).toThrow(/0 to 1/)
  })
})
