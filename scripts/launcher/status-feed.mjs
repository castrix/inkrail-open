import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { summarize, statusQuery } from './status-summary.mjs'
const configured = process.env.DATABASE_URL || 'file:../data/database/inkrail.db'
const prisma = new PrismaClient({ datasourceUrl: 'file:' + resolve('prisma', configured.slice(5)).replaceAll('\\', '/') })
async function publish() {
  let delay = 30_000
  try {
    const summary = summarize(await prisma.scrapeJob.groupBy(statusQuery()))
    process.stdout.write('[inkrail-tray-status] ' + JSON.stringify(summary) + '\n')
    if (summary.active || summary.queued || summary.blocked) delay = 10_000
  } catch {
    process.stdout.write('[inkrail-tray-status] {"unavailable":true}\n')
  }
  setTimeout(publish, delay).unref()
}
setTimeout(publish, 3000).unref()
