import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes } from 'node:crypto'
const existing = await readFile('.env', 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e })
const env = parseEnv(existing ?? await readFile('.env.example', 'utf8'))
if (process.argv[2] === 'read') {
  console.log(JSON.stringify({ port: env.PORT || '4000', host: env.HOST || '127.0.0.1', password: env.OWNER_PASSWORD || '' }))
} else if (process.argv[2] === 'save') {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const settings = JSON.parse(input)
  const port = Number(settings.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.')
  if (!['127.0.0.1', '0.0.0.0', 'localhost', '::', '::1'].includes(settings.host)) throw new Error('Unsupported host.')
  if (typeof settings.password !== 'string' || settings.password.length < 8 || /[\r\n"'`\x00]/.test(settings.password)) throw new Error('Use at least 8 password characters, without quotes, backticks or line breaks.')
  const updates = { PORT: String(port), HOST: settings.host, OWNER_PASSWORD: settings.password }
  if (!env.OWNER_SESSION_SECRET) updates.OWNER_SESSION_SECRET = randomBytes(32).toString('hex')
  let text = existing ?? await readFile('.env.example', 'utf8')
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}="${value}"`
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'gm')
    if (pattern.test(text)) text = text.replace(pattern, () => line)
    else text += `\n${line}\n`
  }
  await mkdir('data/launcher', { recursive: true })
  const temp = `.env.launcher-${randomBytes(8).toString('hex')}`
  await writeFile(temp, text, { mode: 0o600, flag: 'wx' })
  await rename(temp, '.env')
} else throw new Error('Expected read or save.')
