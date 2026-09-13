<script setup lang="ts">
const route = useRoute()
const { data: stream, error, refresh } = await useFetch<any>(() => `/api/manga/reader/${route.params.slug}`)
</script>

<template>
  <div v-if="error" class="grid min-h-screen place-content-center gap-4 text-center"><p>Could not open this manga.</p><button class="btn btn-primary" @click="refresh()">Retry</button><NuxtLink :to="`/manga/${route.params.slug}`">Back to manga</NuxtLink></div>
  <MangaReader v-else-if="stream" :title="stream.titleOriginal" :pages="stream.pages" :back-to="`/manga/${route.params.slug}`" :default-mode="stream.defaultReaderMode" :source-site="stream.sourceSite" />
</template>
