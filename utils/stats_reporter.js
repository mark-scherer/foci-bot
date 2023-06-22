/** Abstract base class for logging stats. */

class StatsReporter {
  stats = null // Should be overridden by the child.
  
  statsReportIntervalSecs = 0
  statsReportIntervalId = null

  constructor(statsReportIntervalSecs, name) {
    if (new.target === StatsReporter) {
      throw new TypeError(`Cannot instantiate abstract class ${new.target}`)
    }

    this.name = name !== undefined ? name : new.target.name

    this.statsReportIntervalSecs = statsReportIntervalSecs
    this.statsReportIntervalId = setInterval(this.reportStats.bind(this), this.statsReportIntervalSecs*1000)
  }

  // Children can overwrite this if wanted.
  reportStats() {
    console.log(`${this.name} stats: ${JSON.stringify(this.stats)}`)
  }
}

export {StatsReporter}