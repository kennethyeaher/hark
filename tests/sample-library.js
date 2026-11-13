// the seeded sample library in the shapes the pages read, built without a database

import { buildSampleLibrary } from '../src/data/seed.js'
import { buildLibrary } from '../src/data/library.js'

/**
 * build the sample library the way loadLibrary returns it after seeding.
 * @param {Date} now the current time, so sample dates are stable
 * @returns {{ courses: object[], recordings: object[], droppedCount: number }} the library
 */
export function buildSampleView(now) {
  return buildLibrary(buildSampleLibrary(now))
}
