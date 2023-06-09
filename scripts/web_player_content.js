/* Script to modify the content of Spotify Web Player. */

MAIN_CONTENT_SELECTOR = '.Root'
TRACK_LINKS_SELECTOR = 'a[href^="/track/"]'

PLAYLIST_STYLE_GUIDE = {
  // foci
  '76OCVnnBFLGwroNqfEo8IU': {color: 'palegreen'},
  // foci_archive
  '0fQQnQBQwa6CZgamlDac2Z': {color: 'khaki'},

  // acceptable II
  '74wBN03GfuLjXKclHnXynE': {color: 'lightskyblue'},
  // emo
  '1weePWdySMTM3uE5Iwgql4': {color: 'mediumpurple'},
  // acceptable
  '03XeYNOEtrpPxVq1r44EPR': {color: 'cadetblue'},
}
NO_PLAYLIST_COLOR = 'indianred'

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
    // Setup spotify client - note this cannot be done using traditional import 
    // b/c this file is not treated as a module for some reason.
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

  async trackStyle(trackElement) {
    const elementTrackId = trackElement.getAttribute('href').split('/')[2]
    let color = NO_PLAYLIST_COLOR
    const orderedPlaylistsData = Object.keys(PLAYLIST_STYLE_GUIDE).map(playlistID => {
      return {playlistID, playlistData: this.playlistData[playlistID]}
    })
    const matchedPlaylistId = await this.spotifyClient.trackIdInPlaylists({
      trackId: elementTrackId,
      orderedPlaylistsData: orderedPlaylistsData,
      checkTrackAliases: true
    })
    if (matchedPlaylistId) {
      const playlistStyle = PLAYLIST_STYLE_GUIDE[matchedPlaylistId]
      color = playlistStyle.color
    }

    return {color}
  }

  /**
   * Style all elements matching the specified selector with the result of the speicfied styleFunction.
   */
  async styleElementType(selector, styleFunction, styleDepth) {
    const elements = document.querySelectorAll(selector)
    const elementsArray = [...elements.values()]
    await Promise.all(elementsArray.map(async element => {
      // Update element and as many orders of children as specified.
      const styleUpdate = await styleFunction(element)
      this.updateStyleRecursive(element, styleUpdate, styleDepth)
    }))
  }

  /**
   * Style all elements on interest in the web player.
   */
  async style() {    
    await this.styleElementType(TRACK_LINKS_SELECTOR, this.trackStyle.bind(this), 1)
  }
}

async function main() {
  styler = new WebPlayerStyler(Object.keys(PLAYLIST_STYLE_GUIDE))
}

main()