// formatting helpers for durations, dates, and course colors

/** course color names that exist in the design tokens */
export const courseColors = ['indigo', 'teal', 'orange', 'pink']

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Format a length in seconds as whole minutes, such as `52 min` or `1 hr 08 min`.
 * @param {number} seconds duration in seconds, zero or more
 * @returns {string} the formatted duration
 * @throws {TypeError} when seconds is not a number or is NaN
 * @throws {RangeError} when seconds is negative or infinite
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    throw new TypeError(`seconds must be a number, got ${String(seconds)}`)
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`seconds must be finite and not negative, got ${seconds}`)
  }

  // round to whole minutes first so 59 min 40 s becomes 1 hr 00 min
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours} hr ${minutes} min`
}

/**
 * Check that a value is a Date holding a real time.
 * @param {unknown} value value to check
 * @returns {boolean} true when value is a valid Date
 */
function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Count local calendar days for a date, ignoring the time of day.
 * @param {Date} date a valid date
 * @returns {number} days since the epoch in local calendar terms
 */
function getLocalDayNumber(date) {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
}

/**
 * Format a date as `Today`, `Yesterday`, `Oct 21`, or `Oct 21, 2025`.
 * @param {Date} date the date to describe
 * @param {Date} [now] the reference date, defaults to the current time
 * @returns {string} the relative label
 * @throws {TypeError} when date or now is not a valid Date
 */
export function formatRelativeDate(date, now = new Date()) {
  if (!isValidDate(date)) throw new TypeError(`date must be a valid Date, got ${String(date)}`)
  if (!isValidDate(now)) throw new TypeError(`now must be a valid Date, got ${String(now)}`)

  // compare calendar days so 23:59 yesterday is not "today"
  const dayDifference = getLocalDayNumber(now) - getLocalDayNumber(date)
  if (dayDifference === 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'

  const label = `${monthNames[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === now.getFullYear() ? label : `${label}, ${date.getFullYear()}`
}
