import { Order } from '../orders/order.model'
import { Task } from '../tasks/task.model'
import { Material } from '../inventory/material.model'
import { Machine } from '../machines/machine.model'
import { Payment } from '../payments/payment.model'
import { Bill } from '../billing/bill.model'

export interface DateRangeQuery {
  from?: string
  to?:   string
}

function parseRange(query: DateRangeQuery): { from?: Date; to?: Date } {
  return {
    from: query.from ? new Date(query.from) : undefined,
    to:   query.to   ? new Date(query.to)   : undefined,
  }
}

function dateFilter(field: string, range: { from?: Date; to?: Date }) {
  if (!range.from && !range.to) return {}
  const filter: Record<string, Date> = {}
  if (range.from) filter.$gte = range.from
  if (range.to)   filter.$lte = range.to
  return { [field]: filter }
}

export async function getOverview(query: DateRangeQuery) {
  const range  = parseRange(query)
  const oFilter = dateFilter('createdAt', range)
  const pFilter = dateFilter('paidAt',    range)

  const [
    totalOrders,
    ordersByStatus,
    activeTasks,
    lowStockCount,
    revenueAgg,
    activeMachines,
  ] = await Promise.all([
    Order.countDocuments(oFilter),
    Order.aggregate([
      { $match: oFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({ status: { $in: ['assigned', 'in_progress'] } }),
    Material.countDocuments({
      isActive: true,
      $expr:    { $lte: ['$stock', '$threshold'] },
    }),
    Payment.aggregate([
      { $match: { status: 'completed', ...pFilter } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Machine.countDocuments({ status: 'active' }),
  ])

  const statusBreakdown: Record<string, number> = {}
  for (const row of ordersByStatus) statusBreakdown[row._id] = row.count

  return {
    totalOrders,
    statusBreakdown,
    activeTasks,
    lowStockCount,
    activeMachines,
    revenue: revenueAgg[0]?.total ?? 0,
  }
}

export async function getOrderStats(query: DateRangeQuery) {
  const range  = parseRange(query)
  const filter = dateFilter('createdAt', range)

  const [byStatus, byJobType, byPriority, daily] = await Promise.all([
    Order.aggregate([
      { $match: filter },
      { $group: { _id: '$status',   count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: filter },
      { $group: { _id: '$jobType',  count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: filter },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])

  return {
    byStatus:   byStatus.map(r   => ({ status:   r._id, count: r.count })),
    byJobType:  byJobType.map(r  => ({ jobType:  r._id, count: r.count })),
    byPriority: byPriority.map(r => ({ priority: r._id, count: r.count })),
    daily:      daily.map(r      => ({ date: r._id,     count: r.count })),
  }
}

export async function getRevenue(query: DateRangeQuery) {
  const range  = parseRange(query)
  const pFilter = { status: 'completed', ...dateFilter('paidAt', range) }
  const bFilter = dateFilter('createdAt', range)

  const [byMethod, byType, daily, totalAgg, billsAgg] = await Promise.all([
    Payment.aggregate([
      { $match: pFilter },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: pFilter },
      { $group: { _id: '$type',   total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: pFilter },
      {
        $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: pFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Bill.aggregate([
      { $match: bFilter },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ])

  return {
    total:      totalAgg[0]?.total ?? 0,
    byMethod:   byMethod.map(r => ({ method: r._id, total: r.total, count: r.count })),
    byType:     byType.map(r   => ({ type:   r._id, total: r.total, count: r.count })),
    daily:      daily.map(r    => ({ date:   r._id, total: r.total })),
    bills:      billsAgg.map(r => ({ type:   r._id, total: r.total, count: r.count })),
  }
}

export async function getInventoryStatus() {
  const [byCategory, lowStock, valueAgg, totalActive] = await Promise.all([
    Material.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:   '$category',
          count: { $sum: 1 },
          stock: { $sum: '$stock' },
          value: { $sum: { $multiply: ['$stock', '$costPerUnit'] } },
        },
      },
    ]),
    Material.find({
      isActive: true,
      $expr:    { $lte: ['$stock', '$threshold'] },
    })
      .select('name category stock threshold unit')
      .lean(),
    Material.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:        null,
          totalValue: { $sum: { $multiply: ['$stock', '$costPerUnit'] } },
        },
      },
    ]),
    Material.countDocuments({ isActive: true }),
  ])

  return {
    totalMaterials: totalActive,
    totalValue:     valueAgg[0]?.totalValue ?? 0,
    lowStockCount:  lowStock.length,
    lowStock,
    byCategory:     byCategory.map(r => ({
      category: r._id,
      count:    r.count,
      stock:    r.stock,
      value:    r.value,
    })),
  }
}

export async function getTaskStats(query: DateRangeQuery) {
  const range  = parseRange(query)
  const filter = dateFilter('createdAt', range)

  const [byStatus, byType, completionAgg, topPerformers] = await Promise.all([
    Task.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: filter },
      { $group: { _id: '$type',   count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { ...filter, status: 'done', totalMinutes: { $gt: 0 } } },
      {
        $group: {
          _id:        null,
          avgMinutes: { $avg: '$totalMinutes' },
          totalDone:  { $sum: 1 },
        },
      },
    ]),
    Task.aggregate([
      { $match: { ...filter, status: 'done', assignedTo: { $ne: null } } },
      {
        $group: {
          _id:           '$assignedTo',
          completed:     { $sum: 1 },
          totalMinutes:  { $sum: '$totalMinutes' },
        },
      },
      { $sort: { completed: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: '_id',
          as:           'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id:          1,
          completed:    1,
          totalMinutes: 1,
          name:         '$user.name',
          role:         '$user.role',
        },
      },
    ]),
  ])

  return {
    byStatus:           byStatus.map(r => ({ status: r._id, count: r.count })),
    byType:             byType.map(r   => ({ type:   r._id, count: r.count })),
    avgCompletionMins:  completionAgg[0]?.avgMinutes ?? 0,
    totalCompleted:     completionAgg[0]?.totalDone  ?? 0,
    topPerformers,
  }
}

export async function getMachineUtilization() {
  const [byStatus, byType, byDepartment, total] = await Promise.all([
    Machine.aggregate([
      { $group: { _id: '$status',     count: { $sum: 1 } } },
    ]),
    Machine.aggregate([
      { $group: { _id: '$type',       count: { $sum: 1 } } },
    ]),
    Machine.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]),
    Machine.countDocuments({}),
  ])

  return {
    total,
    byStatus:     byStatus.map(r     => ({ status:     r._id, count: r.count })),
    byType:       byType.map(r       => ({ type:       r._id, count: r.count })),
    byDepartment: byDepartment.map(r => ({ department: r._id, count: r.count })),
  }
}
