import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
await mkdir('data/database', { recursive: true })
let exists = false
try { await readFile('.env'); exists = true } catch (e) { if (e.code !== 'ENOENT') throw e }
if (!exists) {
  const password = randomBytes(18).toString('base64url')
  const example = await readFile('.env.example', 'utf8')
  await writeFile('.env', example.replace('OWNER_PASSWORD=', `OWNER_PASSWORD=${password}`).replace('OWNER_SESSION_SECRET=', `OWNER_SESSION_SECRET=${randomBytes(32).toString('hex')}`), { flag: 'wx', mode: 0o600 })
  console.log('Generated private credentials in .env. Read OWNER_PASSWORD there to sign in.')
}
process.loadEnvFile('.env')
const configured = process.env.DATABASE_URL || 'file:../data/database/inkrail.db'
if (!configured.startsWith('file:')) throw new Error('Inkrail requires a SQLite file URL')
const databasePath = resolve('prisma', configured.slice(5))
await mkdir(dirname(databasePath), { recursive: true })
await (await open(databasePath, 'a')).close()
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll('\\', '/')}` } })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
