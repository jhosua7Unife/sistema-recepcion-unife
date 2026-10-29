import { randomUUID } from 'node:crypto'
import { database } from './database.js'
import type { Role } from './auth.js'
import type { Program } from './programs.js'

export type BookingInput = {
  resource: 'Foro 1' | 'Foro 2' | 'Croma' | 'Locación'
  programId: string
  startsAt: string
  endsAt: string
  locationName?: string
  locationAddress?: string
  notes?: string
  services: { makeup: boolean; cameras: boolean; vehicle: boolean }
  guests: Array<{ name: string; role: string }>
}

export type Booking = {
  id: string
  resource: BookingInput['resource']
  program: string
  programId: string
  producer: string
  producerId: string
  startsAt: string
  endsAt: string
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  locationName: string | null
  locationAddress: string | null
  notes: string | null
  services: BookingInput['services']
  requestedBy: string
  cancellationReason: string | null
  guests: Array<{ id: string; name: string; role: string }>
}

type BookingRow = {
  id: string; resource: BookingInput['resource']; program: string; program_id: string
  producer: string; producer_id: string; starts_at: string; ends_at: string; status: Booking['status']
  location_name: string | null; location_address: string | null; notes: string | null
  service_makeup: number; service_cameras: number; service_vehicle: number
  requested_by: string; cancellation_reason: string | null
}

function transaction<T>(callback: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    database.exec('COMMIT')
    return result
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
}

function mapBooking(row: BookingRow): Booking {
  const guests = database.prepare('SELECT id, name, role FROM booking_guests WHERE booking_id = ? ORDER BY rowid').all(row.id) as Array<{ id: string; name: string; role: string }>
  return {
    id: row.id,
    resource: row.resource,
    program: row.program,
    programId: row.program_id,
    producer: row.producer,
    producerId: row.producer_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    locationName: row.location_name,
    locationAddress: row.location_address,
    notes: row.notes,
    services: { makeup: Boolean(row.service_makeup), cameras: Boolean(row.service_cameras), vehicle: Boolean(row.service_vehicle) },
    requestedBy: row.requested_by,
    cancellationReason: row.cancellation_reason,
    guests,
  }
}

const bookingSelect = `
  SELECT bookings.id, bookings.resource, programs.name AS program, bookings.program_id,
    users.name AS producer, bookings.producer_id, bookings.starts_at, bookings.ends_at,
    bookings.status, bookings.location_name, bookings.location_address, bookings.notes,
    bookings.service_makeup, bookings.service_cameras, bookings.service_vehicle,
    bookings.requested_by, bookings.cancellation_reason
  FROM bookings
  JOIN programs ON programs.id = bookings.program_id
  JOIN users ON users.id = bookings.producer_id
`

export function listBookings(role: Role, userId: string) {
  const filter = role === 'producer'
    ? 'WHERE bookings.producer_id = ?'
    : role === 'reception'
      ? "WHERE bookings.status = 'confirmed'"
      : ''
  const parameters = role === 'producer' ? [userId] : []
  const rows = database.prepare(`${bookingSelect} ${filter} ORDER BY bookings.starts_at DESC`).all(...parameters) as BookingRow[]
  return rows.map(mapBooking)
}

function getBooking(id: string) {
  const row = database.prepare(`${bookingSelect} WHERE bookings.id = ?`).get(id) as BookingRow | undefined
  return row ? mapBooking(row) : null
}

export function createBooking(input: BookingInput, requesterId: string, role: Role) {
  const program = database.prepare('SELECT id, name, producer_id AS producerId FROM programs WHERE id = ? AND active = 1').get(input.programId) as Pick<Program, 'id' | 'name' | 'producerId'> | undefined
  if (!program) return { error: 'Programa no encontrado' as const }
  if (role === 'producer' && program.producerId !== requesterId) return { error: 'Solo puedes agendar programas asignados a tu cuenta' as const }
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return { error: 'La hora final debe ser posterior a la inicial' as const }
  if (input.resource === 'Locación' && !input.locationName?.trim()) return { error: 'Indica la locación externa' as const }
  if (input.guests.length === 0) return { error: 'Agrega al menos un invitado' as const }

  return transaction(() => {
    const conflict = database.prepare(`
      SELECT id FROM bookings
      WHERE resource = ? AND status IN ('pending', 'confirmed')
        AND (? != 'Locación' OR location_name = ?)
        AND starts_at < ? AND ends_at > ?
      LIMIT 1
    `).get(input.resource, input.resource, input.locationName ?? '', input.endsAt, input.startsAt)
    if (conflict) return { error: 'El recurso ya tiene una solicitud o reserva en ese horario' as const }

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    database.prepare(`
      INSERT INTO bookings (
        id, resource, program_id, producer_id, starts_at, ends_at, status,
        location_name, location_address, notes, service_makeup, service_cameras,
        service_vehicle, requested_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.resource, input.programId, program.producerId, input.startsAt, input.endsAt,
      input.locationName?.trim() || null, input.locationAddress?.trim() || null, input.notes?.trim() || null,
      Number(input.services.makeup), Number(input.services.cameras), Number(input.services.vehicle), requesterId, timestamp,
    )
    const insertGuest = database.prepare('INSERT INTO booking_guests (id, booking_id, name, role, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const guest of input.guests) insertGuest.run(randomUUID(), id, guest.name.trim(), guest.role.trim(), timestamp)
    database.prepare(`
      INSERT INTO notifications (id, recipient_role, title, detail, created_at)
      VALUES (?, 'supervisor', ?, ?, ?)
    `).run(randomUUID(), 'Nueva solicitud de agenda', `${program.name} solicitó ${input.resource} para ${input.guests.map((guest) => guest.name.trim()).join(', ')}.`, timestamp)
    const booking = getBooking(id)
    if (!booking) throw new Error('No fue posible recuperar la reserva creada')
    return { booking }
  })
}

export function reviewBooking(id: string, supervisorId: string, approve: boolean) {
  return transaction(() => {
    const row = database.prepare('SELECT id, status, program_id FROM bookings WHERE id = ?').get(id) as { id: string; status: Booking['status']; program_id: string } | undefined
    if (!row) return { error: 'Reserva no encontrada' as const }
    if (row.status !== 'pending') return { error: 'Solo se pueden revisar solicitudes pendientes' as const }

    const timestamp = new Date().toISOString()
    const status = approve ? 'confirmed' : 'rejected'
    database.prepare('UPDATE bookings SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(status, supervisorId, timestamp, id)
    const booking = getBooking(id)
    if (!booking) throw new Error('No fue posible recuperar la reserva actualizada')
    database.prepare(`
      INSERT INTO notifications (id, recipient_role, recipient_user_id, title, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      approve ? 'reception' : 'producer',
      approve ? null : booking.requestedBy,
      approve ? 'Llegada aprobada para Recepción' : 'Solicitud de agenda rechazada',
      approve
        ? `${booking.program}: ${booking.guests.map((guest) => guest.name).join(', ')} llegará ${booking.startsAt}.`
        : `La solicitud de ${booking.program} para ${booking.resource} fue rechazada.`,
      timestamp,
    )
    return { booking }
  })
}

export function cancelBooking(id: string, producerId: string, reason: string) {
  const row = database.prepare('SELECT id, producer_id, status FROM bookings WHERE id = ?').get(id) as { id: string; producer_id: string; status: Booking['status'] } | undefined
  if (!row) return { error: 'Reserva no encontrada' as const }
  if (row.producer_id !== producerId) return { error: 'Solo puedes cancelar tus propias solicitudes' as const }
  if (row.status === 'cancelled' || row.status === 'rejected') return { error: 'La solicitud ya no se puede cancelar' as const }
  const timestamp = new Date().toISOString()
  database.prepare("UPDATE bookings SET status = 'cancelled', cancellation_reason = ? WHERE id = ?").run(reason, id)
  const booking = getBooking(id)
  if (!booking) throw new Error('No fue posible recuperar la reserva cancelada')
  database.prepare(`
    INSERT INTO notifications (id, recipient_role, title, detail, created_at)
    VALUES (?, 'supervisor', 'Solicitud cancelada', ?, ?)
  `).run(randomUUID(), `${booking.program} canceló ${booking.resource}: ${reason}`, timestamp)
  return { booking }
}
