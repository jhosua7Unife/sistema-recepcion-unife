import { randomUUID } from 'node:crypto'
import { database } from './database.js'

export type ProgramCategory = 'unife' | 'church'
export type Program = { id: string; name: string; producer: string; producerId: string; category: ProgramCategory }
type ProgramRow = { id: string; name: string; producer: string; producer_id: string; category: ProgramCategory }

function mapProgram(row: ProgramRow): Program {
  return { id: row.id, name: row.name, producer: row.producer, producerId: row.producer_id, category: row.category }
}

export function listPrograms(producerId?: string) {
  const rows = producerId === undefined
    ? database.prepare(`
    SELECT programs.id, programs.name, users.name AS producer, programs.producer_id, programs.category
    FROM programs JOIN users ON users.id = programs.producer_id
    WHERE programs.active = 1
    ORDER BY programs.name
  `).all()
    : database.prepare(`
      SELECT programs.id, programs.name, users.name AS producer, programs.producer_id, programs.category
      FROM programs JOIN users ON users.id = programs.producer_id
      WHERE programs.active = 1 AND programs.producer_id = ?
      ORDER BY programs.name
    `).all(producerId)
  return (rows as ProgramRow[]).map(mapProgram)
}

export function getProgram(id: string) {
  const row = database.prepare(`
    SELECT programs.id, programs.name, users.name AS producer, programs.producer_id, programs.category
    FROM programs JOIN users ON users.id = programs.producer_id
    WHERE programs.id = ? AND programs.active = 1
  `).get(id) as ProgramRow | undefined
  return row ? mapProgram(row) : null
}

export function createProgram(input: { name: string; producer: string; category: ProgramCategory }) {
  const producer = database.prepare("SELECT id FROM users WHERE name = ? COLLATE NOCASE AND role = 'producer' AND active = 1").get(input.producer) as { id: string } | undefined
  if (!producer) return null
  const id = randomUUID()
  const timestamp = new Date().toISOString()
  try {
    database.prepare('INSERT INTO programs (id, name, producer_id, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, input.name.trim(), producer.id, input.category, timestamp, timestamp,
    )
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('UNIQUE constraint failed: programs.name')) return null
    throw cause
  }
  return getProgram(id)
}

export function updateProgram(id: string, input: { name: string; producer: string; category?: ProgramCategory }) {
  const existing = getProgram(id)
  if (!existing) return null
  const producer = database.prepare("SELECT id FROM users WHERE name = ? COLLATE NOCASE AND role = 'producer' AND active = 1").get(input.producer) as { id: string } | undefined
  if (!producer) return null
  try {
    database.prepare('UPDATE programs SET name = ?, producer_id = ?, category = ?, updated_at = ? WHERE id = ?').run(
      input.name.trim(), producer.id, input.category ?? existing.category, new Date().toISOString(), id,
    )
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('UNIQUE constraint failed: programs.name')) return null
    throw cause
  }
  return getProgram(id)
}

export function deactivateProgram(id: string) {
  const result = database.prepare('UPDATE programs SET active = 0, updated_at = ? WHERE id = ? AND active = 1').run(new Date().toISOString(), id)
  return result.changes > 0
}
