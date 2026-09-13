<script setup lang="ts">
import type { ReaderEntity } from '~/shared/utils/encyclopedia'
import { entityTextSegments } from '~/shared/utils/encyclopedia'

const props = defineProps<{ text: string, entities: ReaderEntity[] }>()
const emit = defineEmits<{ select: [entity: ReaderEntity, event: MouseEvent] }>()
const segments = computed(() => entityTextSegments(props.text, props.entities))
</script>

<template>
  <template v-for="(segment, index) in segments" :key="`${index}-${segment.text}`">
    <button v-if="segment.entity" type="button" class="inline cursor-help border-b border-dotted border-current/40 bg-transparent p-0 [font:inherit] text-inherit transition hover:border-current hover:bg-current/[.06]" @click.stop="emit('select', segment.entity, $event)">{{ segment.text }}</button><template v-else>{{ segment.text }}</template>
  </template>
</template>
