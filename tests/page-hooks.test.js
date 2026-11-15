// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { getPageHooks, leavePage, setPageHooks } from '../src/app/page-hooks.js'

describe('page hooks', () => {
  it('returns no hooks for a page without any', () => {
    expect(getPageHooks(document.createElement('section'))).toEqual({})
    expect(getPageHooks(null)).toEqual({})
  })

  it('runs the leave hook once', () => {
    const page = document.createElement('section')
    const onLeave = vi.fn()
    setPageHooks(page, { onLeave })
    leavePage(page)
    leavePage(page)
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(getPageHooks(page)).toEqual({})
  })

  it('does nothing when leaving no page', () => {
    expect(() => leavePage(null)).not.toThrow()
  })

  it('rejects a page that is not an element and hooks that are not functions', () => {
    expect(() => setPageHooks({}, {})).toThrow(TypeError)
    expect(() => setPageHooks(document.createElement('div'), { onData: 'redraw' })).toThrow(
      /onData must be a function/
    )
  })
})
