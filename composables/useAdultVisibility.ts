const STORAGE_KEY = 'inkrail:show-adult-content'

export function useAdultVisibility() {
  const visible = useState<boolean>('adult-content-visible', () => false)
  const loaded = useState<boolean>('adult-content-visible-loaded', () => false)
  let stopWatcher: (() => void) | undefined
  const sync = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) visible.value = event.newValue === 'true'
  }

  onMounted(() => {
    if (!loaded.value) {
      visible.value = localStorage.getItem(STORAGE_KEY) === 'true'
      loaded.value = true
    }
    stopWatcher = watch(visible, (value: boolean) => localStorage.setItem(STORAGE_KEY, String(value)))
    window.addEventListener('storage', sync)
  })
  onBeforeUnmount(() => { stopWatcher?.(); window.removeEventListener('storage', sync) })

  return visible
}
