import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Order } from '../../src/modules/orders/order.model'
import { Task } from '../../src/modules/tasks/task.model'
import { env } from '../../src/config/env'
import { makeUser, makeOrder } from '../helpers/mock-factory'

export { app, request }

export function signToken(userId: string, role: string, email: string) {
  return jwt.sign({ _id: userId, role, email }, env.JWT_SECRET, { expiresIn: '1h' })
}

export function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function seedUser(role: string, email: string) {
  const user = await User.create(makeUser({ email, role, password: 'Password1234' }))
  return {
    user,
    id: user._id.toString(),
    token: signToken(user._id.toString(), role, email),
  }
}

export async function seedOrder(createdById: string, overrides: Record<string, unknown> = {}) {
  return await Order.create({
    ...makeOrder(overrides),
    createdBy: new mongoose.Types.ObjectId(createdById),
  })
}

export async function seedTask(orderId: string, assignedTo?: string) {
  return await Task.create({
    orderId:     new mongoose.Types.ObjectId(orderId),
    type:        'flex_printing',
    status:      assignedTo ? 'assigned' : 'unassigned',
    assignedTo:  assignedTo ? new mongoose.Types.ObjectId(assignedTo) : null,
    priority:    'normal',
    totalMinutes: 0,
  })
}

// Drive an order through a list of statuses, throwing if any step fails
export async function transitionThrough(orderId: string, statuses: string[], token: string) {
  for (const status of statuses) {
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(auth(token))
      .send({ status })
    if (res.status !== 200) {
      throw new Error(`Transition to "${status}" failed with ${res.status}: ${JSON.stringify(res.body)}`)
    }
  }
}
