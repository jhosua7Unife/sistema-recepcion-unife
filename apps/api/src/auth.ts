import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { database } from './database.js'

export type Role = 'reception' | 'producer' | 'supervisor'
export type Avatar = { id: string; name: string; color: string; accent: string }
export type PublicUser = { id: string; name: string; email: string; role: Role; avatarId: string }
type UserRow = { id: string; name: string; email: string; role: Role; avatar_id: string; password_hash: string; password_salt: string; active: number }

export const avatars: Avatar[] = [
  { id: 'avatar-01', name: 'Azul', color: '#000050', accent: '#dce4ff' },
  { id: 'avatar-02', name: 'Cobalto', color: '#164e8a', accent: '#d9efff' },
  { id: 'avatar-03', name: 'Esmeralda', color: '#12634f', accent: '#d9f6e8' },
  { id: 'avatar-04', name: 'Coral', color: '#a84445', accent: '#ffe0dc' },
  { id: 'avatar-05', name: 'Amatista', color: '#633d88', accent: '#eee1ff' },
  { id: 'avatar-06', name: 'Ocre', color: '#91630d', accent: '#fff0c7' },
]

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex')
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const toPublicUser = (user: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatar_id'>): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatarId: user.avatar_id,
})

export function authenticate(email: string, password: string) {
  const user = database.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1').get(email.trim()) as UserRow | undefined
  if (!user) return null
  const expected = Buffer.from(user.password_hash, 'hex')
  const received = Buffer.from(hashPassword(password, user.password_salt), 'hex')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  const token = randomUUID()
  const now = new Date()
  database.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash(token),
    user.id,
    now.toISOString(),
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  )
  return { token, user: toPublicUser(user) }
}

export function getUserFromToken(token: string | undefined) {
  if (!token) return null
  const row = database.prepare(`
    SELECT users.id, users.name, users.email, users.role, users.avatar_id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1
  `).get(tokenHash(token), new Date().toISOString()) as Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatar_id'> | undefined
  return row ? toPublicUser(row) : null
}

export function createUser(input: { name: string; email: string; role: Role; password: string; avatarId: string }) {
  if (!avatars.some((avatar) => avatar.id === input.avatarId)) return null
  const id = randomUUID()
  const salt = randomBytes(16).toString('hex')
  const timestamp = new Date().toISOString()
  try {
    database.prepare(`
      INSERT INTO users (id, name, email, role, avatar_id, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name.trim(), input.email.trim().toLowerCase(), input.role, input.avatarId, hashPassword(input.password, salt), salt, timestamp, timestamp)
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('UNIQUE constraint failed: users.email')) return null
    throw cause
  }
  return getUserById(id)
}

export function updateUser(id: string, input: Partial<{ name: string; email: string; role: Role; password: string; avatarId: string }>) {
  if (input.avatarId && !avatars.some((avatar) => avatar.id === input.avatarId)) return null
  const existing = getUserById(id)
  if (!existing) return null

  const changes: Array<[string, string | Role]> = []
  if (input.name !== undefined) changes.push(['name', input.name.trim()])
  if (input.email !== undefined) changes.push(['email', input.email.trim().toLowerCase()])
  if (input.role !== undefined) changes.push(['role', input.role])
  if (input.avatarId !== undefined) changes.push(['avatar_id', input.avatarId])
  if (input.password) {
    const salt = randomBytes(16).toString('hex')
    changes.push(['password_salt', salt], ['password_hash', hashPassword(input.password, salt)])
  }
  if (changes.length === 0) return existing

  const assignments = changes.map(([column]) => `${column} = ?`)
  const timestamp = new Date().toISOString()
  database.prepare(`UPDATE users SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...changes.map(([, value]) => value),
    timestamp,
    id,
  )
  return getUserById(id)
}

export function deactivateUser(id: string, currentUserId: string) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const user = database.prepare('SELECT role FROM users WHERE id = ? AND active = 1').get(id) as { role: Role } | undefined
    if (!user) {
      database.exec('COMMIT')
      return 'not-found' as const
    }
    if (id === currentUserId) {
      database.exec('COMMIT')
      return 'self' as const
    }

    if (user.role === 'supervisor') {
      const supervisors = database.prepare("SELECT count(*) AS count FROM users WHERE role = 'supervisor' AND active = 1").get() as { count: number }
      if (supervisors.count <= 1) {
        database.exec('COMMIT')
        return 'last-supervisor' as const
      }
    }

    const programs = database.prepare('SELECT count(*) AS count FROM programs WHERE producer_id = ? AND active = 1').get(id) as { count: number }
    if (programs.count > 0) {
      database.exec('COMMIT')
      return 'assigned-programs' as const
    }

    database.prepare('UPDATE users SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    database.exec('COMMIT')
    return 'deactivated' as const
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
}

function getUserById(id: string): PublicUser | null {
  const user = database.prepare('SELECT id, name, email, role, avatar_id FROM users WHERE id = ?').get(id) as Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatar_id'> | undefined
  return user ? toPublicUser(user) : null
}

export function listUsers() {
  const users = database.prepare('SELECT id, name, email, role, avatar_id FROM users WHERE active = 1 ORDER BY name').all() as Array<Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'avatar_id'>>
  return users.map(toPublicUser)
}

export function revokeSession(token: string | undefined) {
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/, '')
  const user = getUserFromToken(token)
  if (!user) return response.status(401).json({ message: 'Autenticación requerida' })
  request.user = user
  next()
}

export function requireRoles(...roles: Role[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) return response.status(403).json({ message: 'No tienes permisos para esta acción' })
    next()
  }
}

declare global {
  namespace Express {
    interface Request { user?: PublicUser }
  }
}
