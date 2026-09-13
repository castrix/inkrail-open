<script setup lang="ts">
defineProps<{ title: string, library?: { id: string, name: string }, media: 'NOVEL' | 'MANGA' }>()
</script>

<template>
  <nav aria-label="Breadcrumb" class="mb-6 text-xs text-white/40">
    <ol class="flex min-w-0 flex-wrap items-center gap-2">
      <li><NuxtLink to="/library" class="hover:text-gold">Library</NuxtLink></li>
      <template v-if="library">
        <li aria-hidden="true">/</li>
        <li><NuxtLink :to="{ path: '/library', query: { library: library.id, media } }" class="hover:text-gold">{{ library.name }}</NuxtLink></li>
      </template>
      <li aria-hidden="true">/</li>
      <li aria-current="page" class="min-w-0 max-w-full truncate text-white/65" :title="title">{{ title }}</li>
    </ol>
  </nav>
</template>
