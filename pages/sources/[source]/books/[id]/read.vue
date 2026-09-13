<script setup lang="ts">
const route = useRoute()
const sourceSite = String(route.params.source)
const sourceNovelId = String(route.params.id)
const { data: stream, error, refresh } = await useFetch<any>('/api/manga/stream', { query: { sourceSite, sourceNovelId } })
</script>

<template>
  <div v-if="error" role="alert" class="grid min-h-screen place-content-center gap-4 text-center"><p>Could not open this manga.</p><button class="btn btn-primary" @click="refresh()">Retry</button></div>
  <MangaReader v-else :title="stream?.titleOriginal || 'Streaming manga…'" :pages="stream?.pages || []" :back-to="`/sources/${sourceSite}/books/${sourceNovelId}`" :default-mode="stream?.defaultReaderMode || 'manga'" :source-site="sourceSite" />
</template>
