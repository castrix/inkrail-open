export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  setHeader(event, 'pragma', 'no-cache')
  setResponseStatus(event, 204)
  return null
})
