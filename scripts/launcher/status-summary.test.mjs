import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, statusQuery } from './status-summary.mjs'
const row = (status, type, count) => ({ status, type, _count: { _all: count } })
test('separates running work, queued jobs and access blockers', () => {
  const result = summarize([
    row('RUNNING', 'TRANSLATE_CHAPTER', 2), row('RUNNING', 'EXTRACT_ENTITIES', 1),
    row('PENDING', 'TRANSLATE_CHAPTER', 40), row('WAITING_FOR_ACCESS', 'DOWNLOAD_MANGA', 3),
    row('CANCEL_REQUESTED', 'SCRAPE_CHAPTERS', 1), row('COMPLETED', 'TRANSLATE_CHAPTER', 100)
  ])
  assert.deepEqual(result, { active: 4, translation: 2, dictionary: 1, downloads: 1, art: 0, queued: 40, blocked: 3 })
})
test('unknown running types still count as active; empty work is idle', () => {
  assert.equal(summarize([row('RUNNING', 'FUTURE_JOB', 1)]).active, 1)
  assert.equal(summarize([]).active, 0)
})
test('active counts exclude stale worker heartbeats', () => {
  const query = statusQuery(60_000)
  assert.equal(query.where.OR[1].updatedAt.gte.getTime(), 30_000)
  assert.deepEqual(query.where.OR[0].status.in, ['PENDING', 'WAITING_FOR_ACCESS', 'PAUSED'])
})

test('missing-source paused jobs need attention', () => {
  assert.equal(summarize([row('PAUSED', 'DOWNLOAD_MANGA', 2)]).blocked, 2)
})
