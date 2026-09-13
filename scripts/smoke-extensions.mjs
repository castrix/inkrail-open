// Requires a built app and a signed source repository containing the two example packages.
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
if (!process.env.TEST_REPOSITORY_URL || !process.env.TEST_REPOSITORY_FINGERPRINT) throw new Error('Set TEST_REPOSITORY_URL and TEST_REPOSITORY_FINGERPRINT')
await mkdir('work', { recursive: true })
const root = await mkdtemp(resolve('work', 'smoke-'))
const password = randomBytes(24).toString('hex')
await writeFile(resolve(root, 'database.db'), '')
const env = { ...process.env, DATA_DIR: root, DATABASE_URL: `file:${resolve(root, 'database.db').replaceAll('\\', '/')}`, OWNER_PASSWORD: password, OWNER_SESSION_SECRET: randomBytes(32).toString('hex'), HOST: '127.0.0.1', PORT: process.env.TEST_PORT || '4100', INKRAIL_ENABLE_TRANSLATION: 'false', INKRAIL_DISABLE_BACKGROUND_JOBS: 'false' }
const db = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, encoding: 'utf8', windowsHide: true })
if (db.status !== 0) throw new Error(db.stdout + db.stderr)
const child = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let logs = ''; child.stdout.on('data', b => { logs += b }); child.stderr.on('data', b => { logs += b })
const base = `http://127.0.0.1:${env.PORT}`
let cookie = ''
const request = async (path, body) => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined })
  const text = await response.text(); if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${text}`)
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
  return JSON.parse(text)
}
const action = (action, extra = {}) => request('/api/extensions', { action, ...extra })
const report = []
let browser, browserPage
try {
  let ready = false
  for (let i = 0; i < 90; i++) { try { await fetch(base + '/login'); ready = true; break } catch {} await new Promise(r => setTimeout(r, 500)) }
  assert(ready, 'App startup')
  assert.equal((await fetch(base + '/api/extensions')).status, 401)
  await request('/api/auth/login', { password })
  assert.equal((await request('/api/sources')).length, 0); report.push('empty source registry and authenticated management')
  const extensionPage = await fetch(base + '/extensions', { headers: { cookie } }); assert.equal(extensionPage.status, 200); assert((await extensionPage.text()).includes('Add repository'))
  await action('addRepository', { url: process.env.TEST_REPOSITORY_URL, fingerprint: process.env.TEST_REPOSITORY_FINGERPRINT })
  const state = await request('/api/extensions')
  for (const release of state.repositories[0].packages) await action('install', { fingerprint: process.env.TEST_REPOSITORY_FINGERPRINT, source: release.manifest.id })
  report.push('all six signed packages install and complete a process handshake')
  assert.equal((await request('/api/sources')).length, 6)
  if (process.env.TEST_BROWSER) {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ channel: process.env.TEST_BROWSER, headless: true })
    browserPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await browserPage.goto(base + '/login')
    await browserPage.getByPlaceholder('Enter password').fill(password)
    await browserPage.getByRole('button', { name: 'Enter library' }).click()
    await browserPage.waitForURL('**/library')
    await browserPage.goto(base + '/extensions'); await browserPage.getByRole('heading', { name: 'Installed', exact: true }).waitFor()
    assert.equal(await browserPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await browserPage.screenshot({ path: resolve(root, 'extensions-mobile.png'), fullPage: true })
    report.push('mobile browser login and Extensions layout without horizontal overflow')
  }
  for (const source of ['example-novel', 'example-manga']) {
    const results = await request(`/api/sources/${source}/browse`); assert.equal(results.results.length, 1)
    const detail = await request(`/api/sources/${source}/books/sample`); assert(detail.titleOriginal)
    if (browserPage && source === 'example-manga') {
      await browserPage.goto(base + `/sources/${source}/books/sample/read`)
      await browserPage.waitForFunction(() => [...document.images].some(image => image.complete && image.naturalWidth > 0))
      report.push('newly installed manga source renders an online reader image')
    }
    const bookmark = await request('/api/library/bookmark', { sourceSite: source, sourceNovelId: 'sample' }); assert(bookmark.novel.id)
    const queued = await request(`/api/downloads/${source}`, { sourceNovelId: 'sample' }); assert.equal(queued.queued, 1)
    let completed = false
    for (let i = 0; i < 60; i++) {
      const jobs = await request('/api/jobs?category=' + (source === 'example-novel' ? 'novel' : 'manga'))
      const job = jobs.items.find(j => j.id === queued.job.id)
      if (job?.status === 'COMPLETED') { completed = true; break }
      if (['FAILED', 'PARTIAL'].includes(job?.status)) throw new Error(JSON.stringify(job))
      await new Promise(r => setTimeout(r, 500))
    }
    assert(completed, `${source} download worker completion`)
    await action('uninstall', { source })
    const page = await fetch(`${base}/novels/${bookmark.novel.slug}`, { headers: { cookie } }); assert.equal(page.status, 200)
    if (source === 'example-manga') {
      const manifest = await request(`/api/manga/stream?sourceSite=${source}&sourceNovelId=sample`)
      assert(manifest.pages[0].archived); const image = await fetch(base + manifest.pages[0].imageUrl, { headers: { cookie } }); assert.equal(image.status, 200); assert((await image.arrayBuffer()).byteLength > 0)
    } else {
      const { DatabaseSync } = await import('node:sqlite'); const database = new DatabaseSync(resolve(root, 'database.db'), { readOnly: true })
      const chapter = database.prepare('SELECT sourcePath FROM Chapter LIMIT 1').get(); database.close()
      assert((await readFile(chapter.sourcePath, 'utf8')).includes('synthetic demonstration content'))
    }
    report.push(`${source}: browse, details, bookmark, worker download, and offline content after uninstall`)
  }
  await writeFile(resolve(root, 'report.json'), JSON.stringify({ passed: report }, null, 2)); console.log(JSON.stringify({ passed: report, testDirectory: root }, null, 2))
} catch (error) { console.error(logs.slice(-12000)); throw error }
finally {
  await browser?.close()
  await writeFile(resolve(root, 'server.log'), logs)
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill('SIGTERM')
}
