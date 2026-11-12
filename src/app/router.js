// hash router. github pages has no server rewrites, so every route lives after the #

// routes with no parameters, keyed by their single path segment
const staticRoutes = {
  recordings: 'recordings',
  notes: 'notes',
  starred: 'starred',
  trash: 'trash',
  settings: 'settings',
  search: 'search',
  new: 'new',
}

// routes that take one id segment, such as #/course/hcim605
const idRoutes = {
  course: 'course',
  recording: 'recording',
}

/**
 * Turn the query part of a hash into a plain object of strings.
 * @param {string} queryText text after the question mark, without it
 * @returns {Record<string, string>} each key with its decoded value
 */
function parseQuery(queryText) {
  const query = {}
  for (const [key, value] of new URLSearchParams(queryText)) {
    query[key] = value
  }
  return query
}

/**
 * Decode one path segment, returning null when the escape sequence is malformed.
 * @param {string} segment raw path segment
 * @returns {string | null} decoded text, or null when it cannot be decoded
 */
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

/**
 * Parse a location hash into a route. Pure, so it is easy to test.
 * @param {string} hash value such as `#/course/hcim605` or `#/search?q=bias`
 * @returns {{ name: string, params: Record<string, string>, query: Record<string, string> }}
 *   the route name, path params, and query values. unknown paths return the
 *   name `notFound` with the path in `params.path`.
 * @throws {TypeError} when hash is not a string
 */
export function parseRoute(hash) {
  if (typeof hash !== 'string') {
    throw new TypeError(`parseRoute needs a string hash, and got ${String(hash)}`)
  }

  // split "#/path?query" into its two halves and drop the leading # and slashes
  const withoutMark = hash.startsWith('#') ? hash.slice(1) : hash
  const questionIndex = withoutMark.indexOf('?')
  const pathText = questionIndex === -1 ? withoutMark : withoutMark.slice(0, questionIndex)
  const queryText = questionIndex === -1 ? '' : withoutMark.slice(questionIndex + 1)
  const query = parseQuery(queryText)
  const segments = pathText.split('/').filter((segment) => segment !== '')

  if (segments.length === 0) {
    return { name: 'home', params: {}, query }
  }

  const [first, second] = segments
  if (segments.length === 1 && Object.hasOwn(staticRoutes, first)) {
    return { name: staticRoutes[first], params: {}, query }
  }
  if (segments.length === 2 && Object.hasOwn(idRoutes, first)) {
    const id = decodeSegment(second)
    if (id !== null) {
      return { name: idRoutes[first], params: { id }, query }
    }
  }

  return { name: 'notFound', params: { path: `/${segments.join('/')}` }, query }
}

/**
 * Call onChange with the current route now and again on every hash change.
 * @param {(route: ReturnType<typeof parseRoute>) => void} onChange called with each parsed route
 * @returns {() => void} a function that stops listening
 * @throws {TypeError} when onChange is not a function
 */
export function startRouter(onChange) {
  if (typeof onChange !== 'function') {
    throw new TypeError(`startRouter needs a function, and got ${String(onChange)}`)
  }

  const handleHashChange = () => onChange(parseRoute(window.location.hash))
  window.addEventListener('hashchange', handleHashChange)
  handleHashChange()
  return () => window.removeEventListener('hashchange', handleHashChange)
}
