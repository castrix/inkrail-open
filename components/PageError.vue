<script setup lang="ts">
const props = withDefaults(defineProps<{ error?: any, backTo?: string }>(), { backTo: '/library' })
defineEmits<{ retry: [] }>()
const missing = computed(() => (props.error?.statusCode || props.error?.status) === 404)
</script>
<template>
  <section class="mx-auto max-w-lg px-5 py-16" role="alert"><h1 class="font-serif text-3xl">{{ missing ? 'Page not found' : 'Could not open this page' }}</h1><p class="my-5 text-muted">{{ missing ? 'This item may have moved or is no longer available.' : 'Check your connection and make sure the source is enabled in Extensions, then try again.' }}</p><div class="flex flex-wrap gap-3"><NuxtLink :to="backTo" class="btn btn-quiet">Go back</NuxtLink><NuxtLink to="/library" class="btn btn-quiet">Library</NuxtLink><button v-if="!missing" class="btn btn-primary" @click="$emit('retry')">Retry</button></div></section>
</template>
