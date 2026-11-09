/**
 * Render the app shell into the given root element.
 * @param {HTMLElement} root element that receives the app
 * @returns {HTMLElement} the main element that was rendered
 * @throws {Error} when root is missing or is not an html element
 */
export function mountApp(root) {
  if (!(root instanceof HTMLElement)) {
    throw new Error(`mountApp needs an HTMLElement root element, and got ${String(root)}`)
  }

  // placeholder until the app shell from the first roadmap item is built
  const main = document.createElement('main')
  main.textContent = 'Hark'
  root.replaceChildren(main)
  return main
}
