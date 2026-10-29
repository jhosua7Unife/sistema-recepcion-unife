export type VisitStatus = 'expected' | 'inside' | 'completed'
export type BookingStatus = 'confirmed' | 'pending' | 'cancelled'

export type Visitor = {
  id: string
  name: string
  role: string
  personType: 'adult' | 'minor'
  programs: string[]
  identificationType: 'ine' | 'passport' | 'license' | null
  identificationNumber: string | null
  curp: string | null
  address: string | null
  documentStatus: 'valid' | 'expired' | 'missing'
  identificationFile: string | null
  imageReleaseFile: string | null
  tutors: Tutor[]
}

export type Tutor = {
  id: string
  name: string
  identificationType: 'ine' | 'passport' | 'license'
  identificationNumber: string | null
  identificationFile: string | null
  imageReleaseFile: string | null
}

export type VisitGroup = {
  id: string
  name: string
  program: string
  producer: string
  expectedAt: string
  enteredAt: string | null
  exitedAt: string | null
  status: VisitStatus
  members: Visitor[]
}

export type Booking = {
  id: string
  resource: 'Foro 1' | 'Foro 2' | 'Croma' | 'Locación'
  program: string
  producer: string
  startsAt: string
  endsAt: string
  status: BookingStatus
  locationName: string | null
  locationAddress: string | null
  notes: string | null
  services: { makeup: boolean; cameras: boolean; vehicle: boolean }
  requestedBy: string | null
  cancellationReason: string | null
}

export type Notification = {
  id: string
  title: string
  detail: string
  createdAt: string
  read: boolean
}

export type Message = {
  id: string
  senderId: string
  senderName: string
  senderRole: 'reception' | 'producer' | 'supervisor'
  recipientRole: 'reception' | 'producer' | 'supervisor'
  subject: string
  body: string
  createdAt: string
  read: boolean
}

export const visits: VisitGroup[] = [
  {
    id: 'visit-001', name: 'Equipo Horizonte', program: 'Noticias UNIFE', producer: 'Mariana Torres',
    expectedAt: '2026-09-21T09:30:00-06:00', enteredAt: '2026-09-21T09:42:00-06:00', exitedAt: null, status: 'inside',
    members: [
      { id: 'visitor-001', name: 'Laura Méndez', role: 'Cantante', personType: 'adult', programs: ['Noticias UNIFE'], identificationType: 'ine', identificationNumber: 'MELAL900101', curp: 'MELAL900101MDFNRA01', address: 'Ciudad de México', documentStatus: 'valid', identificationFile: 'laura-ine.pdf', imageReleaseFile: 'laura-carta.pdf', tutors: [] },
      { id: 'visitor-002', name: 'Diego Ruiz', role: 'Músico', personType: 'adult', programs: ['Noticias UNIFE'], identificationType: 'passport', identificationNumber: 'G12345678', curp: null, address: null, documentStatus: 'valid', identificationFile: 'diego-pasaporte.pdf', imageReleaseFile: 'diego-carta.pdf', tutors: [] },
    ],
  },
  {
    id: 'visit-002', name: 'Especialistas en salud', program: 'Vive Mejor', producer: 'Jorge Salas',
    expectedAt: '2026-09-21T11:00:00-06:00', enteredAt: null, exitedAt: null, status: 'expected',
    members: [{ id: 'visitor-003', name: 'Dra. Elena Vargas', role: 'Especialista', personType: 'adult', programs: ['Vive Mejor'], identificationType: 'license', identificationNumber: 'LIC-7788', curp: null, address: null, documentStatus: 'expired', identificationFile: 'elena-licencia.pdf', imageReleaseFile: null, tutors: [] }],
  },
]

export const bookings: Booking[] = [
  { id: 'booking-001', resource: 'Foro 1', program: 'Noticias UNIFE', producer: 'Mariana Torres', startsAt: '2026-09-21T10:00:00-06:00', endsAt: '2026-09-21T12:00:00-06:00', status: 'confirmed', locationName: null, locationAddress: null, notes: null, services: { makeup: true, cameras: true, vehicle: false }, requestedBy: 'user-producer', cancellationReason: null },
  { id: 'booking-002', resource: 'Croma', program: 'Vive Mejor', producer: 'Jorge Salas', startsAt: '2026-09-21T13:00:00-06:00', endsAt: '2026-09-21T14:30:00-06:00', status: 'pending', locationName: null, locationAddress: null, notes: null, services: { makeup: false, cameras: true, vehicle: false }, requestedBy: 'user-producer', cancellationReason: null },
  { id: 'booking-003', resource: 'Foro 2', program: 'Conversaciones', producer: 'Ana Gómez', startsAt: '2026-09-22T09:00:00-06:00', endsAt: '2026-09-22T11:00:00-06:00', status: 'confirmed', locationName: null, locationAddress: null, notes: null, services: { makeup: false, cameras: false, vehicle: false }, requestedBy: 'user-producer', cancellationReason: null },
]

export const notifications: Notification[] = [
  { id: 'notification-001', title: 'Grupo dentro de UNIFE', detail: 'Equipo Horizonte llegó para Noticias UNIFE.', createdAt: '2026-09-21T09:42:00-06:00', read: false },
  { id: 'notification-002', title: 'Reserva pendiente', detail: 'La solicitud de Croma requiere confirmación.', createdAt: '2026-09-21T08:15:00-06:00', read: false },
]

export const messages: Message[] = [
  { id: 'message-001', senderId: 'user-reception', senderName: 'Recepción Demo', senderRole: 'reception', recipientRole: 'supervisor', subject: 'Documentación pendiente', body: 'El grupo de Vive Mejor llegó con una carta vencida. ¿Desean reprogramar?', createdAt: '2026-09-21T09:50:00-06:00', read: false },
]