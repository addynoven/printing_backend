import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
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
import { errorHandler } from './middleware/errorHandler'

export const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))

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

app.use(errorHandler)
