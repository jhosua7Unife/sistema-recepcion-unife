import { randomUUID } from 'node:crypto'
import { database } from './database.js'

type VisitPayload = {
  bookingId?: string
  name: string
  program: string
  producer: string
  expectedAt: string
  members: Array<{
    id?: string
    profileId?: string
    reuseIdentification?: boolean
    reuseImageRelease?: boolean
    bookingGuestId?: string
    name: string
    role: string
    personType: 'adult' | 'minor'
    programs: string[]
    identificationType: 'ine' | 'passport' | 'license' | null
    identificationNumber?: string
    curp?: string
    address?: string
    tutors: Array<{
      id?: string
      profileId?: string
      reuseIdentification?: boolean
      reuseImageRelease?: boolean
      name: string
      identificationType: 'ine' | 'passport' | 'license'
      identificationNumber?: string
    }>
  }>
}

export type UploadedFile = { fieldname: string; filename: string; originalname: string; mimetype: string; size: number }
type VisitRow = { id: string; booking_id: string | null; name: string; program_name: string; producer_name: string; expected_at: string; entered_at: string | null; exited_at: string | null; status: 'expected' | 'inside' | 'completed' }
type ProfileRow = {
  id: string
  full_name: string
  normalized_name: string
  identification_number: string
  normalized_identification_number: string
  person_type: 'adult' | 'minor' | 'tutor'
  first_registered_at: string
}
type DocumentRow = {
  id: string
  document_type: string
  original_name: string
  expires_at: string | null
  created_at: string
}
export type VisitDocument = {
  id: string
  name: string
  expiresAt: string | null
  status: 'valid' | 'expiring_soon' | 'expired' | 'unknown'
}
export type Visit = {
  id: string
  bookingId: string | null
  name: string
  program: string
  producer: string
  expectedAt: string
  enteredAt: string | null
  exitedAt: string | null
  status: 'expected' | 'inside' | 'completed'
  members: Array<{
    id: string
    profileId: string
    bookingGuestId: string | null
    name: string
    role: string
    personType: 'adult' | 'minor'
    programs: string[]
    identificationType: 'ine' | 'passport' | 'license' | null
    identificationNumber: string | null
    curp: string | null
    address: string | null
    documentStatus: 'valid' | 'expired' | 'missing'
    identificationFile: VisitDocument | null
    imageReleaseFile: VisitDocument | null
    tutors: Array<{
      id: string
      profileId: string
      name: string
      identificationType: 'ine' | 'passport' | 'license'
      identificationNumber: string | null
      identificationFile: VisitDocument | null
      imageReleaseFile: VisitDocument | null
    }>
  }>
}

const normalizedName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const normalizedIdentification = (value: string | undefined) => (value ?? '').normalize('NFKC').replace(/[\s.-]/g, '').toLocaleUpperCase()
const documentExpiry = (createdAt: string) => {
  const expiresAt = new Date(createdAt)
  const year = expiresAt.getUTCFullYear() + 1
  const month = expiresAt.getUTCMonth()
  const day = Math.min(expiresAt.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  expiresAt.setUTCFullYear(year, month, day)
  return expiresAt.toISOString()
}
const documentStatus = (expiresAt: string | null): VisitDocument['status'] => {
  if (!expiresAt) return 'unknown'
  const expiration = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiration)) return 'unknown'
  const remaining = expiration - Date.now()
  if (remaining <= 0) return 'expired'
  if (remaining <= 90 * 24 * 60 * 60 * 1000) return 'expiring_soon'
  return 'valid'
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

function findProfile(profileId: string | undefined, name: string, identificationNumber: string | undefined, type: ProfileRow['person_type']) {
  const normalized = normalizedName(name)
  const identity = normalizedIdentification(identificationNumber)
  if (profileId) {
    const profile = database.prepare('SELECT * FROM visitor_profiles WHERE id = ?').get(profileId) as ProfileRow | undefined
    if (!profile || profile.normalized_name !== normalized || !identity || profile.normalized_identification_number !== identity || profile.person_type !== type) return null
    return profile
  }
  if (!identity) return null
  return database.prepare(`
    SELECT * FROM visitor_profiles
    WHERE normalized_name = ? AND normalized_identification_number = ? AND person_type = ?
    ORDER BY first_registered_at, id LIMIT 1
  `).get(normalized, identity, type) as ProfileRow | undefined ?? null
}

function profileDocuments(profileId: string | null) {
  if (!profileId) return []
  const profile = database.prepare('SELECT normalized_name, normalized_identification_number, person_type FROM visitor_profiles WHERE id = ?').get(profileId) as Pick<ProfileRow, 'normalized_name' | 'normalized_identification_number' | 'person_type'> | undefined
  if (!profile) return []
  return database.prepare(`
    SELECT visitor_profile_documents.id, visitor_profile_documents.document_type,
      visitor_profile_documents.original_name, visitor_profile_documents.expires_at,
      visitor_profile_documents.created_at
    FROM visitor_profile_documents
    JOIN visitor_profiles ON visitor_profiles.id = visitor_profile_documents.profile_id
    WHERE visitor_profiles.normalized_name = ?
      AND visitor_profiles.normalized_identification_number = ?
      AND visitor_profiles.person_type = ?
      AND visitor_profile_documents.replaced_by IS NULL
    ORDER BY visitor_profile_documents.created_at DESC
  `).all(profile.normalized_name, profile.normalized_identification_number, profile.person_type) as DocumentRow[]
}

function saveArchiveDocument(
  file: UploadedFile | undefined,
  owner: { visitMemberId?: string; tutorId?: string },
  profileId: string,
  actorId: string,
  timestamp: string,
  type: 'identification' | 'image_release' | 'tutor_authorization',
) {
  if (!file) return
  const documentId = randomUUID()
  const expiresAt = type === 'image_release' || type === 'tutor_authorization' ? documentExpiry(timestamp) : null
  const profile = database.prepare('SELECT normalized_name, normalized_identification_number, person_type FROM visitor_profiles WHERE id = ?').get(profileId) as Pick<ProfileRow, 'normalized_name' | 'normalized_identification_number' | 'person_type'> | undefined
  if (!profile) throw new Error('No se encontró el expediente de la persona para guardar el documento')
  const previous = database.prepare(`
    SELECT visitor_profile_documents.id
    FROM visitor_profile_documents
    JOIN visitor_profiles ON visitor_profiles.id = visitor_profile_documents.profile_id
    WHERE visitor_profiles.normalized_name = ?
      AND visitor_profiles.normalized_identification_number = ?
      AND visitor_profiles.person_type = ?
      AND visitor_profile_documents.document_type = ?
      AND visitor_profile_documents.replaced_by IS NULL
  `).all(profile.normalized_name, profile.normalized_identification_number, profile.person_type, type) as Array<{ id: string }>
  database.prepare(`
    INSERT INTO visitor_documents (
      id, visit_member_id, tutor_id, document_type, storage_key, original_name,
      mime_type, byte_size, expires_at, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(documentId, owner.visitMemberId ?? null, owner.tutorId ?? null, type, file.filename, file.originalname, file.mimetype, file.size, expiresAt, actorId, timestamp)
  database.prepare(`
    INSERT INTO visitor_profile_documents (
      id, profile_id, document_type, storage_key, original_name, mime_type, byte_size,
      expires_at, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(documentId, profileId, type, file.filename, file.originalname, file.mimetype, file.size, expiresAt, actorId, timestamp)
  const replacePrevious = database.prepare('UPDATE visitor_profile_documents SET replaced_by = ? WHERE id = ?')
  for (const previousDocument of previous) replacePrevious.run(documentId, previousDocument.id)
}

function getDocuments(memberId: string, profileId: string | null, tutorId?: string) {
  const rows = tutorId
    ? database.prepare(`
      SELECT visitor_documents.id, visitor_documents.document_type, visitor_documents.original_name,
        COALESCE(visitor_documents.expires_at, visitor_profile_documents.expires_at) AS expires_at,
        visitor_documents.created_at
      FROM visitor_documents
      LEFT JOIN visitor_profile_documents ON visitor_profile_documents.id = visitor_documents.id
      WHERE visitor_documents.tutor_id = ? ORDER BY visitor_documents.created_at DESC
    `).all(tutorId)
    : database.prepare(`
      SELECT visitor_documents.id, visitor_documents.document_type, visitor_documents.original_name,
        COALESCE(visitor_documents.expires_at, visitor_profile_documents.expires_at) AS expires_at,
        visitor_documents.created_at
      FROM visitor_documents
      LEFT JOIN visitor_profile_documents ON visitor_profile_documents.id = visitor_documents.id
      WHERE visitor_documents.visit_member_id = ? ORDER BY visitor_documents.created_at DESC
    `).all(memberId)
  const direct = rows as DocumentRow[]
  const combined = [...direct]
  const seenTypes = new Set(direct.map((item) => item.document_type))
  for (const item of profileDocuments(profileId)) {
    if (!seenTypes.has(item.document_type)) {
      combined.push(item)
      seenTypes.add(item.document_type)
    }
  }
  return combined
}

function documentValue(documents: DocumentRow[], type: string): VisitDocument | null {
  const document = documents.find((item) => item.document_type === type)
  return document ? {
    id: document.id,
    name: document.original_name,
    expiresAt: document.expires_at,
    status: documentStatus(document.expires_at),
  } : null
}

function mapVisit(row: VisitRow): Visit {
  const members = database.prepare(`
    SELECT id, profile_id, booking_guest_id, name, role, person_type, programs_json, identification_type, identification_number,
      curp, address, document_status
    FROM visit_members WHERE visit_id = ? ORDER BY rowid
  `).all(row.id) as Array<{
    id: string; profile_id: string | null; booking_guest_id: string | null; name: string; role: string; person_type: 'adult' | 'minor'; programs_json: string
    identification_type: 'ine' | 'passport' | 'license' | null; identification_number: string | null
    curp: string | null; address: string | null; document_status: 'valid' | 'expired' | 'missing'
  }>

  return {
    id: row.id,
    bookingId: row.booking_id,
    name: row.name,
    program: row.program_name,
    producer: row.producer_name,
    expectedAt: row.expected_at,
    enteredAt: row.entered_at,
    exitedAt: row.exited_at,
    status: row.status,
    members: members.map((member) => {
      const documents = getDocuments(member.id, member.profile_id)
      const tutors = database.prepare('SELECT id, profile_id, name, identification_type, identification_number FROM visit_tutors WHERE visit_member_id = ? ORDER BY rowid').all(member.id) as Array<{
        id: string; profile_id: string | null; name: string; identification_type: 'ine' | 'passport' | 'license'; identification_number: string | null
      }>
      return {
        id: member.id,
        profileId: member.profile_id ?? '',
        bookingGuestId: member.booking_guest_id,
        name: member.name,
        role: member.role,
        personType: member.person_type,
        programs: JSON.parse(member.programs_json) as string[],
        identificationType: member.identification_type,
        identificationNumber: member.identification_number,
        curp: member.curp,
        address: member.address,
        documentStatus: member.document_status,
        identificationFile: documentValue(documents, 'identification'),
        imageReleaseFile: documentValue(documents, 'image_release'),
        tutors: tutors.map((tutor) => {
          const tutorDocs = getDocuments(member.id, tutor.profile_id, tutor.id)
          return {
            id: tutor.id,
            profileId: tutor.profile_id ?? '',
            name: tutor.name,
            identificationType: tutor.identification_type,
            identificationNumber: tutor.identification_number,
            identificationFile: documentValue(tutorDocs, 'identification'),
            imageReleaseFile: documentValue(tutorDocs, 'tutor_authorization'),
          }
        }),
      }
    }),
  }
}

function getVisit(id: string) {
  const row = database.prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow | undefined
  return row ? mapVisit(row) : null
}

export function listVisits(search: string) {
  const term = `%${search.trim().toLocaleLowerCase()}%`
  const rows = database.prepare(`
    SELECT DISTINCT visits.*
    FROM visits
    LEFT JOIN visit_members ON visit_members.visit_id = visits.id
    WHERE ? = '%%' OR lower(visits.name) LIKE ? OR lower(visits.program_name) LIKE ?
      OR lower(visits.producer_name) LIKE ? OR lower(visit_members.name) LIKE ?
    ORDER BY visits.expected_at DESC
  `).all(term, term, term, term, term) as VisitRow[]
  return rows.map(mapVisit)
}

export function createVisit(payload: VisitPayload, actorId: string, files: UploadedFile[]) {
  const uploadedByField = new Map(files.map((file) => [file.fieldname, file]))
  return transaction(() => {
    const timestamp = new Date().toISOString()
    const preparedMembers = payload.members.map((member, memberIndex) => {
      const bookedGuest = member.bookingGuestId
        ? database.prepare('SELECT name, role FROM booking_guests WHERE id = ?').get(member.bookingGuestId) as { name: string; role: string } | undefined
        : undefined
      const name = bookedGuest?.name ?? member.name.trim()
      const profile = findProfile(member.profileId, name, member.identificationNumber, member.personType)
      const personNameMatchesProfile = !member.profileId || profile !== null
      const profileDocs = profileDocuments(profile?.id ?? null)
      const identification = profileDocs.find((document) => document.document_type === 'identification')
      const imageRelease = profileDocs.find((document) => document.document_type === 'image_release')
      return {
        member,
        memberIndex,
        name,
        profile,
        personNameMatchesProfile,
        identification,
        imageRelease,
        tutors: member.tutors.map((tutor, tutorIndex) => {
          const tutorProfile = findProfile(tutor.profileId, tutor.name, tutor.identificationNumber, 'tutor')
          const tutorDocs = profileDocuments(tutorProfile?.id ?? null)
          return {
            tutor,
            tutorIndex,
            profile: tutorProfile,
            profileMatches: !tutor.profileId || tutorProfile !== null,
            identification: tutorDocs.find((document) => document.document_type === 'identification'),
            authorization: tutorDocs.find((document) => document.document_type === 'tutor_authorization'),
          }
        }),
      }
    })
    const missingDocuments: string[] = []
    for (const prepared of preparedMembers) {
      const { member, memberIndex } = prepared
      if (!prepared.personNameMatchesProfile) return { error: `Verifica el nombre y la identificación de ${prepared.name}` as const }
      if (member.personType === 'adult') {
        const identificationFile = uploadedByField.has(`members.${memberIndex}.identificationFile`)
        const releaseFile = uploadedByField.has(`members.${memberIndex}.imageReleaseFile`)
        const canReuseIdentification = prepared.identification && (!prepared.identification.expires_at || new Date(prepared.identification.expires_at) > new Date(timestamp))
        const canReuseRelease = prepared.imageRelease?.expires_at && new Date(prepared.imageRelease.expires_at) > new Date(timestamp)
        if (!identificationFile && !(member.reuseIdentification && canReuseIdentification)) missingDocuments.push(`${prepared.name}: identificación`)
        if (!releaseFile && !(member.reuseImageRelease && canReuseRelease)) missingDocuments.push(`${prepared.name}: autorización vigente de uso de imagen`)
      }
      for (const preparedTutor of prepared.tutors) {
        const { tutor, tutorIndex } = preparedTutor
        if (!preparedTutor.profileMatches) return { error: `Verifica el nombre y la identificación de ${tutor.name}` as const }
        const identificationFile = uploadedByField.has(`members.${memberIndex}.tutors.${tutorIndex}.identificationFile`)
        const authorizationFile = uploadedByField.has(`members.${memberIndex}.tutors.${tutorIndex}.imageReleaseFile`)
        const canReuseIdentification = preparedTutor.identification && (!preparedTutor.identification.expires_at || new Date(preparedTutor.identification.expires_at) > new Date(timestamp))
        const canReuseAuthorization = preparedTutor.authorization?.expires_at && new Date(preparedTutor.authorization.expires_at) > new Date(timestamp)
        if (!identificationFile && !(tutor.reuseIdentification && canReuseIdentification)) missingDocuments.push(`${tutor.name}: identificación`)
        if (!authorizationFile && !(tutor.reuseImageRelease && canReuseAuthorization)) missingDocuments.push(`${tutor.name}: autorización vigente`)
      }
    }
    if (missingDocuments.length) return { error: 'Faltan documentos obligatorios' as const, missingDocuments }

    let bookingGuests: Array<{ id: string; name: string; role: string }> = []
    let producerId: string | null = null
    if (payload.bookingId) {
      const booking = database.prepare(`
        SELECT bookings.id, bookings.status, bookings.producer_id, bookings.starts_at, programs.name AS program, users.name AS producer
        FROM bookings
        JOIN programs ON programs.id = bookings.program_id
        JOIN users ON users.id = bookings.producer_id
        WHERE bookings.id = ?
      `).get(payload.bookingId) as { id: string; status: string; producer_id: string; starts_at: string; program: string; producer: string } | undefined
      if (!booking) return { error: 'Reserva asociada no encontrada' as const }
      if (booking.status !== 'confirmed') return { error: 'Solo puedes registrar la llegada de una reserva aprobada' as const }
      if (database.prepare('SELECT id FROM visits WHERE booking_id = ?').get(payload.bookingId)) return { error: 'Esta reserva ya tiene un registro de recepción' as const }
      if (booking.program !== payload.program || booking.producer !== payload.producer) return { error: 'El programa o productor no coincide con la reserva' as const }
      if (new Date(booking.starts_at).getTime() !== new Date(payload.expectedAt).getTime()) return { error: 'La hora de llegada no coincide con la agenda aprobada' as const }
      bookingGuests = database.prepare('SELECT id, name, role FROM booking_guests WHERE booking_id = ? ORDER BY rowid').all(payload.bookingId) as typeof bookingGuests
      const requestedGuestIds = payload.members.map((member) => member.bookingGuestId).filter((id): id is string => Boolean(id))
      if (requestedGuestIds.length !== bookingGuests.length || new Set(requestedGuestIds).size !== bookingGuests.length || bookingGuests.some((guest) => !requestedGuestIds.includes(guest.id))) {
        return { error: 'La lista de invitados no coincide con la reserva aprobada' as const }
      }
      producerId = booking.producer_id
    }

    const id = randomUUID()
    database.prepare(`
      INSERT INTO visits (id, booking_id, name, program_name, producer_id, producer_name, expected_at, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'expected', ?, ?)
    `).run(id, payload.bookingId ?? null, payload.name.trim(), payload.program.trim(), producerId, payload.producer.trim(), payload.expectedAt, actorId, timestamp)

    database.prepare(`
      INSERT INTO visit_archives (visit_id, status, created_at, updated_at)
      VALUES (?, 'pending_review', ?, ?)
    `).run(id, timestamp, timestamp)

    const createProfile = (name: string, identificationNumber: string | undefined, type: ProfileRow['person_type']) => {
      const profileId = randomUUID()
      const cleanName = name.trim()
      database.prepare(`
        INSERT INTO visitor_profiles (
          id, full_name, normalized_name, identification_number, normalized_identification_number,
          person_type, first_registered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profileId, cleanName, normalizedName(cleanName), identificationNumber?.trim() ?? '',
        normalizedIdentification(identificationNumber), type, timestamp, timestamp, timestamp,
      )
      return profileId
    }

    preparedMembers.forEach((prepared) => {
      const { member, memberIndex } = prepared
      const memberId = randomUUID()
      const bookedGuest = bookingGuests.find((guest) => guest.id === member.bookingGuestId)
      const name = bookedGuest?.name ?? member.name.trim()
      const role = bookedGuest?.role ?? member.role.trim()
      const profileId = prepared.profile?.id ?? createProfile(name, member.identificationNumber, member.personType)
      database.prepare(`
        INSERT INTO visitors (id, full_name, normalized_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(memberId, name, name.normalize('NFKC').toLocaleLowerCase(), timestamp, timestamp)
      const bookingGuestId = member.bookingGuestId ?? null
      database.prepare(`
        INSERT INTO visit_members (
          id, visit_id, visitor_id, profile_id, booking_guest_id, name, role, person_type, programs_json,
          identification_type, identification_number, curp, address, document_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid')
      `).run(
        memberId, id, memberId, profileId, bookingGuestId, name, role, member.personType,
        JSON.stringify(member.programs), member.identificationType, member.identificationNumber ?? null,
        member.curp ?? null, member.address ?? null,
      )
      saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.identificationFile`), { visitMemberId: memberId }, profileId, actorId, timestamp, 'identification')
      saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.imageReleaseFile`), { visitMemberId: memberId }, profileId, actorId, timestamp, 'image_release')

      prepared.tutors.forEach(({ tutor, tutorIndex, profile: existingTutorProfile }) => {
        const tutorId = randomUUID()
        const tutorProfileId = existingTutorProfile?.id ?? createProfile(tutor.name, tutor.identificationNumber, 'tutor')
        database.prepare('INSERT INTO visit_tutors (id, visit_member_id, profile_id, name, identification_type, identification_number) VALUES (?, ?, ?, ?, ?, ?)').run(
          tutorId, memberId, tutorProfileId, tutor.name.trim(), tutor.identificationType, tutor.identificationNumber ?? null,
        )
        saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.tutors.${tutorIndex}.identificationFile`), { tutorId }, tutorProfileId, actorId, timestamp, 'identification')
        saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.tutors.${tutorIndex}.imageReleaseFile`), { tutorId }, tutorProfileId, actorId, timestamp, 'tutor_authorization')
      })
    })
    const visit = getVisit(id)
    if (!visit) throw new Error('No fue posible recuperar el registro creado')
    return { visit }
  })
}

export function updateVisit(id: string, payload: VisitPayload, actorId: string, files: UploadedFile[]) {
  const uploadedByField = new Map(files.map((file) => [file.fieldname, file]))
  return transaction(() => {
    const existing = database.prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow | undefined
    if (!existing) return { error: 'Visita no encontrada' as const }

    const existingMembers = database.prepare('SELECT id FROM visit_members WHERE visit_id = ?').all(id) as Array<{ id: string }>
    if (payload.members.length !== existingMembers.length || payload.members.some((member) => !member.id || !existingMembers.some((existingMember) => existingMember.id === member.id))) {
      return { error: 'No se pueden agregar o quitar integrantes desde la edición del registro' as const }
    }

    if (existing.booking_id && (
      payload.program !== existing.program_name
      || payload.producer !== existing.producer_name
      || new Date(payload.expectedAt).getTime() !== new Date(existing.expected_at).getTime()
    )) return { error: 'El programa, productor y horario de una solicitud aprobada no se pueden cambiar aquí' as const }

    for (const member of payload.members) {
      const memberId = member.id
      if (!memberId) return { error: 'Integrante inválido para actualizar' as const }
      const existingTutors = database.prepare('SELECT id FROM visit_tutors WHERE visit_member_id = ?').all(memberId) as Array<{ id: string }>
      if (member.tutors.length !== existingTutors.length || member.tutors.some((tutor) => !tutor.id || !existingTutors.some((existingTutor) => existingTutor.id === tutor.id))) {
        return { error: 'No se pueden agregar o quitar tutores desde la edición del registro' as const }
      }
      const existingMember = database.prepare('SELECT booking_guest_id FROM visit_members WHERE id = ? AND visit_id = ?').get(memberId, id) as { booking_guest_id: string | null } | undefined
      if (existingMember?.booking_guest_id) {
        const guest = database.prepare('SELECT name, role FROM booking_guests WHERE id = ?').get(existingMember.booking_guest_id) as { name: string; role: string } | undefined
        if (member.bookingGuestId !== existingMember.booking_guest_id || !guest || member.name !== guest.name || member.role !== guest.role) {
          return { error: 'Los nombres de invitados ligados a una solicitud aprobada no se pueden cambiar' as const }
        }
      }
    }

    database.prepare('UPDATE visits SET name = ?, program_name = ?, producer_name = ?, expected_at = ? WHERE id = ?').run(
      payload.name.trim(), payload.program.trim(), payload.producer.trim(), payload.expectedAt, id,
    )
    const timestamp = new Date().toISOString()
    for (const [memberIndex, member] of payload.members.entries()) {
      const memberId = member.id
      if (!memberId) throw new Error('Integrante inválido después de validar el registro')
      const currentMember = database.prepare('SELECT id, profile_id FROM visit_members WHERE id = ? AND visit_id = ?').get(memberId, id) as { id: string; profile_id: string | null } | undefined
      if (!currentMember) return { error: 'Un integrante no pertenece a este registro' as const }
      database.prepare(`
        UPDATE visit_members
        SET name = ?, role = ?, person_type = ?, programs_json = ?, identification_type = ?,
          identification_number = ?, curp = ?, address = ?
        WHERE id = ? AND visit_id = ?
      `).run(member.name.trim(), member.role.trim(), member.personType, JSON.stringify(member.programs),
        member.identificationType, member.identificationNumber ?? null, member.curp ?? null, member.address ?? null, memberId, id)
      database.prepare('UPDATE visitors SET full_name = ?, normalized_name = ?, updated_at = ? WHERE id = ?').run(
        member.name.trim(), normalizedName(member.name), timestamp, memberId,
      )
      if (currentMember.profile_id) {
        saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.identificationFile`), { visitMemberId: memberId }, currentMember.profile_id, actorId, timestamp, 'identification')
        saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.imageReleaseFile`), { visitMemberId: memberId }, currentMember.profile_id, actorId, timestamp, 'image_release')
      }
      for (const [tutorIndex, tutor] of member.tutors.entries()) {
        database.prepare('UPDATE visit_tutors SET name = ?, identification_type = ?, identification_number = ? WHERE id = ? AND visit_member_id = ?')
          .run(tutor.name.trim(), tutor.identificationType, tutor.identificationNumber ?? null, tutor.id!, memberId)
        const currentTutor = database.prepare('SELECT profile_id FROM visit_tutors WHERE id = ? AND visit_member_id = ?').get(tutor.id!, memberId) as { profile_id: string | null } | undefined
        if (currentTutor?.profile_id) {
          const tutorId = tutor.id!
          saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.tutors.${tutorIndex}.identificationFile`), { tutorId }, currentTutor.profile_id, actorId, timestamp, 'identification')
          saveArchiveDocument(uploadedByField.get(`members.${memberIndex}.tutors.${tutorIndex}.imageReleaseFile`), { tutorId }, currentTutor.profile_id, actorId, timestamp, 'tutor_authorization')
        }
      }
    }
    database.prepare(`
      UPDATE visit_archives
      SET status = 'needs_update', reviewed_by = NULL, reviewed_at = NULL, downloaded_at = NULL, updated_at = ?
      WHERE visit_id = ?
    `).run(timestamp, id)
    const visit = getVisit(id)
    if (!visit) throw new Error('No fue posible recuperar la visita actualizada')
    return { visit }
  })
}

export function updateVisitStatus(id: string, status: 'inside' | 'completed') {
  const visit = database.prepare('SELECT id, name, program_name, producer_id, status FROM visits WHERE id = ?').get(id) as {
    id: string; name: string; program_name: string; producer_id: string | null; status: string
  } | undefined
  if (!visit) return { error: 'Visita no encontrada' as const }
  if (status === 'inside' && visit.status !== 'expected') return { error: 'La visita no está pendiente de entrada' as const }
  if (status === 'completed' && visit.status !== 'inside') return { error: 'La visita no tiene una entrada activa' as const }

  const timestamp = new Date().toISOString()
  if (status === 'inside') {
    database.prepare("UPDATE visits SET status = 'inside', entered_at = ? WHERE id = ?").run(timestamp, id)
    database.prepare(`
      INSERT INTO notifications (id, recipient_role, recipient_user_id, title, detail, created_at)
      VALUES (?, 'producer', ?, 'Invitados llegaron a Recepción', ?, ?)
    `).run(randomUUID(), visit.producer_id, `${visit.name} llegó para ${visit.program_name}.`, timestamp)
  } else {
    database.prepare("UPDATE visits SET status = 'completed', exited_at = ? WHERE id = ?").run(timestamp, id)
  }
  const updated = getVisit(id)
  if (!updated) throw new Error('No fue posible recuperar la visita actualizada')
  return { visit: updated }
}

export type PersonArchiveMatch = {
  profileId: string
  name: string
  identificationNumberMasked: string
  identificationMatches: boolean
  identificationAvailable: boolean
  imageReleaseStatus: VisitDocument['status']
  imageReleaseExpiresAt: string | null
  firstRegisteredAt: string
}

export function lookupPeople(name: string, identificationNumber: string, personType: 'adult' | 'tutor') {
  const queryName = normalizedName(name)
  if (queryName.length < 4) return []
  const profiles = database.prepare(`
    SELECT * FROM visitor_profiles
    WHERE normalized_name = ? AND person_type = ?
    ORDER BY first_registered_at, id
  `).all(queryName, personType) as ProfileRow[]
  const identity = normalizedIdentification(identificationNumber)
  const grouped = new Map<string, ProfileRow>()
  for (const profile of profiles) {
    const key = profile.normalized_identification_number || profile.id
    if (!grouped.has(key)) grouped.set(key, profile)
  }
  return Array.from(grouped.values()).map((profile): PersonArchiveMatch => {
    const documents = profileDocuments(profile.id)
    const identification = documents.find((document) => document.document_type === 'identification')
    const release = documents.find((document) => document.document_type === (personType === 'adult' ? 'image_release' : 'tutor_authorization'))
    const validIdentification = Boolean(identification && (!identification.expires_at || new Date(identification.expires_at) > new Date()))
    const releaseStatus = release ? documentStatus(release.expires_at) : 'unknown'
    return {
      profileId: profile.id,
      name: profile.full_name,
      identificationNumberMasked: profile.identification_number ? `•••• ${profile.identification_number.slice(-4)}` : 'Sin identificación registrada',
      identificationMatches: Boolean(identity) && profile.normalized_identification_number === identity,
      identificationAvailable: validIdentification,
      imageReleaseStatus: release ? releaseStatus : 'unknown',
      imageReleaseExpiresAt: release?.expires_at ?? null,
      firstRegisteredAt: profile.first_registered_at,
    }
  })
}

export type ArchiveStatus = 'pending_review' | 'needs_update' | 'ready_to_download' | 'pending_onedrive' | 'archived'
export type VisitArchive = {
  visit: Visit
  status: ArchiveStatus
  reviewedAt: string | null
  downloadedAt: string | null
  uploadedAt: string | null
}

function archiveEntry(visit: Visit): VisitArchive | null {
  const row = database.prepare('SELECT status, reviewed_at, downloaded_at, uploaded_at FROM visit_archives WHERE visit_id = ?').get(visit.id) as {
    status: ArchiveStatus; reviewed_at: string | null; downloaded_at: string | null; uploaded_at: string | null
  } | undefined
  if (!row) return null
  return { visit, status: row.status, reviewedAt: row.reviewed_at, downloadedAt: row.downloaded_at, uploadedAt: row.uploaded_at }
}

export function getVisitArchive(id: string) {
  const visit = listVisits('').find((item) => item.id === id)
  return visit ? archiveEntry(visit) : null
}

export function listVisitArchives(view: 'pending' | 'archived', search: string) {
  const term = normalizedName(search)
  const statuses = view === 'archived' ? ['archived'] : ['pending_review', 'needs_update', 'ready_to_download', 'pending_onedrive']
  return listVisits('').filter((visit) => {
    if (term && ![
      visit.name,
      visit.program,
      visit.producer,
      ...visit.members.flatMap((member) => [member.name, ...member.tutors.map((tutor) => tutor.name)]),
    ].some((value) => normalizedName(value).includes(term))) return false
    const entry = archiveEntry(visit)
    return entry !== null && statuses.includes(entry.status)
  }).map((visit) => archiveEntry(visit)).filter((entry): entry is VisitArchive => entry !== null)
    .sort((left, right) => right.visit.expectedAt.localeCompare(left.visit.expectedAt))
}

function missingArchiveDocuments(visit: Visit) {
  const missing: string[] = []
  for (const member of visit.members) {
    if (member.personType === 'adult') {
      if (!member.identificationFile || member.identificationFile.status === 'expired') missing.push(`${member.name}: identificación`)
      if (!member.imageReleaseFile || ['expired', 'unknown'].includes(member.imageReleaseFile.status ?? 'unknown')) missing.push(`${member.name}: autorización de imagen`)
    }
    for (const tutor of member.tutors) {
      if (!tutor.identificationFile || tutor.identificationFile.status === 'expired') missing.push(`${tutor.name}: identificación`)
      if (!tutor.imageReleaseFile || ['expired', 'unknown'].includes(tutor.imageReleaseFile.status ?? 'unknown')) missing.push(`${tutor.name}: autorización`)
    }
  }
  return missing
}

export function reviewVisitArchive(id: string, actorId: string) {
  const entry = getVisitArchive(id)
  if (!entry) return { error: 'Expediente no encontrado' as const }
  if (!['pending_review', 'needs_update'].includes(entry.status)) return { error: 'El expediente no está pendiente de revisión' as const }
  const missingDocuments = missingArchiveDocuments(entry.visit)
  const timestamp = new Date().toISOString()
  if (missingDocuments.length) {
    database.prepare(`
      UPDATE visit_archives SET status = 'needs_update', reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE visit_id = ?
    `).run(actorId, timestamp, timestamp, id)
    return { error: 'El expediente requiere documentos vigentes antes de aprobar la revisión' as const, missingDocuments }
  }
  database.prepare(`
    UPDATE visit_archives SET status = 'ready_to_download', reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE visit_id = ?
  `).run(actorId, timestamp, timestamp, id)
  return { archive: getVisitArchive(id) }
}

export function markVisitArchiveDownloaded(id: string) {
  const entry = getVisitArchive(id)
  if (!entry) return { error: 'Expediente no encontrado' as const }
  if (!['ready_to_download', 'pending_onedrive'].includes(entry.status)) return { error: 'Revisa el expediente antes de descargarlo' as const }
  const timestamp = new Date().toISOString()
  database.prepare(`
    UPDATE visit_archives SET status = 'pending_onedrive', downloaded_at = ?, updated_at = ?
    WHERE visit_id = ?
  `).run(timestamp, timestamp, id)
  return { archive: getVisitArchive(id) }
}

export function confirmVisitArchiveUpload(id: string, actorId: string) {
  const entry = getVisitArchive(id)
  if (!entry) return { error: 'Expediente no encontrado' as const }
  if (entry.status !== 'pending_onedrive') return { error: 'Descarga primero el expediente revisado' as const }
  const timestamp = new Date().toISOString()
  database.prepare(`
    UPDATE visit_archives SET status = 'archived', uploaded_by = ?, uploaded_at = ?, updated_at = ?
    WHERE visit_id = ?
  `).run(actorId, timestamp, timestamp, id)
  return { archive: getVisitArchive(id) }
}

export function getDocument(id: string) {
  return database.prepare(`
    SELECT storage_key, original_name, mime_type FROM visitor_profile_documents WHERE id = ?
    UNION ALL
    SELECT storage_key, original_name, mime_type FROM visitor_documents
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM visitor_profile_documents WHERE id = ?)
    LIMIT 1
  `).get(id, id, id) as {
    storage_key: string; original_name: string; mime_type: string
  } | undefined
}
