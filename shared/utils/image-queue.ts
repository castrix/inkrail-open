/** A single bounded queue; replacing the reading window cancels obsolete work. */
export class ImageQueue<T> {
  private active = new Map<string, AbortController>()
  private cache = new Map<string, T>()
  private desired: string[] = []
  private disposed = false
  constructor(private loader: (url: string, signal: AbortSignal) => Promise<T>, private done: (url: string, value?: T, error?: unknown) => void, private concurrency = 2, private capacity = 8) {}
  setWindow(urls: string[]) {
    this.desired = [...new Set(urls)]
    for (const [url, controller] of this.active) if (!this.desired.includes(url)) { controller.abort(); this.active.delete(url) }
    for (const url of this.desired) if (this.cache.has(url)) this.done(url, this.cache.get(url))
    this.pump()
  }
  retry(url: string) { this.cache.delete(url); this.setWindow([url, ...this.desired.filter(x => x !== url)]) }
  dispose() { this.disposed = true; for (const controller of this.active.values()) controller.abort(); this.active.clear(); this.cache.clear(); this.desired = [] }
  private pump() {
    if (this.disposed) return
    for (const url of this.desired) {
      if (this.active.size >= this.concurrency) break
      if (this.cache.has(url) || this.active.has(url)) continue
      const controller = new AbortController()
      this.active.set(url, controller)
      void this.loader(url, controller.signal).then(value => {
        if (controller.signal.aborted || this.disposed) return
        this.cache.delete(url); this.cache.set(url, value)
        while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!)
        this.done(url, value)
      }, error => {
        if (!controller.signal.aborted && !this.disposed) {
          this.desired = this.desired.filter(x => x !== url)
          this.done(url, undefined, error)
        }
      }).finally(() => { if (this.active.get(url) === controller) this.active.delete(url); this.pump() })
    }
  }
}
