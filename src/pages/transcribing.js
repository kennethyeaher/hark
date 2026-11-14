// the Transcribing card: live progress for one recording, then its saved, failed, or waiting state

import { createElement, createIcon } from '../lib/dom.js'
import { formatDuration } from '../lib/format.js'
import { describeFocus, restoreFocus } from '../lib/focus.js'
import { renderWaveform, setWaveformProgress } from '../components/waveform.js'
import { formatEstimate } from '../transcription/estimate.js'
import { getModel } from '../transcription/models.js'
import { cancelRecording, getJobState, subscribe } from '../transcription/jobs.js'
import { listSegmentsForRecording } from '../data/segments.js'
import { renderNotFound } from './not-found.js'
import { announce } from '../lib/announce.js'

const checkIconPaths = ['M5 12.5l4.5 4.5L19 7.5']
const alertIconPaths = ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0 -18z', 'M12 8v4.5', 'M12 16h.01']
const lockIconPaths = ['M6 11h12v10H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3']
const waveformBarCount = 48

// the real job and data functions; tests pass fakes through the context
const defaultJobs = { getJobState, subscribe, cancelRecording }

// recordings whose Cancel is asking to confirm. kept outside the page so the question survives
// the redraw that follows each saved chunk
const confirmingIds = new Set()

// recordings this tab is removing. the delete reloads the library before the course page
// shows, and the card should go blank for that moment instead of saying the page is not found
const removedIds = new Set()

/**
 * forget every open cancel question and every removal, so each card starts fresh.
 * @returns {void}
 */
export function clearCancelQuestions() {
  confirmingIds.clear()
  removedIds.clear()
}

/**
 * send the browser to a hash route.
 * @param {string} hash target such as `#/`
 * @returns {void}
 */
function navigateToHash(hash) {
  window.location.hash = hash
}

/**
 * count the saved segments of a recording.
 * @param {string} id recording id
 * @returns {Promise<number>} the number of segments
 */
async function countSavedSegments(id) {
  return (await listSegmentsForRecording(id)).length
}

/**
 * pick which state the card shows. a finished or failed status in the store wins, since it is
 * the record; otherwise the live job state, then the stored status.
 * @param {{ status: string }} recording the stored recording
 * @param {{ phase: string } | null} jobState the live state, if this tab is running the job
 * @returns {'waiting' | 'running' | 'done' | 'failed'} the card state
 */
export function pickCardState(recording, jobState) {
  if (recording.status === 'transcribed' || recording.status === 'summarized') return 'done'
  if (recording.status === 'failed') return 'failed'
  if (jobState?.phase === 'done') return 'done'
  if (jobState?.phase === 'failed') return 'failed'
  if (jobState?.phase === 'downloading' || jobState?.phase === 'transcribing') return 'running'
  if (jobState?.phase === 'waiting') return 'waiting'
  return recording.status === 'transcribing' ? 'running' : 'waiting'
}

/**
 * describe the time left with a capital letter, for the right side of the progress bar.
 * @param {number} seconds estimated seconds left
 * @returns {string} for example `About 2 minutes left`
 */
export function describeTimeLeft(seconds) {
  const estimate = formatEstimate(seconds)
  return `${estimate[0].toUpperCase()}${estimate.slice(1)} left`
}

/**
 * describe the line for the recordings ahead of a waiting one.
 * @param {number | undefined} recordingsAhead how many recordings run first, when known
 * @returns {string} the sentence to show
 */
export function describeWaiting(recordingsAhead) {
  if (!Number.isInteger(recordingsAhead) || recordingsAhead < 1) return 'Waiting to start'
  const noun = recordingsAhead === 1 ? 'recording' : 'recordings'
  return `Waiting for ${recordingsAhead} ${noun} ahead of this one`
}

/**
 * describe the model step: downloading with a percent, loading from the cache, or loaded with
 * its size.
 * @param {{ phase: string, isModelCached: boolean, downloadFraction: number }} jobState live state
 * @param {{ downloadMegabytes: number }} model the model choice
 * @returns {{ text: string, isDone: boolean }} the step text and whether the step is done
 */
export function describeModelStep(jobState, model) {
  if (jobState.phase === 'downloading') {
    if (jobState.isModelCached) return { text: 'Loading model', isDone: false }
    return {
      text: `Downloading model · ${Math.round(jobState.downloadFraction * 100)}%`,
      isDone: false,
    }
  }
  const cachedNote = jobState.isModelCached ? ', cached' : ''
  return { text: `Model loaded · ${model.downloadMegabytes} MB${cachedNote}`, isDone: true }
}

/**
 * build one pipeline step with an icon and hidden text that name its state, so the state never
 * depends on color alone.
 * @param {string} text the step text
 * @param {'done' | 'current' | 'pending'} stepState where the step stands
 * @returns {HTMLLIElement} the step
 */
function renderStep(text, stepState) {
  const spoken = { done: 'Done: ', current: 'In progress: ', pending: 'Not started: ' }[stepState]
  const icon = createElement('span', {
    className: `step-icon step-icon-${stepState}`,
    'aria-hidden': 'true',
  })
  if (stepState === 'done') icon.append(createIcon(checkIconPaths, { size: 14 }))
  return createElement('li', { className: `step step-${stepState}` }, [
    icon,
    createElement('span', { className: 'visually-hidden', text: spoken }),
    createElement('span', { className: 'step-text', text }),
  ])
}

/**
 * build the eyebrow, title, and meta line shared by every card state.
 * @param {{ title: string, durationSeconds: number, model: string }} recording the recording
 * @param {{ code: string, color: string }} course its course
 * @param {{ text: string, className: string }} eyebrow the small label above the title
 * @returns {HTMLElement[]} the three elements
 */
function renderHeading(recording, course, eyebrow) {
  const dot = createElement('span', { className: 'transcribe-dot', 'aria-hidden': 'true' })
  dot.style.background = `var(--course-${course.color})`
  return [
    createElement('p', {
      className: `transcribe-eyebrow ${eyebrow.className}`,
      text: eyebrow.text,
    }),
    createElement('h1', { className: 'transcribe-title', text: recording.title }),
    createElement('p', { className: 'transcribe-meta' }, [
      dot,
      createElement('span', { className: 'transcribe-meta-code', text: course.code }),
      createElement('span', { 'aria-hidden': 'true', text: ' · ' }),
      createElement('span', { className: 'visually-hidden', text: ', ' }),
      formatDuration(recording.durationSeconds),
      createElement('span', { 'aria-hidden': 'true', text: ' · ' }),
      createElement('span', { className: 'visually-hidden', text: ', ' }),
      getModel(recording.model).name,
    ]),
  ]
}

/**
 * render the Transcribing card for one recording. the card follows the live job state while
 * it is on screen and stops listening once the app replaces it.
 * @param {{ id: string }} params route params with the recording id
 * @param {{ courses: object[], recordings: object[], jobs?: object,
 *   countSegments?: (id: string) => Promise<number>, navigate?: (hash: string) => void }}
 *   context app data, plus job, data, and navigation functions that tests replace
 * @returns {HTMLElement} the page, or the not found page when the id is unknown
 * @throws {TypeError} when courses or recordings is not an array
 */
export function renderTranscribing(
  { id },
  {
    courses,
    recordings,
    jobs = defaultJobs,
    countSegments = countSavedSegments,
    navigate = navigateToHash,
  }
) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderTranscribing needs courses and recordings arrays')
  }
  const recording = recordings.find((candidate) => candidate.id === id)
  const course = courses.find((candidate) => candidate.id === recording?.courseId)
  if (!recording && removedIds.has(id)) {
    return createElement('section', { className: 'page page-transcribe', 'aria-busy': 'true' })
  }
  if (!recording || !course) return renderNotFound({ path: `/transcribe/${id}` })
  const model = getModel(recording.model)

  let jobState = jobs.getJobState(id)
  let cardState = pickCardState(recording, jobState)
  // the parts of the running card that change in place, so focus and the live box stay put
  let runningParts = null
  let lastLiveSegmentCount = -1

  const page = createElement('section', { className: 'page page-transcribe' })

  /**
   * stop the job, delete the recording with its audio and segments, and go to its course. when
   * the delete fails the button comes back and the reason is read out.
   * @param {HTMLButtonElement} button the button that asked, disabled while this runs
   * @param {string} message what to tell screen readers once the course page shows
   * @returns {Promise<void>} resolves once the recording is gone, or the failure is reported
   */
  async function removeRecording(button, message) {
    button.disabled = true
    removedIds.add(id)
    try {
      await jobs.cancelRecording(id)
    } catch (error) {
      removedIds.delete(id)
      button.disabled = false
      announce(`The recording could not be removed: ${error.message}`)
      return
    }
    confirmingIds.delete(id)
    navigate(`#/course/${encodeURIComponent(course.id)}`)
    announce(message)
  }

  /**
   * build the two buttons under a waiting or running card. Cancel asks once inline before it
   * removes anything.
   * @returns {HTMLElement} the button row, or the question with its two answers
   */
  function renderActions() {
    if (confirmingIds.has(id)) {
      const stopButton = createElement('button', {
        type: 'button',
        className: 'button button-outline button-danger transcribe-stop',
        text: 'Stop and remove',
      })
      const keepButton = createElement('button', {
        type: 'button',
        className: 'button button-outline transcribe-keep',
        text: 'Keep going',
      })
      stopButton.addEventListener('click', () =>
        removeRecording(stopButton, `Stopped and removed ${recording.title}.`)
      )
      keepButton.addEventListener('click', () => {
        confirmingIds.delete(id)
        draw()
        page.querySelector('.transcribe-cancel')?.focus()
      })
      return createElement(
        'div',
        {
          className: 'transcribe-confirm',
          role: 'group',
          'aria-labelledby': 'transcribe-confirm-question',
        },
        [
          createElement('p', {
            id: 'transcribe-confirm-question',
            className: 'transcribe-confirm-question',
            text: 'Stop and remove this recording?',
          }),
          createElement('div', { className: 'transcribe-actions' }, [keepButton, stopButton]),
        ]
      )
    }

    const cancelButton = createElement('button', {
      type: 'button',
      className: 'button button-plain button-danger transcribe-cancel',
      text: 'Cancel',
    })
    cancelButton.addEventListener('click', () => {
      confirmingIds.add(id)
      draw()
      // the safe answer takes focus, so a second Enter does not remove the recording
      page.querySelector('.transcribe-keep')?.focus()
    })
    return createElement('div', { className: 'transcribe-actions' }, [
      createElement('a', { className: 'button button-outline', href: '#/', text: 'Keep working' }),
      cancelButton,
    ])
  }

  /**
   * build the running card with its progress bar, steps, and live box.
   * @returns {HTMLElement[]} the card children
   */
  function renderRunning() {
    const state = jobState ?? {
      phase: 'transcribing',
      isModelCached: true,
      downloadFraction: 1,
      fraction: recording.progress,
      remainingSeconds: 0,
      latestSegments: [],
      segmentCount: 0,
    }
    const waveform = renderWaveform({
      seed: recording.id,
      color: course.color,
      barCount: waveformBarCount,
      height: 44,
      progressFraction: state.fraction,
    })
    const fill = createElement('span', { className: 'transcribe-bar-fill' })
    const bar = createElement(
      'div',
      {
        className: 'transcribe-bar',
        role: 'progressbar',
        'aria-label': 'Transcription progress',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
      [fill]
    )
    const percent = createElement('span', { className: 'transcribe-percent' })
    const timeLeft = createElement('span', { className: 'transcribe-time-left' })
    const steps = createElement('ol', { className: 'transcribe-steps' })
    const liveText = createElement('div', {
      className: 'transcribe-live-text',
      'aria-live': 'polite',
    })
    runningParts = { waveform, bar, fill, percent, timeLeft, steps, liveText }
    updateRunning()
    return [
      createElement('div', { className: 'transcribe-waveform' }, [waveform]),
      ...renderHeading(recording, course, {
        text: 'Transcribing',
        className: 'transcribe-eyebrow-working',
      }),
      bar,
      createElement('div', { className: 'transcribe-progress-text' }, [percent, timeLeft]),
      steps,
      createElement('div', { className: 'transcribe-live' }, [
        createElement('p', { className: 'transcribe-live-label' }, [
          createElement('span', { className: 'transcribe-live-dot', 'aria-hidden': 'true' }),
          'Live',
        ]),
        liveText,
      ]),
      renderActions(),
    ]
  }

  /**
   * bring the running card in line with the live state without rebuilding it.
   * @returns {void}
   */
  function updateRunning() {
    if (!runningParts) return
    const fraction = jobState?.fraction ?? recording.progress
    const percentValue = Math.round(fraction * 100)
    setWaveformProgress(runningParts.waveform, fraction)
    runningParts.fill.style.width = `${percentValue}%`
    runningParts.bar.setAttribute('aria-valuenow', String(percentValue))
    runningParts.percent.textContent = `${percentValue}%`

    if (!jobState) {
      // another tab or an earlier visit started this job, so only the stored percent is known
      runningParts.timeLeft.textContent = ''
      runningParts.steps.replaceChildren(
        renderStep('Model loaded', 'done'),
        renderStep('Transcribing audio', 'current')
      )
      return
    }
    const timeLeftText = describeTimeLeft(jobState.remainingSeconds)
    runningParts.timeLeft.textContent = timeLeftText
    runningParts.bar.setAttribute('aria-valuetext', `${percentValue}%, ${timeLeftText}`)
    const modelStep = describeModelStep(jobState, model)
    runningParts.steps.replaceChildren(
      renderStep(modelStep.text, modelStep.isDone ? 'done' : 'current'),
      renderStep('Transcribing audio', modelStep.isDone ? 'current' : 'pending')
    )

    // the live box changes once per chunk, so screen readers are not flooded by download events
    if (jobState.segmentCount === lastLiveSegmentCount) return
    lastLiveSegmentCount = jobState.segmentCount
    if (jobState.latestSegments.length === 0) {
      runningParts.liveText.replaceChildren(
        createElement('p', {
          className: 'transcribe-live-empty',
          text: 'Text shows here after each 5 minutes of audio.',
        })
      )
      return
    }
    runningParts.liveText.replaceChildren(
      ...jobState.latestSegments.map((segment, index, all) =>
        createElement('p', {
          className: index === all.length - 1 ? 'transcribe-live-latest' : 'transcribe-live-older',
          text: segment.text.trim(),
        })
      )
    )
  }

  /**
   * build the waiting card.
   * @returns {HTMLElement[]} the card children
   */
  function renderWaiting() {
    return [
      createElement('div', { className: 'transcribe-waveform' }, [
        renderWaveform({
          seed: recording.id,
          color: course.color,
          barCount: waveformBarCount,
          height: 44,
          progressFraction: 0,
        }),
      ]),
      ...renderHeading(recording, course, {
        text: 'Queued',
        className: 'transcribe-eyebrow-quiet',
      }),
      createElement('p', {
        className: 'transcribe-message',
        role: 'status',
        text: describeWaiting(jobState?.recordingsAhead),
      }),
      renderActions(),
    ]
  }

  /**
   * build the card for a saved transcript, filling in the segment count once it is known.
   * @returns {HTMLElement[]} the card children
   */
  function renderDone() {
    const count = createElement('span', { className: 'transcribe-count' })
    /**
     * show the segment count.
     * @param {number} total the number of segments
     * @returns {void}
     */
    const showCount = (total) => {
      // a silent file finishes with nothing in it, which reads better in words than as zero
      if (total === 0) count.textContent = 'no speech found'
      else count.textContent = `${total} ${total === 1 ? 'segment' : 'segments'}`
    }
    if (jobState?.phase === 'done') showCount(jobState.segmentCount)
    else countSegments(id).then(showCount, () => count.remove())
    return [
      createElement('div', { className: 'transcribe-waveform' }, [
        renderWaveform({
          seed: recording.id,
          color: course.color,
          barCount: waveformBarCount,
          height: 44,
          progressFraction: 1,
        }),
      ]),
      ...renderHeading(recording, course, {
        text: 'Transcribed',
        className: 'transcribe-eyebrow-done',
      }),
      createElement('p', { className: 'transcribe-message transcribe-message-done' }, [
        createIcon(checkIconPaths, { size: 18 }),
        'Transcript saved',
        count,
      ]),
      createElement('div', { className: 'transcribe-actions' }, [
        createElement('a', {
          className: 'button button-primary',
          href: `#/recording/${encodeURIComponent(id)}`,
          text: 'Open recording',
        }),
      ]),
    ]
  }

  /**
   * build the card for a failed transcription.
   * @returns {HTMLElement[]} the card children
   */
  function renderFailed() {
    const message = jobState?.errorMessage ?? recording.errorMessage ?? 'Something went wrong.'
    const removeButton = createElement('button', {
      type: 'button',
      className: 'button button-outline button-danger transcribe-remove',
      text: 'Remove recording',
    })
    removeButton.addEventListener('click', () =>
      removeRecording(removeButton, `Removed ${recording.title}.`)
    )
    return [
      ...renderHeading(recording, course, {
        text: 'Failed',
        className: 'transcribe-eyebrow-failed',
      }),
      createElement('p', { className: 'transcribe-message transcribe-message-failed' }, [
        createIcon(alertIconPaths, { size: 18 }),
        createElement('span', { className: 'transcribe-message-text', text: message }),
      ]),
      createElement('div', { className: 'transcribe-actions' }, [removeButton]),
    ]
  }

  /**
   * draw the card for the current state, keeping keyboard focus on the same control.
   * @returns {void}
   */
  function draw() {
    const focus = describeFocus(page)
    runningParts = null
    lastLiveSegmentCount = -1
    const renderers = {
      waiting: renderWaiting,
      running: renderRunning,
      done: renderDone,
      failed: renderFailed,
    }
    const card = createElement(
      'div',
      { className: `transcribe-card transcribe-card-${cardState}` },
      renderers[cardState]()
    )
    page.replaceChildren(
      card,
      createElement('p', { className: 'transcribe-footnote' }, [
        createIcon(lockIconPaths, { size: 16 }),
        'Runs in your browser. Closing the tab pauses it.',
      ])
    )
    page.dataset.cardState = cardState
    restoreFocus(page, focus, page.querySelector('h1'))
  }

  draw()

  // live updates for this recording until the page leaves the document
  const unsubscribe = jobs.subscribe((state) => {
    if (!page.isConnected) {
      unsubscribe()
      return
    }
    if (state.recordingId !== id) return
    jobState = state
    const nextCardState = pickCardState(recording, jobState)
    if (nextCardState === cardState && cardState === 'running') {
      updateRunning()
      return
    }
    cardState = nextCardState
    draw()
  })

  return page
}
