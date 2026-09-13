import { sourceDetails } from '~/server/services/sources'
export default defineEventHandler(event => sourceDetails(getRouterParam(event, 'source')!, getRouterParam(event, 'id')!))
