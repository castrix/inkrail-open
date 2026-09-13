import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { extensionManager } from '../services/extensions'

const workerState = globalThis as unknown as {
  inkrailWorkerChildren?: ChildProcess[]
  inkrailWorkersClosing?: boolean
}

function stopTree(child: ChildProcess) {
  if (!child.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else child.kill('SIGTERM')
}

export default defineNitroPlugin((nitroApp) => {
  process.env.INKRAIL_WORKER_TOKEN ||= randomBytes(32).toString('hex')
  nitroApp.hooks.hook('close', () => extensionManager().close())
  if (process.env.INKRAIL_DISABLE_BACKGROUND_JOBS === 'true') return
  if (workerState.inkrailWorkerChildren?.some(child => child.exitCode === null)) return
  workerState.inkrailWorkersClosing = false
  workerState.inkrailWorkerChildren = []
  const workerPath = resolve(process.cwd(), 'workers', 'worker.ts')

  const launch = (type: 'scrape' | 'translation', source?: string) => {
    if (workerState.inkrailWorkersClosing) return
    const child = spawn(process.execPath, ['--import', 'tsx', workerPath, `--type=${type}`, ...(source ? [`--source=${source}`] : [])], {
      cwd: process.cwd(), env: { ...process.env, INKRAIL_CORE_URL: `http://127.0.0.1:${process.env.PORT || 4000}`, INKRAIL_BROWSER_PROFILE: source ? `download-${source}` : type }, stdio: 'inherit', windowsHide: true
    })
    workerState.inkrailWorkerChildren!.push(child)
    child.on('error', error => console.error(`[inkrail ${type} worker]`, error))
    child.on('exit', code => {
      workerState.inkrailWorkerChildren = workerState.inkrailWorkerChildren?.filter(item => item !== child)
      if (!workerState.inkrailWorkersClosing) {
        console.error(`[inkrail ${type} worker] exited with ${code}; restarting.`)
        setTimeout(() => launch(type, source), 1500)
      }
    })
  }

  launch('scrape')
  const translationConcurrency = Math.min(4, Math.max(1, Number(process.env.TRANSLATION_WORKER_CONCURRENCY || 2) || 2))
  if (process.env.INKRAIL_ENABLE_TRANSLATION === 'true') for (let index = 0; index < translationConcurrency; index += 1) launch('translation')
  nitroApp.hooks.hook('close', () => {
    workerState.inkrailWorkersClosing = true
    for (const child of workerState.inkrailWorkerChildren || []) stopTree(child)
    workerState.inkrailWorkerChildren = []
  })
})
