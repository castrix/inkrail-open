<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const isReader = computed(() => route.name?.toString().includes('chapters') || route.path.endsWith('/read'))
const mobileMenuOpen = ref(false)

watch(() => route.fullPath, () => { mobileMenuOpen.value = false })

async function logout() {
  mobileMenuOpen.value = false
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen">
    <header v-if="route.path !== '/login' && !isReader" class="sticky top-0 z-40 border-b border-white/10 bg-[#101210]/90 backdrop-blur-xl">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <NuxtLink to="/library" class="flex items-center gap-3">
          <span class="grid h-9 w-9 place-items-center rounded-xl bg-gold font-serif text-xl font-semibold text-ink">I</span>
          <div>
            <div class="font-serif text-lg font-semibold tracking-tight">{{ config.public.appName }}</div>
            <div class="text-[10px] uppercase tracking-[.2em] text-white/40">private reading room</div>
          </div>
        </NuxtLink>
        <nav class="hidden items-center gap-2 text-sm md:flex">
          <NuxtLink class="btn btn-quiet" to="/search" aria-label="Global search" title="Global search"><svg viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span class="mobile-hide">Search</span></NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/library">Library</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/sources">Browse</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/extensions">Extensions</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/schedules">Schedules</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/speedtest">Speed test</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/apps">Apps</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/admin">Workspace</NuxtLink>
          <button class="btn btn-quiet" @click="logout">Lock</button>
        </nav>
        <button type="button" class="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-white md:hidden" :aria-expanded="mobileMenuOpen" aria-controls="mobile-navigation" :aria-label="mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'" @click="mobileMenuOpen = !mobileMenuOpen">
          <svg v-if="!mobileMenuOpen" viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          <svg v-else viewBox="0 0 24 24" class="h-5 w-5 fill-none stroke-current" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <nav v-if="mobileMenuOpen" id="mobile-navigation" class="border-t border-white/10 px-5 py-3 md:hidden" aria-label="Mobile navigation">
        <div class="mx-auto grid max-w-7xl grid-cols-2 gap-2 text-sm">
          <NuxtLink class="btn btn-quiet justify-start" to="/search"><svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>Search</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/library">Library</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/sources">Browse</NuxtLink>
          <NuxtLink class="btn btn-quiet" to="/extensions">Extensions</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/schedules">Schedules</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/speedtest">Speed test</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/apps">Apps</NuxtLink>
          <NuxtLink class="btn btn-quiet justify-start" to="/admin">Workspace</NuxtLink>
          <button class="btn btn-quiet justify-start" @click="logout">Lock</button>
        </div>
      </nav>
    </header>
    <main><slot /></main>
    <JobQueueToolbar v-if="route.path !== '/login'" />
  </div>
</template>
