import prisma from '~/server/lib/prisma'
import { syncSourceDirectory } from '~/server/services/scraper'
import { nextZonedRun } from '~/shared/utils/scheduler'

export async function runDueNovelSchedules() {
  const due = await prisma.novelSyncSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: new Date() } },
    include: { novel: { select: { sourceSite: true, sourceNovelId: true } } },
    orderBy: { nextRunAt: 'asc' }
  })
  for (const schedule of due) {
    const claimed = await prisma.novelSyncSchedule.updateMany({ where: { id: schedule.id, enabled: true, nextRunAt: schedule.nextRunAt }, data: { lastStatus: 'RUNNING', lastRunAt: new Date(), error: null } })
    if (!claimed.count) continue
    try {
      const result = await syncSourceDirectory(schedule.novel.sourceSite, schedule.novel.sourceNovelId, { translateNewChapters: process.env.INKRAIL_ENABLE_TRANSLATION === 'true' })
      await prisma.novelSyncSchedule.update({ where: { id: schedule.id }, data: { lastStatus: 'SUCCESS', lastResult: JSON.stringify({ added: result.added, queued: result.queued, translateAfterDownload: process.env.INKRAIL_ENABLE_TRANSLATION === 'true' && result.queued > 0, total: result.total }), nextRunAt: nextZonedRun(schedule.localTime, schedule.timezone), error: null } })
    } catch (cause) {
      await prisma.novelSyncSchedule.update({ where: { id: schedule.id }, data: { lastStatus: 'FAILED', nextRunAt: nextZonedRun(schedule.localTime, schedule.timezone), error: cause instanceof Error ? cause.message : 'Scheduled sync failed.' } })
    }
  }
  return due.length
}
