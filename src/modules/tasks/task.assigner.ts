import { IOrder, JobType } from '../orders/order.model'
import { Task } from './task.model'
import { User } from '../auth/auth.model'
import { Role } from '../../config/permissions'

const JOB_ROLE_MAP: Record<JobType, Role> = {
  flex_printing:   'flex_printing_staff',
  screen_printing: 'screen_printing_staff',
  design:          'designer',
  laser_cut:       'laser_cut_staff',
  offset:          'offset_staff',
  acrylic:         'acrylic_printing_staff',
  glass:           'glass_printing_staff',
  binding:         'binder_staff',
}

export async function autoAssignTask(order: IOrder): Promise<void> {
  const role  = JOB_ROLE_MAP[order.jobType]
  const staff = await User.findOne({ role, isAvailable: true, isActive: true })
    .sort({ activeTaskCount: 1 })

  if (staff) {
    await Task.create({
      orderId:    order._id,
      type:       order.jobType,
      status:     'assigned',
      assignedTo: staff._id,
      priority:   order.priority ?? 'normal',
    })
    await User.findByIdAndUpdate(staff._id, {
      $inc: { activeTaskCount: 1 },
      $set: { lastAssignedAt: new Date() },
    })
  } else {
    await Task.create({
      orderId:    order._id,
      type:       order.jobType,
      status:     'unassigned',
      assignedTo: null,
      priority:   order.priority ?? 'normal',
    })
  }
}
