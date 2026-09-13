import { runDueNovelSchedules } from '~/server/services/scheduler'

const schedulerState = globalThis as unknown as { inkrailScheduleTimer?: ReturnType<typeof setInterval>; inkrailScheduleRunning?: boolean }

export default defineNitroPlugin((nitroApp) => {
  if (process.env.INKRAIL_DISABLE_BACKGROUND_JOBS === 'true') return
  if (schedulerState.inkrailScheduleTimer) return
  const tick = async () => {
    if (schedulerState.inkrailScheduleRunning) return
    schedulerState.inkrailScheduleRunning = true
    try { await runDueNovelSchedules() } catch (error) { console.error('[inkrail scheduler]', error) } finally { schedulerState.inkrailScheduleRunning = false }
  }
  void tick()
  schedulerState.inkrailScheduleTimer = setInterval(() => void tick(), 60_000)
  nitroApp.hooks.hook('close', () => {
    if (schedulerState.inkrailScheduleTimer) clearInterval(schedulerState.inkrailScheduleTimer)
    schedulerState.inkrailScheduleTimer = undefined
  })
})
