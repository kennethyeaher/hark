// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { missingAudioMessage, renderRecording } from '../src/pages/recording.js'
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
    expect(page.querySelector('.player-message').textContent).toBe(missingAudioMessage)
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
