<script setup lang="ts">
const props = defineProps<{ page: number, pageCount: number, total: number, pending?: boolean, placement: 'top' | 'bottom' }>()
const emit = defineEmits<{ change: [page: number] }>()
const pages = computed(() => {
  const start = Math.max(1, Math.min(props.page - 2, props.pageCount - 4))
  return Array.from({ length: Math.min(5, props.pageCount) }, (_, index) => start + index)
})
</script>

<template>
  <nav :aria-label="`Chapter pagination ${placement}`" class="my-5 flex flex-col items-center gap-3 text-sm">
    <p class="text-xs text-muted" aria-live="polite">Page {{ page }} of {{ pageCount }} · {{ total }} chapters</p>
    <div class="flex max-w-full flex-wrap items-center justify-center gap-1.5">
      <button class="pagination-button" :disabled="pending || page <= 1" @click="emit('change', 1)">First</button>
      <button class="pagination-button" :disabled="pending || page <= 1" @click="emit('change', page - 1)">Prev</button>
      <button v-for="number in pages" :key="number" class="pagination-button" :class="number === page ? 'border-gold/60 bg-gold/15 text-gold' : ''" :aria-label="`Page ${number}`" :aria-current="number === page ? 'page' : undefined" :disabled="pending || number === page" @click="emit('change', number)">{{ number }}</button>
      <button class="pagination-button" :disabled="pending || page >= pageCount" @click="emit('change', page + 1)">Next</button>
      <button class="pagination-button" :disabled="pending || page >= pageCount" @click="emit('change', pageCount)">Last</button>
    </div>
  </nav>
</template>

<style scoped>
.pagination-button { @apply min-h-11 min-w-9 rounded-lg border border-white/10 px-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-default; }
.pagination-button:disabled:not([aria-current="page"]) { @apply opacity-75; }
.pagination-button[aria-current="page"] { @apply border-gold/60 bg-gold/15 text-gold; }
</style>
