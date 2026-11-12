// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderCourseFolder } from '../src/components/course-folder.js'
import { renderRecordingCard, renderRecordingIcon } from '../src/components/recording-card.js'

const course = {
  id: 'hcim605',
  code: 'HCIM 605',
  name: 'Qualitative Research Methods',
  color: 'indigo',
  recordingCount: 12,
}
const now = new Date(2026, 10, 11, 12, 0, 0)
const recording = {
  id: 'rec week9/a',
  title: 'Week 9 · Thematic analysis',
  courseId: 'hcim605',
  durationSeconds: 4440,
  recordedAt: new Date(2026, 10, 11, 9, 0, 0),
  status: 'summarized',
  isStarred: false,
  hasNotes: false,
}

describe('renderRecordingCard', () => {
  it('links to the encoded recording route and shows the title', () => {
    const card = renderRecordingCard({ recording, course, now })
    const link = card.querySelector('a.recording-card-link')
    expect(link.getAttribute('href')).toBe('#/recording/rec%20week9%2Fa')
    expect(card.querySelector('h3').textContent).toBe('Week 9 · Thematic analysis')
  })

  it('shows the course code in course mode with the duration', () => {
    const meta = renderRecordingCard({ recording, course, now }).querySelector(
      '.recording-card-meta'
    )
    expect(meta.textContent).toContain('HCIM 605')
    expect(meta.textContent).toContain('1 hr 14 min')
  })

  it('shows the relative date in date mode', () => {
    const meta = renderRecordingCard({ recording, course, meta: 'date', now }).querySelector(
      '.recording-card-meta'
    )
    expect(meta.textContent).toContain('Today')
    expect(meta.textContent).not.toContain('HCIM 605')
  })

  it('hides decorative parts from assistive tech', () => {
    const card = renderRecordingCard({ recording, course, now })
    expect(card.querySelector('.recording-card-dot').getAttribute('aria-hidden')).toBe('true')
    expect(card.querySelector('.recording-card-stripe').getAttribute('aria-hidden')).toBe('true')
    expect(card.querySelector('svg.waveform').getAttribute('aria-hidden')).toBe('true')
  })

  it('puts a focusable but inert More button outside the link', () => {
    const card = renderRecordingCard({ recording, course, now })
    const button = card.querySelector('button')
    expect(card.querySelector('a').contains(button)).toBe(false)
    expect(button.getAttribute('aria-label')).toBe('More options, coming soon')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('type')).toBe('button')
  })

  it('throws for mismatched or invalid data', () => {
    expect(() => renderRecordingCard({ recording, course: { ...course, id: 'other' } })).toThrow(
      TypeError
    )
    expect(() => renderRecordingCard({ recording, course: { ...course, color: 'blue' } })).toThrow(
      TypeError
    )
    expect(() => renderRecordingCard({ recording: null, course })).toThrow(TypeError)
    expect(() => renderRecordingCard({ recording, course, meta: 'size' })).toThrow(TypeError)
  })
})

describe('renderRecordingIcon', () => {
  it('renders a hidden tile with five bars', () => {
    const icon = renderRecordingIcon({ recording, course })
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.querySelectorAll('rect')).toHaveLength(5)
  })
})

describe('renderCourseFolder', () => {
  it('links to the encoded course route and shows code and plural count', () => {
    const folder = renderCourseFolder({ course })
    expect(folder.getAttribute('href')).toBe('#/course/hcim605')
    expect(folder.textContent).toContain('HCIM 605')
    expect(folder.textContent).toContain('12 recordings')
  })

  it('uses the singular for one recording', () => {
    expect(renderCourseFolder({ course: { ...course, recordingCount: 1 } }).textContent).toContain(
      '1 recording'
    )
    expect(
      renderCourseFolder({ course: { ...course, recordingCount: 1 } }).textContent
    ).not.toContain('1 recordings')
  })

  it('throws for invalid courses', () => {
    expect(() => renderCourseFolder({ course: null })).toThrow(TypeError)
    expect(() => renderCourseFolder({ course: { ...course, color: 'blue' } })).toThrow(TypeError)
    expect(() => renderCourseFolder({ course: { ...course, recordingCount: -1 } })).toThrow(
      /recordingCount of 0 or more/
    )
  })
})
