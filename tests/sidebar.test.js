// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  renderSidebar,
  setSidebarActive,
  updateStorageMeter,
} from '../src/components/sidebar.js'

const courses = [
  {
    id: 'hcim605',
    code: 'HCIM 605',
    name: 'Qualitative Research Methods',
    color: 'indigo',
    recordingCount: 12,
  },
  {
    id: 'inst630',
    code: 'INST 630',
    name: 'Information Ethics',
    color: 'teal',
    recordingCount: 10,
  },
  { id: 'info615', code: 'INFO 615', name: 'Data Studies', color: 'orange', recordingCount: 9 },
  { id: 'hcim620', code: 'HCIM 620', name: 'Design Studio', color: 'pink', recordingCount: 7 },
]

const noStorage = {}
const gigabyte = 1024 ** 3

/**
 * build a sidebar for a route name and optional params.
 * @param {string} name route name
 * @param {Record<string, string>} [params] route params
 * @returns {HTMLElement} the rendered sidebar
 */
function build(name, params = {}) {
  return renderSidebar({ courses, activeRoute: { name, params, query: {} } })
}

/**
 * list the hrefs or labels of every element that has aria-current.
 * @param {HTMLElement} sidebar rendered sidebar
 * @returns {string[]} hrefs of current links
 */
function currentHrefs(sidebar) {
  return [...sidebar.querySelectorAll('[aria-current]')].map((link) => link.getAttribute('href'))
}

describe('renderSidebar', () => {
  it('renders a primary nav with the expected links', () => {
    const sidebar = build('home')
    const nav = sidebar.querySelector('nav')
    expect(nav.getAttribute('aria-label')).toBe('Primary')
    const hrefs = [...nav.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      '#/',
      '#/recordings',
      '#/notes',
      '#/starred',
      '#/trash',
      '#/course/hcim605',
      '#/course/inst630',
      '#/course/info615',
      '#/course/hcim620',
      '#/settings',
    ])
    expect(sidebar.querySelector('.sidebar-brand').getAttribute('href')).toBe('#/')
    expect(sidebar.querySelector('.sidebar-new-button').getAttribute('href')).toBe('#/new')
    expect(sidebar.querySelector('.sidebar-new-button').textContent).toBe('New recording')
  })

  it('marks Home current on the home route', () => {
    expect(currentHrefs(build('home'))).toEqual(['#/'])
  })

  it('marks only the matching course on a course route', () => {
    const sidebar = build('course', { id: 'inst630' })
    expect(currentHrefs(sidebar)).toEqual(['#/course/inst630'])
    expect(sidebar.querySelector('[data-route-key="home"]').hasAttribute('aria-current')).toBe(
      false
    )
  })

  it('hides decorative dots and icons from assistive tech', () => {
    const sidebar = build('home')
    const dots = sidebar.querySelectorAll('.sidebar-course-dot')
    expect(dots).toHaveLength(4)
    expect([...dots].every((dot) => dot.getAttribute('aria-hidden') === 'true')).toBe(true)
    const icons = sidebar.querySelectorAll('svg.icon')
    expect(icons.length).toBeGreaterThan(0)
    expect([...icons].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('shows the total recording count before any estimate resolves', () => {
    const sidebar = build('home')
    expect(sidebar.querySelector('.sidebar-storage-detail').textContent).toBe('38 recordings')
    expect(sidebar.querySelector('.sidebar-meter').hidden).toBe(true)
  })

  it('uses a singular recording count', () => {
    const sidebar = renderSidebar({
      courses: [{ ...courses[0], recordingCount: 1 }],
      activeRoute: { name: 'home', params: {}, query: {} },
    })
    expect(sidebar.querySelector('.sidebar-storage-detail').textContent).toBe('1 recording')
  })

  it('throws specific errors on bad courses', () => {
    const route = { name: 'home', params: {}, query: {} }
    expect(() => renderSidebar({ courses: null, activeRoute: route })).toThrow(/array/)
    expect(() => renderSidebar({ courses: [null], activeRoute: route })).toThrow(/object/)
    expect(() =>
      renderSidebar({ courses: [{ ...courses[0], id: '' }], activeRoute: route })
    ).toThrow(/id/)
    expect(() =>
      renderSidebar({ courses: [{ ...courses[0], color: 'blue' }], activeRoute: route })
    ).toThrow(/color/)
    expect(() =>
      renderSidebar({ courses: [{ ...courses[0], recordingCount: -1 }], activeRoute: route })
    ).toThrow(/recordingCount/)
  })
})

describe('setSidebarActive', () => {
  it('moves the current state and clears it for other routes', () => {
    const sidebar = build('home')
    setSidebarActive(sidebar, { name: 'trash', params: {}, query: {} })
    expect(currentHrefs(sidebar)).toEqual(['#/trash'])
    setSidebarActive(sidebar, { name: 'settings', params: {}, query: {} })
    expect(currentHrefs(sidebar)).toEqual(['#/settings'])
    setSidebarActive(sidebar, { name: 'recording', params: { id: 'x' }, query: {} })
    expect(currentHrefs(sidebar)).toEqual([])
    setSidebarActive(sidebar, { name: 'notFound', params: {}, query: {} })
    expect(currentHrefs(sidebar)).toEqual([])
  })

  it('validates its arguments', () => {
    expect(() => setSidebarActive(null, { name: 'home' })).toThrow(/element/)
    expect(() => setSidebarActive(build('home'), {})).toThrow(/name/)
  })
})

describe('formatBytes', () => {
  it('formats kilobytes, megabytes, and gigabytes', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(38.5 * 1024 * 1024)).toBe('38.5 MB')
    expect(formatBytes(4.2 * gigabyte)).toBe('4.2 GB')
  })

  it('rejects bad input', () => {
    expect(() => formatBytes(-1)).toThrow(TypeError)
    expect(() => formatBytes(Number.NaN)).toThrow(TypeError)
    expect(() => formatBytes(Infinity)).toThrow(TypeError)
    expect(() => formatBytes('5')).toThrow(TypeError)
  })
})

describe('updateStorageMeter', () => {
  it('shows usage and sets the bar width', async () => {
    const block = build('home').querySelector('.sidebar-storage')
    const storage = { estimate: async () => ({ usage: 4.2 * gigabyte, quota: 42 * gigabyte }) }
    await updateStorageMeter(block, 38, storage)
    const track = block.querySelector('.sidebar-meter')
    expect(block.querySelector('.sidebar-storage-detail').textContent).toBe(
      '4.2 GB · 38 recordings'
    )
    expect(track.hidden).toBe(false)
    expect(track.getAttribute('aria-valuenow')).toBe('10')
    expect(block.querySelector('.sidebar-meter-fill').style.width).toBe('10%')
  })

  it('clamps the bar at 100 percent', async () => {
    const block = build('home').querySelector('.sidebar-storage')
    await updateStorageMeter(block, 38, {
      estimate: async () => ({ usage: 2 * gigabyte, quota: gigabyte }),
    })
    expect(block.querySelector('.sidebar-meter-fill').style.width).toBe('100%')
  })

  it('hides the bar when storage is missing', async () => {
    const block = build('home').querySelector('.sidebar-storage')
    await updateStorageMeter(block, 38, noStorage)
    expect(block.querySelector('.sidebar-meter').hidden).toBe(true)
    expect(block.querySelector('.sidebar-storage-detail').textContent).toBe('38 recordings')
  })

  it('hides the bar when estimate rejects', async () => {
    const block = build('home').querySelector('.sidebar-storage')
    const storage = { estimate: () => Promise.reject(new Error('blocked')) }
    await updateStorageMeter(block, 38, storage)
    expect(block.querySelector('.sidebar-meter').hidden).toBe(true)
    expect(block.querySelector('.sidebar-storage-detail').textContent).toBe('38 recordings')
  })
})
