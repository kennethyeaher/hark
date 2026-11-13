// checks shared by the data modules, so every save throws the same kind of error

/**
 * check that a value is a string with at least one character that is not whitespace.
 * @param {unknown} value value to check
 * @param {string} label what the value is, used in the error message
 * @returns {string} the value, unchanged
 * @throws {TypeError} when value is not a string or is blank
 */
export function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non empty string, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * check that a value is a Date holding a real time.
 * @param {unknown} value value to check
 * @param {string} label what the value is, used in the error message
 * @returns {Date} the value, unchanged
 * @throws {TypeError} when value is not a valid Date
 */
export function assertDate(value, label) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${label} must be a valid Date, got ${String(value)}`)
  }
  return value
}

/**
 * check that a value is a finite number of zero or more.
 * @param {unknown} value value to check
 * @param {string} label what the value is, used in the error message
 * @returns {number} the value, unchanged
 * @throws {RangeError} when value is not a finite number or is negative
 */
export function assertNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite number of 0 or more, got ${String(value)}`)
  }
  return value
}

/**
 * check that a value is a plain object, so its fields can be read.
 * @param {unknown} value value to check
 * @param {string} label what the value is, used in the error message
 * @returns {object} the value, unchanged
 * @throws {TypeError} when value is null, an array, or not an object
 */
export function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object, got ${String(value)}`)
  }
  return value
}
