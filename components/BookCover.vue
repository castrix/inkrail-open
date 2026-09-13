<script setup lang="ts">
const props = defineProps<{ src?: string | null, title?: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>
<template>
  <div class="relative overflow-hidden bg-ink">
    <img v-if="src && !failed" :src="src" :alt="title || ''" loading="lazy" decoding="async" class="h-full w-full object-cover" @error="failed = true" />
    <div v-else class="grid h-full min-h-24 place-items-center p-3 text-center font-serif text-3xl text-gold" role="img" :aria-label="title ? `No cover available for ${title}` : 'No cover available'">{{ title?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('') || 'I' }}</div>
  </div>
</template>
