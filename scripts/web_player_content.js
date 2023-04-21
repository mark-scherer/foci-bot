/* Script to modify the content of Spotify Web Player. */

CONTENT_POLL_INTERVAL = 100
CONTENT_POLL_TIMEOUT = 10000
MAIN_CONTENT_SELECTOR = '.Root__main-view'
ADDITIONAL_WAIT = 2000  // Event after main content loaded, not all tracks are.

TRACK_SELECTOR = 'a[href^="/track/"]'

INCLUDED_FOCI_COLOR = 'lightgreen'

/**
 * Delay for main page element to load.
 */
async function waitForContent() {
  return new Promise((resolve, reject) => {
    pollInterval = setInterval(() => {
      console.log(`Polling for content...`)
      content = document.querySelector(MAIN_CONTENT_SELECTOR)
      if (content) {
        console.log('Found content!')
        clearInterval(pollInterval)
        resolve()
      }
    }, CONTENT_POLL_INTERVAL)
    
    // Setup polling timeout.
    setTimeout(() => {
      clearInterval(pollInterval)
      reject(`Content poll timed out after ${CONTENT_POLL_TIMEOUT}ms`)
    }, CONTENT_POLL_TIMEOUT)
  })
}

/**
 * Delay an additional fixed amount for page subcontent to fully load.
 */
async function additionalTrackWait() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, ADDITIONAL_WAIT)
  })
}

/**
 * Update specified style on given element and its children.
 * @param {Element} element : Element to update and its children.
 * @param {Object} styleUpdate : Dictionary of style updates to make: { styleAttribute: newValue }.
 * @param {Number} recursiveDepth   : Orders of children to also update.
 */
function updateStyleRecursive(element, styleUpdate, recursiveDepth) {
  Object.entries(styleUpdate).forEach(([attribute, value]) => element.style[attribute] = value)
  if (recursiveDepth > 0) {
    children = [...element.children]
    children.forEach(childElement => updateStyleRecursive(childElement, styleUpdate, recursiveDepth-1))
  }
}

/**
 * Determine color of given track element.
 * @param {Element} trackElement : Track element to determine color of.
 * @return {Object} : Style updates to make to track element: { styleAttribute: newValue }.
 */
function trackColor(trackElement, {}) {
  return {
    color: INCLUDED_FOCI_COLOR
  }
}

/**
 * Update style of matching elements according to provided style function.
 * @param {String} selector : CSS selector for elements to update.
 * @param {Function} styleFunction : Function returning style update to make on matching elements: 
 * @param {Object} styleFunctionKwargs : Object of named args to pass into styleFunction.
 *  (element, kwargs) => { styleAttribute: newValue }.
 */
function colorCodeElements(selector, styleFunction, styleFunctionKwargs) {
  elements = document.querySelectorAll(selector)
  elements.forEach(element => {
    // Update element and its first order children.
    styleUpdate = styleFunction(element, styleFunctionKwargs)
    updateStyleRecursive(element, styleUpdate, 1)
  })
}

async function main() {
  try {
    await waitForContent()
  } catch (error) {
    console.error(`Error waiting for content: ${error}`)
  }

  await additionalTrackWait()
  colorKwargs = {}
  colorCodeElements(TRACK_SELECTOR, trackColor, colorKwargs)
  
}

main()