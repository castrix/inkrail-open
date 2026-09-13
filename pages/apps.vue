<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch<any>('/api/apps')
const refreshing = ref(false)
const viewerHost = ref('')
const viewerPort = ref(0)
const showAllEndpoints = ref(false)
const localViewer = computed(() => ['localhost', '127.0.0.1', '::1'].includes(viewerHost.value))
const visibleApps = computed(() => (data.value?.apps || []).filter((app: any) => {
  if (!showAllEndpoints.value && app.port === viewerPort.value) return false
  if (showAllEndpoints.value || app.known) return true
  return Boolean(app.title && !/^(error|unauthorized|service unavailable)$/i.test(app.title))
}))

function address(app: any) {
  if (app.scope === 'local' && !localViewer.value) return ''
  const host = app.scope === 'local' ? '127.0.0.1' : app.scope === 'lan' ? app.addresses.find((item: string) => !item.includes(':')) || app.addresses[0] : viewerHost.value
  const wrapped = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  const defaultPort = (app.protocol === 'http' && app.port === 80) || (app.protocol === 'https' && app.port === 443)
  return `${app.protocol}://${wrapped}${defaultPort ? '' : `:${app.port}`}${app.path || '/'}`
}
function scopeLabel(value: string) { return value === 'tailnet' ? 'Tailnet ready' : value === 'local' ? 'Server PC only' : 'Local network' }
async function rescan() {
  refreshing.value = true
  try { data.value = await $fetch('/api/apps?refresh=true') } finally { refreshing.value = false }
}
onMounted(() => { viewerHost.value = location.hostname; viewerPort.value = Number(location.port || (location.protocol === 'https:' ? 443 : 80)) })
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 py-10 md:py-16">
    <section class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p class="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-gold">Local services</p><h1 class="font-serif text-4xl font-semibold md:text-6xl">Apps</h1><p class="mt-4 max-w-2xl text-sm leading-7 text-muted">Web apps currently listening on this Windows PC. Tailnet-ready services open using the same hostname you used for Inkrail.</p></div>
      <div class="flex min-w-0 flex-wrap gap-2"><button class="btn btn-quiet h-fit" :class="showAllEndpoints ? 'border-gold/50 text-gold' : ''" @click="showAllEndpoints = !showAllEndpoints">{{ showAllEndpoints ? 'Hide endpoints' : 'Show all endpoints' }}</button><button class="btn btn-quiet h-fit" :disabled="refreshing || pending" @click="rescan"><svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="2"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 9a7 7 0 0 0-12-2M5.5 15a7 7 0 0 0 12 2"/></svg>{{ refreshing ? 'Scanning…' : 'Refresh' }}</button></div>
    </section>

    <div v-if="pending && !data" class="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><div v-for="index in 3" :key="index" class="surface h-44 animate-pulse rounded-2xl" /></div>
    <div v-else-if="error" class="surface mt-10 rounded-2xl border-[#efa58b]/30 p-8 text-[#efa58b]">Could not scan local web services. {{ error.message }}</div>
    <div v-else-if="visibleApps.length" class="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="app in visibleApps" :key="`${app.protocol}-${app.port}`" class="surface group flex min-w-0 min-h-48 flex-col rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-gold/30">
        <div class="flex items-start justify-between gap-4"><span class="grid h-12 min-w-12 place-items-center rounded-xl bg-gold/10 px-2 font-serif text-lg font-semibold text-gold">{{ app.icon }}</span><span class="badge" :class="app.scope === 'tailnet' ? 'badge-good' : app.scope === 'local' ? 'badge-muted' : 'badge-warn'">{{ scopeLabel(app.scope) }}</span></div>
        <div class="mt-5"><h2 class="truncate font-serif text-xl font-semibold" :title="app.name">{{ app.name }}</h2><p class="mt-1 text-xs text-muted">{{ app.description }} · {{ app.protocol.toUpperCase() }} :{{ app.port }} · HTTP {{ app.status }}</p></div>
        <div class="mt-auto pt-5">
          <a v-if="address(app)" :href="address(app)" target="_blank" rel="noreferrer" class="btn btn-primary w-full">Open app ↗</a>
          <button v-else class="btn btn-quiet w-full cursor-not-allowed opacity-75" disabled>Open on the server PC</button>
        </div>
      </article>
    </div>
    <div v-else class="surface mt-10 rounded-2xl p-12 text-center"><h2 class="font-serif text-2xl font-semibold">No HTTP apps found</h2><p class="mt-3 text-sm text-muted">Start a Web UI such as Plex or qBittorrent, then refresh this page.</p></div>

    <p v-if="data" class="mt-5 text-xs text-muted">Scanned {{ data.listeners }} listening ports in {{ data.durationMs }} ms. Found {{ data.apps.length }} HTTP endpoints; {{ visibleApps.length }} shown.</p>
  </div>
</template>
