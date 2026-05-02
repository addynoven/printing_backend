import { Order } from '../orders/order.model'
import { Task } from '../tasks/task.model'
import { Payment } from '../payments/payment.model'
import { Material } from '../inventory/material.model'

export async function getOverview() {
  const [orders, tasks, revenueAgg, lowStock] = await Promise.all([
    Order.countDocuments(),
    Task.countDocuments(),
    Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Material.countDocuments({
      isActive: true,
      $expr: { $lte: ['$stock', '$threshold'] },
    }),
  ])

  return {
    orders,
    tasks,
    revenue: revenueAgg[0]?.total ?? 0,
    lowStock,
  }
}

export async function getOrderStats() {
  const byStatus = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort:  { _id: 1 } },
  ])
  return { byStatus }
}

export async function getRevenueStats() {
  const byMethod = await Payment.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort:  { total: -1 } },
  ])
  const total = byMethod.reduce((sum: number, m: { total: number }) => sum + m.total, 0)
  return { byMethod, total }
}

export async function getTaskStats() {
  const byStatus = await Task.aggregate([
    {
      $group: {
        _id:        '$status',
        count:      { $sum: 1 },
        avgMinutes: { $avg: '$totalMinutes' },
      },
    },
    { $sort: { _id: 1 } },
  ])
  return { byStatus }
}
