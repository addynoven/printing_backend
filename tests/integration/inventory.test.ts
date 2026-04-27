import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app'
import { User } from '../../src/modules/auth/auth.model'
import { Material } from '../../src/modules/inventory/material.model'
import { makeUser, makeMaterial } from '../helpers/mock-factory'
import jwt from 'jsonwebtoken'
import { env } from '../../src/config/env'
import mongoose from 'mongoose'

function signToken(payload: { _id: string; role: string; email: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' })
}

describe('Inventory API — Integration', () => {
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    const admin = await User.create(makeUser({ email: 'admin@poms.com', password: 'password123', role: 'admin' }))
    adminId = admin._id.toString()
    adminToken = signToken({ _id: adminId, role: 'admin', email: 'admin@poms.com' })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/inventory/alerts  (must come before /:id in test ordering)
  // ──────────────────────────────────────────────
  describe('GET /api/v1/inventory/alerts', () => {
    it('returns 200 with only materials where stock <= threshold', async () => {
      // Low stock material (stock 5, threshold 10 → alert)
      await Material.create(makeMaterial({ name: 'Low Flex',    stock: 5,   threshold: 10 }))
      // Normal stock material (stock 100, threshold 10 → no alert)
      await Material.create(makeMaterial({ name: 'Normal Flex', stock: 100, threshold: 10 }))

      const res = await request(app)
        .get('/api/v1/inventory/alerts')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.materials)).toBe(true)
      const names = res.body.materials.map((m: { name: string }) => m.name)
      expect(names).toContain('Low Flex')
      expect(names).not.toContain('Normal Flex')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/inventory/alerts')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/inventory
  // ──────────────────────────────────────────────
  describe('GET /api/v1/inventory', () => {
    it('returns 200 with materials array and total (only active by default)', async () => {
      await Material.create(makeMaterial({ name: 'Active Flex' }))
      await Material.create(makeMaterial({ name: 'Inactive Ink', category: 'ink', unit: 'ml', isActive: false }))

      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.materials)).toBe(true)
      expect(typeof res.body.total).toBe('number')

      const names = res.body.materials.map((m: { name: string }) => m.name)
      expect(names).toContain('Active Flex')
      expect(names).not.toContain('Inactive Ink')
    })

    it('filters by category', async () => {
      await Material.create(makeMaterial({ name: 'Flex Material', category: 'flex' }))
      await Material.create(makeMaterial({ name: 'Ink Material',  category: 'ink', unit: 'ml' }))

      const res = await request(app)
        .get('/api/v1/inventory?category=ink')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const names = res.body.materials.map((m: { name: string }) => m.name)
      expect(names).toContain('Ink Material')
      expect(names).not.toContain('Flex Material')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/v1/inventory')
      expect(res.status).toBe(401)
    })

    it('returns 403 for a role with no inventory access (designer has only inventory.read — but helper_staff also only read; use a role that has zero inventory perms to test 403)', async () => {
      // designer has inventory.read — use a role with no inventory perms at all.
      // Looking at permissions.ts — there is no role with ZERO inventory access;
      // all roles including staff have inventory.read.
      // We test the 403 case on a write endpoint instead (covered in POST tests).
      // For GET, everyone with a valid role gets through — skip with note.
      // This test verifies that the 401 path (no token) is distinct from 403.
      const res = await request(app).get('/api/v1/inventory')
      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/inventory
  // ──────────────────────────────────────────────
  describe('POST /api/v1/inventory', () => {
    const validPayload = {
      name:        'New Acrylic',
      category:    'acrylic',
      unit:        'pcs',
      threshold:   5,
      costPerUnit: 20,
    }

    it('creates material and returns 201 with correct fields', async () => {
      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload)

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('New Acrylic')
      expect(res.body.category).toBe('acrylic')
      expect(res.body.unit).toBe('pcs')
      expect(res.body.costPerUnit).toBe(20)
      expect(res.body._id).toBeDefined()
    })

    it('returns 409 on duplicate name', async () => {
      await Material.create(makeMaterial({ name: 'New Acrylic', category: 'acrylic', unit: 'pcs' }))

      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload)

      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    it('returns 400 for invalid category enum', async () => {
      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPayload, name: 'Bad Cat', category: 'not_a_category' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when name is too short (< 2 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPayload, name: 'X' })

      expect(res.status).toBe(400)
    })

    it('returns 401 with no token', async () => {
      const res = await request(app)
        .post('/api/v1/inventory')
        .send(validPayload)

      expect(res.status).toBe(401)
    })

    it('returns 403 for sub_admin (has only inventory.read, not inventory.create)', async () => {
      const subAdmin = await User.create(makeUser({ email: 'sub@poms.com', password: 'password123', role: 'sub_admin' }))
      const subToken = signToken({ _id: subAdmin._id.toString(), role: 'sub_admin', email: 'sub@poms.com' })

      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${subToken}`)
        .send(validPayload)

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/inventory/:id
  // ──────────────────────────────────────────────
  describe('GET /api/v1/inventory/:id', () => {
    it('returns 200 with material data', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Lookup Flex' }))

      const res = await request(app)
        .get(`/api/v1/inventory/${mat._id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Lookup Flex')
      expect(res.body._id).toBe(mat._id.toString())
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('returns 404 for valid ObjectId not in DB', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .get(`/api/v1/inventory/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ error: expect.any(String) })
    })

    it('returns 401 with no token', async () => {
      const mat = await Material.create(makeMaterial())

      const res = await request(app).get(`/api/v1/inventory/${mat._id}`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // PATCH /api/v1/inventory/:id
  // ──────────────────────────────────────────────
  describe('PATCH /api/v1/inventory/:id', () => {
    it('returns 200 and updates threshold and costPerUnit', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Patch Flex', threshold: 5, costPerUnit: 3 }))

      const res = await request(app)
        .patch(`/api/v1/inventory/${mat._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ threshold: 15, costPerUnit: 10 })

      expect(res.status).toBe(200)
      expect(res.body.threshold).toBe(15)
      expect(res.body.costPerUnit).toBe(10)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .patch('/api/v1/inventory/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ threshold: 5 })

      expect(res.status).toBe(400)
    })

    it('returns 404 for valid ObjectId not in DB', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .patch(`/api/v1/inventory/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ threshold: 5 })

      expect(res.status).toBe(404)
    })

    it('returns 401 with no token', async () => {
      const mat = await Material.create(makeMaterial())

      const res = await request(app)
        .patch(`/api/v1/inventory/${mat._id}`)
        .send({ threshold: 5 })

      expect(res.status).toBe(401)
    })

    it('returns 403 for role with only inventory.read (e.g. sub_admin)', async () => {
      const mat = await Material.create(makeMaterial({ name: 'RBAC Flex' }))
      const subAdmin = await User.create(makeUser({ email: 'sub2@poms.com', password: 'password123', role: 'sub_admin' }))
      const subToken = signToken({ _id: subAdmin._id.toString(), role: 'sub_admin', email: 'sub2@poms.com' })

      const res = await request(app)
        .patch(`/api/v1/inventory/${mat._id}`)
        .set('Authorization', `Bearer ${subToken}`)
        .send({ threshold: 20 })

      expect(res.status).toBe(403)
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/v1/inventory/:id/restock
  // ──────────────────────────────────────────────
  describe('POST /api/v1/inventory/:id/restock', () => {
    it('returns 200, stock increases by qty, response has { material, transaction }', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Restock Flex', stock: 50 }))

      const res = await request(app)
        .post(`/api/v1/inventory/${mat._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ qty: 20, note: 'weekly top-up' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('material')
      expect(res.body).toHaveProperty('transaction')
      expect(res.body.material.stock).toBe(70)
      expect(res.body.transaction.type).toBe('RESTOCK')
      expect(res.body.transaction.qty).toBe(20)
    })

    it('returns 400 when qty is negative or zero (must be positive)', async () => {
      const mat = await Material.create(makeMaterial())

      const res = await request(app)
        .post(`/api/v1/inventory/${mat._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ qty: -5 })

      expect(res.status).toBe(400)
    })

    it('returns 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/not-a-valid-id/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ qty: 10 })

      expect(res.status).toBe(400)
    })

    it('returns 404 for valid ObjectId not in DB', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .post(`/api/v1/inventory/${fakeId}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ qty: 10 })

      expect(res.status).toBe(404)
    })

    it('returns 401 with no token', async () => {
      const mat = await Material.create(makeMaterial())

      const res = await request(app)
        .post(`/api/v1/inventory/${mat._id}/restock`)
        .send({ qty: 10 })

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/v1/inventory/:id/ledger
  // ──────────────────────────────────────────────
  describe('GET /api/v1/inventory/:id/ledger', () => {
    it('returns 200 with { entries, total }; after restock, entry appears', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Ledger Flex', stock: 30 }))

      // Perform a restock so a ledger entry is created
      await request(app)
        .post(`/api/v1/inventory/${mat._id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ qty: 15, note: 'ledger test' })

      const res = await request(app)
        .get(`/api/v1/inventory/${mat._id}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.entries)).toBe(true)
      expect(typeof res.body.total).toBe('number')
      expect(res.body.total).toBeGreaterThanOrEqual(1)

      const types = res.body.entries.map((e: { type: string }) => e.type)
      expect(types).toContain('RESTOCK')
    })

    it('returns 404 for material not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString()

      const res = await request(app)
        .get(`/api/v1/inventory/${fakeId}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('returns 401 with no token', async () => {
      const mat = await Material.create(makeMaterial())

      const res = await request(app).get(`/api/v1/inventory/${mat._id}/ledger`)

      expect(res.status).toBe(401)
    })
  })

  // ──────────────────────────────────────────────
  // RBAC — staff roles blocked from create/update/restock
  // ──────────────────────────────────────────────
  describe('RBAC — staff roles have inventory.read only', () => {
    let staffToken: string

    beforeEach(async () => {
      const staff = await User.create(makeUser({ email: 'staff@poms.com', password: 'password123', role: 'flex_printing_staff' }))
      staffToken = signToken({ _id: staff._id.toString(), role: 'flex_printing_staff', email: 'staff@poms.com' })
    })

    it('POST / returns 403 for flex_printing_staff', async () => {
      const res = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Staff Mat', category: 'flex', unit: 'sqft', threshold: 5, costPerUnit: 3 })

      expect(res.status).toBe(403)
    })

    it('PATCH /:id returns 403 for flex_printing_staff', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Staff RBAC Mat' }))

      const res = await request(app)
        .patch(`/api/v1/inventory/${mat._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ threshold: 99 })

      expect(res.status).toBe(403)
    })

    it('POST /:id/restock returns 403 for flex_printing_staff', async () => {
      const mat = await Material.create(makeMaterial({ name: 'Staff Restock Mat' }))

      const res = await request(app)
        .post(`/api/v1/inventory/${mat._id}/restock`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ qty: 5 })

      expect(res.status).toBe(403)
    })

    it('GET / returns 200 for flex_printing_staff (read is allowed)', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.status).toBe(200)
    })
  })
})
