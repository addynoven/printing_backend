import { Order } from '../orders/order.model'
import { Task } from '../tasks/task.model'
import { Material } from '../inventory/material.model'
import { Machine } from '../machines/machine.model'
import { Payment } from '../payments/payment.model'
import { Bill } from '../billing/bill.model'
import { Customer } from '../customers/customer.model'
import { Attendance } from '../attendance/attendance.model'
import { Discount } from '../discounts/discount.model'
import { DiscountLog } from '../discounts/discount-log.model'
import { Coupon } from '../loyalty/coupon.model'

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

export async function getAttendanceStats(query: DateRangeQuery) {
  const range  = parseRange(query)
  const filter = dateFilter('date', range)

  const [byStatus, totals, topLate, topOvertime] = await Promise.all([
    Attendance.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id:                   null,
          totalRecords:          { $sum: 1 },
          totalLateMinutes:      { $sum: '$lateMinutes' },
          totalOvertimeMinutes:  { $sum: '$overtimeMinutes' },
          avgShiftDuration:      { $avg: '$shiftDurationMinutes' },
        },
      },
    ]),
    Attendance.aggregate([
      { $match: filter },
      { $group: { _id: '$userId', lateMinutes: { $sum: '$lateMinutes' } } },
      { $sort: { lateMinutes: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, lateMinutes: 1, name: '$user.name', role: '$user.role' } },
    ]),
    Attendance.aggregate([
      { $match: filter },
      { $group: { _id: '$userId', overtimeMinutes: { $sum: '$overtimeMinutes' } } },
      { $sort: { overtimeMinutes: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, overtimeMinutes: 1, name: '$user.name', role: '$user.role' } },
    ]),
  ])

  return {
    byStatus:             byStatus.map(r => ({ status: r._id, count: r.count })),
    totalRecords:         totals[0]?.totalRecords         ?? 0,
    totalLateMinutes:     totals[0]?.totalLateMinutes     ?? 0,
    totalOvertimeMinutes: totals[0]?.totalOvertimeMinutes ?? 0,
    avgShiftDuration:     totals[0]?.avgShiftDuration     ?? 0,
    topLate,
    topOvertime,
  }
}

export async function getCustomerStats(query: DateRangeQuery) {
  const range = parseRange(query)
  const newCustomerFilter = dateFilter('createdAt', range)

  const [byTier, totals, topSpenders, newCustomers] = await Promise.all([
    Customer.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:        '$loyaltyTier',
          count:      { $sum: 1 },
          totalSpend: { $sum: '$totalSpend' },
          totalVisits:{ $sum: '$visitCount' },
        },
      },
    ]),
    Customer.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:           null,
          totalCustomers:{ $sum: 1 },
          totalSpend:    { $sum: '$totalSpend' },
          totalVisits:   { $sum: '$visitCount' },
          avgSpend:      { $avg: '$totalSpend' },
          avgVisits:     { $avg: '$visitCount' },
        },
      },
    ]),
    Customer.find({ isActive: true })
      .sort({ totalSpend: -1 })
      .limit(10)
      .select('name phone loyaltyTier totalSpend visitCount lastVisit')
      .lean(),
    Customer.countDocuments(newCustomerFilter),
  ])

  return {
    byTier: byTier.map(r => ({
      tier:         r._id,
      count:        r.count,
      totalSpend:   r.totalSpend,
      totalVisits:  r.totalVisits,
    })),
    totalCustomers: totals[0]?.totalCustomers ?? 0,
    totalSpend:     totals[0]?.totalSpend     ?? 0,
    totalVisits:    totals[0]?.totalVisits    ?? 0,
    avgSpend:       totals[0]?.avgSpend       ?? 0,
    avgVisits:      totals[0]?.avgVisits      ?? 0,
    newCustomers,
    topSpenders,
  }
}

export async function getDiscountStats(query: DateRangeQuery) {
  const range  = parseRange(query)
  const filter = dateFilter('appliedAt', range)

  const [byDiscount, totals, byType, active] = await Promise.all([
    DiscountLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id:         '$discountId',
          name:        { $first: '$name' },
          uses:        { $sum: 1 },
          amountSaved: { $sum: '$amountSaved' },
        },
      },
      { $sort: { amountSaved: -1 } },
      { $limit: 10 },
    ]),
    DiscountLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id:               null,
          totalApplications: { $sum: 1 },
          totalAmountSaved:  { $sum: '$amountSaved' },
        },
      },
    ]),
    DiscountLog.aggregate([
      { $match: filter },
      { $group: { _id: '$type', uses: { $sum: 1 }, amountSaved: { $sum: '$amountSaved' } } },
    ]),
    Discount.countDocuments({ isActive: true }),
  ])

  return {
    activeDiscounts:   active,
    totalApplications: totals[0]?.totalApplications ?? 0,
    totalAmountSaved:  totals[0]?.totalAmountSaved  ?? 0,
    byType:            byType.map(r => ({ type: r._id, uses: r.uses, amountSaved: r.amountSaved })),
    topDiscounts:      byDiscount.map(r => ({
      discountId:  r._id,
      name:        r.name,
      uses:        r.uses,
      amountSaved: r.amountSaved,
    })),
  }
}

export async function getLoyaltyStats(query: DateRangeQuery) {
  const range  = parseRange(query)
  const filter = dateFilter('createdAt', range)
  const usedFilter = dateFilter('usedAt', range)

  const now = new Date()

  const [byStatus, totals, redeemed, topRedeemers] = await Promise.all([
    Coupon.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Coupon.aggregate([
      { $match: filter },
      {
        $group: {
          _id:           null,
          total:         { $sum: 1 },
          activeCount:   { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          usedCount:     { $sum: { $cond: [{ $eq: ['$status', 'used']   }, 1, 0] } },
          expiredCount:  { $sum: { $cond: [{ $lt: ['$expiresAt', now] }, 1, 0] } },
        },
      },
    ]),
    Coupon.aggregate([
      { $match: { status: 'used', ...usedFilter } },
      { $group: { _id: null, redeemed: { $sum: 1 } } },
    ]),
    Coupon.aggregate([
      { $match: { status: 'used', ...usedFilter } },
      { $group: { _id: '$customerId', redeemed: { $sum: 1 } } },
      { $sort: { redeemed: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id:         1,
          redeemed:    1,
          name:        '$customer.name',
          phone:       '$customer.phone',
          loyaltyTier: '$customer.loyaltyTier',
        },
      },
    ]),
  ])

  return {
    byStatus:        byStatus.map(r => ({ status: r._id, count: r.count })),
    totalCoupons:    totals[0]?.total        ?? 0,
    activeCoupons:   totals[0]?.activeCount  ?? 0,
    usedCoupons:     totals[0]?.usedCount    ?? 0,
    expiredCoupons:  totals[0]?.expiredCount ?? 0,
    redeemedInRange: redeemed[0]?.redeemed   ?? 0,
    topRedeemers,
  }
}
