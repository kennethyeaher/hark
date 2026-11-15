// the Recording page: header, audio player with a real waveform, transcript, and the notes rail

import { createElement } from '../lib/dom.js'
import { announce } from '../lib/announce.js'
import { setPageHooks } from '../app/page-hooks.js'
import { renderRecordingHeader } from '../components/recording-header.js'
import { renderPlayerBar } from '../components/player-bar.js'
import { renderTranscriptList } from '../components/transcript-list.js'
import { renderNotFound } from './not-found.js'
import { getRecording, setRecordingStarred } from '../data/recordings.js'
import { getAudio, saveAudioPeaks } from '../data/audio.js'
import { listSegmentsForRecording, updateSegmentTexts } from '../data/segments.js'
import { listMomentsForRecording } from '../data/moments.js'
import { createPlayer } from '../player/player.js'
import { readSavedRate, saveRate } from '../player/saved-rate.js'
import { findActiveSegmentIndex } from '../player/active-segment.js'
import { findMatches } from '../player/find.js'
import { describeMatchCount, renderTranscriptToolbar } from '../components/transcript-toolbar.js'
import { buildPeaks } from '../audio/peaks.js'
import { decodeAudioFile } from '../transcription/decode.js'
import { peakBarCount } from '../transcription/jobs.js'

/** the line the player shows when a recording has no audio on this device */
export const missingAudioMessage = 'Audio for sample lectures is not on this device.'

// the real data and audio functions; tests pass fakes through the context
const defaultServices = {
  getRecording,
  setRecordingStarred,
  getAudio,
  saveAudioPeaks,
  listSegmentsForRecording,
  listMomentsForRecording,
  updateSegmentTexts,
  createPlayer,
  decodeAudio: decodeAudioFile,
  buildPeaks,
  readSavedRate,
  saveRate,
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
 * swap the current history entry for another route, so Back does not return to a redirect.
 * @param {string} hash target such as `#/transcribe/abc`
 * @returns {void}
 */
function replaceHash(hash) {
  window.location.replace(hash)
}

/**
 * go back in history, or to the course page when this page was the first one opened.
 * @param {boolean} canGoBack true when the app showed another page before this one
 * @param {string} courseHash the course page to fall back to
 * @param {(hash: string) => void} navigate how to change the route
 * @returns {void}
 */
function goBack(canGoBack, courseHash, navigate) {
  if (canGoBack) window.history.back()
  else navigate(courseHash)
}

/**
 * check whether the user asked the system for less motion.
 * @returns {boolean} true when smooth scrolling should be skipped
 */
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * scroll a row to the middle of the window when it is hidden under the sticky player or below
 * the fold. a row that is already in view is left alone, so reading is not interrupted.
 * @param {HTMLElement} row the row to show
 * @param {HTMLElement} controls the sticky player and toolbar above the transcript
 * @returns {void}
 */
function scrollRowIntoView(row, controls) {
  const box = row.getBoundingClientRect()
  const topEdge = controls.getBoundingClientRect().bottom
  if (box.top >= topEdge && box.bottom <= window.innerHeight) return
  row.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/**
 * render the Recording page. a recording still in the queue or transcribing goes to its
 * Transcribing card, a failed one shows why, and an unknown id shows the not found page.
 * recordings in Trash are read straight from the store, since the library leaves them out.
 * @param {{ id: string }} params route params with the recording id
 * @param {{ courses: object[], recordings: object[], navigate?: (hash: string) => void,
 *   redirect?: (hash: string) => void, canGoBack?: boolean, services?: object }} context app
 *   data, navigation, and the data and audio functions that tests replace
 * @returns {HTMLElement} the page
 * @throws {TypeError} when courses or recordings is not an array
 */
export function renderRecording(
  { id },
  {
    courses,
    recordings,
    navigate = navigateToHash,
    redirect = replaceHash,
    canGoBack = false,
    services = defaultServices,
  }
) {
  if (!Array.isArray(courses) || !Array.isArray(recordings)) {
    throw new TypeError('renderRecording needs courses and recordings arrays')
  }
  const page = createElement('section', { className: 'page page-recording' })
  // set once the page is replaced, so late reads and saves do not touch a page that is gone
  let hasLeft = false
  const cleanups = []
  // the player once its audio loads. without audio, the page still keeps a position, so clicking
  // a row highlights it and a moment lands at that time
  let player = null
  let positionSeconds = 0
  const timeListeners = new Set()

  /**
   * tell every part of the page the playback position.
   * @param {number} seconds the position
   * @returns {void}
   */
  function showPosition(seconds) {
    positionSeconds = seconds
    for (const listener of timeListeners) listener(seconds)
  }

  /**
   * seek the player, or move the stored position when there is no audio.
   * @param {number} seconds the target
   * @returns {void}
   */
  function seekTo(seconds) {
    if (player) player.seek(seconds)
    else showPosition(seconds)
  }

  /**
   * release the player and anything else this page started, once.
   * @returns {void}
   */
  function leave() {
    hasLeft = true
    for (const cleanup of cleanups.splice(0)) cleanup()
  }
  // until the recording is read, a library reload leaves the page alone instead of redrawing it
  setPageHooks(page, { onData: () => {}, onLeave: leave })

  /**
   * show the not found page in place of this one.
   * @returns {void}
   */
  function showNotFound() {
    page.className = 'page page-recording-missing'
    page.replaceChildren(...renderNotFound({ path: `/recording/${id}` }).childNodes)
  }

  /**
   * build the page for a known recording and course.
   * @param {object} recording the stored recording
   * @param {{ id: string, code: string, color: string }} course its course
   * @returns {void}
   */
  function build(recording, course) {
    if (recording.status === 'queued' || recording.status === 'transcribing') {
      redirect(`#/transcribe/${encodeURIComponent(id)}`)
      return
    }
    let current = recording
    const courseHash = `#/course/${encodeURIComponent(course.id)}`
    const header = renderRecordingHeader({
      recording,
      course,
      onBack: () => goBack(canGoBack, courseHash, navigate),
      onStar: (isStarred) => toggleStar(isStarred),
    })

    /**
     * save the star and show it right away, putting it back when the save fails.
     * @param {boolean} isStarred the new value
     * @returns {Promise<void>} resolves once saved or reported
     */
    async function toggleStar(isStarred) {
      header.setStarBusy(true)
      header.setRecording({ ...current, isStarred })
      try {
        current = await services.setRecordingStarred(id, isStarred)
        announce(isStarred ? 'Starred' : 'Removed star')
      } catch (error) {
        header.setRecording(current)
        announce(`The star could not be saved: ${error.message}`)
      } finally {
        header.setStarBusy(false)
      }
    }

    setPageHooks(page, {
      onData(data) {
        const next = data.recordings.find((candidate) => candidate.id === id)
        if (!next) return
        current = next
        header.setRecording(next)
      },
      onLeave: leave,
    })

    if (recording.status === 'failed') {
      page.replaceChildren(header.element, renderFailure(recording))
      return
    }

    const controls = createElement('div', { className: 'recording-controls' })
    const transcriptSlot = createElement('div', {
      className: 'transcript-slot',
      'aria-busy': 'true',
    })
    const main = createElement('div', { className: 'recording-main' }, [controls, transcriptSlot])
    page.replaceChildren(
      header.element,
      createElement('div', { className: 'recording-body' }, [main])
    )
    mountPlayer(recording, controls)
    mountTranscript(controls, transcriptSlot)
  }

  /**
   * load the segments and moments, then show the transcript and keep it in step with playback.
   * @param {HTMLElement} controls the sticky area that gets the toolbar
   * @param {HTMLElement} slot where the transcript goes
   * @returns {Promise<void>} resolves once the transcript shows or the failure is shown
   */
  async function mountTranscript(controls, slot) {
    let storedSegments
    let moments
    try {
      ;[storedSegments, moments] = await Promise.all([
        services.listSegmentsForRecording(id),
        services.listMomentsForRecording(id),
      ])
    } catch (error) {
      if (hasLeft) return
      slot.removeAttribute('aria-busy')
      slot.replaceChildren(
        createElement('p', {
          className: 'transcript-empty',
          role: 'alert',
          text: `The transcript could not be read: ${error.message}`,
        })
      )
      return
    }
    if (hasLeft) return
    slot.removeAttribute('aria-busy')
    // find offsets and edits work on the text as shown, without whisper's leading space
    const segments = storedSegments.map((segment) => ({ ...segment, text: segment.text.trim() }))
    if (segments.length === 0) {
      slot.replaceChildren(
        createElement('p', {
          className: 'transcript-empty',
          text: 'No speech was found in this recording.',
        })
      )
      return
    }

    let isAutoScrollOn = true
    let lastIndex = -1
    let matches = []
    let currentMatch = -1
    let hasQuery = false
    let isEditing = false
    let isSaving = false
    const list = renderTranscriptList({ segments, onSeek: seekTo })
    list.setMoments(moments)

    /**
     * ask the browser to confirm closing the tab while edits are unsaved.
     * @param {BeforeUnloadEvent} event the unload event
     * @returns {void}
     */
    const warnBeforeUnload = (event) => {
      if (!list.hasChanges()) return
      event.preventDefault()
      event.returnValue = ''
    }

    /**
     * turn the rows into text fields. find clears and auto scroll pauses until editing ends.
     * @returns {void}
     */
    function startEditing() {
      isEditing = true
      toolbar.clearFind()
      matches = []
      hasQuery = false
      list.showMatches([])
      list.startEditing()
      toolbar.setEditing(true)
      window.addEventListener('beforeunload', warnBeforeUnload)
      list.getField(Math.max(0, lastIndex))?.focus()
    }

    /**
     * put the rows back and hand focus to Edit.
     * @param {string} message what to tell screen readers
     * @returns {void}
     */
    function stopEditing(message) {
      isEditing = false
      list.stopEditing()
      toolbar.setEditing(false)
      window.removeEventListener('beforeunload', warnBeforeUnload)
      toolbar.focusEdit()
      announce(message)
    }

    /**
     * save the changed segments in one write. an empty segment stops the save and says which.
     * @returns {Promise<void>} resolves once saved, or once the problem is shown
     */
    async function saveEdits() {
      if (isSaving) return
      const changes = list.getChanges()
      const emptyIndexes = changes
        .filter((change) => change.text === '')
        .map((change) => change.index)
      list.showEmptyErrors(emptyIndexes)
      if (emptyIndexes.length > 0) {
        list.getField(emptyIndexes[0])?.focus()
        announce('A segment cannot be empty.')
        return
      }
      if (changes.length === 0) {
        stopEditing('No changes to save')
        return
      }
      isSaving = true
      toolbar.setSaving(true)
      try {
        await services.updateSegmentTexts(
          id,
          changes.map((change) => ({ id: segments[change.index].id, text: change.text }))
        )
      } catch (error) {
        announce(`The edits could not be saved: ${error.message}`)
        return
      } finally {
        isSaving = false
        toolbar.setSaving(false)
      }
      if (hasLeft) return
      for (const change of changes) segments[change.index].text = change.text
      const noun = changes.length === 1 ? 'segment' : 'segments'
      stopEditing(`Saved ${changes.length} ${noun}`)
    }

    // leaving the page with unsaved edits drops them, and says so
    cleanups.push(() => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      if (isEditing && list.hasChanges()) announce('Transcript edits discarded')
    })

    /**
     * mark the current match, scroll to it, and update the count.
     * @param {number} matchIndex position in the matches, or -1
     * @returns {void}
     */
    function showCurrentMatch(matchIndex) {
      currentMatch = matchIndex
      const row = list.setCurrentMatch(matchIndex)
      if (row) scrollRowIntoView(row, controls)
      toolbar.setMatchCount(describeMatchCount(currentMatch, matches.length, hasQuery))
    }

    const toolbar = renderTranscriptToolbar({
      isAutoScrollOn,
      onAutoScroll: (isOn) => {
        isAutoScrollOn = isOn
        const row = list.getRow(lastIndex)
        if (isOn && row) scrollRowIntoView(row, controls)
      },
      onFind: (query) => {
        hasQuery = query.trim().length >= 2
        matches = findMatches(segments, query)
        list.showMatches(matches)
        showCurrentMatch(matches.length > 0 ? 0 : -1)
      },
      onFindStep: (direction) => {
        if (matches.length === 0) return
        showCurrentMatch((currentMatch + direction + matches.length) % matches.length)
      },
      onEdit: startEditing,
      onCancel: () => stopEditing('Edits canceled'),
      onSave: saveEdits,
    })
    controls.append(toolbar.element)
    slot.replaceChildren(list.element)

    /**
     * move the highlight only when the playing segment changes.
     * @param {number} seconds the position
     * @returns {void}
     */
    const handleTime = (seconds) => {
      const index = findActiveSegmentIndex(segments, seconds)
      if (index === lastIndex) return
      lastIndex = index
      const row = list.setActiveIndex(index)
      if (row && isAutoScrollOn && !isEditing) scrollRowIntoView(row, controls)
    }
    timeListeners.add(handleTime)
    cleanups.push(() => timeListeners.delete(handleTime))
    handleTime(positionSeconds)
  }

  /**
   * build the card for a failed transcription, with the reason and a way back to its card.
   * @param {{ errorMessage: string | null }} recording the failed recording
   * @returns {HTMLElement} the card
   */
  function renderFailure(recording) {
    return createElement('div', { className: 'recording-failed', role: 'alert' }, [
      createElement('p', {
        className: 'recording-failed-message',
        text: recording.errorMessage ?? 'The transcription failed.',
      }),
      createElement('a', {
        className: 'page-link',
        href: `#/transcribe/${encodeURIComponent(id)}`,
        text: 'Open the Transcribing card',
      }),
    ])
  }

  /**
   * add the player card, then load the audio. without audio the controls stay off and say why.
   * @param {object} recording the recording
   * @param {HTMLElement} controls the sticky area above the transcript
   * @returns {Promise<void>} resolves once the audio is loaded or found missing
   */
  async function mountPlayer(recording, controls) {
    const slot = createElement('div', { className: 'player-slot', 'aria-busy': 'true' })
    controls.prepend(slot)
    let audio
    try {
      audio = await services.getAudio(id)
    } catch (error) {
      announce(`The audio could not be read: ${error.message}`)
      audio = undefined
    }
    if (hasLeft) return
    slot.removeAttribute('aria-busy')

    if (!audio) {
      const bar = renderPlayerBar({
        durationSeconds: recording.durationSeconds,
        seed: recording.id,
        rate: 1,
        unavailableMessage: missingAudioMessage,
        onToggle: () => {},
        onSkip: () => {},
        onSeek: () => {},
        onRate: () => {},
      })
      slot.replaceChildren(bar.element)
      cleanups.push(bar.destroy)
      return
    }

    player = services.createPlayer(audio.blob)
    const startRate = services.readSavedRate()
    player.setRate(startRate)
    const bar = renderPlayerBar({
      durationSeconds: recording.durationSeconds,
      peaks: audio.peaks ?? null,
      seed: recording.id,
      rate: startRate,
      onToggle: () => player.toggle(),
      onSkip: (seconds) => player.skip(seconds),
      onSeek: (seconds) => player.seek(seconds),
      onRate: (rate) => {
        player.setRate(rate)
        services.saveRate(rate)
      },
    })
    slot.replaceChildren(bar.element)
    const unsubscribe = player.subscribe((state) => {
      bar.update(state)
      if (state.currentTime !== positionSeconds) showPosition(state.currentTime)
    })
    bar.update(player.getState())
    cleanups.push(unsubscribe, () => player.destroy(), bar.destroy)

    if (!audio.peaks) fillMissingPeaks(audio.blob, bar)
  }

  /**
   * compute and save peaks for audio uploaded before peaks existed. it runs once per recording,
   * since the saved peaks are there on the next visit. a failure keeps the placeholder bars.
   * @param {Blob} blob the stored audio
   * @param {{ setPeaks: (peaks: number[]) => void }} bar the player card
   * @returns {Promise<void>} resolves once peaks are shown or the failure is logged
   */
  async function fillMissingPeaks(blob, bar) {
    try {
      const { samples } = await services.decodeAudio(blob)
      const peaks = services.buildPeaks(samples, peakBarCount)
      if (hasLeft) return
      bar.setPeaks(peaks)
      await services.saveAudioPeaks(id, peaks)
    } catch (error) {
      // the waveform is decoration on top of a working player, so log it and keep the placeholder
      console.error(`Hark could not build the waveform for ${id}`, error)
    }
  }

  /**
   * find the course for a recording in the library.
   * @param {object} recording the recording
   * @returns {object | undefined} the course, if it exists
   */
  const findCourse = (recording) => courses.find((course) => course.id === recording.courseId)

  const known = recordings.find((candidate) => candidate.id === id)
  if (known) {
    const course = findCourse(known)
    if (course) build(known, course)
    else showNotFound()
    return page
  }

  // not in the library, so it may be in Trash. the title appears once the read finishes
  page.setAttribute('aria-busy', 'true')
  page.append(createElement('h1', { className: 'visually-hidden', text: 'Recording' }))
  services.getRecording(id).then(
    (stored) => {
      if (hasLeft) return
      page.removeAttribute('aria-busy')
      const course = stored && findCourse(stored)
      if (!stored || !course) {
        showNotFound()
        return
      }
      build(stored, course)
      document.title = `${stored.title} · Hark`
    },
    (error) => {
      page.removeAttribute('aria-busy')
      page.replaceChildren(
        createElement('h1', { className: 'page-title', text: 'Recording' }),
        createElement('p', {
          className: 'page-note',
          role: 'alert',
          text: `This recording could not be read: ${error.message}`,
        })
      )
    }
  )
  return page
}
