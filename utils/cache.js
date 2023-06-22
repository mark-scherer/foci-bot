/**
 * Generic cache that stores data in local store.
 * TODO: save to / load from local store
 */

import { StatsReporter } from './stats_reporter.js'


const STATS_TEMPLATE = {
  get: {
    attempted: 0,
    successful: 0
  },
  add: {
    new: 0,
    overwrites: 0,
    tags: {},
  }
}

const DEFAULT_STATS_REPORT_INTERVAL_SECS = 10


class Cache extends StatsReporter {
  data = {}
  stats = JSON.parse(JSON.stringify(STATS_TEMPLATE))

  constructor(
    name, 
    statsReportIntervalSecs = DEFAULT_STATS_REPORT_INTERVAL_SECS
  ) {
    super(statsReportIntervalSecs, name)
  }

  add(key, value, tag) {
    if (this.has(key)) this.stats.add.overwrites++
    else this.stats.add.new++
    if (tag !== undefined) {
      if (!(tag in this.stats.add.tags)) this.stats.add.tags[tag] = 0
      this.stats.add.tags[tag]++
    }
    
    this.data[key] = value
  }

  has(key) {
    return key in this.data
  }

  get(key) {
    this.stats.get.attempted++
    
    let result = null
    if (this.has(key)) {
      result = this.data[key]
      this.stats.get.successful++
    }
    return result
  }
}

export {Cache}