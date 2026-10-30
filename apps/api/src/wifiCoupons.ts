import { randomUUID } from 'node:crypto'
import { database } from './database.js'

export type WifiCouponStatus = 'available' | 'delivered'
export type WifiCoupon = {
  id: string
  code: string
  status: WifiCouponStatus
  uploadedAt: string
  deliveredAt: string | null
}

type WifiCouponRow = {
  id: string
  code: string
  status: WifiCouponStatus
  uploaded_at: string
  delivered_at: string | null
}

function mapCoupon(row: WifiCouponRow): WifiCoupon {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    uploadedAt: row.uploaded_at,
    deliveredAt: row.delivered_at,
  }
}

export function listWifiCoupons(status?: WifiCouponStatus) {
  const rows = status
    ? database.prepare(`
      SELECT id, code, status, uploaded_at, delivered_at
      FROM wifi_coupons WHERE status = ? ORDER BY uploaded_at, code
    `).all(status)
    : database.prepare(`
      SELECT id, code, status, uploaded_at, delivered_at
      FROM wifi_coupons ORDER BY uploaded_at DESC, code
    `).all()
  return (rows as WifiCouponRow[]).map(mapCoupon)
}

export function uploadWifiCoupons(codes: string[], actorId: string) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const timestamp = new Date().toISOString()
    const insert = database.prepare(`
      INSERT OR IGNORE INTO wifi_coupons (id, code, status, uploaded_by, uploaded_at)
      VALUES (?, ?, 'available', ?, ?)
    `)
    let added = 0
    for (const code of codes) {
      const result = insert.run(randomUUID(), code, actorId, timestamp)
      added += Number(result.changes)
    }
    database.exec('COMMIT')
    return { added, duplicates: codes.length - added }
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
}

export function markWifiCouponDelivered(id: string, actorId: string) {
  const timestamp = new Date().toISOString()
  const result = database.prepare(`
    UPDATE wifi_coupons
    SET status = 'delivered', delivered_by = ?, delivered_at = ?
    WHERE id = ? AND status = 'available'
  `).run(actorId, timestamp, id)
  if (result.changes === 1) return { status: 'delivered' as const }

  const existing = database.prepare('SELECT status FROM wifi_coupons WHERE id = ?').get(id) as { status: WifiCouponStatus } | undefined
  if (!existing) return { error: 'Cupón no encontrado' as const }
  return { error: 'Este cupón ya fue marcado como entregado' as const }
}

export function wifiCouponCounts() {
  return database.prepare(`
    SELECT
      count(*) AS total,
      sum(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      sum(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
    FROM wifi_coupons
  `).get() as { total: number; available: number | null; delivered: number | null }
}
