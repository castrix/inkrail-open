import prisma from '../server/lib/prisma'
import { downloadWorkerScope } from '../shared/utils/download-workers'
import { processMangaDownloadJob, processScrapeJob } from '../server/services/scraper'
import { processTranslationJob, processTranslationRepairJob } from '../server/services/translation'
import { processDictionaryReconcileJob, processEncyclopediaJob } from '../server/services/encyclopedia'
import { processCharacterImageJob, processCharacterSkinDetectionJob } from '../server/services/character-visuals'
import { codexWorker } from '../server/services/codex-app-server'
import { nextDictionaryReadyJob } from '../server/services/dictionary-queue'
import { sourceManifest, extensionManager } from '../server/services/extensions'

let stopping = false
const requestedType = process.argv.find(value => value.startsWith('--type='))?.split('=')[1]
const requestedSource = process.argv.find(value => value.startsWith('--source='))?.split('=')[1]
if (requestedSource && requestedType !== 'scrape') throw new Error('--source requires --type=scrape')
const sourceScope = requestedSource ? downloadWorkerScope(requestedSource) : {}
const jobTypes = requestedType === 'translation' ? ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES', 'RECONCILE_DICTIONARY'] : requestedType === 'scrape' ? ['SCRAPE_CHAPTERS', 'DOWNLOAD_MANGA'] : requestedType === 'image' ? ['GENERATE_CHARACTER_IMAGE', 'DETECT_CHARACTER_SKINS'] : null
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function recoverStaleJobs(startup = false) {
  if (startup && jobTypes?.includes('TRANSLATE_CHAPTER')) {
    const interrupted = await prisma.scrapeJob.findMany({ where: { type: 'TRANSLATE_CHAPTER', status: 'CANCEL_REQUESTED' }, select: { id: true, payload: true } })
    for (const job of interrupted) {
      await prisma.$transaction([
        prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'CANCELED', completedAt: new Date(), error: null } }),
        ...(job.payload ? [prisma.translation.updateMany({ where: { chapterId: job.payload, status: { in: ['QUEUED', 'TRANSLATING'] } }, data: { status: 'NOT_STARTED', error: null } })] : [])
      ])
    }
  }
  const staleBefore = new Date(Date.now() - 45_000)
  await prisma.scrapeJob.updateMany({ where: { status: 'RUNNING', updatedAt: { lt: staleBefore }, ...(jobTypes ? { type: { in: jobTypes } } : {}), ...sourceScope }, data: { status: 'PENDING', error: 'Recovered after an interrupted worker.' } })
}

async function main() {
  if (requestedType !== 'scrape') {
    await codexWorker.start()
      .then(() => console.log(`[worker] Persistent Codex app-server ready (PID ${codexWorker.pid})`))
      .catch(error => console.error('[worker] Codex warmup failed; next job will retry:', error))
  }
  await recoverStaleJobs(true)
  let lastRecovery = Date.now()
  while (!stopping) {
    if (Date.now() - lastRecovery >= 15_000) {
      await recoverStaleJobs()
      lastRecovery = Date.now()
    }
    const candidate = await nextDictionaryReadyJob({ ...(jobTypes ? { type: { in: jobTypes } } : {}), ...sourceScope })
    if (!candidate) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      continue
    }
    if (['SCRAPE_CHAPTERS', 'DOWNLOAD_MANGA'].includes(candidate.type) && candidate.novelId) {
      const novel = await prisma.novel.findUnique({ where: { id: candidate.novelId }, select: { sourceSite: true } })
      try { if (novel) await sourceManifest(novel.sourceSite) }
      catch (error: any) {
        if (error.code === 'SOURCE_UNAVAILABLE' || error.statusCode === 503) await prisma.scrapeJob.update({ where: { id: candidate.id }, data: { status: 'PAUSED', error: error.message } })
        await new Promise(resolve => setTimeout(resolve, 1500)); continue
      }
    }
    const claimed = await prisma.scrapeJob.updateMany({ where: { id: candidate.id, status: 'PENDING' }, data: { status: 'RUNNING', startedAt: new Date() } })
    if (!claimed.count) continue
    const job = candidate
    const jobStartedAt = performance.now()
    const heartbeat = setInterval(() => {
      void prisma.scrapeJob.updateMany({ where: { id: job.id, status: 'RUNNING' }, data: { updatedAt: new Date() } }).catch(() => undefined)
    }, 5000)
    try {
      if (job.type === 'SCRAPE_CHAPTERS') await processScrapeJob(job.id)
      else if (job.type === 'DOWNLOAD_MANGA') await processMangaDownloadJob(job.id)
      else if (job.type === 'TRANSLATE_CHAPTER') await processTranslationJob(job.id)
      else if (job.type === 'REPAIR_TRANSLATION') await processTranslationRepairJob(job.id)
      else if (job.type === 'EXTRACT_ENTITIES') await processEncyclopediaJob(job.id)
      else if (job.type === 'RECONCILE_DICTIONARY') await processDictionaryReconcileJob(job.id)
      else if (job.type === 'GENERATE_CHARACTER_IMAGE') await processCharacterImageJob(job.id)
      else if (job.type === 'DETECT_CHARACTER_SKINS') await processCharacterSkinDetectionJob(job.id)
      else await prisma.scrapeJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: `Unknown job type: ${job.type}` } })
    } catch (error) {
      console.error(`[worker] ${job.type} ${job.id}:`, error)
    } finally {
      clearInterval(heartbeat)
      const durationMs = Math.round(performance.now() - jobStartedAt)
      const finalJob = await prisma.scrapeJob.findUnique({ where: { id: job.id }, select: { status: true } }).catch(() => null)
      console.log('[worker timing]', JSON.stringify({ timestamp: new Date().toISOString(), jobId: job.id, type: job.type, status: finalJob?.status || 'UNKNOWN', durationMs, durationSeconds: Number((durationMs / 1000).toFixed(3)), workerPid: process.pid }))
    }
  }
  await prisma.$disconnect()
  extensionManager().close()
  codexWorker.close()
}

main().catch(async error => {
  console.error(error)
  codexWorker.close()
  await prisma.$disconnect()
  process.exitCode = 1
})
