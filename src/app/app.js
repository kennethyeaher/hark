/**
 * Render the app shell into the given root element.
 * @param {HTMLElement | null} root element that receives the app
 * @returns {HTMLElement} the main element that was rendered
 * @throws {Error} when the root element is missing
 */
export function mountApp(root) {
  if (!root) {
    throw new Error('mountApp needs a root element, and none was found for #app')
  }

  // placeholder until the real shell lands in milestone 1
  const main = document.createElement('main')
  main.textContent = 'Hark'
  root.replaceChildren(main)
  return main
}
