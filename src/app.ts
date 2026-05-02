import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { makeRateLimit } from './middleware/rateLimit'
import swaggerUi from 'swagger-ui-express'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'
import { authRouter } from './modules/auth/auth.routes'
import { userRouter } from './modules/users/user.routes'
import { machineRouter } from './modules/machines/machine.routes'
import { orderRouter } from './modules/orders/order.routes'
import { inventoryRouter } from './modules/inventory/inventory.routes'
import { taskRouter } from './modules/tasks/task.routes'
import { billingRouter } from './modules/billing/billing.routes'
import { paymentRouter } from './modules/payments/payment.routes'
import { notificationRouter } from './modules/notifications/notification.routes'
import { barcodeRouter } from './modules/barcode/barcode.routes'
import { analyticsRouter } from './modules/analytics/analytics.routes'
import { activityLogRouter } from './modules/audit/activity-log.routes'
import { discountRouter } from './modules/discounts/discount.routes'
import { attendanceRouter } from './modules/attendance/attendance.routes'
import { customerRouter } from './modules/customers/customer.routes'
import { loyaltyRouter } from './modules/loyalty/loyalty.routes'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './utils/logger'
import { env } from './config/env'

export const app = express()

if (env.TRUST_PROXY) {
  const trust = env.TRUST_PROXY === 'true' ? true : parseInt(env.TRUST_PROXY, 10)
  app.set('trust proxy', isNaN(trust as number) ? 1 : trust)
}

app.use(helmet())
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json())
app.use(makeRateLimit({ max: 100 }))

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const color = res.statusCode >= 500 ? 31 : res.statusCode >= 400 ? 33 : res.statusCode >= 300 ? 36 : 32
    logger.info(`\x1b[${color}m${req.method} ${req.path} ${res.statusCode}\x1b[0m — ${ms}ms`)
  })
  next()
})

// Swagger UI — served from docs/openapi.yaml (skipped in test env)
if (process.env.NODE_ENV !== 'test') {
  const specPath = path.resolve(__dirname, '../docs/openapi.yaml')
  if (fs.existsSync(specPath)) {
    const spec = yaml.load(fs.readFileSync(specPath, 'utf8')) as Record<string, unknown>
    app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(spec, {
      customSiteTitle: 'POMS API Docs',
      swaggerOptions: { persistAuthorization: true },
    }))
    app.get('/api/openapi.yaml', (_req, res) => {
      res.setHeader('Content-Type', 'text/yaml')
      res.sendFile(specPath)
    })
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', userRouter)
app.use('/api/v1/machines', machineRouter)
app.use('/api/v1/orders', orderRouter)
app.use('/api/v1/inventory', inventoryRouter)
app.use('/api/v1/tasks', taskRouter)
app.use('/api/v1/billing', billingRouter)
app.use('/api/v1/payments', paymentRouter)
app.use('/api/v1/notifications', notificationRouter)
app.use('/api/v1/barcodes', barcodeRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/v1/activity-logs', activityLogRouter)
app.use('/api/v1/discounts', discountRouter)
app.use('/api/v1/attendance', attendanceRouter)
app.use('/api/v1/customers', customerRouter)
app.use('/api/v1/loyalty', loyaltyRouter)

app.use(errorHandler)
