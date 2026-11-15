// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleAudioMessage, renderRecording } from '../src/pages/recording.js'
import { leavePage, getPageHooks } from '../src/app/page-hooks.js'

const course = { id: 'hcim605', code: 'HCIM 605', color: 'indigo' }
const baseRecording = {
  id: 'week9',
  title: 'Week 9 · Thematic analysis',
  courseId: 'hcim605',
  durationSeconds: 4440,
  recordedAt: new Date(2026, 9, 28, 10, 0),
  status: 'transcribed',
  isStarred: false,
  errorMessage: null,
}

const segments = [
  { id: 's0', index: 0, startSeconds: 724, endSeconds: 758, text: 'So when we talk about coding.' },
  { id: 's1', index: 1, startSeconds: 758, endSeconds: 795, text: 'A lot of students jump ahead.' },
  { id: 's2', index: 2, startSeconds: 795, endSeconds: 832, text: 'Let me show you an example.' },
]
const moments = [
  { id: 'm0', recordingId: 'week9', atSeconds: 760, label: 'Exam hint', color: 'orange' },
]

/**
 * build a fake player that records calls and lets the test push state.
 * @returns {object} the fake, with a push function
 */
function createFakePlayer() {
  const listeners = new Set()
  let state = { currentTime: 0, duration: 4440, isPlaying: false, rate: 1, errorMessage: '' }
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    skip: vi.fn(),
    setRate: vi.fn((rate) => {
      state = { ...state, rate }
    }),
    destroy: vi.fn(),
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    push(changes) {
      state = { ...state, ...changes }
      for (const listener of listeners) listener(state)
    },
  }
}

/**
 * build fake services with spies, any of which a test can replace.
 * @param {object} [overrides] services to replace
 * @returns {object} the services, with the fake player on `player`
 */
function createServices(overrides = {}) {
  const player = createFakePlayer()
  return {
    player,
    getRecording: vi.fn(async () => undefined),
    setRecordingStarred: vi.fn(async (id, isStarred) => ({ ...baseRecording, isStarred })),
    getAudio: vi.fn(async () => ({ recordingId: 'week9', blob: new Blob(['x']), peaks: [0.5, 1] })),
    saveAudioPeaks: vi.fn(async () => {}),
    listSegmentsForRecording: vi.fn(async () => segments),
    listMomentsForRecording: vi.fn(async () => moments),
    updateSegmentTexts: vi.fn(async () => []),
    getNote: vi.fn(async () => ({ recordingId: 'week9', body: 'Ask about NVivo' })),
    saveNote: vi.fn(async (note) => note),
    saveMoment: vi.fn(async (moment) => ({ id: 'm-new', ...moment })),
    deleteMoment: vi.fn(async () => {}),
    createPlayer: vi.fn(() => player),
    decodeAudio: vi.fn(async () => ({ samples: new Float32Array([0, 0.5]), durationSeconds: 1 })),
    buildPeaks: vi.fn(() => [0.3, 0.6, 1]),
    readSavedRate: vi.fn(() => 1.25),
    saveRate: vi.fn(),
    ...overrides,
  }
}

/**
 * render the page into the document.
 * @param {{ recording?: object | null, services?: object, navigate?: Function,
 *   redirect?: Function, canGoBack?: boolean }} [options] what to render with
 * @returns {{ page: HTMLElement, services: object }} the page and its services
 */
function mount({ recording = baseRecording, services = createServices(), ...rest } = {}) {
  const page = renderRecording(
    { id: 'week9' },
    {
      courses: [course],
      recordings: recording ? [recording] : [],
      services,
      navigate: vi.fn(),
      redirect: vi.fn(),
      ...rest,
    }
  )
  document.body.replaceChildren(page)
  return { page, services }
}

afterEach(() => {
  for (const page of document.querySelectorAll('.page-recording')) leavePage(page)
  document.body.replaceChildren()
})

describe('Recording page header', () => {
  it('shows the course crumb, the meta line, and the title', () => {
    const { page } = mount()
    expect(page.querySelector('h1').textContent).toBe('Week 9 · Thematic analysis')
    const crumb = page.querySelector('.recording-crumb-link')
    expect(crumb.getAttribute('href')).toBe('#/course/hcim605')
    expect(crumb.textContent).toBe('HCIM 605')
    expect(page.querySelector('.recording-meta').textContent).toBe('Oct 28, 2026 · 1 hr 14 min')
  })

  it('renders Export and More as focusable coming soon buttons', () => {
    const { page } = mount()
    for (const selector of ['.recording-export', '.recording-more']) {
      const button = page.querySelector(selector)
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(button.getAttribute('aria-label')).toMatch(/coming soon/)
      expect(button.disabled).toBe(false)
    }
  })

  it('stars and saves, and puts the star back when the save fails', async () => {
    const { page, services } = mount()
    const star = page.querySelector('.recording-star')
    expect(star.getAttribute('aria-pressed')).toBe('false')
    star.click()
    expect(star.getAttribute('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(services.setRecordingStarred).toHaveBeenCalledWith('week9', true))

    services.setRecordingStarred.mockRejectedValueOnce(new Error('disk full'))
    await vi.waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('true'))
    star.click()
    await vi.waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('true'))
  })

  it('goes back in history, or to the course page on a first visit', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const first = mount({ canGoBack: false })
    first.page.querySelector('.recording-back').click()
    expect(back).not.toHaveBeenCalled()

    const navigate = vi.fn()
    const second = mount({ canGoBack: true, navigate })
    second.page.querySelector('.recording-back').click()
    expect(back).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    back.mockRestore()
  })

  it('follows a renamed or starred recording from new library data without a redraw', () => {
    const { page } = mount()
    const { onData } = getPageHooks(page)
    onData({
      courses: [course],
      recordings: [{ ...baseRecording, title: 'Renamed', isStarred: true }],
    })
    expect(page.querySelector('h1').textContent).toBe('Renamed')
    expect(page.querySelector('.recording-star').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Recording page states', () => {
  it('sends a queued or transcribing recording to its Transcribing card', () => {
    for (const status of ['queued', 'transcribing']) {
      const redirect = vi.fn()
      mount({ recording: { ...baseRecording, status }, redirect })
      expect(redirect).toHaveBeenCalledWith('#/transcribe/week9')
    }
  })

  it('shows why a failed recording failed and links to its card', () => {
    const { page } = mount({
      recording: {
        ...baseRecording,
        status: 'failed',
        errorMessage: 'This file could not be read.',
      },
    })
    expect(page.querySelector('.recording-failed-message').textContent).toBe(
      'This file could not be read.'
    )
    expect(page.querySelector('.recording-failed a').getAttribute('href')).toBe(
      '#/transcribe/week9'
    )
    expect(page.querySelector('.player-card')).toBeNull()
  })

  it('shows the not found page for an unknown id', async () => {
    const { page } = mount({ recording: null })
    await vi.waitFor(() => expect(page.textContent).toMatch(/not found/i))
  })

  it('says so when the recording cannot be read', async () => {
    const services = createServices({
      getRecording: vi.fn(async () => {
        throw new Error('storage blocked')
      }),
    })
    const { page } = mount({ recording: null, services })
    await vi.waitFor(() =>
      expect(page.querySelector('[role="alert"]')?.textContent).toBe(
        'This recording could not be read: storage blocked'
      )
    )
  })

  it('opens a recording in Trash by reading the store', async () => {
    const services = createServices({
      getRecording: vi.fn(async () => ({ ...baseRecording, deletedAt: new Date() })),
    })
    const { page } = mount({ recording: null, services })
    await vi.waitFor(() =>
      expect(page.querySelector('.recording-title')?.textContent).toBe('Week 9 · Thematic analysis')
    )
    expect(document.title).toBe('Week 9 · Thematic analysis · Hark')
  })
})

describe('Recording page player', () => {
  it('turns the controls off when the recording has no audio here', async () => {
    const services = createServices({ getAudio: vi.fn(async () => undefined) })
    const { page } = mount({ services })
    await vi.waitFor(() => expect(page.querySelector('.player-card')).not.toBeNull())
    expect(page.querySelector('.player-message').textContent).toBe(sampleAudioMessage)
    expect(page.querySelector('.player-play').disabled).toBe(true)
    expect(page.querySelector('.player-waveform').getAttribute('aria-disabled')).toBe('true')
    expect(services.createPlayer).not.toHaveBeenCalled()
  })

  it('plays the stored audio at the saved speed and follows the player state', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.player-play')).not.toBeNull())
    expect(services.player.setRate).toHaveBeenCalledWith(1.25)
    expect(page.querySelector('.player-speed').value).toBe('1.25')

    page.querySelector('.player-play').click()
    expect(services.player.toggle).toHaveBeenCalled()
    services.player.push({ currentTime: 795, isPlaying: true })
    expect(page.querySelector('.player-time-current').textContent).toBe('13:15')
    expect(page.querySelector('.player-time-total').textContent).toBe('1:14:00')
    expect(page.querySelector('.player-play').getAttribute('aria-label')).toBe('Pause')

    page.querySelectorAll('.player-skip')[0].click()
    expect(services.player.skip).toHaveBeenCalledWith(-15)
  })

  it('saves a new speed', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.player-speed')).not.toBeNull())
    const select = page.querySelector('.player-speed')
    select.value = '2'
    select.dispatchEvent(new Event('change'))
    expect(services.player.setRate).toHaveBeenLastCalledWith(2)
    expect(services.saveRate).toHaveBeenCalledWith(2)
  })

  it('seeks from the waveform keys', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.player-waveform')).not.toBeNull())
    services.player.push({ currentTime: 60 })
    page
      .querySelector('.player-waveform')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    expect(services.player.seek).toHaveBeenCalledWith(65)
  })

  it('draws stored peaks and does not decode again', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelectorAll('.player-waveform-bar')).toHaveLength(2))
    expect(services.decodeAudio).not.toHaveBeenCalled()
  })

  it('builds and saves peaks for audio uploaded before peaks existed', async () => {
    const services = createServices({
      getAudio: vi.fn(async () => ({ recordingId: 'week9', blob: new Blob(['x']) })),
    })
    const { page } = mount({ services })
    await vi.waitFor(() =>
      expect(services.saveAudioPeaks).toHaveBeenCalledWith('week9', [0.3, 0.6, 1])
    )
    expect(services.buildPeaks).toHaveBeenCalledWith(expect.any(Float32Array), 120)
    expect(page.querySelectorAll('.player-waveform-bar')).toHaveLength(3)
  })

  it('still saves peaks that finish after the page is gone', async () => {
    let finishDecode
    const services = createServices({
      getAudio: vi.fn(async () => ({ recordingId: 'week9', blob: new Blob(['x']) })),
      decodeAudio: vi.fn(
        () =>
          new Promise((resolve) => {
            finishDecode = () => resolve({ samples: new Float32Array([0.5]), durationSeconds: 1 })
          })
      ),
    })
    const { page } = mount({ services })
    await vi.waitFor(() => expect(services.decodeAudio).toHaveBeenCalled())
    leavePage(page)
    finishDecode()
    await vi.waitFor(() => expect(services.saveAudioPeaks).toHaveBeenCalled())
  })

  it('keeps the placeholder bars when the audio cannot be decoded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const services = createServices({
      getAudio: vi.fn(async () => ({ recordingId: 'week9', blob: new Blob(['x']) })),
      decodeAudio: vi.fn(async () => {
        throw new Error('unsupported codec')
      }),
    })
    const { page } = mount({ services })
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(page.querySelector('.player-waveform').classList.contains('is-pending')).toBe(true)
    expect(services.saveAudioPeaks).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('releases the player when the route changes', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
    leavePage(page)
    expect(services.player.destroy).toHaveBeenCalled()
  })
})

describe('Recording page transcript', () => {
  it('lists every segment with its time and the moment dots', async () => {
    const { page } = mount()
    await vi.waitFor(() => expect(page.querySelectorAll('.transcript-row')).toHaveLength(3))
    const rows = page.querySelectorAll('.transcript-row')
    expect(rows[0].querySelector('.transcript-time').textContent).toBe('12:04')
    expect(rows[1].querySelector('.transcript-moment-dot')).not.toBeNull()
    expect(rows[1].textContent).toContain('moment Exam hint')
    expect(rows[0].querySelector('.transcript-moment-dot')).toBeNull()
  })

  it('seeks when a row is clicked and follows the playing segment', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelectorAll('.transcript-row')).toHaveLength(3))
    await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
    const rows = page.querySelectorAll('.transcript-row')
    rows[2].click()
    expect(services.player.seek).toHaveBeenCalledWith(795)

    services.player.push({ currentTime: 770 })
    expect(rows[1].classList.contains('is-active')).toBe(true)
    expect(rows[1].getAttribute('aria-current')).toBe('true')
    services.player.push({ currentTime: 800 })
    expect(rows[1].classList.contains('is-active')).toBe(false)
    expect(rows[2].classList.contains('is-active')).toBe(true)
    // more than a second past the last segment is a gap, so nothing is highlighted
    services.player.push({ currentTime: 900 })
    expect(page.querySelector('.transcript-row.is-active')).toBeNull()
  })

  it('keeps the playing row in view while auto scroll is on, and stops when it is off', async () => {
    const scrolled = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView() {
      scrolled.push(this)
    }
    try {
      const { page, services } = mount()
      await vi.waitFor(() => expect(page.querySelector('.switch')).not.toBeNull())
      await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
      const rows = page.querySelectorAll('.transcript-row')
      // jsdom has no layout, so every row counts as out of view and gets scrolled to
      rows.forEach((row) => {
        row.getBoundingClientRect = () => ({ top: 2000, bottom: 2040 })
      })
      services.player.push({ currentTime: 770 })
      expect(scrolled.at(-1)).toBe(rows[1])

      const toggle = page.querySelector('.switch')
      expect(toggle.getAttribute('aria-checked')).toBe('true')
      toggle.click()
      expect(toggle.getAttribute('aria-checked')).toBe('false')
      services.player.push({ currentTime: 800 })
      expect(scrolled.at(-1)).toBe(rows[1])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('highlights a clicked row on a sample with no audio', async () => {
    const services = createServices({ getAudio: vi.fn(async () => undefined) })
    const { page } = mount({ services })
    await vi.waitFor(() => expect(page.querySelectorAll('.transcript-row')).toHaveLength(3))
    page.querySelectorAll('.transcript-row')[2].click()
    expect(page.querySelectorAll('.transcript-row')[2].classList.contains('is-active')).toBe(true)
  })

  it('says so when no speech was found', async () => {
    const services = createServices({ listSegmentsForRecording: vi.fn(async () => []) })
    const { page } = mount({ services })
    await vi.waitFor(() =>
      expect(page.querySelector('.transcript-empty')?.textContent).toBe(
        'No speech was found in this recording.'
      )
    )
  })
})

describe('Recording page find', () => {
  /**
   * type into the find field.
   * @param {HTMLElement} page the page
   * @param {string} query the text to type
   * @returns {HTMLInputElement} the field
   */
  function find(page, query) {
    const input = page.querySelector('.transcript-find-input')
    input.value = query
    input.dispatchEvent(new Event('input'))
    return input
  }

  it('highlights matches across rows and counts them', async () => {
    const { page } = mount()
    await vi.waitFor(() => expect(page.querySelector('.transcript-find-input')).not.toBeNull())
    find(page, 'ME')
    const marks = page.querySelectorAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    const count = page.querySelector('.transcript-find-count')
    expect(count.textContent).toBe(`1 of ${marks.length}`)
    expect(marks[0].classList.contains('is-current')).toBe(true)
  })

  it('steps with Enter and wraps around', async () => {
    const { page } = mount()
    await vi.waitFor(() => expect(page.querySelector('.transcript-find-input')).not.toBeNull())
    const input = find(page, 'a lot')
    expect(page.querySelector('.transcript-find-count').textContent).toBe('1 of 1')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(page.querySelector('.transcript-find-count').textContent).toBe('1 of 1')
    find(page, 'ou')
    expect(page.querySelector('.transcript-find-count').textContent).toBe('1 of 2')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(page.querySelector('.transcript-find-count').textContent).toBe('2 of 2')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(page.querySelector('.transcript-find-count').textContent).toBe('1 of 2')
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true })
    )
    expect(page.querySelector('.transcript-find-count').textContent).toBe('2 of 2')
  })

  it('says No matches, and nothing for a one letter query or after Escape', async () => {
    const { page } = mount()
    await vi.waitFor(() => expect(page.querySelector('.transcript-find-input')).not.toBeNull())
    find(page, 'zebra')
    expect(page.querySelector('.transcript-find-count').textContent).toBe('No matches')
    find(page, 'a')
    expect(page.querySelector('.transcript-find-count').textContent).toBe('')
    expect(page.querySelector('mark')).toBeNull()
    const input = find(page, 'you')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(page.querySelector('mark')).toBeNull()
    expect(page.querySelector('.transcript-find-count').textContent).toBe('')
  })
})

describe('Recording page transcript editing', () => {
  /**
   * open the page and start editing.
   * @param {object} [options] mount options
   * @returns {Promise<{ page: HTMLElement, services: object }>} the page in edit mode
   */
  async function startEditing(options) {
    const mounted = mount(options)
    await vi.waitFor(() => expect(mounted.page.querySelector('.transcript-edit')).not.toBeNull())
    mounted.page.querySelector('.transcript-edit').click()
    return mounted
  }

  it('turns rows into fields, turns find off, and hides Edit', async () => {
    const { page } = await startEditing()
    const fields = page.querySelectorAll('.transcript-field')
    expect(fields).toHaveLength(3)
    expect(fields[0].value).toBe('So when we talk about coding.')
    expect(fields[0].getAttribute('aria-label')).toBe('Segment at 12:04')
    expect(page.querySelector('.transcript-row')).toBeNull()
    expect(page.querySelector('.transcript-find-input').disabled).toBe(true)
    expect(page.querySelector('.transcript-edit').hidden).toBe(true)
    expect(page.querySelector('.transcript-save').hidden).toBe(false)
  })

  it('saves only the changed segments, trimmed, in one call', async () => {
    const { page, services } = await startEditing()
    const fields = page.querySelectorAll('.transcript-field')
    fields[1].value = '  A lot of students jump to themes.  '
    page.querySelector('.transcript-save').click()
    await vi.waitFor(() => expect(page.querySelector('.transcript-row')).not.toBeNull())
    expect(services.updateSegmentTexts).toHaveBeenCalledTimes(1)
    expect(services.updateSegmentTexts).toHaveBeenCalledWith('week9', [
      { id: 's1', text: 'A lot of students jump to themes.' },
    ])
    const rows = page.querySelectorAll('.transcript-row')
    expect(rows[1].querySelector('.transcript-text').textContent).toBe(
      'A lot of students jump to themes.'
    )
    expect(rows[1].querySelector('.transcript-time').textContent).toBe('12:38')
    expect(document.activeElement).toBe(page.querySelector('.transcript-edit'))
  })

  it('refuses an empty segment and shows the error on its field', async () => {
    const { page, services } = await startEditing()
    const field = page.querySelectorAll('.transcript-field')[2]
    field.value = '   '
    page.querySelector('.transcript-save').click()
    expect(services.updateSegmentTexts).not.toHaveBeenCalled()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const error = document.getElementById(field.getAttribute('aria-describedby'))
    expect(error.textContent).toBe('A segment cannot be empty.')
    expect(document.activeElement).toBe(field)
  })

  it('keeps the fields when the save fails', async () => {
    const services = createServices({
      updateSegmentTexts: vi.fn(async () => {
        throw new Error('disk full')
      }),
    })
    const { page } = await startEditing({ services })
    page.querySelectorAll('.transcript-field')[0].value = 'Changed.'
    page.querySelector('.transcript-save').click()
    await vi.waitFor(() => expect(services.updateSegmentTexts).toHaveBeenCalled())
    await vi.waitFor(() => expect(page.querySelector('.transcript-save').disabled).toBe(false))
    expect(page.querySelectorAll('.transcript-field')).toHaveLength(3)
  })

  it('cancels without saving and puts the old text back', async () => {
    const { page, services } = await startEditing()
    page.querySelectorAll('.transcript-field')[0].value = 'Changed.'
    page.querySelector('.transcript-cancel').click()
    expect(services.updateSegmentTexts).not.toHaveBeenCalled()
    expect(page.querySelector('.transcript-text').textContent).toBe('So when we talk about coding.')
  })

  it('stops clicks from seeking while editing', async () => {
    const { page, services } = await startEditing()
    await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
    page.querySelectorAll('.transcript-field')[1].click()
    expect(services.player.seek).not.toHaveBeenCalled()
  })

  it('warns before the tab closes with unsaved edits, and only then', async () => {
    const { page } = await startEditing()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    page.querySelectorAll('.transcript-field')[0].value = 'Changed.'
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })

  it('discards unsaved edits on a route change and says so', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const { page } = await startEditing()
      page.querySelectorAll('.transcript-field')[0].value = 'Changed.'
      leavePage(page)
      vi.advanceTimersByTime(200)
      expect(document.getElementById('app-announcer').textContent).toBe(
        'Transcript edits discarded'
      )
      const later = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(later)
      expect(later.defaultPrevented).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Recording page rail', () => {
  it('shows the summary placeholder and the saved note', async () => {
    const { page } = mount()
    expect(page.querySelector('.summary-panel').textContent).toContain('later version')
    await vi.waitFor(() =>
      expect(page.querySelector('.notes-field')?.value).toBe('Ask about NVivo')
    )
  })

  it('saves typed notes for this recording, and saves a pending change on leave', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.notes-field')).not.toBeNull())
    const field = page.querySelector('.notes-field')
    field.value = 'Ask about NVivo and Atlas'
    field.dispatchEvent(new Event('input'))
    leavePage(page)
    await vi.waitFor(() =>
      expect(services.saveNote).toHaveBeenCalledWith({
        recordingId: 'week9',
        body: 'Ask about NVivo and Atlas',
      })
    )
  })

  it('saves a pending note when the tab is hidden', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.notes-field')).not.toBeNull())
    const field = page.querySelector('.notes-field')
    field.value = 'Typed just before closing'
    field.dispatchEvent(new Event('input'))
    window.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() =>
      expect(services.saveNote).toHaveBeenCalledWith({
        recordingId: 'week9',
        body: 'Typed just before closing',
      })
    )
  })

  it('starts empty when the recording has no note', async () => {
    const services = createServices({ getNote: vi.fn(async () => undefined) })
    const { page } = mount({ services })
    await vi.waitFor(() => expect(page.querySelector('.notes-field')?.value).toBe(''))
  })
})

describe('Recording page moments', () => {
  it('adds a moment at the playback time and shows its dot on the transcript', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.moments-add')).not.toBeNull())
    await vi.waitFor(() => expect(page.querySelectorAll('.transcript-row')).toHaveLength(3))
    await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
    services.player.push({ currentTime: 800.4 })
    page.querySelector('.moments-add').click()
    await vi.waitFor(() =>
      expect(services.saveMoment).toHaveBeenCalledWith(
        expect.objectContaining({ recordingId: 'week9', atSeconds: 800.4, label: 'Moment' })
      )
    )
    await vi.waitFor(() =>
      expect(
        page.querySelectorAll('.transcript-row')[2].querySelector('.transcript-moment-dot')
      ).not.toBeNull()
    )
  })

  it('seeks back to a moment from its time', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.moment-time')).not.toBeNull())
    await vi.waitFor(() => expect(services.createPlayer).toHaveBeenCalled())
    page.querySelector('.moment-time').click()
    expect(services.player.seek).toHaveBeenCalledWith(760)
  })

  it('drops the transcript dot when a moment is deleted', async () => {
    const { page, services } = mount()
    await vi.waitFor(() => expect(page.querySelector('.transcript-moment-dot')).not.toBeNull())
    await vi.waitFor(() => expect(page.querySelector('.moment-delete')).not.toBeNull())
    page.querySelector('.moment-delete').click()
    await vi.waitFor(() => expect(services.deleteMoment).toHaveBeenCalledWith('m0'))
    expect(page.querySelector('.transcript-moment-dot')).toBeNull()
  })
})
