import { scraperDnsStatus } from '~/server/services/scraper-dns'

export default defineEventHandler(() => scraperDnsStatus())
