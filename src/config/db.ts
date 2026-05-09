import mongoose from 'mongoose'
import { env } from './env'
import { logger } from '../utils/logger'
import { getMongoTarget } from '../utils/mongoTarget'

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI)
    logger.info(`Connected to MongoDB at ${getMongoTarget(env.MONGODB_URI)}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to connect to MongoDB at ${getMongoTarget(env.MONGODB_URI)}: ${message}`)
    process.exit(1)
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect()
}
