import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => prisma.translation.update({
  where: { id: getRouterParam(event, 'id')! },
  data: { status: 'APPROVED', approvedAt: new Date() }
}))
