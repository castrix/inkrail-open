<script setup lang="ts">
const route = useRoute()
const sourceSite = String(route.params.source)
const sourceNovelId = String(route.params.id)
const { data: stream, error, refresh } = await useFetch<any>('/api/manga/stream', { query: { sourceSite, sourceNovelId } })
</script>

<template>
  <PageError v-if="error" :error="error" @retry="refresh()" />
  <MangaReader v-else :title="stream?.titleOriginal || 'Streaming manga…'" :pages="stream?.pages || []" :back-to="`/sources/${sourceSite}/books/${sourceNovelId}`" :default-mode="stream?.defaultReaderMode || 'manga'" :source-site="sourceSite" />
</template>
