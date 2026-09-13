import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const state = resolve('data/launcher')
await mkdir(state, { recursive: true })
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Setup failed (${result.status}): ${args[0]}`)
}
const npm = process.argv[2]
const receipt = name => readFile(join(state, name), 'utf8').catch(() => '')
const lock = createHash('sha256').update(await readFile('package-lock.json')).update(process.version).digest('hex')
if (!existsSync('node_modules/.bin/nuxt.cmd') || await receipt('dependencies.sha256') !== lock) {
  console.log('Installing application dependencies (internet required)...')
  run([npm, 'ci'])
  await writeFile(join(state, 'dependencies.sha256'), lock)
}
run(['scripts/setup.mjs'])
run(['scripts/launcher/config.mjs'])
await writeFile(join(state, 'node-path.txt'), process.execPath)
if (!existsSync('.output/server/index.mjs')) {
  console.log('Building Inkrail Open...')
  run([npm, 'run', 'build'])
} else console.log('Using the included production build; no rebuild needed.')
console.log('Ready. Sign in with OWNER_PASSWORD from .env (tray Settings > Edit configuration).')
