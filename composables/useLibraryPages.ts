import type { ComputedRef } from 'vue'

export function useLibraryPages(request: ComputedRef<Record<string, string>>) {
  const cache = useState<Record<string, { response: any, scroll: number }>>('library-pages-v2', () => ({}))
  const keyOf = (value: Record<string, string>) => JSON.stringify(value)
  const initial = { ...request.value }, initialKey = keyOf(initial)
  const requestFetch = useRequestFetch()
  const response = ref<any>(cache.value[initialKey]?.response || null)
  const pending = ref(false), loadingMore = ref(false), error = ref(''), dirty = ref(false)
  const sentinel = ref<HTMLElement | null>(null)
  let lastMore = false
  let activeKey = initialKey, generation = 0, timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined, observer: IntersectionObserver | undefined
  const ready = useAsyncData(`library:${initialKey}`, () => requestFetch<any>('/api/library', { query: initial }), {
    getCachedData: (key, app) => cache.value[initialKey]?.response || (app.isHydrating ? app.payload.data[key] : undefined),
    deep: false
  })
  watch(ready.data, (value: any) => { if (value) { response.value = value; cache.value[initialKey] = { response: value, scroll: cache.value[initialKey]?.scroll || 0 } } }, { immediate: true })
  watch(ready.error, (value: any) => { if (value) error.value = 'Could not open your library. Please retry.' })

  function remember() {
    if (!response.value) return
    cache.value[activeKey] = { response: response.value, scroll: import.meta.client ? window.scrollY : 0 }
    const keys = Object.keys(cache.value)
    while (keys.length > 6) { const key = keys.shift()!; if (key !== activeKey) delete cache.value[key] }
  }

  async function load(more = false) {
    if (more && (pending.value || loadingMore.value || dirty.value || !response.value?.hasMore)) return
    if (more && keyOf(request.value) !== activeKey) more = false
    lastMore = more
    const run = ++generation
    controller?.abort(); controller = new AbortController()
    const query = { ...request.value }, key = keyOf(query)
    if (!more) { pending.value = true; loadingMore.value = false }
    else loadingMore.value = true
    dirty.value = false; error.value = ''
    try {
      const result = await $fetch<any>('/api/library', { query: { ...query, ...(more ? { cursor: response.value.nextCursor, summary: '0' } : {}) }, signal: controller.signal })
      if (run !== generation) return
      if (more) {
        const known = new Set(response.value.items.map((x: any) => x.id))
        response.value = { ...response.value, ...result, items: [...response.value.items, ...result.items.filter((x: any) => !known.has(x.id))] }
      } else response.value = result
      activeKey = key
      remember()
    } catch (cause: any) {
      if (run === generation && !controller.signal.aborted) error.value = cause?.data?.statusMessage || 'Could not load titles. Please retry.'
    } finally { if (run === generation) { pending.value = false; loadingMore.value = false } }
  }

  watch(request, (next: Record<string, string>, previous: Record<string, string>) => {
    remember(); generation++; controller?.abort()
    if (timer) clearTimeout(timer)
    loadingMore.value = false; pending.value = false; dirty.value = true; error.value = ''
    const key = keyOf(next)
    if (cache.value[key]) { response.value = cache.value[key].response; activeKey = key }
    else if (next.libraryId !== previous.libraryId) response.value = null
    timer = setTimeout(() => void load(), 350)
  })
  async function refresh() {
    if (timer) clearTimeout(timer)
    cache.value = {}
    await load()
  }
  onMounted(() => {
    const scroll = cache.value[initialKey]?.scroll || 0
    if (scroll) requestAnimationFrame(() => window.scrollTo({ top: scroll, behavior: 'instant' }))
    observer = new IntersectionObserver(entries => {
      if (entries.some(x => x.isIntersecting) && !error.value) void load(true)
    }, { rootMargin: '600px' })
    if (sentinel.value) observer.observe(sentinel.value)
  })
  onBeforeUnmount(() => { remember(); generation++; controller?.abort(); if (timer) clearTimeout(timer); observer?.disconnect() })
  return { ready, response, pending: computed(() => pending.value || dirty.value || ready.pending.value), loadingMore, error, sentinel, loadMore: () => load(true), retry: () => load(lastMore), refresh }
}
