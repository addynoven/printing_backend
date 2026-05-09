import mongoose from 'mongoose'
import { app } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'
import { getMongoTarget } from './utils/mongoTarget'

mongoose.connect(env.MONGODB_URI).then(() => {
  logger.info(`Connected to MongoDB at ${getMongoTarget(env.MONGODB_URI)}`)
  app.listen(env.PORT, () => {
    logger.info(`Backend server is now running on port ${env.PORT}`)
  })
}).catch(err => {
  const message = err instanceof Error ? err.message : String(err)
  logger.error(`Failed to connect to MongoDB at ${getMongoTarget(env.MONGODB_URI)}: ${message}`)
  process.exit(1)
})
