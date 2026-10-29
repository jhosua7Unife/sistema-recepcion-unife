import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { approveBooking, cancelBooking, createBooking, getBookings, getPrograms, rejectBooking, type Booking } from '../../services/api'
import { FormNotice } from '../../components/ui/FormNotice'
import formStyles from '../../styles/FormStyles.module.css'
import styles from './Agenda.module.css'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const resources = ['Foro 1', 'Foro 2', 'Croma', 'Locación'] as const
const formatTime = (value: string) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
const mexicoDateKey = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(value))
const hourDecimal = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(value))
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) + Number(parts.find((part) => part.type === 'minute')?.value ?? 0) / 60
}
type GuestInput = { name: string; role: string }
const maxGuests = 50
type BookingForm = {
  resource: Booking['resource']
  programId: string
  startsAt: string
  endsAt: string
  locationName: string
  locationAddress: string
  notes: string
  services: { makeup: boolean; cameras: boolean; vehicle: boolean }
}

const initialBookingForm = (): BookingForm => ({
  resource: 'Foro 1',
  programId: '',
  startsAt: `${today}T09:00`,
  endsAt: `${today}T10:00`,
  locationName: '',
  locationAddress: '',
  notes: '',
  services: { makeup: false, cameras: false, vehicle: false },
})

export function Agenda({ role }: { role: 'reception' | 'producer' | 'supervisor' }) {
  const client = useQueryClient()
  const [date, setDate] = useState(today)
  const [resource, setResource] = useState('all')
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [detailTarget, setDetailTarget] = useState<Booking | null>(null)
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [form, setForm] = useState<BookingForm>(initialBookingForm)
  const [guests, setGuests] = useState<GuestInput[]>([{ name: '', role: '' }])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['bookings'], queryFn: getBookings, retry: false })
  const programsQuery = useQuery({ queryKey: ['programs'], queryFn: getPrograms, enabled: role === 'producer', retry: false })
  const bookings = query.data ?? []
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelBooking(id, reason),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['bookings'] })
      setCancelTarget(null)
      setMessage('Cancelación registrada con su motivo.')
      setError('')
    },
    onError: (cause) => setError(cause.message),
  })
  const reviewMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => approve ? approveBooking(id) : rejectBooking(id),
    onSuccess: async (booking, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['bookings'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ])
      setMessage(variables.approve
        ? `Se aprobó la solicitud de ${booking.program}.`
        : `Se rechazó la solicitud de ${booking.program}.`)
      setError('')
    },
    onError: (cause) => setError(cause.message),
  })
  const createMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['bookings'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['notifications'] }),
      ])
      setShowBookingForm(false)
      setForm(initialBookingForm())
      setGuests([{ name: '', role: '' }])
      setMessage('Solicitud enviada al supervisor para aprobación.')
      setError('')
    },
    onError: (cause) => setError(cause.message),
  })
  const visible = bookings.filter((booking) => mexicoDateKey(booking.startsAt) === date && (resource === 'all' || booking.resource === resource))

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    const startsAt = new Date(form.startsAt)
    const endsAt = new Date(form.endsAt)
    if (endsAt <= startsAt) {
      setError('La hora final debe ser posterior a la inicial.')
      return
    }
    if (guests.some((guest) => guest.name.trim().length < 2 || guest.role.trim().length < 2)) {
      setError('Completa el nombre y la actividad de cada invitado.')
      return
    }
    createMutation.mutate({
      resource: form.resource,
      programId: form.programId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      locationName: form.locationName.trim() || undefined,
      locationAddress: form.locationAddress.trim() || undefined,
      notes: form.notes.trim() || undefined,
      services: form.services,
      guests: guests.map(({ name, role: guestRole }) => ({ name: name.trim(), role: guestRole.trim() })),
    })
  }

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Producción y espacios</p><h1 className={styles.heading}>Agenda</h1><p className={styles.description}>{role === 'reception' ? 'Consulta la agenda y el cronograma sin modificar reservas.' : role === 'producer' ? 'Solicita espacios y agenda a tus invitados para aprobación.' : 'Revisa y responde las solicitudes de agenda de producción.'}</p></div>
      {role === 'producer' && <button className={styles.primaryButton} type="button" onClick={() => { setError(''); setMessage(''); setForm(initialBookingForm()); setGuests([{ name: '', role: '' }]); setShowBookingForm(true) }}><Plus size={16} /> Nueva solicitud</button>}
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <FormNotice message={message} onDismiss={() => setMessage('')} />}
    <div className={`${styles.panel} ${styles.toolbar}`}><label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Recurso<select value={resource} onChange={(event) => setResource(event.target.value)}><option value="all">Todos los recursos</option>{resources.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className={styles.filterButton} type="button" onClick={() => { setDate(today); setResource('all') }}>Ver día actual</button></div>
    <Timeline bookings={visible} />
    <div className={`${styles.panel} ${styles.tableWrap}`}>
      {query.isLoading ? <p className={styles.loading}>Cargando agenda...</p> : query.isError ? <p className={styles.error}>No fue posible cargar la agenda.</p> : visible.length === 0 ? <p className={styles.empty}>No hay reservas para los filtros seleccionados.</p> : <table className={styles.table}><thead><tr><th>Horario</th><th>Recurso</th><th>Programa e invitados</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visible.map((booking) => <tr key={booking.id}>
        <td>{formatTime(booking.startsAt)} - {formatTime(booking.endsAt)}<p className={styles.meta}>{formatDate(booking.startsAt)}</p></td>
        <td>{booking.resource}{booking.locationName ? ` · ${booking.locationName}` : ''}</td>
        <td><p className={styles.program}>{booking.program}</p><p className={styles.meta}>{booking.producer}</p><p className={styles.meta}>{booking.guests.map((guest) => guest.name).join(', ')}</p></td>
        <td><span className={`${styles.status} ${styles[booking.status]}`}>{booking.status === 'confirmed' ? 'Confirmada' : booking.status === 'pending' ? 'Pendiente' : booking.status === 'rejected' ? 'Rechazada' : 'Cancelada'}</span></td>
        <td>{role === 'producer' && booking.status !== 'cancelled' && booking.status !== 'rejected' && <button className={styles.dangerButton} type="button" onClick={() => setCancelTarget(booking)}>Cancelar</button>}{role === 'supervisor' && <div className={styles.actions}><button className={styles.detailButton} type="button" onClick={() => setDetailTarget(booking)}><Eye size={13} /> Ver solicitud</button>{booking.status === 'pending' && <><button className={styles.approveButton} type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: booking.id, approve: true })}>Aceptar</button><button className={styles.dangerButton} type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: booking.id, approve: false })}>Rechazar</button></>}</div>}{role === 'reception' && <span className={styles.meta}>Solo lectura</span>}</td>
      </tr>)}</tbody></table>}
    </div>
    {cancelTarget && <CancelModal booking={cancelTarget} submitting={cancelMutation.isPending} onClose={() => setCancelTarget(null)} onSubmit={(reason) => cancelMutation.mutate({ id: cancelTarget.id, reason })} />}
    {detailTarget && <BookingDetailsModal booking={detailTarget} onClose={() => setDetailTarget(null)} />}
    {showBookingForm && <BookingModal form={form} setForm={setForm} guests={guests} setGuests={setGuests} programs={programsQuery.data ?? []} programsLoading={programsQuery.isLoading} programsError={programsQuery.isError} submitting={createMutation.isPending} error={createMutation.error?.message} onClose={() => setShowBookingForm(false)} onSubmit={submitBooking} />}
  </section>
}

function BookingDetailsModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const services = [
    booking.services.makeup && 'Maquillaje',
    booking.services.cameras && 'Cámaras',
    booking.services.vehicle && 'Vehículo',
  ].filter(Boolean)
  return <div className={formStyles.backdrop}><div className={`${formStyles.modal} ${formStyles.modalCompact}`} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
    <div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Revisión de agenda</p><h2 className={formStyles.title} id="booking-detail-title">Solicitud de {booking.program}</h2><p className={formStyles.description}>Revisa los datos y los invitados antes de responder.</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
    <div className={styles.detailContent}>
      <dl className={styles.detailGrid}>
        <div><dt>Productor</dt><dd>{booking.producer}</dd></div>
        <div><dt>Espacio</dt><dd>{booking.resource}{booking.locationName ? ` · ${booking.locationName}` : ''}</dd></div>
        <div><dt>Fecha</dt><dd>{formatDate(booking.startsAt)}</dd></div>
        <div><dt>Horario</dt><dd>{formatTime(booking.startsAt)} - {formatTime(booking.endsAt)}</dd></div>
        {booking.locationAddress && <div className={styles.detailWide}><dt>Dirección</dt><dd>{booking.locationAddress}</dd></div>}
        <div className={styles.detailWide}><dt>Servicios solicitados</dt><dd>{services.length ? services.join(', ') : 'Ninguno'}</dd></div>
        <div className={styles.detailWide}><dt>Notas para supervisión</dt><dd>{booking.notes || 'Sin notas adicionales'}</dd></div>
      </dl>
      <div><h3 className={styles.detailHeading}>Invitados ({booking.guests.length})</h3><ul className={styles.guestList}>{booking.guests.map((guest) => <li key={guest.id}><strong>{guest.name}</strong><span>{guest.role}</span></li>)}</ul></div>
    </div>
    <div className={formStyles.footer}><button className={formStyles.primaryButton} type="button" onClick={onClose}>Cerrar</button></div>
  </div></div>
}

function BookingModal({ form, setForm, guests, setGuests, programs, programsLoading, programsError, submitting, error, onClose, onSubmit }: {
  form: BookingForm
  setForm: (form: BookingForm) => void
  guests: GuestInput[]
  setGuests: (guests: GuestInput[]) => void
  programs: Array<{ id: string; name: string; category: 'unife' | 'church' }>
  programsLoading: boolean
  programsError: boolean
  submitting: boolean
  error?: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const update = <K extends keyof BookingForm>(key: K, value: BookingForm[K]) => setForm({ ...form, [key]: value })
  return <div className={formStyles.backdrop}><div className={formStyles.modal} role="dialog" aria-modal="true" aria-labelledby="booking-title">
    <div className={formStyles.modalHeader}>
      <div><p className={formStyles.eyebrow}>Agenda de producción</p><h2 className={formStyles.title} id="booking-title">Solicitar espacio</h2><p className={formStyles.description}>Completa los datos de la producción y agrega a todas las personas que asistirán.</p></div>
      <button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
    </div>
    <form className={styles.bookingForm} onSubmit={onSubmit}>
      <section className={styles.formSection} aria-labelledby="booking-details-title">
        <div className={styles.formSectionHeading}><span className={styles.sectionNumber}>01</span><div><h3 id="booking-details-title">Espacio y horario</h3><p>Selecciona el recurso y el tiempo que necesitas.</p></div></div>
        <div className={styles.formGrid}>
          <label className={formStyles.field}>Recurso<select required value={form.resource} onChange={(event) => update('resource', event.target.value as BookingForm['resource'])}>{resources.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={formStyles.field}>Programa<select required value={form.programId} onChange={(event) => update('programId', event.target.value)}><option value="">Selecciona un programa</option>{(['unife', 'church'] as const).map((category) => { const categoryPrograms = programs.filter((program) => program.category === category); return categoryPrograms.length > 0 && <optgroup key={category} label={category === 'unife' ? 'Programas UNIFE' : 'Programas Iglesia'}>{categoryPrograms.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</optgroup> })}</select></label>
          <label className={formStyles.field}>Fecha y hora de inicio<input type="datetime-local" required value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)} /></label>
          <label className={formStyles.field}>Fecha y hora de término<input type="datetime-local" required value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)} /></label>
          {form.resource === 'Locación' && <><label className={formStyles.field}>Nombre de la locación<input required value={form.locationName} onChange={(event) => update('locationName', event.target.value)} placeholder="Ej. Foro externo" /></label><label className={formStyles.field}>Dirección<input value={form.locationAddress} onChange={(event) => update('locationAddress', event.target.value)} placeholder="Calle, número, colonia y ciudad" /></label></>}
        </div>
      </section>
      <section className={styles.formSection} aria-labelledby="booking-services-title">
        <div className={styles.formSectionHeading}><span className={styles.sectionNumber}>02</span><div><h3 id="booking-services-title">Servicios y notas</h3><p>Indica el apoyo que requiere la producción.</p></div></div>
        <div className={styles.serviceGrid}>{(['makeup', 'cameras', 'vehicle'] as const).map((service) => <label className={styles.serviceOption} key={service}><input type="checkbox" checked={form.services[service]} onChange={(event) => update('services', { ...form.services, [service]: event.target.checked })} /><span className={styles.checkboxMark} aria-hidden="true" /><span>{service === 'makeup' ? 'Maquillaje' : service === 'cameras' ? 'Cámaras' : 'Vehículo'}</span></label>)}</div>
        <label className={`${formStyles.field} ${styles.notesField}`}>Notas para supervisión <span className={styles.optionalLabel}>Opcional</span><textarea className={formStyles.textarea} value={form.notes} onChange={(event) => update('notes', event.target.value)} maxLength={1000} placeholder="Agrega requerimientos u otra información importante." /><span className={styles.characterCount}>{form.notes.length}/1000</span></label>
      </section>
      <section className={styles.formSection} aria-labelledby="booking-guests-title">
        <div className={styles.formSectionHeading}>
          <span className={styles.sectionNumber}>03</span>
          <div><h3 id="booking-guests-title">Invitados</h3><p>Registra nombre y actividad de cada persona.</p></div>
          <span className={styles.guestCount}>{guests.length} de {maxGuests}</span>
        </div>
        <div className={styles.guestList}>{guests.map((guest, index) => <div className={styles.guestCard} key={index}>
          <div className={styles.guestCardHeader}><span className={styles.guestNumber}>Invitado {index + 1}</span>{guests.length > 1 && <button className={styles.removeGuestButton} type="button" onClick={() => setGuests(guests.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar invitado ${index + 1}`}><Trash2 size={14} /><span>Quitar</span></button>}</div>
          <div className={styles.guestFields}>
            <label className={formStyles.field}>Nombre completo<input required minLength={2} maxLength={100} value={guest.name} onChange={(event) => setGuests(guests.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Ej. Ana Pérez" /></label>
            <label className={formStyles.field}>Actividad o rol<input required minLength={2} maxLength={100} value={guest.role} onChange={(event) => setGuests(guests.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} placeholder="Ej. Conductora" /></label>
          </div>
        </div>)}</div>
        <button className={styles.addGuestButton} type="button" disabled={guests.length >= maxGuests} onClick={() => setGuests([...guests, { name: '', role: '' }])}><Plus size={16} /> Agregar invitado</button>
        {guests.length >= maxGuests && <p className={styles.guestLimit}>Se alcanzó el máximo de {maxGuests} invitados por solicitud.</p>}
      </section>
      {(programsError || programs.length === 0 && !programsLoading) && <p className={styles.error}>{programsError ? 'No se pudieron cargar tus programas.' : 'No tienes programas asignados. Contacta al supervisor.'}</p>}
      {error && <p className={styles.error}>{error}</p>}
      <div className={formStyles.footer}><button className={formStyles.secondaryButton} type="button" onClick={onClose}>Cancelar</button><button className={formStyles.primaryButton} type="submit" disabled={submitting || programsLoading || programs.length === 0}>{submitting ? 'Enviando solicitud...' : 'Enviar solicitud a supervisión'}</button></div>
    </form>
  </div></div>
}

function Timeline({ bookings }: { bookings: Booking[] }) {
  const scheduled = bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed')
  return <section className={`${styles.panel} ${styles.timelinePanel}`}><div className={styles.panelHeader}><h2 className={styles.panelTitle}>Cronograma del día</h2><span className={styles.meta}>00:00 a 24:00 · {scheduled.length} actividades</span></div><div className={styles.timelineScroll}><div className={styles.timeline}><div className={styles.timelineAxis}><span className={styles.timelineLabel} />{Array.from({ length: 25 }, (_, hour) => <span className={styles.hour} key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>{resources.map((resource) => <div className={styles.timelineLane} key={resource}><span className={styles.timelineLabel}>{resource}</span><div className={styles.timelineTrack}>{scheduled.filter((booking) => booking.resource === resource).map((booking) => { const start = hourDecimal(booking.startsAt); const duration = Math.max(.5, hourDecimal(booking.endsAt) - start); return <div className={`${styles.timelineBooking} ${booking.status === 'pending' ? styles.timelineBookingPending : ''}`} key={booking.id} style={{ left: `${(start / 24) * 100}%`, width: `${Math.min((duration / 24) * 100, 100 - (start / 24) * 100)}%` }}><strong>{booking.program}</strong><span>{formatTime(booking.startsAt)} · {booking.resource}</span></div> })}</div></div>)}</div></div></section>
}

function CancelModal({ booking, submitting, onClose, onSubmit }: { booking: Booking; submitting: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return <div className={formStyles.backdrop}><div className={`${formStyles.modal} ${formStyles.modalCompact}`} role="dialog" aria-modal="true" aria-labelledby="cancel-title"><div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Agenda de producción</p><h2 className={formStyles.title} id="cancel-title">Cancelar grabación</h2><p className={formStyles.description}>{booking.program} · {booking.resource}</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></div><label className={formStyles.field}>Motivo de cancelación<textarea className={formStyles.textarea} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} placeholder="Ej. Invitado no disponible" /></label><div className={formStyles.footer}><button className={formStyles.secondaryButton} type="button" onClick={onClose}>Volver</button><button className={styles.dangerButton} type="button" disabled={submitting || reason.trim().length < 5} onClick={() => onSubmit(reason.trim())}>{submitting ? 'Cancelando...' : 'Confirmar cancelación'}</button></div></div></div>
}
