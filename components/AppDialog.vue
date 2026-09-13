<script setup lang="ts">
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
let previous: HTMLElement | null = null
function backdropClick(event: MouseEvent) { if (event.target === dialog.value) emit('close') }
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(el => el.getClientRects().length)
  const first = controls[0], last = controls.at(-1)
  if (!first) { event.preventDefault(); dialog.value?.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => { previous = document.activeElement as HTMLElement; dialog.value?.showModal() })
onBeforeUnmount(() => { dialog.value?.close(); previous?.focus() })
</script>
<template>
  <dialog ref="dialog" class="app-dialog" :aria-label="title" aria-modal="true" @keydown="trapFocus" @cancel.prevent="emit('close')" @click="backdropClick">
    <section class="p-5 sm:p-6"><div class="mb-5 flex items-start justify-between gap-4"><h2 class="font-serif text-2xl">{{ title }}</h2><button type="button" class="btn btn-quiet" aria-label="Close dialog" @click="emit('close')">✕</button></div><slot /></section>
  </dialog>
</template>
