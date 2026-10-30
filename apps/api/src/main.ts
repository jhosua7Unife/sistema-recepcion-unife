import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { archiveDocumentEntries, archivePdfFilename, archiveZipFilename, createArchivePdf, createZip } from './archiveFiles.js'
import { cancelBooking, createBooking, listBookings, reviewBooking } from './bookings.js'
import { database } from './database.js'
import { authenticate, avatars, createUser, deactivateUser, listUsers, requireAuth, requireRoles, revokeSession, updateUser } from './auth.js'
import { createProgram, deactivateProgram, getProgram, listPrograms, updateProgram } from './programs.js'
import { cancelBookingSchema, createBookingSchema, createMessageSchema, createProgramSchema, createUserSchema, createVisitSchema, loginSchema, lookupPeopleSchema, updateProgramSchema, updateUserSchema, uploadWifiCouponsSchema } from './schemas.js'
import { confirmVisitArchiveUpload, createVisit, getDocument, getVisitArchive, listVisitArchives, lookupPeople, markVisitArchiveDownloaded, reviewVisitArchive, listVisits, updateVisit, updateVisitStatus, type UploadedFile } from './visits.js'
import { listWifiCoupons, markWifiCouponDelivered, uploadWifiCoupons, wifiCouponCounts } from './wifiCoupons.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR ?? './storage/uploads')
fs.mkdirSync(uploadDirectory, { recursive: true })
const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 10 * 1024 * 1024, files: 30 },
  fileFilter: (_request, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
})

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '10mb' }))

function cleanUploads(files: Express.Multer.File[]) {
  for (const file of files) fs.rmSync(file.path, { force: true })
}

function uploadedFiles(request: Request) {
  return (Array.isArray(request.files) ? request.files : []) as UploadedFile[]
}

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'unife-api', demo: true, database: 'sqlite' }))

app.post('/api/auth/login', (request, response) => {
  const result = loginSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Credenciales inválidas', issues: result.error.issues })
  const session = authenticate(result.data.email, result.data.password)
  if (!session) return response.status(401).json({ message: 'Correo o contraseña incorrectos' })
  response.json(session)
})
app.get('/api/auth/me', requireAuth, (request, response) => response.json({ user: request.user }))
app.post('/api/auth/logout', requireAuth, (request, response) => {
  revokeSession(request.headers.authorization?.replace(/^Bearer\s+/, ''))
  response.status(204).end()
})

app.get('/api/users/avatars', requireAuth, (_request, response) => response.json(avatars))
app.get('/api/users', requireAuth, requireRoles('supervisor'), (_request, response) => response.json(listUsers()))
app.post('/api/users', requireAuth, requireRoles('supervisor'), (request, response) => {
  const result = createUserSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de usuario inválidos', issues: result.error.issues })
  const user = createUser(result.data)
  if (!user) return response.status(409).json({ message: 'El correo ya existe o el avatar no es válido' })
  response.status(201).json({ user })
})
app.patch('/api/users/:id', requireAuth, requireRoles('supervisor'), (request, response) => {
  const userId = request.params.id
  if (typeof userId !== 'string') return response.status(400).json({ message: 'Identificador de usuario inválido' })
  const result = updateUserSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de usuario inválidos', issues: result.error.issues })
  const previousUser = listUsers().find((item) => item.id === userId)
  if (!previousUser) return response.status(404).json({ message: 'Usuario no encontrado' })
  if (previousUser.role === 'producer' && result.data.role && result.data.role !== 'producer' && listPrograms().some((program) => program.producerId === previousUser.id)) {
    return response.status(409).json({ message: 'Reasigna sus programas antes de cambiarlo a otro rol' })
  }
  const user = updateUser(userId, result.data)
  if (!user) return response.status(409).json({ message: 'El correo ya está en uso o el avatar no es válido' })
  response.json({ user })
})
app.delete('/api/users/:id', requireAuth, requireRoles('supervisor'), (request, response) => {
  const userId = request.params.id
  if (typeof userId !== 'string') return response.status(400).json({ message: 'Identificador de usuario inválido' })
  const result = deactivateUser(userId, request.user!.id)
  if (result === 'not-found') return response.status(404).json({ message: 'Usuario no encontrado' })
  if (result === 'self') return response.status(409).json({ message: 'No puedes eliminar el usuario con el que iniciaste sesión' })
  if (result === 'last-supervisor') return response.status(409).json({ message: 'No puedes eliminar al único supervisor activo' })
  if (result === 'assigned-programs') return response.status(409).json({ message: 'Reasigna sus programas antes de eliminar este usuario' })
  response.json({ success: true })
})

app.get('/api/programs', requireAuth, (request, response) => {
  const producerId = request.user!.role === 'producer' ? request.user!.id : undefined
  response.json(listPrograms(producerId))
})
app.post('/api/programs', requireAuth, requireRoles('supervisor'), (request, response) => {
  const result = createProgramSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de programa inválidos', issues: result.error.issues })
  const program = createProgram(result.data)
  if (!program) return response.status(409).json({ message: 'El nombre ya está en uso o el productor no es válido' })
  response.status(201).json(program)
})
app.patch('/api/programs/:id', requireAuth, requireRoles('supervisor'), (request, response) => {
  const programId = request.params.id
  if (typeof programId !== 'string') return response.status(400).json({ message: 'Identificador de programa inválido' })
  const result = updateProgramSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de programa inválidos', issues: result.error.issues })
  if (!getProgram(programId)) return response.status(404).json({ message: 'Programa no encontrado' })
  const program = updateProgram(programId, result.data)
  if (!program) return response.status(409).json({ message: 'El nombre ya está en uso o el productor no es válido' })
  response.json(program)
})
app.delete('/api/programs/:id', requireAuth, requireRoles('supervisor'), (request, response) => {
  const programId = request.params.id
  if (typeof programId !== 'string') return response.status(400).json({ message: 'Identificador de programa inválido' })
  if (!deactivateProgram(programId)) return response.status(404).json({ message: 'Programa no encontrado' })
  response.json({ success: true })
})

app.get('/api/supervisor/wifi-coupons', requireAuth, requireRoles('supervisor'), (_request, response) => {
  const counts = wifiCouponCounts()
  response.json({
    counts: { total: counts.total, available: counts.available ?? 0, delivered: counts.delivered ?? 0 },
    coupons: listWifiCoupons(),
  })
})
app.post('/api/supervisor/wifi-coupons', requireAuth, requireRoles('supervisor'), (request, response) => {
  const parsed = uploadWifiCouponsSchema.safeParse(request.body)
  if (!parsed.success) return response.status(422).json({ message: 'Revisa los códigos: cada cupón debe contener únicamente números', issues: parsed.error.issues })
  const result = uploadWifiCoupons(parsed.data.codes, request.user!.id)
  const counts = wifiCouponCounts()
  response.status(201).json({
    added: result.added,
    duplicates: result.duplicates,
    counts: { total: counts.total, available: counts.available ?? 0, delivered: counts.delivered ?? 0 },
  })
})
app.get('/api/reception/wifi-coupons', requireAuth, requireRoles('reception'), (_request, response) => {
  response.json(listWifiCoupons('available'))
})
app.patch('/api/reception/wifi-coupons/:id/delivered', requireAuth, requireRoles('reception'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de cupón inválido' })
  const result = markWifiCouponDelivered(id, request.user!.id)
  if ('error' in result) return response.status(result.error === 'Cupón no encontrado' ? 404 : 409).json({ message: result.error })
  response.json({ id, status: result.status })
})

app.get('/api/dashboard', requireAuth, (request, response) => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const dateInMexico = (date: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date))
  const allVisitsToday = listVisits('').filter((visit) => dateInMexico(visit.expectedAt) === today)
  const visits = request.user?.role === 'producer'
    ? []
    : allVisitsToday
      .sort((left, right) => left.expectedAt.localeCompare(right.expectedAt))
      .slice(0, 5)
  const bookings = listBookings(request.user?.role ?? 'producer', request.user?.id ?? '')
    .filter((booking) => booking.status !== 'cancelled' && booking.status !== 'rejected')
    .filter((booking) => new Date(booking.endsAt).getTime() >= Date.now())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 5)
    .map(({ guests: _guests, ...booking }) => booking)
  const unreadNotifications = database.prepare(`
    SELECT count(*) AS count FROM notifications
    WHERE read = 0 AND (recipient_role IS NULL OR recipient_role = ?)
      AND (recipient_user_id IS NULL OR recipient_user_id = ?)
  `).get(request.user!.role, request.user!.id) as { count: number }
  const visitorsInside = database.prepare("SELECT count(*) AS count FROM visits WHERE status = 'inside'").get() as { count: number }
  const todayBookings = listBookings(request.user?.role ?? 'producer', request.user?.id ?? '')
    .filter((booking) => booking.status === 'confirmed' && dateInMexico(booking.startsAt) === today)
    .length
  const pendingBookingReviews = request.user?.role === 'supervisor'
    ? (database.prepare("SELECT count(*) AS count FROM bookings WHERE status = 'pending'").get() as { count: number }).count
    : 0
  response.json({
    metrics: {
      visitorsInside: visitorsInside.count,
      expectedGroups: allVisitsToday.filter((visit) => visit.status === 'expected').length,
      completedVisitsToday: allVisitsToday.filter((visit) => visit.status === 'completed').length,
      todayBookings,
      pendingBookingReviews,
      unreadNotifications: unreadNotifications.count,
    },
    visits,
    bookings,
    notifications: [],
  })
})

app.post('/api/reception/people/lookup', requireAuth, requireRoles('reception', 'supervisor'), (request, response) => {
  const result = lookupPeopleSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de búsqueda inválidos', issues: result.error.issues })
  response.json(lookupPeople(result.data.name, result.data.identificationNumber, result.data.personType))
})

app.get('/api/reception/archive', requireAuth, requireRoles('reception'), (request, response) => {
  const view = request.query.view === 'archived' ? 'archived' : 'pending'
  response.json(listVisitArchives(view, String(request.query.search ?? '')))
})

app.get('/api/reception/archive/:id/pdf', requireAuth, requireRoles('reception'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de expediente inválido' })
  const archive = getVisitArchive(id)
  if (!archive) return response.status(404).json({ message: 'Expediente no encontrado' })
  response.type('application/pdf')
  response.setHeader('Content-Disposition', `inline; filename="${archivePdfFilename(archive)}"`)
  response.send(createArchivePdf(archive))
})

app.get('/api/reception/archive/:id/download', requireAuth, requireRoles('reception'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de expediente inválido' })
  const archive = getVisitArchive(id)
  if (!archive) return response.status(404).json({ message: 'Expediente no encontrado' })
  if (!['ready_to_download', 'pending_onedrive'].includes(archive.status)) {
    return response.status(409).json({ message: 'Revisa el expediente antes de descargarlo' })
  }
  const entries = [{ name: 'formulario.pdf', data: createArchivePdf(archive) }]
  for (const { document, path: entryPath } of archiveDocumentEntries(archive.visit)) {
    const stored = getDocument(document.id)
    if (!stored) return response.status(409).json({ message: `No se encontró el archivo ${document.name}` })
    const storageKey = path.basename(stored.storage_key)
    if (storageKey !== stored.storage_key) return response.status(400).json({ message: 'Referencia de documento inválida' })
    const filePath = path.join(uploadDirectory, storageKey)
    if (!fs.existsSync(filePath)) return response.status(409).json({ message: `No está disponible el archivo ${document.name}` })
    entries.push({ name: entryPath, data: fs.readFileSync(filePath) })
  }
  const zip = createZip(entries)
  const downloaded = markVisitArchiveDownloaded(id)
  if ('error' in downloaded) return response.status(409).json({ message: downloaded.error })
  response.type('application/zip')
  response.setHeader('Content-Disposition', `attachment; filename="${archiveZipFilename(archive)}"`)
  response.send(zip)
})

app.patch('/api/reception/archive/:id/review', requireAuth, requireRoles('reception'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de expediente inválido' })
  const result = reviewVisitArchive(id, request.user!.id)
  if ('error' in result) {
    const status = result.error === 'Expediente no encontrado' ? 404 : 409
    const missingDocuments = 'missingDocuments' in result ? result.missingDocuments : undefined
    const message = missingDocuments?.length ? `${result.error}: ${missingDocuments.join(', ')}` : result.error
    return response.status(status).json({ message, missingDocuments })
  }
  response.json(result.archive)
})

app.patch('/api/reception/archive/:id/complete', requireAuth, requireRoles('reception'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de expediente inválido' })
  const result = confirmVisitArchiveUpload(id, request.user!.id)
  if ('error' in result) {
    const status = result.error === 'Expediente no encontrado' ? 404 : 409
    return response.status(status).json(result)
  }
  response.json(result.archive)
})

app.get('/api/visits', requireAuth, requireRoles('reception', 'supervisor'), (request, response) => {
  const search = String(request.query.search ?? '')
  response.json(listVisits(search))
})

app.post('/api/visits', requireAuth, requireRoles('reception', 'supervisor'), upload.any(), (request, response, next) => {
  const files = uploadedFiles(request)
  let body: unknown
  try {
    body = typeof request.body.payload === 'string' ? JSON.parse(request.body.payload) : request.body
  } catch {
    cleanUploads(files as Express.Multer.File[])
    return response.status(400).json({ message: 'El contenido del registro no es JSON válido' })
  }
  const result = createVisitSchema.safeParse(body)
  if (!result.success) {
    cleanUploads(files as Express.Multer.File[])
    return response.status(422).json({ message: 'Datos de visita inválidos', issues: result.error.issues })
  }
  try {
    const created = createVisit(result.data, request.user!.id, files)
    if ('error' in created && created.error) {
      cleanUploads(files as Express.Multer.File[])
      return response.status('missingDocuments' in created ? 422 : 409).json(created)
    }
    response.status(201).json(created.visit)
  } catch (cause) {
    cleanUploads(files as Express.Multer.File[])
    next(cause)
  }
})
app.patch('/api/visits/:id', requireAuth, requireRoles('reception', 'supervisor'), upload.any(), (request, response, next) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de visita inválido' })
  const files = uploadedFiles(request)
  let body: unknown
  try {
    body = typeof request.body.payload === 'string' ? JSON.parse(request.body.payload) : request.body
  } catch {
    cleanUploads(files as Express.Multer.File[])
    return response.status(400).json({ message: 'El contenido del registro no es JSON válido' })
  }
  const result = createVisitSchema.safeParse(body)
  if (!result.success) {
    cleanUploads(files as Express.Multer.File[])
    return response.status(422).json({ message: 'Datos de visita inválidos', issues: result.error.issues })
  }
  try {
    const updated = updateVisit(id, result.data, request.user!.id, files)
    if ('error' in updated) {
      cleanUploads(files as Express.Multer.File[])
      return response.status(updated.error === 'Visita no encontrada' ? 404 : 409).json({ message: updated.error })
    }
    response.json(updated.visit)
  } catch (cause) {
    cleanUploads(files as Express.Multer.File[])
    next(cause)
  }
})

app.post('/api/visits/:id/entry', requireAuth, requireRoles('reception', 'supervisor'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de visita inválido' })
  const result = updateVisitStatus(id, 'inside')
  if ('error' in result) return response.status(result.error === 'Visita no encontrada' ? 404 : 409).json({ message: result.error })
  response.json(result.visit)
})
app.post('/api/visits/:id/exit', requireAuth, requireRoles('reception', 'supervisor'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de visita inválido' })
  const result = updateVisitStatus(id, 'completed')
  if ('error' in result) return response.status(result.error === 'Visita no encontrada' ? 404 : 409).json({ message: result.error })
  response.json(result.visit)
})
app.get('/api/documents/:id', requireAuth, requireRoles('reception', 'supervisor'), (request, response, next) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de documento inválido' })
  const document = getDocument(id)
  if (!document) return response.status(404).json({ message: 'Documento no encontrado' })
  const storageKey = path.basename(document.storage_key)
  if (storageKey !== document.storage_key) return response.status(400).json({ message: 'Referencia de documento inválida' })
  response.type(document.mime_type)
  response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(document.original_name)}`)
  response.sendFile(path.join(uploadDirectory, storageKey), (error) => {
    if (error) next(error)
  })
})

app.get('/api/bookings', requireAuth, (request, response) => {
  response.json(listBookings(request.user!.role, request.user!.id))
})
app.post('/api/bookings', requireAuth, requireRoles('producer', 'supervisor'), (request, response) => {
  const result = createBookingSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Datos de reserva inválidos', issues: result.error.issues })
  const created = createBooking(result.data, request.user!.id, request.user!.role)
  if (!('booking' in created)) {
    const status = created.error === 'Programa no encontrado' ? 404 : created.error.includes('Solo puedes') ? 403 : created.error.includes('recurso') ? 409 : 422
    return response.status(status).json({ message: created.error })
  }
  response.status(201).json(created.booking)
})
app.patch('/api/bookings/:id/cancel', requireAuth, requireRoles('producer'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de reserva inválido' })
  const result = cancelBookingSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Indica el motivo de cancelación', issues: result.error.issues })
  const cancelled = cancelBooking(id, request.user!.id, result.data.reason)
  if ('error' in cancelled && cancelled.error) {
    const status = cancelled.error === 'Reserva no encontrada' ? 404 : cancelled.error.startsWith('Solo puedes') ? 403 : 409
    return response.status(status).json({ message: cancelled.error })
  }
  response.json(cancelled.booking)
})
app.patch('/api/bookings/:id/approve', requireAuth, requireRoles('supervisor'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de reserva inválido' })
  const reviewed = reviewBooking(id, request.user!.id, true)
  if ('error' in reviewed) return response.status(reviewed.error === 'Reserva no encontrada' ? 404 : 409).json({ message: reviewed.error })
  response.json(reviewed.booking)
})
app.patch('/api/bookings/:id/reject', requireAuth, requireRoles('supervisor'), (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de reserva inválido' })
  const reviewed = reviewBooking(id, request.user!.id, false)
  if ('error' in reviewed) return response.status(reviewed.error === 'Reserva no encontrada' ? 404 : 409).json({ message: reviewed.error })
  response.json(reviewed.booking)
})

app.get('/api/notifications', requireAuth, (request, response) => {
  const rows = database.prepare(`
    SELECT id, title, detail, created_at, read
    FROM notifications
    WHERE (recipient_role IS NULL OR recipient_role = ?)
      AND (recipient_user_id IS NULL OR recipient_user_id = ?)
    ORDER BY created_at DESC
  `).all(request.user!.role, request.user!.id) as Array<{ id: string; title: string; detail: string; created_at: string; read: number }>
  response.json(rows.map((item) => ({ id: item.id, title: item.title, detail: item.detail, createdAt: item.created_at, read: Boolean(item.read) })))
})
app.patch('/api/notifications/:id/read', requireAuth, (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de notificación inválido' })
  const result = database.prepare(`
    UPDATE notifications SET read = 1
    WHERE id = ? AND (recipient_role IS NULL OR recipient_role = ?)
      AND (recipient_user_id IS NULL OR recipient_user_id = ?)
  `).run(id, request.user!.role, request.user!.id)
  if (result.changes === 0) return response.status(404).json({ message: 'Notificación no encontrada' })
  const item = database.prepare('SELECT id, title, detail, created_at, read FROM notifications WHERE id = ?').get(id) as {
    id: string; title: string; detail: string; created_at: string; read: number
  }
  response.json({ id: item.id, title: item.title, detail: item.detail, createdAt: item.created_at, read: Boolean(item.read) })
})

app.get('/api/messages', requireAuth, (request, response) => {
  const rows = database.prepare(`
    SELECT id, sender_id, sender_name, sender_role, recipient_role, subject, body, created_at, read
    FROM messages WHERE recipient_role = ? OR sender_id = ? ORDER BY created_at DESC
  `).all(request.user!.role, request.user!.id) as Array<{
    id: string; sender_id: string; sender_name: string; sender_role: string; recipient_role: string
    subject: string; body: string; created_at: string; read: number
  }>
  response.json(rows.map((item) => ({
    id: item.id, senderId: item.sender_id, senderName: item.sender_name, senderRole: item.sender_role,
    recipientRole: item.recipient_role, subject: item.subject, body: item.body, createdAt: item.created_at, read: Boolean(item.read),
  })))
})
app.post('/api/messages', requireAuth, (request, response) => {
  const result = createMessageSchema.safeParse(request.body)
  if (!result.success) return response.status(422).json({ message: 'Nota inválida', issues: result.error.issues })
  if (request.user!.role === 'reception' && !['producer', 'supervisor'].includes(result.data.recipientRole)) {
    return response.status(403).json({ message: 'Recepción solo puede escribir a productores o supervisores' })
  }
  const message = {
    id: randomUUID(), senderId: request.user!.id, senderName: request.user!.name, senderRole: request.user!.role,
    ...result.data, createdAt: new Date().toISOString(), read: false,
  }
  database.prepare(`
    INSERT INTO messages (id, sender_id, sender_name, sender_role, recipient_role, subject, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(message.id, message.senderId, message.senderName, message.senderRole, message.recipientRole, message.subject, message.body, message.createdAt)
  response.status(201).json(message)
})
app.patch('/api/messages/:id/read', requireAuth, (request, response) => {
  const id = request.params.id
  if (typeof id !== 'string') return response.status(400).json({ message: 'Identificador de mensaje inválido' })
  const result = database.prepare('UPDATE messages SET read = 1 WHERE id = ? AND (recipient_role = ? OR sender_id = ?)').run(id, request.user!.role, request.user!.id)
  if (result.changes === 0) return response.status(404).json({ message: 'Nota no encontrada' })
  const item = database.prepare(`
    SELECT id, sender_id, sender_name, sender_role, recipient_role, subject, body, created_at, read
    FROM messages WHERE id = ?
  `).get(id) as {
    id: string; sender_id: string; sender_name: string; sender_role: string; recipient_role: string
    subject: string; body: string; created_at: string; read: number
  }
  response.json({
    id: item.id, senderId: item.sender_id, senderName: item.sender_name, senderRole: item.sender_role,
    recipientRole: item.recipient_role, subject: item.subject, body: item.body, createdAt: item.created_at, read: Boolean(item.read),
  })
})

app.use((_request, response) => response.status(404).json({ message: 'Ruta no encontrada' }))
app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error)
  response.status(500).json({ message: 'Error interno del servidor' })
})

app.listen(port, () => console.log(`UNIFE API escuchando en http://localhost:${port}`))
