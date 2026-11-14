// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseRoute, startRouter } from '../src/app/router.js'

describe('parseRoute', () => {
  it('sends an empty hash, a bare #, and #/ to home', () => {
    for (const hash of ['', '#', '#/']) {
      expect(parseRoute(hash)).toEqual({ name: 'home', params: {}, query: {} })
    }
  })

  it.each([
    ['#/recordings', 'recordings'],
    ['#/notes', 'notes'],
    ['#/starred', 'starred'],
    ['#/trash', 'trash'],
    ['#/settings', 'settings'],
    ['#/search', 'search'],
    ['#/new', 'new'],
  ])('maps %s to %s', (hash, name) => {
    expect(parseRoute(hash)).toEqual({ name, params: {}, query: {} })
  })

  it('reads the id from course and recording routes', () => {
    expect(parseRoute('#/course/hcim605')).toEqual({
      name: 'course',
      params: { id: 'hcim605' },
      query: {},
    })
    expect(parseRoute('#/recording/rec-12').params).toEqual({ id: 'rec-12' })
  })

  it('reads the id from the transcribe route', () => {
    expect(parseRoute('#/transcribe/rec-12')).toEqual({
      name: 'transcribe',
      params: { id: 'rec-12' },
      query: {},
    })
  })

  it('reads the course from the new route', () => {
    expect(parseRoute('#/new?course=inst630')).toEqual({
      name: 'new',
      params: {},
      query: { course: 'inst630' },
    })
  })

  it('decodes an encoded id', () => {
    expect(parseRoute('#/course/inst%20630').params.id).toBe('inst 630')
  })

  it('parses and decodes the search query', () => {
    expect(parseRoute('#/search?q=thematic%20analysis')).toEqual({
      name: 'search',
      params: {},
      query: { q: 'thematic analysis' },
    })
    expect(parseRoute('#/search?q=a%26b&mode=keyword').query).toEqual({
      q: 'a&b',
      mode: 'keyword',
    })
  })

  it('ignores a trailing slash', () => {
    expect(parseRoute('#/recordings/').name).toBe('recordings')
    expect(parseRoute('#/course/hcim605/').params.id).toBe('hcim605')
    expect(parseRoute('#/search/?q=bias').query.q).toBe('bias')
  })

  it('accepts a hash without the leading #', () => {
    expect(parseRoute('/settings').name).toBe('settings')
  })

  it('sends unknown paths to notFound with the path', () => {
    expect(parseRoute('#/nowhere')).toEqual({
      name: 'notFound',
      params: { path: '/nowhere' },
      query: {},
    })
    expect(parseRoute('#/course').name).toBe('notFound')
    expect(parseRoute('#/course/a/b').name).toBe('notFound')
    expect(parseRoute('#/settings/extra').name).toBe('notFound')
  })

  it('does not treat object keys as routes', () => {
    expect(parseRoute('#/constructor').name).toBe('notFound')
    expect(parseRoute('#/toString/1').name).toBe('notFound')
  })

  it('sends a malformed escape to notFound instead of throwing', () => {
    expect(parseRoute('#/course/%E0%A4%A').name).toBe('notFound')
  })

  it('rejects a value that is not a string', () => {
    expect(() => parseRoute(undefined)).toThrow(/string hash/)
  })
})

describe('startRouter', () => {
  let stop = () => {}

  afterEach(() => {
    stop()
    window.location.hash = ''
  })

  it('reports the current route right away', () => {
    window.location.hash = '#/notes'
    const onChange = vi.fn()
    stop = startRouter(onChange)
    expect(onChange).toHaveBeenCalledWith({ name: 'notes', params: {}, query: {} })
  })

  it('reports each hash change until stopped', () => {
    const onChange = vi.fn()
    stop = startRouter(onChange)
    window.location.hash = '#/trash'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(onChange).toHaveBeenLastCalledWith({ name: 'trash', params: {}, query: {} })

    stop()
    const callCount = onChange.mock.calls.length
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(onChange).toHaveBeenCalledTimes(callCount)
  })

  it('rejects a callback that is not a function', () => {
    expect(() => startRouter('home')).toThrow(/needs a function/)
  })
})
