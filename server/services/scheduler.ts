import prisma from '~/server/lib/prisma'
import { syncSourceDirectory } from '~/server/services/scraper'
import { nextJakartaRun } from '~/shared/utils/scheduler'

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
      const result = await syncSourceDirectory(schedule.novel.sourceSite, schedule.novel.sourceNovelId, { translateNewChapters: true })
      await prisma.novelSyncSchedule.update({ where: { id: schedule.id }, data: { lastStatus: 'SUCCESS', lastResult: JSON.stringify({ added: result.added, queued: result.queued, translateAfterDownload: result.queued, total: result.total }), nextRunAt: nextJakartaRun(schedule.localTime), error: null } })
    } catch (cause) {
      await prisma.novelSyncSchedule.update({ where: { id: schedule.id }, data: { lastStatus: 'FAILED', nextRunAt: nextJakartaRun(schedule.localTime), error: cause instanceof Error ? cause.message : 'Scheduled sync failed.' } })
    }
  }
  return due.length
}
