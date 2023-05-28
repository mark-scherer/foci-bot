/* Script to modify the content of Spotify Web Player. */

// import SpotifyClient from '../utils/spotify_client.js'

CONTENT_POLL_INTERVAL = 100
CONTENT_POLL_TIMEOUT = 10000
MAIN_CONTENT_SELECTOR = '.Root'
ADDITIONAL_WAIT = 2000  // Event after main content loaded, not all tracks are.

FOCI_PLAYLIST_ID = '76OCVnnBFLGwroNqfEo8IU'
PLAYLIST_IDS = [FOCI_PLAYLIST_ID]

TRACK_LINKS_SELECTOR = 'a[href^="/track/"]'

INCLUDED_PRIMARY_PLAYLIST_COLOR = 'lightgreen'
NOT_INCLUDED_COLOR = 'red'

class WebPlayerStyler {
  constructor(playlistIds) {
    this.playlistIds = playlistIds
    this.playlistData = {}

    // Trigger async instance setup.
    this.setup()
  }

  /**
   * Async class setup - ctor cannot use async/await.
   */
  async setup() {
    // Setup spotify client.
    const src = chrome.runtime.getURL('utils/spotify_client.js')
    const spotifyClientLibrary = await import(src)
    this.spotifyClient = new spotifyClientLibrary.SpotifyClient()

    // Fetch playlist data.
    await this.fetchPlaylists()

    // Setup styler event handler.
    const playerContainer = document.querySelector(MAIN_CONTENT_SELECTOR)
    this.playerObserver = new MutationObserver(this.style.bind(this))
    const playerObserverConfig = {subtree: true, childList: true}
    this.playerObserver.observe(playerContainer, playerObserverConfig)
  }

  /**
   * Fetch playlist data from Spotify API - split into it's own method so can be called periodically throughout the instance's lifecycle.
   */
  async fetchPlaylists() {
    if (!this.spotifyClient) {
      throw new Error(`Cannot fetch playlists, spotifyClient not setup.`)
    }

    const playlistDataArray = await Promise.all(this.playlistIds.map(async id => {
      const data = await this.spotifyClient.getPlaylist(id)
      return [id, data]
    }))
    this.playlistData = Object.fromEntries(playlistDataArray)
    console.log(`Fetched playlist data for ${Object.keys(this.playlistData).length} playlists: ${Object.keys(this.playlistData)}`)
  }

  /**
   * Helper to update specified style on given element and its children.
   */
  updateStyleRecursive(element, styleUpdate, recursiveDepth) {
    Object.entries(styleUpdate).forEach(([attribute, value]) => element.style[attribute] = value)
    if (recursiveDepth > 0) {
      const children = [...element.children]
      children.forEach(childElement => this.updateStyleRecursive(childElement, styleUpdate, recursiveDepth-1))
    }
  }

  trackStyle(trackElement) {
    // Will need to generalize this.
    const primaryPlaylistId = FOCI_PLAYLIST_ID
    const primaryPlaylistData = this.playlistData[primaryPlaylistId]

    const elementTrackId = trackElement.getAttribute('href').split('/')[2]
    
    // Determine color.
    let color = NOT_INCLUDED_COLOR
    const trackIncludedPrimaryPlaylist = this.spotifyClient.trackIdInPlaylist({trackId: elementTrackId, playlistData: primaryPlaylistData})
    if (trackIncludedPrimaryPlaylist) color = INCLUDED_PRIMARY_PLAYLIST_COLOR

    return {color}
  }

  /**
   * Style all elements matching the specified selector with the result of the speicfied styleFunction.
   */
  styleElementType(selector, styleFunction, styleDepth) {
    const elements = document.querySelectorAll(selector)
    elements.forEach(element => {
      // Update element and as many orders of children as specified.
      const styleUpdate = styleFunction(element)
      this.updateStyleRecursive(element, styleUpdate, styleDepth)
    })
  }

  /**
   * Style all elements on interest in the web player.
   */
  style() {    
    this.styleElementType(TRACK_LINKS_SELECTOR, this.trackStyle.bind(this), 1)
  }
}

async function main() {
  styler = new WebPlayerStyler(PLAYLIST_IDS)
}

main()