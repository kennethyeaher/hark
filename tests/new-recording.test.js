// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeEstimate,
  renderFileName,
  renderNewRecordingSheet,
  validateNewCourse,
} from '../src/pages/new-recording.js'

const courses = [
  { id: 'hcim605', code: 'HCIM 605', name: 'Qualitative Research Methods', color: 'indigo' },
  { id: 'inst630', code: 'INST 630', name: 'Information Ethics', color: 'teal' },
]

let actions
let onDismiss
let onStart

/**
 * build fake data actions that record what the sheet asked for.
 * @returns {object} the actions
 */
function createFakeActions() {
  return {
    saveCourse: vi.fn(async (course) => ({ ...course, id: 'new-course-id' })),
    saveRecording: vi.fn(async (recording) => ({ ...recording, id: 'recording-1' })),
    saveAudio: vi.fn(async (audio) => audio),
    deleteRecordingForever: vi.fn(async () => {}),
    enqueueRecording: vi.fn(async () => {}),
    readAudioDuration: vi.fn(async () => 3480),
  }
}

/**
 * render the sheet with the fakes, put it in the document, and open it the way showModal
 * would, since jsdom has no showModal.
 * @param {object} [options] options that replace the defaults
 * @returns {HTMLDialogElement} the sheet
 */
function renderSheet(options = {}) {
  const sheet = renderNewRecordingSheet({ courses, onDismiss, onStart, actions, ...options })
  document.body.replaceChildren(sheet)
  sheet.setAttribute('open', '')
  return sheet
}

/**
 * make a file the way the browser's picker would.
 * @param {string} [name] file name
 * @returns {File} the file
 */
function makeFile(name = 'lecture-18_qualitative-coding.m4a') {
  return new File([new Uint8Array(1024)], name, {
    type: 'audio/mp4',
    lastModified: new Date(2026, 10, 10, 9, 30).getTime(),
  })
}

/**
 * pick a file through the hidden file input and wait for its length to be read.
 * @param {HTMLDialogElement} sheet the sheet
 * @param {File} file the file
 * @returns {Promise<void>} resolves once the sheet has updated
 */
async function pickFile(sheet, file) {
  const input = sheet.querySelector('input[type="file"]')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(actions.readAudioDuration).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * find the checked radio in a group.
 * @param {HTMLElement} sheet the sheet
 * @param {string} name radio group name
 * @returns {string | undefined} the checked value
 */
function checkedValue(sheet, name) {
  return [...sheet.querySelectorAll(`input[name="${name}"]`)].find((input) => input.checked)?.value
}

beforeEach(() => {
  actions = createFakeActions()
  onDismiss = vi.fn()
  onStart = vi.fn()
})

describe('describeEstimate', () => {
  it('asks for a file before one is picked', () => {
    expect(describeEstimate({ durationSeconds: null, modelKey: 'balanced' })).toBe(
      'Pick a file to see how long it will take.'
    )
  })

  it('names the model and the rounded time', () => {
    // 1200 seconds at the balanced factor rounds to whole minutes
    expect(describeEstimate({ durationSeconds: 1200, modelKey: 'balanced' })).toMatch(
      /^Balanced takes about \d+ minutes for this file on a laptop\. Nothing is uploaded\.$/
    )
    expect(describeEstimate({ durationSeconds: 10, modelKey: 'fast' })).toBe(
      'Fast takes less than a minute for this file on a laptop. Nothing is uploaded.'
    )
  })
})

describe('renderFileName', () => {
  it('keeps the last 12 characters apart so the end of the name always shows', () => {
    const name = 'INST630_2026-11-12_lecture-18_final-v2.wav'
    const element = renderFileName(name)
    expect(element.querySelector('.file-chip-name-end').textContent).toBe('final-v2.wav')
    expect(element.textContent).toBe(name)
    expect(element.getAttribute('title')).toBe(name)
  })

  it('puts a short name entirely in the end', () => {
    const element = renderFileName('a.mp3')
    expect(element.querySelector('.file-chip-name-start').textContent).toBe('')
    expect(element.querySelector('.file-chip-name-end').textContent).toBe('a.mp3')
  })
})

describe('validateNewCourse', () => {
  it('asks for both fields', () => {
    expect(validateNewCourse({ code: '', name: '' }, courses)).toEqual({
      code: 'Enter a course code, such as INST 630.',
      name: 'Enter a course name.',
    })
  })

  it('rejects a code that already exists, in any case', () => {
    expect(validateNewCourse({ code: 'inst 630', name: 'Again' }, courses).code).toBe(
      'inst 630 already exists. Pick it from the list instead.'
    )
  })

  it('rejects fields that are too long and accepts good ones', () => {
    const errors = validateNewCourse({ code: 'X'.repeat(21), name: 'Y'.repeat(81) }, courses)
    expect(errors.code).toMatch(/20 characters/)
    expect(errors.name).toMatch(/80 characters/)
    expect(validateNewCourse({ code: 'INST 737', name: 'Data' }, courses)).toEqual({
      code: null,
      name: null,
    })
  })
})

describe('renderNewRecordingSheet', () => {
  it('is a dialog labelled by its title', () => {
    const sheet = renderSheet()
    expect(sheet.tagName).toBe('DIALOG')
    expect(sheet.getAttribute('aria-labelledby')).toBe('new-recording-title')
    expect(sheet.querySelector('#new-recording-title').textContent).toBe('New recording')
  })

  it('shows Upload as the chosen source and Record now as disabled but reachable', () => {
    const sheet = renderSheet()
    const [upload, record] = sheet.querySelectorAll('.source-card')
    expect(upload.getAttribute('aria-pressed')).toBe('true')
    expect(upload.textContent).toContain('MP3, WAV, M4A, WebM · up to 3 hours')
    expect(record.getAttribute('aria-disabled')).toBe('true')
    expect(record.getAttribute('aria-label')).toBe('Record now, coming soon')
    expect(record.hasAttribute('disabled')).toBe(false)
  })

  it('preselects the course from the route', () => {
    const sheet = renderSheet({ initialCourseId: 'inst630' })
    expect(checkedValue(sheet, 'new-recording-course')).toBe('inst630')
  })

  it('falls back to the first course for an unknown or missing course', () => {
    expect(checkedValue(renderSheet({ initialCourseId: 'nope' }), 'new-recording-course')).toBe(
      'hcim605'
    )
  })

  it('asks for a course when there are none and keeps Start disabled', async () => {
    const sheet = renderSheet({ courses: [] })
    expect(sheet.querySelector('.sheet-hint').hidden).toBe(false)
    await pickFile(sheet, makeFile())
    expect(sheet.querySelector('.sheet-start').disabled).toBe(true)
  })

  it('offers the three models with Balanced picked', () => {
    const sheet = renderSheet()
    const labels = [...sheet.querySelectorAll('.segment')].map((segment) =>
      segment.textContent.trim()
    )
    expect(labels).toEqual(['FastWhisper tiny', 'BalancedWhisper base', 'AccurateWhisper small'])
    expect(checkedValue(sheet, 'new-recording-model')).toBe('balanced')
  })

  it('accepts audio and the listed extensions in the picker', () => {
    const input = renderSheet().querySelector('input[type="file"]')
    expect(input.getAttribute('accept')).toBe('audio/*,.m4a,.mp3,.wav,.webm,.ogg')
  })

  it('keeps Start disabled and asks for a file until one is picked', () => {
    const sheet = renderSheet()
    expect(sheet.querySelector('.sheet-start').disabled).toBe(true)
    expect(sheet.querySelector('.sheet-estimate').textContent).toBe(
      'Pick a file to see how long it will take.'
    )
  })

  it('shows the picked file with its length and size, and the estimate', async () => {
    const sheet = renderSheet()
    await pickFile(sheet, makeFile())
    const chip = sheet.querySelector('.file-chip')
    expect(chip.textContent).toContain('lecture-18_qualitative-coding.m4a')
    expect(chip.textContent).toContain('58 min · 1 KB')
    expect(sheet.querySelector('.dropzone').textContent).toContain(
      'Drop a different file or click to browse'
    )
    expect(sheet.querySelector('.sheet-estimate').textContent).toMatch(/^Balanced takes about/)
    expect(sheet.querySelector('.sheet-start').disabled).toBe(false)
  })

  it('updates the estimate when the model changes', async () => {
    const sheet = renderSheet()
    await pickFile(sheet, makeFile())
    const fast = sheet.querySelector('input[name="new-recording-model"][value="fast"]')
    fast.checked = true
    fast.dispatchEvent(new Event('change'))
    expect(sheet.querySelector('.sheet-estimate').textContent).toMatch(/^Fast takes/)
  })

  it('takes a dropped file and clears the dragover state', async () => {
    const sheet = renderSheet()
    const zone = sheet.querySelector('.dropzone')
    zone.dispatchEvent(new Event('dragover', { cancelable: true }))
    expect(zone.classList.contains('is-dragover')).toBe(true)
    const drop = new Event('drop', { cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [makeFile('drop.mp3')] } })
    zone.dispatchEvent(drop)
    expect(zone.classList.contains('is-dragover')).toBe(false)
    await vi.waitFor(() =>
      expect(sheet.querySelector('.file-chip').textContent).toContain('drop.mp3')
    )
  })

  it('shows an inline error and keeps Start disabled when the length cannot be read', async () => {
    actions.readAudioDuration.mockRejectedValueOnce(new Error('no metadata'))
    const sheet = renderSheet()
    await pickFile(sheet, makeFile('broken.m4a'))
    expect(sheet.querySelector('#new-recording-file-error').textContent).toBe(
      'The length of broken.m4a could not be read. Try an MP3, WAV, M4A, or WebM file.'
    )
    expect(sheet.querySelector('input[type="file"]').getAttribute('aria-invalid')).toBe('true')
    expect(sheet.querySelector('.sheet-start').disabled).toBe(true)
  })

  it('saves the recording, its audio, and queues it before calling onStart', async () => {
    const sheet = renderSheet({ initialCourseId: 'inst630' })
    const file = makeFile()
    await pickFile(sheet, file)
    const accurate = sheet.querySelector('input[name="new-recording-model"][value="accurate"]')
    accurate.checked = true
    accurate.dispatchEvent(new Event('change'))

    sheet.querySelector('.sheet-start').click()
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith('recording-1'))

    expect(actions.saveRecording).toHaveBeenCalledWith({
      title: 'lecture 18 qualitative coding',
      courseId: 'inst630',
      durationSeconds: 3480,
      recordedAt: new Date(2026, 10, 10, 9, 30),
      status: 'queued',
      progress: 0,
      model: 'accurate',
    })
    expect(actions.saveAudio).toHaveBeenCalledWith({ recordingId: 'recording-1', blob: file })
    expect(actions.enqueueRecording).toHaveBeenCalledWith('recording-1')
  })

  it('removes the recording again when the audio cannot be saved', async () => {
    actions.saveAudio.mockRejectedValueOnce(new Error('quota exceeded'))
    const sheet = renderSheet()
    await pickFile(sheet, makeFile())
    sheet.querySelector('.sheet-start').click()
    await vi.waitFor(() =>
      expect(actions.deleteRecordingForever).toHaveBeenCalledWith('recording-1')
    )
    expect(sheet.textContent).toContain('The recording could not be saved: quota exceeded')
    expect(onStart).not.toHaveBeenCalled()
    expect(sheet.querySelector('.sheet-start').disabled).toBe(false)
  })

  it('calls onDismiss from Close, Cancel, Escape, and the backdrop', () => {
    const sheet = renderSheet()
    sheet.querySelector('.sheet-close').click()
    sheet.querySelector('.sheet-actions .button-plain').click()
    const escape = new Event('cancel', { cancelable: true })
    sheet.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    sheet.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(4)
  })

  it('does not call onDismiss for a click inside the body', () => {
    const sheet = renderSheet()
    sheet.querySelector('.sheet-title').click()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('rejects bad options', () => {
    expect(() => renderNewRecordingSheet({ courses: null, onDismiss, onStart })).toThrow(
      /courses array/
    )
    expect(() => renderNewRecordingSheet({ courses, onStart })).toThrow(/onDismiss/)
  })
})

describe('new course fields', () => {
  it('open from + New and close from Cancel, with focus moving between them', () => {
    const sheet = renderSheet()
    const newButton = sheet.querySelector('.course-chip-new')
    const form = sheet.querySelector('.new-course-form')
    expect(form.hidden).toBe(true)
    newButton.click()
    expect(form.hidden).toBe(false)
    expect(newButton.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement.id).toBe('new-course-code')
    form.querySelector('.button-plain').click()
    expect(form.hidden).toBe(true)
    expect(document.activeElement).toBe(newButton)
  })

  it('shows errors inline and saves nothing for bad fields', async () => {
    const sheet = renderSheet()
    sheet.querySelector('.course-chip-new').click()
    sheet.querySelector('#new-course-code').value = 'HCIM 605'
    sheet.querySelector('.new-course-form').requestSubmit()
    expect(sheet.querySelector('#new-course-code-error').textContent).toBe(
      'HCIM 605 already exists. Pick it from the list instead.'
    )
    expect(sheet.querySelector('#new-course-name-error').textContent).toBe('Enter a course name.')
    expect(sheet.querySelector('#new-course-code').getAttribute('aria-invalid')).toBe('true')
    expect(actions.saveCourse).not.toHaveBeenCalled()
  })

  it('adds a course with the next unused color, picks it, and announces it', async () => {
    const sheet = renderSheet()
    sheet.querySelector('.course-chip-new').click()
    sheet.querySelector('#new-course-code').value = '  INST 737 '
    sheet.querySelector('#new-course-name').value = 'Data Science'
    sheet.querySelector('.new-course-form').requestSubmit()
    await vi.waitFor(() =>
      expect(checkedValue(sheet, 'new-recording-course')).toBe('new-course-id')
    )
    // indigo and teal are taken, so orange is next
    expect(actions.saveCourse).toHaveBeenCalledWith({
      code: 'INST 737',
      name: 'Data Science',
      color: 'orange',
    })
    expect(sheet.querySelector('.new-course-form').hidden).toBe(true)
    expect(sheet.querySelector('[role="status"]').textContent).toBe(
      'Added INST 737 and picked it for this recording.'
    )
    expect(document.activeElement.value).toBe('new-course-id')
  })
})

describe('unsupported files', () => {
  /**
   * pick a file and wait for the sheet to settle, whether or not it reads the length.
   * @param {HTMLDialogElement} sheet the sheet
   * @param {File} file the file
   * @returns {Promise<void>} resolves after the sheet updates
   */
  async function pickAny(sheet, file) {
    const input = sheet.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  /**
   * read the error under the drop zone.
   * @param {HTMLDialogElement} sheet the sheet
   * @returns {string} the error text
   */
  function fileErrorText(sheet) {
    return sheet.querySelector('#new-recording-file-error').textContent
  }

  it('rejects a file that is not audio without reading it', async () => {
    const sheet = renderSheet()
    await pickAny(sheet, new File(['%PDF'], 'syllabus.pdf', { type: 'application/pdf' }))
    expect(fileErrorText(sheet)).toBe(
      'syllabus.pdf is not an audio file. Pick an MP3, WAV, M4A, WebM, or OGG file.'
    )
    expect(actions.readAudioDuration).not.toHaveBeenCalled()
    expect(sheet.querySelector('.sheet-start').disabled).toBe(true)
  })

  it('takes a listed extension even when the browser gives no type', async () => {
    const sheet = renderSheet()
    await pickAny(sheet, new File([new Uint8Array(4)], 'lecture.m4a', { type: '' }))
    expect(fileErrorText(sheet)).toBe('')
    expect(sheet.querySelector('.sheet-start').disabled).toBe(false)
  })

  it('rejects a recording longer than 3 hours', async () => {
    actions.readAudioDuration.mockResolvedValueOnce(3 * 3600 + 1200)
    const sheet = renderSheet()
    await pickAny(sheet, makeFile('marathon.m4a'))
    expect(fileErrorText(sheet)).toBe(
      'marathon.m4a is 3 hr 20 min long. Hark takes recordings up to 3 hours.'
    )
    expect(sheet.querySelector('.sheet-start').disabled).toBe(true)
    expect(sheet.querySelector('.sheet-estimate').textContent).toBe(
      'Pick a file to see how long it will take.'
    )
  })

  it('accepts a recording of exactly 3 hours', async () => {
    actions.readAudioDuration.mockResolvedValueOnce(3 * 3600)
    const sheet = renderSheet()
    await pickAny(sheet, makeFile('long.m4a'))
    expect(fileErrorText(sheet)).toBe('')
    expect(sheet.querySelector('.sheet-start').disabled).toBe(false)
  })

  it('clears the error when a good file replaces a bad one', async () => {
    const sheet = renderSheet()
    await pickAny(sheet, new File(['x'], 'notes.txt', { type: 'text/plain' }))
    await pickAny(sheet, makeFile())
    expect(fileErrorText(sheet)).toBe('')
    expect(sheet.querySelector('input[type="file"]').hasAttribute('aria-invalid')).toBe(false)
  })

  it('saves nothing when Start is pressed with a rejected file', async () => {
    const sheet = renderSheet()
    await pickAny(sheet, new File(['x'], 'notes.txt', { type: 'text/plain' }))
    sheet.querySelector('.sheet-start').click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(actions.saveRecording).not.toHaveBeenCalled()
    expect(actions.saveAudio).not.toHaveBeenCalled()
  })
})
