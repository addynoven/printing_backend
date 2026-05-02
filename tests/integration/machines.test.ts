import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { Machine } from '../../src/modules/machines/machine.model'
import { User } from '../../src/modules/auth/auth.model'
import { makeMachine, makeUser } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Machines API — Integration', () => {
  let adminToken: string
  let adminId:    string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId    = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/machines
  // ──────────────────────────────────────────────
  describe('GET /api/v1/machines', () => {
    it('returns 200 with machines array and total', async () => {
      await Machine.create(makeMachine())

      const res = await request(app)
        .get('/api/v1/machines')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.machines)).toBe(true)
      expect(typeof res.body.total).toBe('number')
      expect(res.body.total).toBeGreaterThanOrEqual(1)
    })

    it('filters by type query param', async () => {
      await Machine.create(makeMachine({ name: 'Laser One', type: 'laser_cutter' }))
      await Machine.create(makeMachine({ name: 'Flex One', type: 'flex_printer' }))

      const res = await request(app)
        .get('/api/v1/machines?type=laser_cutter')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.machines.every((m: { type: string }) => m.type === 'laser_cutter')).toBe(true)
    })

    it('filters by status query param', async () => {
      await Machine.create(makeMachine({ name: 'Active Machine', status: 'active' }))
      await Machine.create(makeMachine({ name: 'Down Machine', status: 'maintenance' }))

      const res = await request(app)
        .get('/api/v1/machines?status=maintenance')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.machines.every((m: { status: string }) => m.status === 'maintenance')).toBe(true)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/machines')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/machines
  // ──────────────────────────────────────────────
  describe('POST /api/v1/machines', () => {
    it('creates machine with correct fields and returns 201', async () => {
      const payload = makeMachine({ name: 'New Flex', type: 'flex_printer', department: 'Flex Dept' })

      const res = await request(app)
        .post('/api/v1/machines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('New Flex')
      expect(res.body.type).toBe('flex_printer')
      expect(res.body.department).toBe('Flex Dept')
      expect(res.body.status).toBe('active')
    })

    it('returns 400 when name is too short (< 2 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/machines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(makeMachine({ name: 'X' }))

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid type enum value', async () => {
      const res = await request(app)
        .post('/api/v1/machines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(makeMachine({ type: 'invalid_type' }))

      expect(res.status).toBe(400)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app)
        .post('/api/v1/machines')
        .send(makeMachine())

      expect(res.status).toBe(401)
    })

    it('returns 403 for designer role (no machines.create)', async () => {
      const designer = await User.create(makeUser({ email: 'designer@poms.com', password: 'password123', role: 'designer' }))
      const token    = signToken({ _id: designer._id.toString(), role: 'designer', email: 'designer@poms.com' })

      const res = await request(app)
        .post('/api/v1/machines')
        .set('Authorization', `Bearer ${token}`)
        .send(makeMachine())

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/machines/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/machines/:id', () => {
    it('returns 200 with the machine when it exists', async () => {
      const machine = await Machine.create(makeMachine({ name: 'Solo Machine' }))

      const res = await request(app)
        .get(`/api/v1/machines/${machine._id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Solo Machine')
      expect(String(res.body._id)).toBe(machine._id.toString())
    })

    it('returns 404 for valid ObjectId that does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/machines/000000000000000000000001')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/machines/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app)
        .get('/api/v1/machines/000000000000000000000001')

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/machines/:id
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/machines/:id', () => {
    it('updates name/department/notes and returns 200', async () => {
      const machine = await Machine.create(makeMachine())
      const id      = machine._id.toString()

      const res = await request(app)
        .patch(`/api/v1/machines/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed Machine', notes: 'Updated note' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Renamed Machine')
      expect(res.body.notes).toBe('Updated note')
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Whatever' })

      expect(res.status).toBe(400)
    })

    it('returns 404 for valid ObjectId that does not exist', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/000000000000000000000001')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })

      expect(res.status).toBe(404)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/000000000000000000000001')
        .send({ name: 'Test' })

      expect(res.status).toBe(401)
    })

    it('returns 403 for sub_admin (has machines.read but NOT machines.update)', async () => {
      const subAdmin = await User.create(makeUser({ email: 'subadmin@poms.com', password: 'password123', role: 'sub_admin' }))
      const token    = signToken({ _id: subAdmin._id.toString(), role: 'sub_admin', email: 'subadmin@poms.com' })
      const machine  = await Machine.create(makeMachine())

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked' })

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/machines/:id/status
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/machines/:id/status', () => {
    it('sets status to maintenance and returns 200', async () => {
      const machine = await Machine.create(makeMachine({ status: 'active' }))

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'maintenance' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('maintenance')
    })

    it('sets status back to active and returns 200', async () => {
      const machine = await Machine.create(makeMachine({ status: 'maintenance' }))

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('active')
    })

    it('returns 400 for invalid status value', async () => {
      const machine = await Machine.create(makeMachine())

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'broken' })

      expect(res.status).toBe(400)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/not-a-valid-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })

      expect(res.status).toBe(400)
    })

    it('returns 404 for valid ObjectId that does not exist', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/000000000000000000000001/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'inactive' })

      expect(res.status).toBe(404)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app)
        .patch('/api/v1/machines/000000000000000000000001/status')
        .send({ status: 'active' })

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // RBAC — designer role blocked from all machine routes
  // ──────────────────────────────────────────────
  describe('RBAC — designer role blocked from /machines', () => {
    let designerToken: string

    beforeEach(async () => {
      const designer = await User.create(makeUser({ email: 'designer2@poms.com', password: 'password123', role: 'designer' }))
      designerToken  = signToken({ _id: designer._id.toString(), role: 'designer', email: 'designer2@poms.com' })
    })

    it('GET / returns 403 for designer', async () => {
      const res = await request(app)
        .get('/api/v1/machines')
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(403)
    })

    it('GET /:id returns 403 for designer', async () => {
      const machine = await Machine.create(makeMachine())

      const res = await request(app)
        .get(`/api/v1/machines/${machine._id}`)
        .set('Authorization', `Bearer ${designerToken}`)

      expect(res.status).toBe(403)
    })

    it('POST / returns 403 for designer', async () => {
      const res = await request(app)
        .post('/api/v1/machines')
        .set('Authorization', `Bearer ${designerToken}`)
        .send(makeMachine())

      expect(res.status).toBe(403)
    })

    it('PATCH /:id returns 403 for designer', async () => {
      const machine = await Machine.create(makeMachine())

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send({ name: 'Hacked' })

      expect(res.status).toBe(403)
    })

    it('PATCH /:id/status returns 403 for designer', async () => {
      const machine = await Machine.create(makeMachine())

      const res = await request(app)
        .patch(`/api/v1/machines/${machine._id}/status`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send({ status: 'inactive' })

      expect(res.status).toBe(403)
    })
  })
})
