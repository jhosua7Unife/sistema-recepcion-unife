import { randomBytes, scryptSync } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const databasePath = path.resolve(process.env.DATABASE_PATH ?? path.join(projectRoot, 'apps/api/storage/unife.sqlite'))
const migrationsPath = path.join(projectRoot, 'packages/database/sqlite')

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

export const database = new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')

const currentVersion = Number((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
const migrations = fs.readdirSync(migrationsPath).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort()

for (const migration of migrations) {
  const version = Number(migration.split('_', 1)[0])
  if (version <= currentVersion) continue
  const sql = fs.readFileSync(path.join(migrationsPath, migration), 'utf8')
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(sql)
    database.exec(`PRAGMA user_version = ${version}`)
    database.exec('COMMIT')
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
}

const avatars = [
  ['avatar-01', 'Azul', '#000050', '#dce4ff'],
  ['avatar-02', 'Cobalto', '#164e8a', '#d9efff'],
  ['avatar-03', 'Esmeralda', '#12634f', '#d9f6e8'],
  ['avatar-04', 'Coral', '#a84445', '#ffe0dc'],
  ['avatar-05', 'Amatista', '#633d88', '#eee1ff'],
  ['avatar-06', 'Ocre', '#91630d', '#fff0c7'],
] as const
const now = new Date().toISOString()
const insertAvatar = database.prepare('INSERT OR IGNORE INTO avatars (id, name, color, accent) VALUES (?, ?, ?, ?)')
for (const avatar of avatars) insertAvatar.run(...avatar)

const insertUser = database.prepare(`
  INSERT OR IGNORE INTO users (id, name, email, role, avatar_id, password_hash, password_salt, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const demoUsers = [
  ['user-reception', 'Recepción Demo', 'recepcion@unife.mx', 'reception'],
  ['user-producer', 'Productor Demo', 'productor@unife.mx', 'producer'],
  ['user-supervisor', 'Supervisor Demo', 'supervisor@unife.mx', 'supervisor'],
] as const
for (const [id, name, email, role] of demoUsers) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('demo1234', salt, 64).toString('hex')
  insertUser.run(id, name, email, role, 'avatar-01', hash, salt, now, now)
}

const insertProgram = database.prepare(`
  INSERT OR IGNORE INTO programs (id, name, producer_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`)
for (const [id, name] of [
  ['program-noticias-unife', 'Noticias UNIFE'],
  ['program-vive-mejor', 'Vive Mejor'],
  ['program-conversaciones', 'Conversaciones'],
] as const) {
  insertProgram.run(id, name, 'user-producer', now, now)
}

const insertNotification = database.prepare(`
  INSERT OR IGNORE INTO notifications (id, recipient_role, title, detail, created_at)
  VALUES (?, ?, ?, ?, ?)
`)
insertNotification.run(
  'notification-demo-supervisor',
  'supervisor',
  'Agenda lista para revisar',
  'Las solicitudes de productores aparecerán aquí cuando se envíen.',
  now,
)
