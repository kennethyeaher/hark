// pure filter and sort logic for recording lists, shared by the course page

/** filter chips in display order, with the label shown on each chip */
export const recordingFilters = [
  { id: 'all', label: 'All' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'summarized', label: 'Summarized' },
  { id: 'starred', label: 'Starred' },
  { id: 'hasNotes', label: 'Has notes' },
]

/** sort orders, with the label shown after "Sort:" */
export const recordingSorts = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
]

const filterIds = recordingFilters.map((filter) => filter.id)
const sortIds = recordingSorts.map((sort) => sort.id)

/**
 * get local midnight at the start of the given day.
 * @param {Date} date any moment in the day
 * @returns {Date} a new date at 00:00 local time
 */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * check that a value is an array of recordings with a valid date.
 * @param {unknown} recordings value to check
 * @returns {void}
 * @throws {TypeError} when it is not an array or a recording has no valid recordedAt date
 */
function assertRecordings(recordings) {
  if (!Array.isArray(recordings)) {
    throw new TypeError(`expected an array of recordings, and got ${String(recordings)}`)
  }
  for (const recording of recordings) {
    const date = recording?.recordedAt
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new TypeError(`recording ${recording?.id ?? '(no id)'} needs a valid recordedAt date`)
    }
  }
}

/**
 * keep the recordings that match one filter chip. "This week" means the last
 * seven calendar days, today included.
 * @param {object[]} recordings recordings with recordedAt, status, isStarred, and hasNotes
 * @param {string} filterId one of the ids in recordingFilters
 * @param {Date} [now] the current time, passed in so tests are stable
 * @returns {object[]} a new array in the original order
 * @throws {TypeError} when recordings or now are invalid
 * @throws {RangeError} when filterId is unknown
 */
export function filterRecordings(recordings, filterId, now = new Date()) {
  assertRecordings(recordings)
  if (!filterIds.includes(filterId)) {
    throw new RangeError(
      `unknown filter ${String(filterId)}, expected one of ${filterIds.join(', ')}`
    )
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(`filterRecordings needs a valid now date, and got ${String(now)}`)
  }

  const weekStart = startOfDay(now)
  weekStart.setDate(weekStart.getDate() - 6)

  // one predicate per chip, each taking a recording and returning whether it stays
  const predicates = {
    all: () => true,
    thisWeek: (recording) => recording.recordedAt >= weekStart,
    summarized: (recording) => recording.status === 'summarized',
    starred: (recording) => recording.isStarred === true,
    hasNotes: (recording) => recording.hasNotes === true,
  }
  return recordings.filter(predicates[filterId])
}

/**
 * sort recordings by date without changing the input array.
 * @param {object[]} recordings recordings with a recordedAt date
 * @param {string} sortId `newest` or `oldest`
 * @returns {object[]} a new sorted array
 * @throws {TypeError} when recordings are invalid
 * @throws {RangeError} when sortId is unknown
 */
export function sortRecordings(recordings, sortId) {
  assertRecordings(recordings)
  if (!sortIds.includes(sortId)) {
    throw new RangeError(`unknown sort ${String(sortId)}, expected one of ${sortIds.join(', ')}`)
  }
  const direction = sortId === 'newest' ? -1 : 1
  return [...recordings].sort((first, second) => direction * (first.recordedAt - second.recordedAt))
}
