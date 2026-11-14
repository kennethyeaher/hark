// the New recording sheet: pick an audio file, a course, and a model, then start transcribing

import { createElement, createIcon } from '../lib/dom.js'
import { courseColors, formatDuration } from '../lib/format.js'
import {
  buildRecordingTitle,
  describeAudioLimit,
  isAudioFile,
  maxAudioSeconds,
  readAudioDuration,
} from '../lib/audio-file.js'
import { formatBytes } from '../components/sidebar.js'
import { nextCourseColor, saveCourse } from '../data/courses.js'
import { deleteRecordingForever, saveRecording } from '../data/recordings.js'
import { saveAudio } from '../data/audio.js'
import { defaultModelKey, transcriptionModels } from '../transcription/models.js'
import { estimateSeconds, formatEstimate } from '../transcription/estimate.js'
import { enqueueRecording } from '../transcription/jobs.js'

const closeIconPaths = ['M6 6l12 12', 'M18 6L6 18']
const uploadIconPaths = ['M12 16V5', 'M7 10l5-5 5 5', 'M5 19h14']
const microphoneIconPaths = [
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z',
  'M5 11a7 7 0 0 0 14 0',
  'M12 18v3',
]
const fileIconPaths = ['M7 3h7l5 5v13H7z', 'M14 3v5h5']
const lockIconPaths = ['M6 11h12v10H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3']

/** what the file input offers in the browser's picker */
export const acceptedFileTypes = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg'

/** the longest code and name a new course can have */
const courseCodeMaxLength = 20
const courseNameMaxLength = 80

// the real data and job functions; tests pass fakes through the actions option
const defaultActions = {
  saveCourse,
  saveRecording,
  saveAudio,
  deleteRecordingForever,
  enqueueRecording,
  readAudioDuration,
}

/**
 * build one of the two source cards at the top of the sheet.
 * @param {{ title: string, subtitle: string, iconPaths: string[], isSelected: boolean }} options
 *   card text, its icon, and whether it is the chosen source
 * @returns {HTMLButtonElement} the card
 */
function renderSourceCard({ title, subtitle, iconPaths, isSelected }) {
  return createElement(
    'button',
    {
      type: 'button',
      className: `source-card${isSelected ? ' is-selected' : ''}`,
      'aria-pressed': isSelected ? 'true' : null,
    },
    [
      createElement('span', { className: 'source-card-icon', 'aria-hidden': 'true' }, [
        createIcon(iconPaths, { size: 22 }),
      ]),
      createElement('span', { className: 'source-card-title', text: title }),
      createElement('span', { className: 'source-card-subtitle', text: subtitle }),
    ]
  )
}

/**
 * build one course chip as a native radio, so arrow keys move between the chips.
 * @param {{ id: string, code: string, color: string }} course the course
 * @returns {HTMLLabelElement} the chip
 */
function renderCourseChip(course) {
  const color = courseColors.includes(course.color) ? course.color : courseColors[0]
  const chip = createElement('label', { className: 'course-chip' }, [
    createElement('input', {
      type: 'radio',
      name: 'new-recording-course',
      value: course.id,
      className: 'visually-hidden',
    }),
    createElement('span', { className: 'course-chip-dot', 'aria-hidden': 'true' }),
    createElement('span', { className: 'course-chip-code', text: course.code, title: course.code }),
  ])
  chip.style.setProperty('--chip-color', `var(--course-${color})`)
  return chip
}

/**
 * check the code and name for a new course against the courses that exist.
 * @param {{ code: string, name: string }} fields the trimmed field values
 * @param {Array<{ code: string }>} courses courses that exist now
 * @returns {{ code: string | null, name: string | null }} a message per field, or null when
 *   the field is fine
 */
export function validateNewCourse({ code, name }, courses) {
  const errors = { code: null, name: null }
  if (code === '') errors.code = 'Enter a course code, such as INST 630.'
  else if (code.length > courseCodeMaxLength) {
    errors.code = `Keep the code to ${courseCodeMaxLength} characters or fewer.`
  } else if (courses.some((course) => course.code.toLowerCase() === code.toLowerCase())) {
    errors.code = `${code} already exists. Pick it from the list instead.`
  }
  if (name === '') errors.name = 'Enter a course name.'
  else if (name.length > courseNameMaxLength) {
    errors.name = `Keep the name to ${courseNameMaxLength} characters or fewer.`
  }
  return errors
}

/**
 * build the estimate line under the model choice.
 * @param {{ durationSeconds: number | null, modelKey: string }} options file length, or null
 *   before a file is picked, and the model choice
 * @returns {string} the sentence to show
 */
export function describeEstimate({ durationSeconds, modelKey }) {
  if (durationSeconds === null) return 'Pick a file to see how long it will take.'
  const model = transcriptionModels[modelKey]
  const estimate = formatEstimate(estimateSeconds({ durationSeconds, modelKey }))
  return `${model.label} takes ${estimate} for this file on a laptop. Nothing is uploaded.`
}

/**
 * build the New recording sheet as a native dialog. the caller shows it with showModal and
 * removes it when the route changes.
 * @param {{ courses: object[], initialCourseId?: string, onDismiss: () => void,
 *   onStart: (recordingId: string) => void, actions?: object }} options the courses to pick
 *   from, the course to preselect, what to do when the sheet is closed without starting, what
 *   to do once a recording is saved and queued, and data functions for tests
 * @returns {HTMLDialogElement} the dialog
 * @throws {TypeError} when courses is not an array or a callback is missing
 */
export function renderNewRecordingSheet({
  courses,
  initialCourseId,
  onDismiss,
  onStart,
  actions = defaultActions,
}) {
  if (!Array.isArray(courses)) {
    throw new TypeError('renderNewRecordingSheet needs a courses array')
  }
  if (typeof onDismiss !== 'function' || typeof onStart !== 'function') {
    throw new TypeError('renderNewRecordingSheet needs onDismiss and onStart functions')
  }
  const knownCourses = [...courses]

  // everything the sheet tracks while it is open
  const state = {
    file: null,
    durationSeconds: null,
    fileError: null,
    isReadingFile: false,
    courseId: knownCourses.some((course) => course.id === initialCourseId)
      ? initialCourseId
      : (knownCourses[0]?.id ?? null),
    modelKey: defaultModelKey,
    isStarting: false,
  }
  // each pick gets a number, so a slow read of an older file cannot overwrite a newer one
  let fileReadNumber = 0

  const status = createElement('p', { className: 'visually-hidden', role: 'status' })

  // header with the title and the close button
  const closeButton = createElement(
    'button',
    { type: 'button', className: 'sheet-close', 'aria-label': 'Close' },
    [createIcon(closeIconPaths, { size: 18 })]
  )
  const header = createElement('div', { className: 'sheet-header' }, [
    // the title takes focus when the sheet opens, so screen readers start at the top and no
    // ring lands on the close button for mouse users
    createElement('h2', {
      id: 'new-recording-title',
      className: 'sheet-title',
      text: 'New recording',
      tabindex: -1,
      autofocus: true,
    }),
    closeButton,
  ])

  // source cards. upload is the only source for now; record now waits for a later milestone
  const uploadCard = renderSourceCard({
    title: 'Upload audio',
    subtitle: `MP3, WAV, M4A, WebM · up to ${describeAudioLimit()}`,
    iconPaths: uploadIconPaths,
    isSelected: true,
  })
  const recordCard = renderSourceCard({
    title: 'Record now',
    subtitle: 'Coming soon',
    iconPaths: microphoneIconPaths,
    isSelected: false,
  })
  recordCard.setAttribute('aria-disabled', 'true')
  recordCard.setAttribute('aria-label', 'Record now, coming soon')
  const sources = createElement(
    'div',
    { className: 'source-cards', role: 'group', 'aria-label': 'Source' },
    [uploadCard, recordCard]
  )

  // drop zone around a native file input, so the keyboard and screen readers get a real control
  const fileInput = createElement('input', {
    type: 'file',
    id: 'new-recording-file',
    className: 'visually-hidden',
    accept: acceptedFileTypes,
    'aria-describedby': 'new-recording-file-hint new-recording-file-error',
  })
  const dropContent = createElement('span', { className: 'dropzone-content' })
  const dropZone = createElement('label', { className: 'dropzone', for: 'new-recording-file' }, [
    fileInput,
    dropContent,
  ])
  const fileError = createElement('p', {
    id: 'new-recording-file-error',
    className: 'sheet-error',
    'aria-live': 'polite',
  })
  uploadCard.addEventListener('click', () => fileInput.click())

  // course chips as a radio group, then the inline fields for a new course
  const courseChips = createElement('div', { className: 'course-chips' })
  const newCourseButton = createElement('button', {
    type: 'button',
    className: 'course-chip course-chip-new',
    'aria-expanded': 'false',
    'aria-controls': 'new-course-form',
    text: '+ New',
  })
  const codeInput = createElement('input', {
    id: 'new-course-code',
    className: 'text-input',
    type: 'text',
    autocomplete: 'off',
    maxlength: courseCodeMaxLength,
    'aria-describedby': 'new-course-code-error',
  })
  const nameInput = createElement('input', {
    id: 'new-course-name',
    className: 'text-input',
    type: 'text',
    autocomplete: 'off',
    maxlength: courseNameMaxLength,
    'aria-describedby': 'new-course-name-error',
  })
  const codeError = createElement('p', { id: 'new-course-code-error', className: 'sheet-error' })
  const nameError = createElement('p', { id: 'new-course-name-error', className: 'sheet-error' })
  const addCourseButton = createElement('button', {
    type: 'submit',
    className: 'button button-primary button-small',
    text: 'Add',
  })
  const cancelCourseButton = createElement('button', {
    type: 'button',
    className: 'button button-plain button-small',
    text: 'Cancel',
  })
  const newCourseForm = createElement(
    'form',
    { id: 'new-course-form', className: 'new-course-form', 'aria-label': 'New course' },
    [
      createElement('div', { className: 'new-course-field' }, [
        createElement('label', { for: 'new-course-code', text: 'Code' }),
        codeInput,
        codeError,
      ]),
      createElement('div', { className: 'new-course-field new-course-field-wide' }, [
        createElement('label', { for: 'new-course-name', text: 'Name' }),
        nameInput,
        nameError,
      ]),
      createElement('div', { className: 'new-course-actions' }, [
        addCourseButton,
        cancelCourseButton,
      ]),
    ]
  )
  newCourseForm.hidden = true
  const courseHint = createElement('p', {
    className: 'sheet-hint',
    text: 'Add a course to file this recording under.',
  })
  const courseField = createElement('fieldset', { className: 'sheet-field' }, [
    createElement('legend', { className: 'sheet-label', text: 'Course' }),
    courseChips,
    courseHint,
    newCourseForm,
  ])

  // model choice as a segmented radio group
  const modelOptions = Object.values(transcriptionModels).map((model) => {
    const input = createElement('input', {
      type: 'radio',
      name: 'new-recording-model',
      value: model.key,
      className: 'visually-hidden',
    })
    input.checked = model.key === state.modelKey
    input.addEventListener('change', () => {
      state.modelKey = model.key
      update()
    })
    return createElement('label', { className: 'segment' }, [
      input,
      createElement('span', { className: 'segment-label', text: model.label }),
      createElement('span', { className: 'segment-detail', text: model.name }),
    ])
  })
  const estimate = createElement('p', { className: 'sheet-estimate', 'aria-live': 'polite' })
  const modelField = createElement('fieldset', { className: 'sheet-field' }, [
    createElement('legend', { className: 'sheet-label', text: 'Model' }),
    createElement('div', { className: 'segmented' }, modelOptions),
    estimate,
  ])

  // footer with the privacy note and the two actions
  const cancelButton = createElement('button', {
    type: 'button',
    className: 'button button-plain',
    text: 'Cancel',
  })
  const startButton = createElement(
    'button',
    { type: 'button', className: 'button button-primary sheet-start' },
    [createIcon(uploadIconPaths, { size: 18 }), 'Start transcribing']
  )
  const startError = createElement('p', { className: 'sheet-error', 'aria-live': 'polite' })
  const footer = createElement('div', { className: 'sheet-footer' }, [
    createElement('p', { className: 'sheet-privacy' }, [
      createIcon(lockIconPaths, { size: 16 }),
      'Stays on this device',
    ]),
    createElement('div', { className: 'sheet-actions' }, [cancelButton, startButton]),
  ])

  const dialog = createElement(
    'dialog',
    { className: 'sheet', 'aria-labelledby': 'new-recording-title' },
    [
      createElement('div', { className: 'sheet-body' }, [
        header,
        sources,
        createElement('div', { className: 'sheet-file' }, [dropZone, fileError]),
        courseField,
        modelField,
        startError,
        footer,
        status,
      ]),
    ]
  )

  /**
   * draw the drop zone for the current file, or the empty prompt.
   * @returns {void}
   */
  function renderDropContent() {
    if (state.file) {
      const details = state.isReadingFile
        ? 'Reading the file'
        : `${formatDuration(state.durationSeconds ?? 0)} · ${formatBytes(state.file.size)}`
      dropContent.replaceChildren(
        createElement('span', { className: 'file-chip' }, [
          createIcon(fileIconPaths, { size: 18 }),
          createElement('span', {
            className: 'file-chip-name',
            text: state.file.name,
            title: state.file.name,
          }),
          createElement('span', {
            className: 'file-chip-details',
            text: state.fileError ? '' : details,
          }),
        ]),
        createElement('span', {
          id: 'new-recording-file-hint',
          className: 'dropzone-hint',
          text: 'Drop a different file or click to browse',
        })
      )
      return
    }
    dropContent.replaceChildren(
      createIcon(uploadIconPaths, { size: 22, className: 'icon dropzone-icon' }),
      createElement('span', { className: 'dropzone-title', text: 'Choose an audio file' }),
      createElement('span', {
        id: 'new-recording-file-hint',
        className: 'dropzone-hint',
        text: 'Drop it here or click to browse',
      })
    )
  }

  /**
   * draw the course chips and check the selected one.
   * @returns {void}
   */
  function renderCourseChips() {
    const chips = knownCourses.map((course) => {
      const chip = renderCourseChip(course)
      const input = chip.querySelector('input')
      input.checked = course.id === state.courseId
      input.addEventListener('change', () => {
        state.courseId = course.id
        update()
      })
      return chip
    })
    courseChips.replaceChildren(...chips, newCourseButton)
    courseHint.hidden = knownCourses.length > 0
  }

  /**
   * bring every part of the sheet in line with the state.
   * @returns {void}
   */
  function update() {
    renderDropContent()
    fileError.textContent = state.fileError ?? ''
    if (state.fileError) fileInput.setAttribute('aria-invalid', 'true')
    else fileInput.removeAttribute('aria-invalid')
    estimate.textContent = describeEstimate({
      durationSeconds: state.fileError ? null : state.durationSeconds,
      modelKey: state.modelKey,
    })
    const canStart =
      state.file !== null &&
      state.durationSeconds !== null &&
      state.fileError === null &&
      !state.isReadingFile &&
      state.courseId !== null &&
      !state.isStarting
    startButton.disabled = !canStart
  }

  /**
   * take a picked or dropped file, check it, read its length, and show it. a file that is not
   * audio, has no readable length, or runs past the limit shows why under the drop zone, and
   * nothing is saved.
   * @param {File | undefined} file the file, if one was picked
   * @returns {Promise<void>} resolves once the file is shown or rejected
   */
  async function pickFile(file) {
    if (!file) return
    fileReadNumber += 1
    const readNumber = fileReadNumber
    Object.assign(state, { file, durationSeconds: null, fileError: null, isReadingFile: true })
    if (!isAudioFile(file)) {
      state.fileError = `${file.name} is not an audio file. Pick an MP3, WAV, M4A, WebM, or OGG file.`
      state.isReadingFile = false
      update()
      return
    }
    update()
    // the browser's reason means little to a person, so a failed read turns into null and the
    // message below says the file will not work
    const durationSeconds = await actions.readAudioDuration(file).catch(() => null)
    if (readNumber !== fileReadNumber) return
    state.isReadingFile = false
    if (durationSeconds === null) {
      state.fileError = `The length of ${file.name} could not be read. Try an MP3, WAV, M4A, or WebM file.`
    } else if (durationSeconds > maxAudioSeconds) {
      state.fileError = `${file.name} is ${formatDuration(durationSeconds)} long. Hark takes recordings up to ${describeAudioLimit()}.`
    } else {
      state.durationSeconds = durationSeconds
    }
    update()
  }

  fileInput.addEventListener('change', () => pickFile(fileInput.files?.[0]))

  // drag and drop. the class drives the dragover style
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault()
    dropZone.classList.add('is-dragover')
  })
  dropZone.addEventListener('dragleave', (event) => {
    if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragover')
  })
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault()
    dropZone.classList.remove('is-dragover')
    pickFile(event.dataTransfer?.files?.[0])
  })

  /**
   * show or hide the new course fields.
   * @param {boolean} isOpen true to show them
   * @returns {void}
   */
  function setNewCourseOpen(isOpen) {
    newCourseForm.hidden = !isOpen
    newCourseButton.setAttribute('aria-expanded', String(isOpen))
    if (isOpen) {
      codeInput.focus()
      return
    }
    newCourseForm.reset()
    showCourseErrors({ code: null, name: null })
    newCourseButton.focus()
  }

  /**
   * show a message under each new course field, or clear it.
   * @param {{ code: string | null, name: string | null }} errors a message per field
   * @returns {void}
   */
  function showCourseErrors(errors) {
    codeError.textContent = errors.code ?? ''
    nameError.textContent = errors.name ?? ''
    for (const [input, message] of [
      [codeInput, errors.code],
      [nameInput, errors.name],
    ]) {
      if (message) input.setAttribute('aria-invalid', 'true')
      else input.removeAttribute('aria-invalid')
    }
  }

  newCourseButton.addEventListener('click', () => setNewCourseOpen(newCourseForm.hidden))
  cancelCourseButton.addEventListener('click', () => setNewCourseOpen(false))
  newCourseForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const fields = { code: codeInput.value.trim(), name: nameInput.value.trim() }
    const errors = validateNewCourse(fields, knownCourses)
    showCourseErrors(errors)
    if (errors.code) {
      codeInput.focus()
      return
    }
    if (errors.name) {
      nameInput.focus()
      return
    }
    addCourseButton.disabled = true
    try {
      const course = await actions.saveCourse({ ...fields, color: nextCourseColor(knownCourses) })
      knownCourses.push(course)
      state.courseId = course.id
      newCourseForm.hidden = true
      newCourseForm.reset()
      newCourseButton.setAttribute('aria-expanded', 'false')
      renderCourseChips()
      update()
      const inputs = [...courseChips.querySelectorAll('input[type="radio"]')]
      inputs.find((input) => input.value === course.id)?.focus()
      status.textContent = `Added ${course.code} and picked it for this recording.`
    } catch (error) {
      showCourseErrors({ code: `The course could not be saved: ${error.message}`, name: null })
    } finally {
      addCourseButton.disabled = false
    }
  })

  /**
   * save the recording and its audio, put it in line, and hand its id to onStart. a failed
   * audio save removes the recording again, so nothing half saved is left behind.
   * @returns {Promise<void>} resolves once the recording is queued or the error is shown
   */
  async function startTranscribing() {
    if (startButton.disabled) return
    state.isStarting = true
    startError.textContent = ''
    update()
    const { file, durationSeconds, courseId, modelKey } = state
    let recording = null
    try {
      recording = await actions.saveRecording({
        title: buildRecordingTitle(file.name),
        courseId,
        durationSeconds,
        recordedAt: new Date(file.lastModified || Date.now()),
        status: 'queued',
        progress: 0,
        model: modelKey,
      })
      await actions.saveAudio({ recordingId: recording.id, blob: file })
      await actions.enqueueRecording(recording.id)
    } catch (error) {
      if (recording) await actions.deleteRecordingForever(recording.id)
      startError.textContent = `The recording could not be saved: ${error.message}`
      state.isStarting = false
      update()
      return
    }
    onStart(recording.id)
  }
  startButton.addEventListener('click', startTranscribing)

  /**
   * close the sheet without starting, unless a save is running.
   * @returns {void}
   */
  function dismiss() {
    if (state.isStarting) return
    onDismiss()
  }
  closeButton.addEventListener('click', dismiss)
  cancelButton.addEventListener('click', dismiss)
  // escape fires cancel on a modal dialog. the app closes it through the route instead
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dismiss()
  })
  // a click on the dialog itself, not its body, landed on the backdrop
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss()
  })

  renderCourseChips()
  update()
  return dialog
}
