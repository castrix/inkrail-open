export function usePersistedSearchState<T extends Record<string, unknown>>(source: string, defaults: T, routeOverrides: Partial<T> = {}) {
  const key = `inkrail:search:${source}`
  const state = reactive({ ...defaults, ...routeOverrides }) as T
  const restored = ref(false)
  let stopWatcher: (() => void) | undefined

  onMounted(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (saved && typeof saved === 'object') for (const field in defaults) {
        if (typeof saved[field] === typeof defaults[field]) (state as any)[field] = saved[field]
      }
    } catch { /* Ignore stale or malformed browser state. */ }
    Object.assign(state, routeOverrides)
    restored.value = true
    stopWatcher = watch(state, (value: T) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage may be disabled. */ } }, { deep: true })
  })
  onBeforeUnmount(() => stopWatcher?.())

  function clear() {
    Object.assign(state, defaults)
    try { localStorage.removeItem(key) } catch { /* Storage may be disabled. */ }
  }
  return { state, restored, clear }
}
