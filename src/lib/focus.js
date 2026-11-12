// keep keyboard focus in place when a region is rebuilt from new data

// attributes that tell one focusable element apart from its neighbours
const identityAttributes = ['id', 'class', 'href', 'name', 'data-course-id', 'aria-label', 'value']

/**
 * quote a value for use inside a css attribute selector.
 * @param {string} value attribute value
 * @returns {string} the value in double quotes with quotes and backslashes escaped
 */
function quoteAttribute(value) {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

/**
 * describe the focused element inside a container so a rebuilt copy of it can be found again.
 * @param {Element} container region that is about to be rebuilt
 * @returns {{ selector: string, index: number } | null} a selector and the match position,
 *   or null when focus is not inside the container
 */
export function describeFocus(container) {
  const active = container.ownerDocument.activeElement
  if (!active || active === container || !container.contains(active)) return null
  const parts = [active.tagName.toLowerCase()]
  for (const name of identityAttributes) {
    const value = active.getAttribute(name)
    if (value !== null) parts.push(`[${name}=${quoteAttribute(value)}]`)
  }
  const selector = parts.join('')
  const index = [...container.querySelectorAll(selector)].indexOf(active)
  return { selector, index }
}

/**
 * focus the element that matches a description from describeFocus, or the fallback when the
 * element is gone. does nothing when focus was not in the region or is still on a live element.
 * @param {Element} container region that was rebuilt
 * @param {{ selector: string, index: number } | null} description result of describeFocus
 * @param {HTMLElement} fallback element to focus when no match is left, such as the main region
 * @returns {void}
 */
export function restoreFocus(container, description, fallback) {
  if (!description) return
  const active = container.ownerDocument.activeElement
  if (active && active !== container.ownerDocument.body && active.isConnected) return
  const matches = container.querySelectorAll(description.selector)
  const target = matches[description.index] ?? matches[0] ?? fallback
  target.focus({ preventScroll: true })
}
