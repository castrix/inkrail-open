import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
const env = parseEnv(readFileSync('.env', 'utf8'))
const port = Number(env.PORT || 4000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535')
const host = env.HOST || '127.0.0.1'
if (!['127.0.0.1', '0.0.0.0', 'localhost', '::', '::1'].includes(host)) throw new Error('Launcher HOST must be localhost, 127.0.0.1, 0.0.0.0, :: or ::1')
console.log(JSON.stringify({ port: String(port), host }))
