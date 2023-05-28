/** Client for interaction with the Spotify API. */

const CLIENT_ID = '6943ce404e15451d94decbd183c821bc'
const CLIENT_SECRET = 'eb86818b47c84e2ea8c6a0d466138ede'
const BASE_URL = 'https://api.spotify.com/v1/'
const ACCESS_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const ACCESS_TOKEN_FORM_DATA = {
  grant_type: 'client_credentials'
}
const AUTH_OPTIONS = {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
    'Content-Type': 'application/x-www-form-urlencoded'
  },
};

class SpotifyClient {
  accessToken = null

  constructor() {
    // DEBUG
    console.info(`built SpotifyClient`)
  }

  async getAccessToken() {
    const authFormBody = Object.entries(ACCESS_TOKEN_FORM_DATA).map(([key, value]) => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    }).join('&')
    const authOptions = {
      ...AUTH_OPTIONS,
      body: authFormBody
    }
    const response = await fetch(ACCESS_TOKEN_URL, authOptions)
    if (!response.ok) {
      throw new Error(`token request failed (${response.status}): ${JSON.stringify({ACCESS_TOKEN_URL, AUTH_OPTIONS, response})}`)
    }
    const body = await response.json()
    return body.access_token
  }

  async fetch(url, options) {
    if (!this.accessToken) {
      this.accessToken = await this.getAccessToken()
      // DEBUG
      console.info(`got access token: ${this.accessToken}`)
    }
    
    let headers = {
      'Authorization': `Bearer ${this.accessToken}`
    }

    options = {
      headers,
      ...options
    }

    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`Failed to hit ${url} (${response.status}): ${JSON.stringify({response})}`)
    }
    const body = await response.json()
    return body
  }

  /**
   * Fetch data about the specified playlist.
   * @param {String} playlistID 
   * @returns playlist data - see spotify's GET playlists/<playlist_id>
   */
  async getPlaylist(playlistID) {
    const playlistUrl = new URL(`playlists/${playlistID}`, BASE_URL)
    let playlistData = await this.fetch(playlistUrl)

    // These will be to GET playlists/<playlist_id>/tracks, with a slightly different response format.
    let trackPaginationUrl = playlistData.tracks.next
    while (trackPaginationUrl) {
      const trackPaginationData = await this.fetch(trackPaginationUrl)
      playlistData.tracks.items.push(...trackPaginationData.items)
      trackPaginationUrl = trackPaginationData.next
    }
    return playlistData
  }

  getPlaylistDataTrackIds(playlistData) {
    return playlistData.tracks.items.map(trackData => trackData.track.id)
  }

  /**
   * Helper for determining if trackId is included in provided playlistData
   */
  trackIdInPlaylist({trackId, playlistData}) {
    let included = false

    // First just check if directly included in playlist trackIds.
    // Note: this doesn't always work b/c spotify has a lot of redundant trackIds. Example: 'Indian Summer' in foci and in its album.
    const playlistTrackIds = this.getPlaylistDataTrackIds(playlistData)
    if (playlistTrackIds.includes(trackId)) included = true

    return included
  }
}

export {SpotifyClient}