<script setup lang="ts">
const route = useRoute()
const { data: stream, error, refresh } = await useFetch<any>(() => `/api/manga/reader/${route.params.slug}`)
</script>

<template>
  <PageError v-if="error" :error="error" :back-to="`/manga/${route.params.slug}`" @retry="refresh()" />
  <MangaReader v-else-if="stream" :title="stream.titleOriginal" :pages="stream.pages" :back-to="`/manga/${route.params.slug}`" :default-mode="stream.defaultReaderMode" :source-site="stream.sourceSite" />
</template>
