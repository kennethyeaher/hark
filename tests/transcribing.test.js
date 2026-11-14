// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCancelQuestions,
  describeModelStep,
  describeTimeLeft,
  describeWaiting,
  pickCardState,
  renderTranscribing,
} from '../src/pages/transcribing.js'
import { getModel } from '../src/transcription/models.js'

const course = { id: 'hcim605', code: 'HCIM 605', color: 'indigo' }
const baseRecording = {
  id: 'lecture18',
  title: 'Lecture 18 · Qualitative coding',
  courseId: 'hcim605',
  durationSeconds: 3480,
  status: 'transcribing',
  progress: 0,
  model: 'balanced',
  errorMessage: null,
}

/**
 * build a live job state with fields a test can override.
 * @param {object} [overrides] fields to replace
 * @returns {object} the state
 */
function makeState(overrides = {}) {
  return {
    recordingId: 'lecture18',
    phase: 'transcribing',
    recordingsAhead: 0,
    downloadFraction: 1,
    downloadedBytes: 0,
    isModelCached: true,
    processedSeconds: 0,
    fraction: 0,
    remainingSeconds: 120,
    latestSegments: [],
    segmentCount: 0,
    errorMessage: null,
    ...overrides,
  }
}

/**
 * build fake jobs whose state the test pushes by hand.
 * @param {object | null} initialState the state getJobState returns
 * @returns {{ jobs: object, push: (state: object) => void }} the fakes and a way to send state
 */
function createFakeJobs(initialState) {
  const listeners = new Set()
  return {
    jobs: {
      cancelRecording: vi.fn(async () => {}),
      getJobState: () => initialState,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    push: (state) => {
      for (const listener of [...listeners]) listener(state)
    },
  }
}

/**
 * render the card into the document so live updates reach it.
 * @param {{ recording?: object, state?: object | null, countSegments?: Function }} [options]
 *   the stored recording, the live state, and the segment counter
 * @returns {{ page: HTMLElement, push: (state: object) => void }} the page and the state pusher
 */
function renderCard({ recording = baseRecording, state = null, countSegments } = {}) {
  const fake = createFakeJobs(state)
  const navigate = vi.fn()
  const page = renderTranscribing(
    { id: recording.id },
    {
      courses: [course],
      recordings: [recording],
      jobs: fake.jobs,
      countSegments: countSegments ?? (async () => 7),
      navigate,
    }
  )
  document.body.replaceChildren(page)
  return { page, push: fake.push, jobs: fake.jobs, navigate }
}

beforeEach(() => {
  document.body.replaceChildren()
  clearCancelQuestions()
})

describe('pickCardState', () => {
  it.each([
    [{ status: 'transcribed' }, makeState(), 'done'],
    [{ status: 'summarized' }, null, 'done'],
    [{ status: 'failed' }, makeState(), 'failed'],
    [{ status: 'transcribing' }, makeState({ phase: 'done' }), 'done'],
    [{ status: 'queued' }, makeState({ phase: 'failed' }), 'failed'],
    [{ status: 'queued' }, makeState({ phase: 'downloading' }), 'running'],
    [{ status: 'queued' }, makeState({ phase: 'waiting' }), 'waiting'],
    [{ status: 'transcribing' }, null, 'running'],
    [{ status: 'queued' }, null, 'waiting'],
  ])('shows %j with %j as %s', (recording, state, expected) => {
    expect(pickCardState(recording, state)).toBe(expected)
  })
})

describe('card text', () => {
  it('describes the time left with a capital letter', () => {
    expect(describeTimeLeft(120)).toBe('About 2 minutes left')
    expect(describeTimeLeft(10)).toBe('Less than a minute left')
  })

  it('counts the recordings ahead', () => {
    expect(describeWaiting(2)).toBe('Waiting for 2 recordings ahead of this one')
    expect(describeWaiting(1)).toBe('Waiting for 1 recording ahead of this one')
    expect(describeWaiting(0)).toBe('Waiting to start')
    expect(describeWaiting(undefined)).toBe('Waiting to start')
  })

  it('describes the model step while downloading, loading, and loaded', () => {
    const model = getModel('balanced')
    expect(
      describeModelStep(
        makeState({ phase: 'downloading', isModelCached: false, downloadFraction: 0.34 }),
        model
      )
    ).toEqual({ text: 'Downloading model · 34%', isDone: false })
    expect(describeModelStep(makeState({ phase: 'downloading' }), model)).toEqual({
      text: 'Loading model',
      isDone: false,
    })
    expect(describeModelStep(makeState({ isModelCached: false }), model).text).toBe(
      'Model loaded · 80 MB'
    )
    expect(describeModelStep(makeState(), model).text).toBe('Model loaded · 80 MB, cached')
  })
})

describe('renderTranscribing while running', () => {
  it('shows the eyebrow, title, and meta line', () => {
    const { page } = renderCard({ state: makeState() })
    expect(page.querySelector('.transcribe-eyebrow').textContent).toBe('Transcribing')
    expect(page.querySelector('h1').textContent).toBe('Lecture 18 · Qualitative coding')
    expect(page.querySelector('.transcribe-meta').textContent).toContain('HCIM 605')
    expect(page.querySelector('.transcribe-meta').textContent).toContain('58 min')
    expect(page.querySelector('.transcribe-meta').textContent).toContain('Whisper base')
  })

  it('shows progress as a progressbar with the percent and the time left', () => {
    const { page } = renderCard({ state: makeState({ fraction: 0.64, remainingSeconds: 120 }) })
    const bar = page.querySelector('[role="progressbar"]')
    expect(bar.getAttribute('aria-valuenow')).toBe('64')
    expect(bar.getAttribute('aria-valuetext')).toBe('64%, About 2 minutes left')
    expect(page.querySelector('.transcribe-percent').textContent).toBe('64%')
    expect(page.querySelector('.transcribe-time-left').textContent).toBe('About 2 minutes left')
  })

  it('names each step state in words, not color alone', () => {
    const { page } = renderCard({
      state: makeState({ phase: 'downloading', isModelCached: false, downloadFraction: 0.34 }),
    })
    const steps = [...page.querySelectorAll('.step')].map((step) => step.textContent)
    expect(steps).toEqual([
      'In progress: Downloading model · 34%',
      'Not started: Transcribing audio',
    ])
  })

  it('shows only the two steps that exist in this milestone', () => {
    const { page } = renderCard({ state: makeState() })
    const steps = [...page.querySelectorAll('.step')].map((step) => step.textContent)
    expect(steps).toEqual(['Done: Model loaded · 80 MB, cached', 'In progress: Transcribing audio'])
  })

  it('updates in place on live state and keeps focus on Cancel', () => {
    const { page, push } = renderCard({ state: makeState() })
    const cancel = page.querySelector('.transcribe-cancel')
    cancel.focus()
    push(makeState({ fraction: 0.5 }))
    expect(page.querySelector('.transcribe-cancel')).toBe(cancel)
    expect(document.activeElement).toBe(cancel)
    expect(page.querySelector('.transcribe-percent').textContent).toBe('50%')
  })

  it('shows the latest two segments in a polite live region, once per chunk', () => {
    const { page, push } = renderCard({ state: makeState() })
    const live = page.querySelector('.transcribe-live-text')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('Text shows here after each 5 minutes of audio.')

    const segments = [{ text: ' First line.' }, { text: ' Second line.' }]
    push(makeState({ latestSegments: segments, segmentCount: 9 }))
    const lines = [...live.querySelectorAll('p')]
    expect(lines.map((line) => line.textContent)).toEqual(['First line.', 'Second line.'])
    expect(lines[1].className).toBe('transcribe-live-latest')

    // a later event with the same chunk leaves the live text alone
    push(makeState({ latestSegments: segments, segmentCount: 9, fraction: 0.6 }))
    expect(live.querySelectorAll('p')[0]).toBe(lines[0])
  })

  it('ignores state for other recordings', () => {
    const { page, push } = renderCard({ state: makeState({ fraction: 0.2 }) })
    push(makeState({ recordingId: 'other', fraction: 0.9 }))
    expect(page.querySelector('.transcribe-percent').textContent).toBe('20%')
  })

  it('falls back to the stored percent when this tab has no live state', () => {
    const { page } = renderCard({ recording: { ...baseRecording, progress: 0.3 } })
    expect(page.querySelector('.transcribe-percent').textContent).toBe('30%')
  })

  it('links Keep working to Home and has a Cancel button', () => {
    const { page } = renderCard({ state: makeState() })
    expect(page.querySelector('a.button-outline').getAttribute('href')).toBe('#/')
    expect(page.querySelector('.transcribe-cancel').textContent).toBe('Cancel')
    expect(page.querySelector('.transcribe-footnote').textContent).toBe(
      'Runs in your browser. Closing the tab pauses it.'
    )
  })

  it('stops listening once the page leaves the document', () => {
    const { page, push } = renderCard({ state: makeState() })
    page.remove()
    push(makeState({ fraction: 0.9 }))
    document.body.append(page)
    push(makeState({ fraction: 0.4 }))
    expect(page.querySelector('.transcribe-percent').textContent).toBe('0%')
  })
})

describe('renderTranscribing in other states', () => {
  it('shows how many recordings are ahead while waiting', () => {
    const { page } = renderCard({
      recording: { ...baseRecording, status: 'queued' },
      state: makeState({ phase: 'waiting', recordingsAhead: 2 }),
    })
    expect(page.querySelector('.transcribe-message').textContent).toBe(
      'Waiting for 2 recordings ahead of this one'
    )
    expect(page.querySelector('.transcribe-cancel')).not.toBeNull()
  })

  it('moves from waiting to running when the job starts', () => {
    const { page, push } = renderCard({
      recording: { ...baseRecording, status: 'queued' },
      state: makeState({ phase: 'waiting', recordingsAhead: 1 }),
    })
    push(makeState({ phase: 'downloading' }))
    expect(page.dataset.cardState).toBe('running')
    expect(page.querySelector('[role="progressbar"]')).not.toBeNull()
  })

  it('shows the saved transcript with its segment count and a link', async () => {
    const { page } = renderCard({ recording: { ...baseRecording, status: 'transcribed' } })
    expect(page.querySelector('.transcribe-message').textContent).toContain('Transcript saved')
    expect(page.querySelector('a.button-primary').getAttribute('href')).toBe(
      '#/recording/lecture18'
    )
    await vi.waitFor(() =>
      expect(page.querySelector('.transcribe-count').textContent).toBe('7 segments')
    )
  })

  it('says no speech was found when the transcript is empty', async () => {
    const { page } = renderCard({
      recording: { ...baseRecording, status: 'transcribed' },
      countSegments: async () => 0,
    })
    await vi.waitFor(() =>
      expect(page.querySelector('.transcribe-count').textContent).toBe('no speech found')
    )
  })

  it('uses the live segment count when the job just finished', () => {
    const countSegments = vi.fn()
    const { page } = renderCard({
      state: makeState({ phase: 'done', segmentCount: 1 }),
      countSegments,
    })
    expect(page.querySelector('.transcribe-count').textContent).toBe('1 segment')
    expect(countSegments).not.toHaveBeenCalled()
  })

  it('shows the error message and a Remove recording button when it failed', () => {
    const { page } = renderCard({
      recording: {
        ...baseRecording,
        status: 'failed',
        errorMessage: 'This file could not be read as audio',
      },
    })
    expect(page.querySelector('.transcribe-eyebrow').textContent).toBe('Failed')
    expect(page.querySelector('.transcribe-message').textContent).toBe(
      'This file could not be read as audio'
    )
    expect(page.querySelector('.transcribe-remove').textContent).toBe('Remove recording')
  })

  it('shows the not found page for an unknown id', () => {
    const page = renderTranscribing(
      { id: 'missing' },
      { courses: [course], recordings: [], jobs: createFakeJobs(null).jobs }
    )
    expect(page.querySelector('h1').textContent).toBe('Page not found')
    expect(page.textContent).toContain('/transcribe/missing')
  })

  it('rejects data that is not arrays', () => {
    expect(() => renderTranscribing({ id: 'x' }, { courses: null, recordings: [] })).toThrow(
      /arrays/
    )
  })
})

describe('cancel and remove', () => {
  it('asks once inline before cancelling, with focus on the safe answer', () => {
    const { page, jobs } = renderCard({ state: makeState() })
    page.querySelector('.transcribe-cancel').click()
    const question = page.querySelector('.transcribe-confirm')
    expect(question.getAttribute('role')).toBe('group')
    expect(question.textContent).toContain('Stop and remove this recording?')
    expect(document.activeElement.textContent).toBe('Keep going')
    expect(page.querySelector('.transcribe-stop').textContent).toBe('Stop and remove')
    expect(jobs.cancelRecording).not.toHaveBeenCalled()
  })

  it('goes back to the Cancel button on Keep going', () => {
    const { page, jobs } = renderCard({ state: makeState() })
    page.querySelector('.transcribe-cancel').click()
    page.querySelector('.transcribe-keep').click()
    expect(page.querySelector('.transcribe-confirm')).toBeNull()
    expect(document.activeElement).toBe(page.querySelector('.transcribe-cancel'))
    expect(jobs.cancelRecording).not.toHaveBeenCalled()
  })

  it('keeps the question open across a live update and a fresh render', () => {
    const { page, push } = renderCard({ state: makeState() })
    page.querySelector('.transcribe-cancel').click()
    push(makeState({ fraction: 0.5 }))
    expect(page.querySelector('.transcribe-confirm')).not.toBeNull()
    const { page: redrawn } = renderCard({ state: makeState({ fraction: 0.5 }) })
    expect(redrawn.querySelector('.transcribe-confirm')).not.toBeNull()
  })

  it('cancels a running job, goes to the course page, and announces it', async () => {
    vi.useFakeTimers()
    const { page, jobs, navigate } = renderCard({ state: makeState({ fraction: 0.4 }) })
    page.querySelector('.transcribe-cancel').click()
    page.querySelector('.transcribe-stop').click()
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('#/course/hcim605'))
    expect(jobs.cancelRecording).toHaveBeenCalledWith('lecture18')
    vi.advanceTimersByTime(200)
    expect(document.querySelector('#app-announcer').textContent).toBe(
      'Stopped and removed Lecture 18 · Qualitative coding.'
    )
    vi.useRealTimers()
  })

  it('cancels a waiting recording the same way', async () => {
    const { page, jobs } = renderCard({
      recording: { ...baseRecording, status: 'queued' },
      state: makeState({ phase: 'waiting', recordingsAhead: 1 }),
    })
    page.querySelector('.transcribe-cancel').click()
    page.querySelector('.transcribe-stop').click()
    await vi.waitFor(() => expect(jobs.cancelRecording).toHaveBeenCalledWith('lecture18'))
  })

  it('removes a failed recording and goes to its course', async () => {
    const { page, jobs, navigate } = renderCard({
      recording: { ...baseRecording, status: 'failed', errorMessage: 'bad file' },
    })
    page.querySelector('.transcribe-remove').click()
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('#/course/hcim605'))
    expect(jobs.cancelRecording).toHaveBeenCalledWith('lecture18')
  })

  it('brings the button back and reports why when the delete fails', async () => {
    vi.useFakeTimers()
    const { page, jobs, navigate } = renderCard({
      recording: { ...baseRecording, status: 'failed', errorMessage: 'bad file' },
    })
    jobs.cancelRecording.mockRejectedValueOnce(new Error('storage is blocked'))
    const button = page.querySelector('.transcribe-remove')
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    vi.advanceTimersByTime(200)
    expect(document.querySelector('#app-announcer').textContent).toBe(
      'The recording could not be removed: storage is blocked'
    )
    expect(navigate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
