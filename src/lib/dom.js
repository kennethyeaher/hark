// small helpers for building dom nodes without a framework

const svgNamespace = 'http://www.w3.org/2000/svg'

/**
 * create an html element with attributes and children in one call.
 * @param {string} tagName element name such as `div` or `a`
 * @param {Record<string, string | number | boolean | null | undefined>} [attributes]
 *   attributes to set. `className` sets the class, `text` sets text content,
 *   `false`, `null`, and `undefined` skip the attribute, and `true` sets it empty.
 * @param {Array<Node | string | null | undefined | false>} [children] nodes or text to append
 * @returns {HTMLElement} the new element
 */
export function createElement(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue
    if (name === 'className') element.className = String(value)
    else if (name === 'text') element.textContent = String(value)
    else element.setAttribute(name, value === true ? '' : String(value))
  }
  appendChildren(element, children)
  return element
}

/**
 * create a decorative 20px stroke icon from svg path data. Hidden from screen readers.
 * @param {string[]} pathData one `d` string per path
 * @param {{ size?: number, className?: string }} [options] pixel size and class
 * @returns {SVGSVGElement} the svg element
 */
export function createIcon(pathData, { size = 20, className = 'icon' } = {}) {
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', className)
  for (const data of pathData) {
    const path = document.createElementNS(svgNamespace, 'path')
    path.setAttribute('d', data)
    svg.append(path)
  }
  return svg
}

/**
 * create an svg element in the svg namespace with attributes.
 * @param {string} tagName svg element name such as `rect`
 * @param {Record<string, string | number>} [attributes] attributes to set
 * @returns {SVGElement} the new svg element
 */
export function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tagName)
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value))
  }
  return element
}

/**
 * append nodes and strings to a parent, skipping empty values.
 * @param {Element} parent element that receives the children
 * @param {Array<Node | string | null | undefined | false>} children nodes or text
 * @returns {void}
 */
function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.append(child)
  }
}
