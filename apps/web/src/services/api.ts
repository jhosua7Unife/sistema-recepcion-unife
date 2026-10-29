export type DashboardData = {
  metrics: {
    visitorsInside: number
    expectedGroups: number
    completedVisitsToday: number
    todayBookings: number
    pendingBookingReviews: number
    unreadNotifications: number
  }
  visits: Array<{
    id: string
    name: string
    program: string
    producer: string
    expectedAt: string
    status: 'expected' | 'inside' | 'completed'
    members: Array<{ id: string; profileId: string; name: string; role: string; personType: 'adult' | 'minor'; programs: string[]; identificationType: 'ine' | 'passport' | 'license' | null; identificationNumber: string | null; curp: string | null; address: string | null; documentStatus: 'valid' | 'expired' | 'missing'; identificationFile: DocumentReference | null; imageReleaseFile: DocumentReference | null; tutors: Array<{ id: string; profileId: string; name: string; identificationType: 'ine' | 'passport' | 'license'; identificationNumber: string | null; identificationFile: DocumentReference | null; imageReleaseFile: DocumentReference | null }> }>
  }>
  bookings: Array<Omit<Booking, 'guests'>>
  notifications: Array<{ id: string; title: string; detail: string; createdAt: string; read: boolean }>
}

export type Booking = {
  id: string
  resource: 'Foro 1' | 'Foro 2' | 'Croma' | 'Locación'
  program: string
  programId: string
  producer: string
  producerId: string
  startsAt: string
  endsAt: string
  status: 'confirmed' | 'pending' | 'rejected' | 'cancelled'
  locationName: string | null
  locationAddress: string | null
  notes: string | null
  services: { makeup: boolean; cameras: boolean; vehicle: boolean }
  requestedBy: string
  cancellationReason: string | null
  guests: Array<{ id: string; name: string; role: string }>
}

export type Visit = {
  id: string
  bookingId: string | null
  name: string
  program: string
  producer: string
  expectedAt: string
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
    identificationFile: DocumentReference | null
    imageReleaseFile: DocumentReference | null
    tutors: Array<{
      id: string
      profileId: string
      name: string
      identificationType: 'ine' | 'passport' | 'license'
      identificationNumber: string | null
      identificationFile: DocumentReference | null
      imageReleaseFile: DocumentReference | null
    }>
  }>
}
export type DocumentReference = { id: string; name: string; expiresAt?: string | null; status?: 'valid' | 'expiring_soon' | 'expired' | 'unknown' }
export type PersonArchiveMatch = {
  profileId: string
  name: string
  identificationNumberMasked: string
  identificationMatches: boolean
  identificationAvailable: boolean
  imageReleaseStatus: 'valid' | 'expiring_soon' | 'expired' | 'unknown'
  imageReleaseExpiresAt: string | null
  firstRegisteredAt: string
}
export type VisitArchive = {
  visit: Visit
  status: 'pending_review' | 'needs_update' | 'ready_to_download' | 'pending_onedrive' | 'archived'
  reviewedAt: string | null
  downloadedAt: string | null
  uploadedAt: string | null
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export type Notification = DashboardData['notifications'][number]
export type Message = { id: string; senderId: string; senderName: string; senderRole: 'reception' | 'producer' | 'supervisor'; recipientRole: 'reception' | 'producer' | 'supervisor'; subject: string; body: string; createdAt: string; read: boolean }
export type User = { id: string; name: string; email: string; role: 'reception' | 'producer' | 'supervisor'; avatarId: string }
export type Avatar = { id: string; name: string; color: string; accent: string }
export type Program = { id: string; name: string; producer: string; producerId: string; category: 'unife' | 'church' }

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function getDashboard(): Promise<DashboardData> {
  return apiRequest<DashboardData>('/api/dashboard')
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('unife_token')
  const headers = new Headers(options?.headers)
  if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error de comunicación con la API' })) as { message?: string }
    throw new ApiError(error.message ?? 'Error de comunicación con la API', response.status)
  }
  return response.json() as Promise<T>
}

export async function getCurrentUser(): Promise<User> {
  const result = await apiRequest<{ user: User }>('/api/auth/me')
  return result.user
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  localStorage.setItem('unife_token', result.token)
  return result
}

export function getUsers(): Promise<User[]> { return apiRequest<User[]>('/api/users') }
export function getAvatars(): Promise<Avatar[]> { return apiRequest<Avatar[]>('/api/users/avatars') }
export function createUser(payload: { name: string; email: string; role: User['role']; password: string; avatarId: string }): Promise<{ user: User }> { return apiRequest<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateUser(id: string, payload: Partial<{ name: string; email: string; role: User['role']; password: string; avatarId: string }>): Promise<{ user: User }> { return apiRequest<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteUser(id: string): Promise<{ success: boolean }> { return apiRequest<{ success: boolean }>(`/api/users/${id}`, { method: 'DELETE' }) }
export function getPrograms(): Promise<Program[]> { return apiRequest<Program[]>('/api/programs') }
export function createProgram(payload: Omit<Program, 'id' | 'producerId'>): Promise<Program> { return apiRequest<Program>('/api/programs', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateProgram(id: string, payload: Omit<Program, 'id' | 'producerId'>): Promise<Program> { return apiRequest<Program>(`/api/programs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteProgram(id: string): Promise<{ success: boolean }> { return apiRequest<{ success: boolean }>(`/api/programs/${id}`, { method: 'DELETE' }) }

export function getVisits(search = ''): Promise<Visit[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiRequest<Visit[]>(`/api/visits${query}`)
}

export function lookupReceptionPerson(name: string, identificationNumber: string, personType: 'adult' | 'tutor'): Promise<PersonArchiveMatch[]> {
  return apiRequest<PersonArchiveMatch[]>('/api/reception/people/lookup', {
    method: 'POST',
    body: JSON.stringify({ name, identificationNumber, personType }),
  })
}

export function getReceptionArchive(view: 'pending' | 'archived', search = ''): Promise<VisitArchive[]> {
  const query = new URLSearchParams({ view, search })
  return apiRequest<VisitArchive[]>(`/api/reception/archive?${query}`)
}

export function reviewReceptionArchive(id: string): Promise<VisitArchive> {
  return apiRequest<VisitArchive>(`/api/reception/archive/${encodeURIComponent(id)}/review`, { method: 'PATCH' })
}

export function completeReceptionArchive(id: string): Promise<VisitArchive> {
  return apiRequest<VisitArchive>(`/api/reception/archive/${encodeURIComponent(id)}/complete`, { method: 'PATCH' })
}

async function getReceptionArchiveFile(id: string, file: 'pdf' | 'download') {
  const token = localStorage.getItem('unife_token')
  const response = await fetch(`${apiUrl}/api/reception/archive/${encodeURIComponent(id)}/${file}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'No se pudo descargar el expediente' })) as { message?: string }
    throw new ApiError(error.message ?? 'No se pudo descargar el expediente', response.status)
  }
  return response.blob()
}

export function getReceptionArchivePdf(id: string): Promise<Blob> {
  return getReceptionArchiveFile(id, 'pdf')
}

export function downloadReceptionArchive(id: string): Promise<Blob> {
  return getReceptionArchiveFile(id, 'download')
}

export function createVisit(payload: { bookingId?: string; name: string; program: string; producer: string; expectedAt: string; members: Array<Record<string, unknown>> }): Promise<Visit> {
  const formData = new FormData()
  const { files, ...data } = payload as { files?: Record<string, File | undefined>; [key: string]: unknown }
  formData.append('payload', JSON.stringify(data))
  Object.entries(files ?? {}).forEach(([field, file]) => { if (file) formData.append(field, file) })
  return apiRequest<Visit>('/api/visits', { method: 'POST', body: formData, headers: undefined })
}

export function updateVisit(id: string, payload: { name: string; program: string; producer: string; expectedAt: string; members: Array<Record<string, unknown>> }): Promise<Visit> {
  const formData = new FormData()
  const { files, ...data } = payload as { files?: Record<string, File | undefined>; [key: string]: unknown }
  formData.append('payload', JSON.stringify(data))
  Object.entries(files ?? {}).forEach(([field, file]) => { if (file) formData.append(field, file) })
  return apiRequest<Visit>(`/api/visits/${encodeURIComponent(id)}`, { method: 'PATCH', body: formData, headers: undefined })
}

export async function getDocumentBlob(id: string): Promise<Blob> {
  const token = localStorage.getItem('unife_token')
  const response = await fetch(`${apiUrl}/api/documents/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'No se pudo abrir el documento' })) as { message?: string }
    throw new ApiError(error.message ?? 'No se pudo abrir el documento', response.status)
  }
  return response.blob()
}

export function registerEntry(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/api/visits/${id}/entry`, { method: 'POST' })
}

export function registerExit(id: string): Promise<Visit> {
  return apiRequest<Visit>(`/api/visits/${id}/exit`, { method: 'POST' })
}

export function getBookings(): Promise<Booking[]> {
  return apiRequest<Booking[]>('/api/bookings')
}

export function createBooking(payload: { resource: Booking['resource']; programId: string; startsAt: string; endsAt: string; locationName?: string; locationAddress?: string; notes?: string; services: { makeup: boolean; cameras: boolean; vehicle: boolean }; guests: Array<{ name: string; role: string }> }): Promise<Booking> {
  return apiRequest<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
}

export function cancelBooking(id: string, reason: string): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}

export function approveBooking(id: string): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${id}/approve`, { method: 'PATCH' })
}

export function rejectBooking(id: string): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${id}/reject`, { method: 'PATCH' })
}

export function getNotifications(): Promise<Notification[]> {
  return apiRequest<Notification[]>('/api/notifications')
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest<Notification>(`/api/notifications/${id}/read`, { method: 'PATCH' })
}

export function getMessages(): Promise<Message[]> {
  return apiRequest<Message[]>('/api/messages')
}

export function sendMessage(payload: { recipientRole: Message['recipientRole']; subject: string; body: string }): Promise<Message> {
  return apiRequest<Message>('/api/messages', { method: 'POST', body: JSON.stringify(payload) })
}

export function markMessageRead(id: string): Promise<Message> {
  return apiRequest<Message>(`/api/messages/${id}/read`, { method: 'PATCH' })
}
