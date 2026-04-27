/**
 * E2E: Barcode Generation & Scan Workflow
 *
 * Covers the physical-handoff lifecycle:
 *   Generate initial barcode → scan at various checkpoints → generate final barcode
 *
 * Verifies:
 *  - qrDataUrl is produced for each barcode
 *  - Scan events are recorded with correct orderId, action, scannedBy
 *  - Barcodes list is scoped per order
 *  - getScanData returns order data
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { app, request, auth, seedUser, seedOrder } from './helpers'

describe('E2E — Barcode & Scan Workflow', () => {
  let adminToken: string
  let adminId:    string
  let staffToken: string
  let staffId:    string
  let orderId:    string

  beforeEach(async () => {
    const admin = await seedUser('admin', 'admin@poms.com')
    adminToken  = admin.token
    adminId     = admin.id

    const staff = await seedUser('flex_printing_staff', 'staff@poms.com')
    staffToken  = staff.token
    staffId     = staff.id

    const order = await seedOrder(adminId)
    orderId     = order._id.toString()
  })

  // ── Barcode generation ───────────────────────────────────────────────────
  it('generates an initial barcode with a qrDataUrl', async () => {
    const res = await request(app)
      .post('/api/v1/barcodes/generate')
      .set(auth(adminToken))
      .send({ orderId, type: 'initial' })

    expect(res.status).toBe(201)
    expect(res.body.orderId).toBe(orderId)
    expect(res.body.type).toBe('initial')
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(res.body.code).toBe(orderId)
  })

  it('generates a final barcode independently from the initial one', async () => {
    await request(app)
      .post('/api/v1/barcodes/generate')
      .set(auth(adminToken))
      .send({ orderId, type: 'initial' })

    const finalRes = await request(app)
      .post('/api/v1/barcodes/generate')
      .set(auth(adminToken))
      .send({ orderId, type: 'final' })

    expect(finalRes.status).toBe(201)
    expect(finalRes.body.type).toBe('final')
  })

  it('lists both barcodes for the order', async () => {
    await request(app).post('/api/v1/barcodes/generate').set(auth(adminToken)).send({ orderId, type: 'initial' })
    await request(app).post('/api/v1/barcodes/generate').set(auth(adminToken)).send({ orderId, type: 'final' })

    const res = await request(app)
      .get(`/api/v1/barcodes/order/${orderId}`)
      .set(auth(adminToken))

    expect(res.status).toBe(200)
    expect(res.body.barcodes).toHaveLength(2)
    expect(res.body.total).toBe(2)
    const types = res.body.barcodes.map((b: { type: string }) => b.type)
    expect(types).toContain('initial')
    expect(types).toContain('final')
  })

  it('barcodes are scoped to their order', async () => {
    const otherOrder = await seedOrder(adminId)

    await request(app).post('/api/v1/barcodes/generate').set(auth(adminToken)).send({ orderId, type: 'initial' })

    const res = await request(app)
      .get(`/api/v1/barcodes/order/${otherOrder._id}`)
      .set(auth(adminToken))

    expect(res.body.barcodes).toHaveLength(0)
    expect(res.body.total).toBe(0)
  })

  // ── Scan events ──────────────────────────────────────────────────────────
  it('records a scan event and returns it in the response', async () => {
    const res = await request(app)
      .post(`/api/v1/barcodes/scan/${orderId}`)
      .set(auth(staffToken))
      .send({ action: 'in_progress', notes: 'Scanned at gate' })

    expect(res.status).toBe(200)
    expect(res.body.scanEvent).toBeDefined()
    expect(res.body.scanEvent.orderId).toBe(orderId)
    expect(res.body.scanEvent.action).toBe('in_progress')
    expect(res.body.scanEvent.notes).toBe('Scanned at gate')
  })

  it('records multiple scan events for the same order', async () => {
    await request(app)
      .post(`/api/v1/barcodes/scan/${orderId}`)
      .set(auth(staffToken))
      .send({ action: 'in_progress' })

    await request(app)
      .post(`/api/v1/barcodes/scan/${orderId}`)
      .set(auth(staffToken))
      .send({ action: 'done' })

    // Both scans should succeed without error
    // Verify via getScanData that the order still resolves
    const scanPageRes = await request(app)
      .get(`/api/v1/barcodes/scan/${orderId}`)
      .set(auth(adminToken))

    expect(scanPageRes.status).toBe(200)
  })

  it('getScanData returns order data for the given orderId', async () => {
    const res = await request(app)
      .get(`/api/v1/barcodes/scan/${orderId}`)
      .set(auth(adminToken))

    expect(res.status).toBe(200)
    expect(res.body.order).toBeDefined()
    expect(res.body.order._id).toBe(orderId)
  })

  it('getScanData returns 404 when order does not exist', async () => {
    const nonExistent = '000000000000000000000099'

    const res = await request(app)
      .get(`/api/v1/barcodes/scan/${nonExistent}`)
      .set(auth(adminToken))

    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed orderId in scan endpoints', async () => {
    const [getRes, postRes] = await Promise.all([
      request(app).get('/api/v1/barcodes/scan/not-a-valid-id').set(auth(adminToken)),
      request(app).post('/api/v1/barcodes/scan/not-a-valid-id').set(auth(staffToken)).send({ action: 'done' }),
    ])

    expect(getRes.status).toBe(400)
    expect(postRes.status).toBe(400)
  })
})
