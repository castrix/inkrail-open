import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('first setup reuses a shipped build without a receipt and builds only if missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inkrail-prebuilt-'))
  const entry = join(dir, '.output/server/index.mjs')
  try {
    for (const sub of ['data/launcher', 'node_modules/.bin', 'scripts/launcher', '.output/server']) mkdirSync(join(dir, sub), { recursive: true })
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    writeFileSync(join(dir, 'node_modules/.bin/nuxt.cmd'), '')
    writeFileSync(join(dir, 'data/launcher/dependencies.sha256'), createHash('sha256').update('{}').update(process.version).digest('hex'))
    writeFileSync(join(dir, 'scripts/setup.mjs'), '')
    writeFileSync(join(dir, 'scripts/launcher/config.mjs'), '')
    writeFileSync(entry, '// shipped build')
    const npm = join(dir, 'npm-stub.mjs')
    writeFileSync(npm, "import {writeFileSync} from 'node:fs'; if(process.argv.slice(2).join(' ')!=='run build') throw Error('Unexpected npm call'); writeFileSync('build-called','yes'); writeFileSync('.output/server/index.mjs','// rebuilt');")
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./prepare.mjs', import.meta.url)), npm], { cwd: dir, encoding: 'utf8' })
    let result = run()
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /no rebuild needed/)
    assert.equal(existsSync(join(dir, 'build-called')), false)
    assert.equal(readFileSync(entry, 'utf8'), '// shipped build')
    rmSync(entry)
    result = run()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(entry, 'utf8'), '// rebuilt')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
