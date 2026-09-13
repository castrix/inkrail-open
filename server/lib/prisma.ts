import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const configured = process.env.DATABASE_URL || 'file:../data/database/inkrail.db'
const datasourceUrl = configured.startsWith('file:') ? `file:${resolve(process.cwd(), 'prisma', configured.slice(5)).replaceAll('\\', '/')}` : configured
const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
