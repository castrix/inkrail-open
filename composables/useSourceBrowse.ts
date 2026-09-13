export function useSourceBrowse<T extends Record<string, string>>(options: {
  source: string, defaults: T, keys: Record<keyof T, string>, compile: (state: T) => Record<string, string>, searchOnly?: boolean
}) {
  const route = useRoute(), router = useRouter()
  const overrides: Partial<T> = {}
  for (const field in options.defaults) {
    const value = route.query[options.keys[field]]
    if (typeof value === 'string') (overrides as any)[field] = value
  }
  const { state, clear: clearStored } = usePersistedSearchState(options.source, options.defaults, overrides)
  const results = ref<any[]>([]), loading = ref(true), hasNext = ref(false), error = ref(''), searched = ref('')
  const sentinel = ref<HTMLElement | null>(null)
  let page = 1, generation = 0, mounted = false, dirty = false, ownRoute = ''
  let timer: ReturnType<typeof setTimeout> | undefined, revalidation: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined, observer: IntersectionObserver | undefined, stop: (() => void) | undefined
  let applied: Record<string, string> = {}
  const queryState = () => Object.fromEntries(Object.keys(options.defaults)
    .filter(field => state[field] !== options.defaults[field])
    .map(field => [options.keys[field], state[field]]))

  async function load(reset = false, revalidate = false) {
    if (!mounted || (!reset && (loading.value || dirty || !hasNext.value))) return
    const run = ++generation
    controller?.abort(); controller = new AbortController()
    if (reset) {
      page = 1; applied = options.compile({ ...state } as T); dirty = false
      if (options.searchOnly && !applied.q) { results.value = []; searched.value = ''; hasNext.value = false; loading.value = false; return }
    }
    loading.value = true; error.value = ''
    try {
      const response: any = await $fetch(`/api/sources/${options.source}/${options.searchOnly ? 'search' : 'browse'}`, {
        query: { ...applied, ...(!options.searchOnly ? { page } : {}), ...(revalidate ? { revalidate: '1' } : {}) }, signal: controller.signal
      })
      if (run !== generation || !mounted) return
      const known = new Set(reset ? [] : results.value.map((x: any) => x.sourceNovelId))
      results.value = [...(reset ? [] : results.value), ...response.results.filter((x: any) => !known.has(x.sourceNovelId))]
      searched.value = applied.q || ''; hasNext.value = Boolean(response.hasNext); page++
      if (reset && response._cache?.state === 'stale') {
        revalidation = setTimeout(() => { if (run === generation && !dirty) void load(true, true) }, 700)
      }
    } catch (cause: any) {
      if (run === generation && !controller.signal.aborted) { error.value = cause?.data?.statusMessage || 'Could not load results. Please retry.'; hasNext.value = false }
    } finally { if (run === generation) loading.value = false }
  }
  async function search() {
    if (timer) clearTimeout(timer)
    if (revalidation) clearTimeout(revalidation)
    const next = queryState()
    ownRoute = JSON.stringify(next)
    // Search requests do not wait for query-only navigation middleware.
    void router.replace({ path: `/sources/${options.source}`, query: next })
    await load(true)
  }
  function schedule() {
    generation++; controller?.abort(); dirty = true; loading.value = false
    if (timer) clearTimeout(timer)
    if (revalidation) clearTimeout(revalidation)
    timer = setTimeout(() => void search(), 350)
  }
  function clearFilters() { clearStored(); void nextTick(() => search()) }
  function setSort(value: string) { (state as any).sort = value }
  watch(() => route.query, (next: Record<string, any>) => {
    if (!mounted || JSON.stringify(next) === ownRoute) return
    Object.assign(state, options.defaults)
    for (const field in options.defaults) {
      const value = next[options.keys[field]]
      if (typeof value === 'string') (state as any)[field] = value
    }
  })
  onMounted(() => {
    mounted = true
    stop = watch(state, schedule, { deep: true })
    void load(true)
    observer = new IntersectionObserver(entries => {
      if (entries.some(x => x.isIntersecting) && !error.value) void load()
    }, { rootMargin: '600px' })
    if (sentinel.value) observer.observe(sentinel.value)
  })
  onBeforeUnmount(() => { mounted = false; generation++; controller?.abort(); stop?.(); observer?.disconnect(); if (timer) clearTimeout(timer); if (revalidation) clearTimeout(revalidation) })
  return { state, results, loading, hasNext, error, searched, sentinel, search, applyFilters: search, clearFilters, setSort, loadMore: () => load() }
}
