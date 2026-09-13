import { readerManifest } from '~/server/services/reader-manifest'
export default defineEventHandler(event => readerManifest({ slug: getRouterParam(event, 'slug')! }))
