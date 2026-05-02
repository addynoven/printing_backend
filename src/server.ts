import mongoose from 'mongoose'
import { app } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'

mongoose.connect(env.MONGODB_URI).then(() => {
  logger.info('Connected to MongoDB')
  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`)
  })
}).catch(err => {
  logger.error('Failed to connect to MongoDB', { err })
  process.exit(1)
})
