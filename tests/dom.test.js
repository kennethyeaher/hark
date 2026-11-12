// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createElement, createIcon, createSvgElement } from '../src/lib/dom.js'

describe('createElement', () => {
  it('sets class, text, and attributes, and skips empty values', () => {
    const link = createElement('a', {
      className: 'nav-link',
      text: 'Home',
      href: '#/',
      hidden: false,
      title: null,
      'aria-current': 'page',
    })
    expect(link.className).toBe('nav-link')
    expect(link.textContent).toBe('Home')
    expect(link.getAttribute('href')).toBe('#/')
    expect(link.hasAttribute('hidden')).toBe(false)
    expect(link.hasAttribute('title')).toBe(false)
    expect(link.getAttribute('aria-current')).toBe('page')
  })

  it('sets a true boolean attribute as empty', () => {
    expect(createElement('button', { disabled: true }).disabled).toBe(true)
  })

  it('appends nodes and strings and skips empty children', () => {
    const list = createElement('p', {}, ['one ', null, false, createElement('b', { text: 'two' })])
    expect(list.textContent).toBe('one two')
    expect(list.children).toHaveLength(1)
  })
})

describe('createIcon', () => {
  it('builds a hidden 20px stroke icon by default', () => {
    const icon = createIcon(['M4 4h16'])
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('width')).toBe('20')
    expect(icon.getAttribute('stroke')).toBe('currentColor')
    expect(icon.querySelectorAll('path')).toHaveLength(1)
  })
})

describe('createSvgElement', () => {
  it('creates an element in the svg namespace', () => {
    const rect = createSvgElement('rect', { width: 4 })
    expect(rect.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(rect.getAttribute('width')).toBe('4')
  })
})
