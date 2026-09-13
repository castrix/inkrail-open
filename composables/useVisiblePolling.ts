/** Serial polling: no overlapping requests, no background-tab network traffic. */
export function useVisiblePolling(task: () => unknown | Promise<unknown>, interval = 10000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false, running = false
  const tick = async () => {
    if (stopped || document.hidden || running) return
    clearTimeout(timer); running = true
    try { await task() } catch { /* Request state owns user-facing errors. */ }
    finally { running = false; if (!stopped && !document.hidden) timer = setTimeout(tick, interval) }
  }
  const visibility = () => { clearTimeout(timer); if (!document.hidden) void tick() }
  onMounted(() => { document.addEventListener('visibilitychange', visibility); timer = setTimeout(tick, interval) })
  onBeforeUnmount(() => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) })
}
