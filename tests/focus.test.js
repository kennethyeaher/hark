// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { describeFocus, restoreFocus } from '../src/lib/focus.js'

/**
 * build a region with two links and a button, and a main element to fall back to.
 * @returns {{ region: HTMLElement, fallback: HTMLElement }} the region and fallback
 */
function buildRegion() {
  document.body.innerHTML = `
    <div id="region">
      <a href="#/course/a">A</a>
      <a href="#/course/b">B</a>
      <button aria-label="More">…</button>
      <button aria-label="More">…</button>
    </div>
    <main id="content" tabindex="-1"></main>`
  return { region: document.querySelector('#region'), fallback: document.querySelector('#content') }
}

/**
 * replace every child of a region with a fresh copy, the way a redraw does.
 * @param {HTMLElement} region the region to rebuild
 * @returns {void}
 */
function rebuild(region) {
  region.replaceChildren(...[...region.children].map((child) => child.cloneNode(true)))
}

describe('focus helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns null when focus is outside the region', () => {
    const { region } = buildRegion()
    expect(describeFocus(region)).toBeNull()
  })

  it('moves focus to the rebuilt copy of the focused link', () => {
    const { region, fallback } = buildRegion()
    region.querySelector('a[href="#/course/b"]').focus()
    const description = describeFocus(region)
    rebuild(region)
    restoreFocus(region, description, fallback)
    expect(document.activeElement.getAttribute('href')).toBe('#/course/b')
  })

  it('tells apart two elements with the same attributes by position', () => {
    const { region, fallback } = buildRegion()
    region.querySelectorAll('button')[1].focus()
    const description = describeFocus(region)
    rebuild(region)
    restoreFocus(region, description, fallback)
    expect(document.activeElement).toBe(region.querySelectorAll('button')[1])
  })

  it('falls back when the focused element is gone', () => {
    const { region, fallback } = buildRegion()
    region.querySelector('a').focus()
    const description = describeFocus(region)
    region.innerHTML = '<p>nothing to focus</p>'
    restoreFocus(region, description, fallback)
    expect(document.activeElement).toBe(fallback)
  })

  it('leaves focus alone when the focused element survived', () => {
    const { region, fallback } = buildRegion()
    const link = region.querySelector('a')
    link.focus()
    const description = describeFocus(region)
    restoreFocus(region, description, fallback)
    expect(document.activeElement).toBe(link)
  })
})
