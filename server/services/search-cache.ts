type Entry<T> = { value: T, freshUntil: number, staleUntil: number }
const globalCache = globalThis as unknown as { inkrailSourceSearchCache?: Map<string, Entry<any>>, inkrailSearchPending?: Map<string, Promise<any>> }
const cache = globalCache.inkrailSourceSearchCache ||= new Map<string, Entry<any>>()
const pending = globalCache.inkrailSearchPending ||= new Map<string, Promise<any>>()

export async function cachedSourceSearch<T extends Record<string, unknown>>(key: string, loader: () => Promise<T>, force = false) {
  const now = Date.now(), existing = cache.get(key) as Entry<T> | undefined
  function load() {
    const active = pending.get(key)
    if (active) return active as Promise<T>
    const request = loader().then(value => {
      cache.delete(key)
      cache.set(key, { value, freshUntil: Date.now() + 5 * 60_000, staleUntil: Date.now() + 24 * 60 * 60_000 })
      while (cache.size > 300) cache.delete(cache.keys().next().value!)
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
  // A client revalidation joins background work, or reuses its fresh result.
  if (existing && existing.freshUntil > now) return { ...existing.value, _cache: { state: 'fresh' } }
  if (force || !existing || existing.staleUntil <= now) return { ...await load(), _cache: { state: 'revalidated' } }
  void load().catch(() => undefined)
  return { ...existing.value, _cache: { state: 'stale', revalidating: true } }
}
