import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { contrastRatio, parseHexColor, relativeLuminance } from '../src/lib/contrast.js'

// the two light surfaces every color has to sit on
const backgrounds = { background: '#FFFFFF', grouped: '#F5F5F7' }

// approved light theme values: shapes need 3:1, text needs 4.5:1
const shapeColors = {
  indigo: '#5E5CE6',
  teal: '#1E9AAF',
  orange: '#CE7700',
  pink: '#E8325B',
  green: '#1E8E3E',
  red: '#D93025',
}
const textColors = {
  indigo: '#5E5CE6',
  teal: '#177A8A',
  orange: '#A56000',
  pink: '#DB1944',
  green: '#1B8138',
  red: '#D52F24',
  label: '#1D1D1F',
  'secondary label': '#6E6E73',
  blue: '#0B63E5',
}

describe('contrast math', () => {
  it('gives 21 for black on white and 1 for a color on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#0B63E5', '#0B63E5')).toBe(1)
  })

  it('does not care about argument order', () => {
    expect(contrastRatio('#FFFFFF', '#6E6E73')).toBe(contrastRatio('#6E6E73', '#FFFFFF'))
  })

  it('computes luminance at the ends of the range', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBe(1)
  })

  it('rejects values that are not six digit hex colors', () => {
    expect(() => parseHexColor('#fff')).toThrow(/six digit hex/)
    expect(() => parseHexColor('blue')).toThrow(/got blue/)
    expect(() => parseHexColor(null)).toThrow(/got null/)
  })
})

describe('light theme colors', () => {
  for (const [surfaceName, surface] of Object.entries(backgrounds)) {
    for (const [name, value] of Object.entries(shapeColors)) {
      it(`${name} shape meets 3:1 on ${surfaceName}`, () => {
        expect(contrastRatio(value, surface)).toBeGreaterThanOrEqual(3)
      })
    }
    for (const [name, value] of Object.entries(textColors)) {
      it(`${name} text meets 4.5:1 on ${surfaceName}`, () => {
        expect(contrastRatio(value, surface)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('tokens.css', () => {
  const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
  const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme'))

  /**
   * read one custom property value from the light theme block.
   * @param {string} name property name without the leading dashes
   * @returns {string | undefined} the value, or undefined when it is missing
   */
  function readToken(name) {
    return lightBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  }

  it('uses the approved course shape and text values', () => {
    for (const name of ['indigo', 'teal', 'orange', 'pink']) {
      expect(readToken(`course-${name}`)?.toLowerCase()).toBe(shapeColors[name].toLowerCase())
      expect(readToken(`course-${name}-text`)?.toLowerCase()).toBe(textColors[name].toLowerCase())
    }
  })

  it('uses the approved status text values', () => {
    expect(readToken('color-green-text')?.toLowerCase()).toBe(textColors.green.toLowerCase())
    expect(readToken('color-red-text')?.toLowerCase()).toBe(textColors.red.toLowerCase())
  })
})
