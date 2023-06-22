/** Client for interaction with the Spotify API. */

import { Cache } from './cache.js'
import { StatsReporter } from './stats_reporter.js'

// Auth constants.
const CLIENT_ID = '6943ce404e15451d94decbd183c821bc'
const CLIENT_SECRET = 'eb86818b47c84e2ea8c6a0d466138ede'
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

// Urls.
const BASE_URL = 'https://api.spotify.com/v1/'
const ACCESS_TOKEN_URL = 'https://accounts.spotify.com/api/token'

// Stats constants.
const STATS_TEMPLATE = {
  endpointStats: {}
}
const REQUEST_STATS_TEMPLATE = {
  attempted: 0,
  succeeded: 0,
  failed: {},  // non-200 response, by response code.
  errored: {}  // no response, by error type.
}

// Other constants.
const DEFAULT_STATS_REPORT_INTERVAL_SECS = 10


class SpotifyClient extends StatsReporter {
  accessTokenRequest = null  // If accessToken not available, multiple callers may need to await it.
  accessToken = null
  trackDataCache = null
  stats = JSON.parse(JSON.stringify(STATS_TEMPLATE))

  constructor(statsReportIntervalSecs = DEFAULT_STATS_REPORT_INTERVAL_SECS) {
    super(statsReportIntervalSecs)
    
    this.trackDataCache = new Cache('trackDataCache')
  }

  /**
   * Fetch & return access token for the instance, joining an inflight request if available. 
   * Currently done lazily on first fetch attempt.
   */
  async getAccessToken() {
    // Check if access token already exists.
    if (!(this.accessToken === null)) return this.accessToken

    // If access token request not already in flight, initate it.
    if (this.accessTokenRequest === null) {
      const authFormBody = Object.entries(ACCESS_TOKEN_FORM_DATA).map(([key, value]) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      }).join('&')
      const authOptions = {
        ...AUTH_OPTIONS,
        body: authFormBody
      }
  
      this.accessTokenRequest = this.fetch(ACCESS_TOKEN_URL, authOptions, false)
    }

    // Await the shared accessTokenRequest promise.
    const responseBody = await this.accessTokenRequest

    // Once it's resolved, update instance state - note this will be called redundantly for all awaiters.
    this.accessToken = responseBody.access_token
    this.accessTokenRequest = null

    return this.accessToken
  }

  /**
   * Helper for hitting spotify endpoint.
   * @param {string} url Complete url as string.
   * @param {object} options Request options.
   * @param {boolean} requireAccessToken Fetch access token before completing request?
   * @returns {object} response body.
   */
  async fetch(urlString, options = {}, requireAccessToken = true) {
    // TODO:
      // Add backoff when 429 encountered
    
    const url = new URL(urlString)

    let headers = 'headers' in options ? options.headers : {}
    if (requireAccessToken) {
      const accessToken = await this.getAccessToken()
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    if (!('method' in options)) options.method = 'GET'

    options = {
      headers,
      ...options
    }

    const sanitizedPath = url.pathname.split('/').slice(0, 3).join('/')
    const endpointName = `${options.method} ${sanitizedPath}`
    if (!(endpointName in this.stats.endpointStats)) this.stats.endpointStats[endpointName] = JSON.parse(JSON.stringify(REQUEST_STATS_TEMPLATE))
    
    this.stats.endpointStats[endpointName].attempted++
    let response
    try {
      response = await fetch(url.href, options)
    } catch (error) {
      // Errored request.
      errorType = error.name
      if (!(errorType in this.stats.endpointStats[endpointName].errored)) this.stats.endpointStats[endpointName].errored[errorType] = 0
      this.stats.endpointStats[endpointName].errored[errorType]++
      
      throw new Error(`Fetch errored on ${url.href}: ${error}`)
    }
    
    const body = await response.json()
    if (!response.ok) {
      // Failed request.
      const statusCode = response.status
      if (!(statusCode in this.stats.endpointStats[endpointName].failed)) this.stats.endpointStats[endpointName].failed[statusCode] = 0
      this.stats.endpointStats[endpointName].failed[statusCode]++
      
      const statusCodeMessage = body.error.message
      throw new Error(`Request failed on ${url.href} (${response.status}):\n${statusCodeMessage}:\n${JSON.stringify({response})}`)
    }
    
    this.stats.endpointStats[endpointName].succeeded++
    return body
  }

  /**
   * Fetch data about the specified track. Utilizes an unbounded per-instance cache.
   * @param {String} trackId 
   * @returns track data - see spotify's GET tracks/<track_id>
   */
  async getTrack(trackId) {
    let trackData = this.trackDataCache.get(trackId)
    if (trackData === null) {
      const trackUrl = new URL(`tracks/${trackId}`, BASE_URL)
      trackData = await this.fetch(trackUrl)
      this.trackDataCache.add(trackId, trackData, 'fromTrackFetch')
    }
    return trackData
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

    // Add all fetched tracks to track data cache.
    playlistData.tracks.items.forEach(trackData => {
      const trackId = trackData.track.id
      this.trackDataCache.add(trackId, trackData, 'fromPlaylistFetch')
    })

    return playlistData
  }

  getPlaylistDataTrackIds(playlistData) {
    return playlistData.tracks.items.map(trackData => trackData.track.id)
  }

  async trackAliasesInPlaylist({trackId, playlistData}) {
    const trackData = await this.getTrack(trackId)
    const trackName = trackData.name
    const trackArtistIds = new Set(trackData.artists.map(artistData => artistData.id))

    let found = false
    playlistData.tracks.items.forEach(pTrackData => {
      if (!found) {
        // Check for match on a) song name plus b) all artist IDs.
        const pTrackId = pTrackData.track.id
        const pTrackName = pTrackData.track.name
        const pTrackArtistIds = new Set(pTrackData.track.artists.map(pTrackArtisData => pTrackArtisData.id))
        const artistsMatch = trackArtistIds.size === pTrackArtistIds.size && [...trackArtistIds].every(artistId => pTrackArtistIds.has(artistId))
        if (trackName === pTrackName && artistsMatch) {
          // DEBUG
          console.log(`Matched track on alias! ${JSON.stringify({ trackId, trackName, trackArtistIds, pTrackId, pTrackArtistIds })}`)
          found = true
        }
      }
    })
    return found
  }

  /**
   * Helper for determining if trackId is included in provided playlistData.
   * @param {Bool} checkTrackAliases: Additionally try to match tracks that might be duped due to pre-released singles or deluxe albums.
   */
  async trackIdInPlaylists({trackId, orderedPlaylistsData, checkTrackAliases=false}) {
    let matchedPlaylistID
    await Promise.all(orderedPlaylistsData.map(async ({playlistID, playlistData}) => {
      if (!matchedPlaylistID) {
        // First just check if directly included in playlist trackIds.
        const playlistTrackIds = this.getPlaylistDataTrackIds(playlistData)
        if (playlistTrackIds.includes(trackId)) matchedPlaylistID = playlistID

        // Need to add caching of both:
          // trackAliases: {track_id: [trackAliasId1, trackAliasId1, ...]}
            // If track included in this cache, just check the alias trackIds against playlistData first
            // If not included in cache OR if none of the aliases match playlistData, still need to check against playlistData
              // no guarantee it's been checked against the specific playlistData before, maybe it does have an alias here that needs to be discovered.
          // trackData: {track_id: trackData}
            // If track included in this cache, skip fetching trackData from the Spotify API
        if (!matchedPlaylistID && checkTrackAliases) {
          try {
            const foundAlias = await this.trackAliasesInPlaylist({trackId, playlistData})
            if (foundAlias) matchedPlaylistID = playlistID
          } catch (error) {
            // Add full stracktrace from the promise to the raised error.
            Error.captureStackTrace(error, this.trackIdInPlaylists)
            throw error
          }
          
        }
      }
    }))

    return matchedPlaylistID
  }
}

export {SpotifyClient}