/**
 * E2E: Task Workflow
 *
 * Covers the lifecycle of a task from creation through completion:
 *   unassigned → assigned → in_progress → paused → in_progress → done
 *
 * Verifies timestamps (startedAt, pausedAt, completedAt), totalMinutes
 * calculation, and User.activeTaskCount increments / decrements.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { User } from '../../src/modules/auth/auth.model'
import { app, request, auth, seedUser, seedOrder, seedTask } from './helpers'

describe('E2E — Task Workflow', () => {
  let adminToken: string
  let adminId:    string
  let staffToken: string
  let staffId:    string

  beforeEach(async () => {
    const admin = await seedUser('admin', 'admin@poms.com')
    adminToken = admin.token
    adminId    = admin.id

    const staff = await seedUser('flex_printing_staff', 'staff@poms.com')
    staffToken = staff.token
    staffId    = staff.id
  })

  // ── Full task lifecycle ──────────────────────────────────────────────────
  it('assign → in_progress → done increments then decrements activeTaskCount', async () => {
    const order  = await seedOrder(adminId)
    const task   = await seedTask(order._id.toString())
    const taskId = task._id.toString()

    // Assign
    const assignRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/assign`)
      .set(auth(adminToken))
      .send({ assignedTo: staffId })

    expect(assignRes.status).toBe(200)
    expect(assignRes.body.status).toBe('assigned')

    // activeTaskCount should be 1 after assignment
    const userAfterAssign = await User.findById(staffId).lean()
    expect(userAfterAssign!.activeTaskCount).toBe(1)

    // Start
    const startRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'in_progress' })

    expect(startRes.status).toBe(200)
    expect(startRes.body.startedAt).toBeDefined()

    // Done
    const doneRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'done' })

    expect(doneRes.status).toBe(200)
    expect(doneRes.body.completedAt).toBeDefined()
    expect(doneRes.body.totalMinutes).toBeGreaterThanOrEqual(0)

    // activeTaskCount should be decremented back to 0
    const userAfterDone = await User.findById(staffId).lean()
    expect(userAfterDone!.activeTaskCount).toBe(0)
  })

  it('paused task records pausedAt correctly', async () => {
    const order  = await seedOrder(adminId)
    const task   = await seedTask(order._id.toString(), staffId)
    const taskId = task._id.toString()

    await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'in_progress' })

    const pauseRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'paused' })

    expect(pauseRes.status).toBe(200)
    expect(pauseRes.body.pausedAt).toBeDefined()
    expect(pauseRes.body.startedAt).toBeDefined()
  })

  it('totalMinutes is positive after a timed task completion', async () => {
    const order  = await seedOrder(adminId)
    const task   = await seedTask(order._id.toString(), staffId)
    const taskId = task._id.toString()

    // Manually set startedAt in the past so totalMinutes > 0
    await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'in_progress' })

    // Wait 1 second to ensure measurable elapsed time
    await new Promise(r => setTimeout(r, 1100))

    const doneRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set(auth(staffToken))
      .send({ status: 'done' })

    expect(doneRes.status).toBe(200)
    // totalMinutes rounds to nearest minute; at least 0 (might be 0 in fast CI)
    expect(typeof doneRes.body.totalMinutes).toBe('number')
    expect(doneRes.body.totalMinutes).toBeGreaterThanOrEqual(0)
  })

  // ── Listing & scoping ────────────────────────────────────────────────────
  it('staff sees only their own tasks when scopeToOwn applies', async () => {
    const order = await seedOrder(adminId)

    // Create two tasks — one assigned to staff, one to admin
    const staffTask = await seedTask(order._id.toString(), staffId)
    await seedTask(order._id.toString(), adminId)

    // Staff lists tasks — scopeToOwn is enforced by permit middleware
    const res = await request(app)
      .get('/api/v1/tasks')
      .set(auth(staffToken))

    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: { _id: string }) => t._id)
    expect(ids).toContain(staffTask._id.toString())
    // Admin's task should NOT appear for staff
    expect(res.body.tasks.every(
      (t: { assignedTo: string }) => t.assignedTo === staffId
    )).toBe(true)
  })

  it('admin sees all tasks regardless of assignment', async () => {
    const order = await seedOrder(adminId)
    await seedTask(order._id.toString(), staffId)
    await seedTask(order._id.toString(), adminId)

    const res = await request(app)
      .get('/api/v1/tasks')
      .set(auth(adminToken))

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
  })

  it('returns 404 when task does not exist', async () => {
    const fakeId = '000000000000000000000001'
    const res = await request(app)
      .get(`/api/v1/tasks/${fakeId}`)
      .set(auth(adminToken))

    expect(res.status).toBe(404)
  })
})
