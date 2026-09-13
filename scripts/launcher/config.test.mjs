import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('launcher reloads saved settings without revealing credentials and rejects invalid ports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inkrail-launcher-'))
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./config.mjs', import.meta.url))], { cwd: dir, encoding: 'utf8' })
  try {
    writeFileSync(join(dir, '.env'), 'PORT=4001\nHOST=127.0.0.1\nOWNER_PASSWORD=private-test-value\n')
    let result = run()
    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(result.stdout), { port: '4001', host: '127.0.0.1' })
    assert.ok(!result.stdout.includes('private-test-value'))
    writeFileSync(join(dir, '.env'), 'PORT=4102\nHOST=0.0.0.0\n')
    assert.equal(JSON.parse(run().stdout).port, '4102')
    writeFileSync(join(dir, '.env'), 'PORT=70000\n')
    assert.notEqual(run().status, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
