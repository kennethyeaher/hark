// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderStorageError } from '../src/pages/storage-error.js'

describe('renderStorageError', () => {
  it('explains that Hark needs browser storage and shows the reason', () => {
    const page = renderStorageError(new Error('The user denied permission'))
    expect(page.querySelector('h1').textContent).toBe('Hark needs browser storage')
    expect(page.textContent).toContain(
      'Hark needs browser storage to keep recordings on this device'
    )
    expect(page.textContent).toContain('Reason: The user denied permission')
  })

  it('handles a value that is not an Error', () => {
    expect(renderStorageError('blocked').textContent).toContain('Reason: blocked')
  })
})
