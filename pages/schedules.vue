<script setup lang="ts">
const { data, refresh } = await useFetch<any>('/api/schedules')
const items = computed<any[]>(() => data.value?.items || [])
const draftTimes = reactive<Record<string, string>>({})
const busy = ref('')
const message = ref('')

watch(items, (value: any[]) => {
  for (const item of value) if (!draftTimes[item.id]) draftTimes[item.id] = item.localTime
}, { immediate: true })

function formatDate(value?: string) {
  if (!value) return 'Not run yet'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))
}

async function updateSchedule(item: any, changes: Record<string, unknown>) {
  busy.value = item.id; message.value = ''
  try {
    await $fetch(`/api/schedules/${item.id}`, { method: 'PATCH', body: changes })
    message.value = changes.enabled === false ? `${item.novel.titleTranslated || item.novel.titleOriginal} paused.` : 'Schedule updated. The next run starts tomorrow.'
    await refresh()
  } catch (cause: any) {
    message.value = cause?.data?.statusMessage || cause?.message || 'Schedule update failed.'
  } finally { busy.value = '' }
}

function statusClass(status: string) {
  if (status === 'SUCCESS') return 'badge-good'
  if (status === 'FAILED') return 'badge-bad'
  if (status === 'RUNNING') return 'badge-warn'
  return 'badge-muted'
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-10 md:py-14">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p class="text-xs uppercase tracking-[.2em] text-gold/70">Automation</p><h1 class="mt-3 font-serif text-4xl font-semibold md:text-5xl">Scheduled sync</h1><p class="mt-3 max-w-2xl text-sm leading-6 text-white/45">Inkrail checks each scheduled novel daily, indexes and downloads only new chapters, then queues them for translation. Times use Asia/Jakarta.</p></div>
      <NuxtLink to="/library?media=novel" class="btn btn-quiet shrink-0">Choose from library</NuxtLink>
    </div>

    <p v-if="message" class="mt-6 rounded-xl border border-gold/20 bg-gold/[.06] px-4 py-3 text-sm text-gold">{{ message }}</p>

    <div v-if="items.length" class="mt-8 space-y-4">
      <article v-for="item in items" :key="item.id" class="surface rounded-2xl p-5 sm:p-6">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2"><span class="badge" :class="item.enabled ? 'badge-good' : 'badge-muted'">{{ item.enabled ? 'Daily' : 'Paused' }}</span><span class="badge" :class="statusClass(item.lastStatus)">{{ item.lastStatus.replaceAll('_', ' ') }}</span></div>
            <NuxtLink :to="`/novels/${item.novel.slug}`" class="mt-3 block truncate font-serif text-2xl font-semibold hover:text-gold">{{ item.novel.titleTranslated || item.novel.titleOriginal }}</NuxtLink>
            <p v-if="item.novel.titleTranslated" class="mt-1 truncate text-xs text-white/35">{{ item.novel.titleOriginal }}</p>
          </div>
          <button class="btn w-full shrink-0 sm:w-auto" :class="item.enabled ? 'btn-quiet' : 'btn-primary'" :disabled="busy === item.id" @click="updateSchedule(item, { enabled: !item.enabled })">{{ item.enabled ? 'Pause' : 'Resume' }}</button>
        </div>

        <div class="mt-5 grid gap-4 border-t border-white/8 pt-5 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <label class="block"><span class="mb-2 block text-[10px] uppercase tracking-[.16em] text-white/35">Daily time</span><input v-model="draftTimes[item.id]" type="time" class="field" /></label>
          <div class="grid grid-cols-2 gap-3 text-xs sm:flex sm:gap-8"><div><p class="text-white/30">Next run</p><p class="mt-1 text-white/70">{{ item.enabled ? formatDate(item.nextRunAt) : 'Paused' }}</p></div><div><p class="text-white/30">Last run</p><p class="mt-1 text-white/70">{{ formatDate(item.lastRunAt) }}</p></div></div>
          <button class="btn btn-quiet w-full sm:w-auto" :disabled="busy === item.id || draftTimes[item.id] === item.localTime" @click="updateSchedule(item, { localTime: draftTimes[item.id] })">Save time</button>
        </div>

        <p v-if="item.lastStatus === 'SUCCESS' && item.result" class="mt-4 text-xs text-white/40">Last check: {{ item.result.added }} new · {{ item.result.queued }} queued to download{{ item.result.translateAfterDownload ? ' + translate' : '' }} · {{ item.result.total }} total chapters</p>
        <p v-else-if="item.error" class="mt-4 text-xs text-[#efa58b]">{{ item.error }}</p>
      </article>
    </div>
    <div v-else class="mt-8 rounded-2xl border border-dashed border-white/12 px-6 py-16 text-center"><h2 class="font-serif text-2xl font-semibold">No scheduled novels yet</h2><p class="mx-auto mt-3 max-w-md text-sm leading-6 text-white/40">Open a novel in your library and choose “Schedule daily sync.” Its first check will run tomorrow at 06:00.</p><NuxtLink to="/library?media=novel" class="btn btn-primary mt-6">Open novel library</NuxtLink></div>
  </div>
</template>
