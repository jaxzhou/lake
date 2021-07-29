require('module-alias/register')

const dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
const { findOrCreateCollection } = require('commondb')
dayjs.extend(duration)

module.exports = {
  async enrich (rawDb, enrichedDb, { forceAll }) {
    console.log('start enrichment for jira')
    await module.exports.enrichIssues(
      rawDb,
      enrichedDb,
      forceAll
    )
    console.log('end enrichment for jira')
  },

  async enrichIssues (rawDb, enrichedDb, forceAll) {
    const issueCollection = await findOrCreateCollection(rawDb, 'jira_issues')
    const { JiraIssue } = enrichedDb
    // filtering out portion of records that need to be enriched
    const curosr = (
      forceAll
        ? issueCollection.find()
        : issueCollection.find({ $where: 'this.enriched < this.fields.updated || !this.enriched' })
    )

    try {
      let counter = 0
      while (await curosr.hasNext()) {
        const issue = await curosr.next()
        const enriched = {
          id: issue.id,
          url: issue.self,
          title: issue.fields.summary,
          projectId: issue.fields.project.id,
          leadTime: null
        }
        // by standard, leadtime = days of (resolutiondate - creationdate)
        if (issue.fields.resolutiondate) {
          enriched.leadTime = dayjs.duration(dayjs(issue.fields.resolutiondate) - dayjs(issue.fields.created)).days()
        }
        await JiraIssue.upsert(enriched)
        // update enrichment timestamp
        await issueCollection.updateOne(
          { id: issue.id },
          { $set: { enriched: issue.fields.updated } }
        )
        counter++
      }
      console.log('[jira] total enriched ', counter)
    } finally {
      await curosr.close()
    }
  }
}
