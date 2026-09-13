import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
test('wizard creates credentials and preserves private unrelated settings on later saves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inkrail-wizard-'))
  const run = (command, settings) => spawnSync(process.execPath, [fileURLToPath(new URL('./configure.mjs', import.meta.url)), command], { cwd: dir, encoding: 'utf8', input: settings && JSON.stringify(settings) })
  try {
    writeFileSync(join(dir, '.env.example'), 'PORT=4000\nHOST=127.0.0.1\nOWNER_PASSWORD=\nOWNER_SESSION_SECRET=\nDATABASE_URL=file:../data/database/inkrail.db\nCUSTOM_FLAG=keep-me\n')
    assert.equal(JSON.parse(run('read').stdout).password, '')
    let result = run('save', { port: '4001', host: '127.0.0.1', password: 'my # strong $ password' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, '')
    let env = parseEnv(readFileSync(join(dir, '.env'), 'utf8'))
    assert.equal(env.OWNER_PASSWORD, 'my # strong $ password')
    assert.match(env.OWNER_SESSION_SECRET, /^[a-f0-9]{64}$/)
    const secret = env.OWNER_SESSION_SECRET
    result = run('save', { port: '4100', host: '0.0.0.0', password: 'another-password' })
    assert.equal(result.status, 0, result.stderr)
    env = parseEnv(readFileSync(join(dir, '.env'), 'utf8'))
    assert.equal(env.OWNER_SESSION_SECRET, secret)
    assert.equal(env.CUSTOM_FLAG, 'keep-me')
    assert.equal(env.DATABASE_URL, 'file:../data/database/inkrail.db')
    const before = readFileSync(join(dir, '.env'), 'utf8')
    assert.notEqual(run('save', { port: '0', host: '127.0.0.1', password: 'another-password' }).status, 0)
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
