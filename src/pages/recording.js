// the Recording page: header, audio player with a real waveform, transcript, and the notes rail

import { createElement } from '../lib/dom.js'
import { announce } from '../lib/announce.js'
import { setPageHooks } from '../app/page-hooks.js'
import { renderRecordingHeader } from '../components/recording-header.js'
import { renderPlayerBar } from '../components/player-bar.js'
import { renderNotFound } from './not-found.js'
import { getRecording, setRecordingStarred } from '../data/recordings.js'
import { getAudio, saveAudioPeaks } from '../data/audio.js'
import { createPlayer } from '../player/player.js'
import { readSavedRate, saveRate } from '../player/saved-rate.js'
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

    const main = createElement('div', { className: 'recording-main' })
    page.replaceChildren(
      header.element,
      createElement('div', { className: 'recording-body' }, [main])
    )
    mountPlayer(recording, main)
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
   * @param {HTMLElement} main the column that holds the player and transcript
   * @returns {Promise<void>} resolves once the audio is loaded or found missing
   */
  async function mountPlayer(recording, main) {
    const slot = createElement('div', { className: 'player-slot', 'aria-busy': 'true' })
    main.prepend(slot)
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

    const player = services.createPlayer(audio.blob)
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
    const unsubscribe = player.subscribe((state) => bar.update(state))
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
