// one shared signal that fires after any write to the store, so the ui can reload

/** fires a `change` event after every successful write in the data modules */
export const dataEvents = new EventTarget()

/**
 * tell listeners that the store changed.
 * @param {string} store name of the store that was written
 * @param {string} [id] key of the record that changed, when there is one
 * @returns {void}
 */
export function announceChange(store, id) {
  dataEvents.dispatchEvent(new CustomEvent('change', { detail: { store, id } }))
}
