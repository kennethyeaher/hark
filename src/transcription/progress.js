// adds up the transformers.js download events for every model file into one progress value

/**
 * create a tracker that takes transformers.js `progress_callback` events and keeps one total
 * across every file a model needs.
 *
 * a file counts toward the totals only once its size is known, so a server that sends no
 * length cannot cause a division by zero or a fraction above 1. files start at different
 * times, so the fraction can step back a little when a new large file begins.
 * @returns {{ update: (event: object) => object, getSnapshot: () => object }} `update` takes
 *   one event and returns the new snapshot, `getSnapshot` returns the current one. a snapshot is
 *   `{ loadedBytes, totalBytes, fraction, isReady }`.
 */
export function createDownloadTracker() {
  // one entry per file, keyed by model and file name, holding the latest byte counts
  const files = new Map()
  let isReady = false

  /**
   * add up the files into one snapshot.
   * @returns {{ loadedBytes: number, totalBytes: number, fraction: number, isReady: boolean }}
   *   overall progress
   */
  function getSnapshot() {
    let loadedBytes = 0
    let totalBytes = 0
    for (const file of files.values()) {
      if (!(file.total > 0)) continue
      totalBytes += file.total
      loadedBytes += Math.min(file.loaded, file.total)
    }
    let fraction = totalBytes > 0 ? loadedBytes / totalBytes : 0
    if (isReady) fraction = 1
    return { loadedBytes, totalBytes, fraction, isReady }
  }

  /**
   * take one progress event and return the new snapshot. statuses this tracker does not know
   * are left alone, since newer library versions add events of their own.
   * @param {{ status: string, name?: string, file?: string, loaded?: number, total?: number }}
   *   event a transformers.js progress event
   * @returns {{ loadedBytes: number, totalBytes: number, fraction: number, isReady: boolean }}
   *   overall progress after this event
   * @throws {TypeError} when the event is not an object with a status
   */
  function update(event) {
    if (event === null || typeof event !== 'object' || typeof event.status !== 'string') {
      throw new TypeError(`progress event must be an object with a status, got ${String(event)}`)
    }
    const key = `${event.name ?? ''}/${event.file ?? ''}`
    const current = files.get(key) ?? { loaded: 0, total: 0 }

    switch (event.status) {
      case 'initiate':
      case 'download':
        files.set(key, current)
        break
      case 'progress':
        files.set(key, {
          loaded: toByteCount(event.loaded),
          total: toByteCount(event.total),
        })
        break
      case 'done':
        // a finished file with a known size is fully loaded, even if the last event was missed
        files.set(key, {
          loaded: current.total > 0 ? current.total : current.loaded,
          total: current.total,
        })
        break
      case 'ready':
        isReady = true
        break
    }
    return getSnapshot()
  }

  return { update, getSnapshot }
}

/**
 * read a byte count from an event field, treating anything that is not a usable count as 0.
 * @param {unknown} value field from a progress event
 * @returns {number} a finite count of 0 or more
 */
function toByteCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
