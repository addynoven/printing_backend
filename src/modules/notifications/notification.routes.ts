import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/authenticate'
import * as notificationService from './notification.service'

export const notificationRouter = Router()

notificationRouter.get('/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadCount(req.user._id)
    res.json(result)
  })
)

notificationRouter.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await notificationService.listNotifications(req.user._id)
    res.json(result)
  })
)

notificationRouter.patch('/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.user._id)
    res.status(204).send()
  })
)

notificationRouter.patch('/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const notification = await notificationService.markRead(req.params.id, req.user._id)
    res.json(notification)
  })
)
