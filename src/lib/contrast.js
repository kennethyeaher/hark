// wcag 2.1 contrast math, used by tests and by any later check on token values

/**
 * Turn a six digit hex color into red, green, and blue channels from 0 to 255.
 * @param {string} hex color such as `#0B63E5` or `0b63e5`
 * @returns {{ red: number, green: number, blue: number }} the three channels
 * @throws {Error} when the value is not a six digit hex color
 */
export function parseHexColor(hex) {
  if (typeof hex !== 'string' || !/^#?[0-9a-f]{6}$/i.test(hex.trim())) {
    throw new Error(`parseHexColor needs a six digit hex color, and got ${String(hex)}`)
  }
  const digits = hex.trim().replace('#', '')
  return {
    red: parseInt(digits.slice(0, 2), 16),
    green: parseInt(digits.slice(2, 4), 16),
    blue: parseInt(digits.slice(4, 6), 16),
  }
}

/**
 * Convert one 0 to 255 channel to its linear light value, as wcag defines it.
 * @param {number} channel channel value from 0 to 255
 * @returns {number} linear value from 0 to 1
 */
function linearizeChannel(channel) {
  const scaled = channel / 255
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

/**
 * Compute the wcag relative luminance of a hex color.
 * @param {string} hex six digit hex color
 * @returns {number} luminance from 0 for black to 1 for white
 * @throws {Error} when the value is not a six digit hex color
 */
export function relativeLuminance(hex) {
  const { red, green, blue } = parseHexColor(hex)
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  )
}

/**
 * Compute the wcag contrast ratio between two hex colors. Order does not matter.
 * @param {string} foreground six digit hex color
 * @param {string} background six digit hex color
 * @returns {number} ratio from 1 to 21
 * @throws {Error} when either value is not a six digit hex color
 */
export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
