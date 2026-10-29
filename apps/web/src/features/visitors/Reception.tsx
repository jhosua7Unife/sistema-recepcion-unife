import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { createVisit, getBookings, getDocumentBlob, getPrograms, getVisits, lookupReceptionPerson, registerEntry, registerExit, updateVisit, type Booking, type Program, type Visit, type DocumentReference } from '../../services/api'
import { FormNotice } from '../../components/ui/FormNotice'
import formStyles from '../../styles/FormStyles.module.css'
import styles from './Reception.module.css'

const tutorSchema = z.object({ id: z.string().optional(), profileId: z.string().optional(), reuseIdentification: z.boolean().optional(), reuseImageRelease: z.boolean().optional(), name: z.string().min(2, 'Escribe el nombre'), identificationType: z.enum(['ine', 'passport', 'license']), identificationNumber: z.string().optional(), identificationFile: z.any().optional(), imageReleaseFile: z.any().optional() })
const memberSchema = z.object({
  id: z.string().optional(), profileId: z.string().optional(), reuseIdentification: z.boolean().optional(), reuseImageRelease: z.boolean().optional(), bookingGuestId: z.string().optional(), name: z.string().min(2, 'Escribe el nombre'), role: z.string().min(2, 'Escribe el rol'), personType: z.enum(['adult', 'minor']),
  programs: z.string().min(2, 'Indica al menos un programa'), identificationType: z.union([z.enum(['ine', 'passport', 'license']), z.literal(''), z.null()]), identificationNumber: z.string().optional(), curp: z.string().optional(), address: z.string().optional(), identificationFile: z.any().optional(), imageReleaseFile: z.any().optional(), tutors: z.array(tutorSchema),
}).superRefine((member, context) => {
  if (member.personType === 'adult' && !member.identificationType) context.addIssue({ code: 'custom', path: ['identificationType'], message: 'Selecciona el tipo de identificación' })
  if (member.personType === 'minor' && member.tutors.length === 0) context.addIssue({ code: 'custom', path: ['tutors'], message: 'Agrega al menos un tutor' })
  if (member.personType === 'adult' && !fileFromList(member.identificationFile) && !member.reuseIdentification) context.addIssue({ code: 'custom', path: ['identificationFile'], message: 'Sube la identificación o confirma una ya archivada' })
  if (member.personType === 'adult' && !fileFromList(member.imageReleaseFile) && !member.reuseImageRelease) context.addIssue({ code: 'custom', path: ['imageReleaseFile'], message: 'Sube la autorización o confirma una vigente' })
  member.tutors.forEach((tutor, index) => {
    if (!fileFromList(tutor.identificationFile) && !tutor.reuseIdentification) context.addIssue({ code: 'custom', path: ['tutors', index, 'identificationFile'], message: 'Sube la identificación del tutor o reutiliza la archivada' })
    if (!fileFromList(tutor.imageReleaseFile) && !tutor.reuseImageRelease) context.addIssue({ code: 'custom', path: ['tutors', index, 'imageReleaseFile'], message: 'Sube una autorización vigente del tutor' })
  })
})
const visitFormSchema = z.object({ name: z.string().min(2, 'Escribe el nombre del grupo'), program: z.string().min(2, 'Escribe el programa principal'), producer: z.string().min(2, 'Escribe el productor responsable'), expectedAt: z.string().min(1, 'Selecciona fecha y hora'), members: z.array(memberSchema).min(1) })
type VisitForm = z.infer<typeof visitFormSchema>

const fallbackVisits: Visit[] = [{ id: 'fallback-1', bookingId: null, name: 'Equipo Horizonte', program: 'Noticias UNIFE', producer: 'Mariana Torres', expectedAt: '2026-09-21T09:30:00-06:00', status: 'inside', members: [{ id: '1', profileId: '1', bookingGuestId: null, name: 'Laura Méndez', role: 'Cantante', personType: 'adult', programs: ['Noticias UNIFE'], identificationType: 'ine', identificationNumber: 'MELAL900101', curp: 'MELAL900101MDFNRA01', address: 'Ciudad de México', documentStatus: 'valid', identificationFile: null, imageReleaseFile: null, tutors: [] }] }]
const formatDate = (date: string) => new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
const fileFromList = (files?: FileList) => files?.[0]
const localDateTimeToIso = (value: string) => new Date(value).toISOString()
const isoToDateTimeLocal = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

export function Reception() {
  const client = useQueryClient(); const [search, setSearch] = useState(''); const [showForm, setShowForm] = useState(false); const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null); const [editingVisit, setEditingVisit] = useState<Visit | null>(null); const [detailVisit, setDetailVisit] = useState<Visit | null>(null); const [message, setMessage] = useState(''); const [actionError, setActionError] = useState('')
  const programsQuery = useQuery({ queryKey: ['programs'], queryFn: getPrograms, retry: false }); const programs = programsQuery.data ?? []
  const bookingsQuery = useQuery({ queryKey: ['bookings'], queryFn: getBookings, retry: false })
  const visitsQuery = useQuery({ queryKey: ['visits', search], queryFn: () => getVisits(search), retry: false }); const visits = visitsQuery.data ?? fallbackVisits
  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: ['visits'] }), client.invalidateQueries({ queryKey: ['bookings'] }), client.invalidateQueries({ queryKey: ['dashboard'] })])
  const createMutation = useMutation({ mutationFn: createVisit, onSuccess: async () => { await invalidate(); setShowForm(false); setSelectedBooking(null); setMessage('Registro creado con documentos recibidos.') }, onError: (error) => setActionError(error.message) })
  const updateMutation = useMutation({ mutationFn: ({ visit, payload }: { visit: Visit; payload: ReturnType<typeof toPayload> }) => updateVisit(visit.id, payload), onSuccess: async () => { await invalidate(); setShowForm(false); setEditingVisit(null); setMessage('Los datos del registro se actualizaron correctamente.') }, onError: (error) => setActionError(error.message) })
  const entryMutation = useMutation({ mutationFn: registerEntry, onSuccess: async () => { await invalidate(); setMessage('Entrada registrada y personal notificado.') }, onError: (error) => setActionError(error.message) })
  const exitMutation = useMutation({ mutationFn: registerExit, onSuccess: async () => { await invalidate(); setMessage('Salida registrada correctamente.') }, onError: (error) => setActionError(error.message) })
  const busy = entryMutation.isPending || exitMutation.isPending
  const action = (callback: () => void) => { setMessage(''); setActionError(''); callback() }
  const viewDocument = async (document: DocumentReference) => {
    const tab = window.open('', '_blank')
    if (!tab) {
      setActionError('Permite las ventanas emergentes para abrir documentos.')
      return
    }
    try {
      const url = URL.createObjectURL(await getDocumentBlob(document.id))
      tab.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      tab.close()
      setActionError(error instanceof Error ? error.message : 'No se pudo abrir el documento.')
    }
  }

  const registeredBookingIds = new Set(visits.map((visit) => visit.bookingId).filter((id): id is string => Boolean(id)))
  const arrivalBookings = (bookingsQuery.data ?? []).filter((booking) => booking.status === 'confirmed' && !registeredBookingIds.has(booking.id))
  return <section className={styles.page}><header className={styles.header}><div><p className={styles.kicker}>Control de acceso</p><h1 className={styles.heading}>Recepción</h1><p className={styles.description}>Registra llegadas aprobadas, grupos, documentación y cartas de autorización.</p></div><button className={styles.primaryButton} type="button" onClick={() => { setSelectedBooking(null); setShowForm(true) }}><Plus size={16} /> Nuevo registro</button></header>{actionError && <p className={styles.error} role="alert">{actionError}</p>}{message && <FormNotice message={message} onDismiss={() => setMessage('')} />}{programsQuery.isError && <p className={styles.error}>No se pudo cargar el catálogo de programas.</p>}
    <section className={styles.panel}><div className={styles.queueHeader}><div><h2 className={styles.sectionTitle}>Llegadas aprobadas</h2><p className={styles.groupMeta}>Selecciona una solicitud para precargar sus invitados en el registro de recepción.</p></div></div>{bookingsQuery.isError ? <p className={styles.error}>No se pudieron cargar las reservas aprobadas.</p> : bookingsQuery.isLoading ? <p className={styles.empty}>Cargando agenda aprobada...</p> : arrivalBookings.length === 0 ? <p className={styles.empty}>No hay llegadas aprobadas pendientes de registro.</p> : <div className={styles.arrivalList}>{arrivalBookings.map((booking) => <div className={styles.arrivalRow} key={booking.id}><div><p className={styles.groupName}>{booking.program} · {booking.resource}</p><p className={styles.groupMeta}>{formatDate(booking.startsAt)} · {booking.producer} · {booking.guests.map((guest) => guest.name).join(', ')}</p></div><button className={styles.ghostButton} type="button" onClick={() => { setActionError(''); setSelectedBooking(booking); setShowForm(true) }}>Registrar llegada</button></div>)}</div>}</section>
    <div className={`${styles.panel} ${styles.toolbar}`}><div className={styles.search}><Search size={16} className={styles.searchIcon} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar grupo, persona, programa o productor" aria-label="Buscar registros" /></div><button className={styles.secondaryButton} type="button" onClick={() => setSearch('')}>Limpiar búsqueda</button></div><div className={`${styles.panel} ${styles.tableWrap}`}>{visitsQuery.isError && <p className={styles.error}>API no conectada. Mostrando registros de demostración.</p>}{visits.length === 0 ? <p className={styles.empty}>No encontramos registros con esa búsqueda.</p> : <table className={styles.table}><thead><tr><th>Grupo / programa</th><th>Integrantes</th><th>Documentación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visits.map((visit) => <VisitRow key={visit.id} visit={visit} onView={() => setDetailVisit(visit)} onEdit={() => { setActionError(''); setEditingVisit(visit); setSelectedBooking(null); setShowForm(true) }} onEntry={() => action(() => entryMutation.mutate(visit.id))} onExit={() => action(() => exitMutation.mutate(visit.id))} busy={busy} editingDisabled={visitsQuery.isError} />)}</tbody></table>}</div>{showForm && <VisitFormModal key={editingVisit?.id ?? selectedBooking?.id ?? 'new'} booking={selectedBooking} visit={editingVisit} programs={programs} onClose={() => { setShowForm(false); setSelectedBooking(null); setEditingVisit(null) }} onSubmit={(values) => editingVisit ? updateMutation.mutate({ visit: editingVisit, payload: toPayload(values) }) : createMutation.mutate(toPayload(values, selectedBooking ?? undefined))} submitting={createMutation.isPending || updateMutation.isPending} error={actionError || createMutation.error?.message || updateMutation.error?.message} viewDocument={viewDocument} />}{detailVisit && <VisitDetailsModal visit={detailVisit} onClose={() => setDetailVisit(null)} onOpenDocument={viewDocument} />}</section>
}

function toPayload(values: VisitForm, booking?: Booking) {
  const files: Record<string, File | undefined> = {}
  const members = values.members.map((member, memberIndex) => {
    const { identificationFile, imageReleaseFile, tutors, programs, ...data } = member
    files[`members.${memberIndex}.identificationFile`] = fileFromList(identificationFile)
    files[`members.${memberIndex}.imageReleaseFile`] = fileFromList(imageReleaseFile)
    return { ...data, identificationType: data.identificationType === '' ? null : data.identificationType, programs: programs.split(',').map((item) => item.trim()).filter(Boolean), tutors: tutors.map((tutor, tutorIndex) => { const { identificationFile: tutorId, imageReleaseFile: tutorRelease, ...tutorData } = tutor; files[`members.${memberIndex}.tutors.${tutorIndex}.identificationFile`] = fileFromList(tutorId); files[`members.${memberIndex}.tutors.${tutorIndex}.imageReleaseFile`] = fileFromList(tutorRelease); return tutorData }) }
  })
  return { ...values, bookingId: booking?.id, expectedAt: localDateTimeToIso(values.expectedAt), members, files }
}

function VisitRow({ visit, onView, onEdit, onEntry, onExit, busy, editingDisabled }: { visit: Visit; onView: () => void; onEdit: () => void; onEntry: () => void; onExit: () => void; busy: boolean; editingDisabled: boolean }) { const expired = visit.members.filter((member) => member.documentStatus === 'expired').length; const complete = visit.members.filter((member) => member.documentStatus === 'valid').length === visit.members.length; return <tr><td><p className={styles.groupName}>{visit.name}</p><p className={styles.groupMeta}>{visit.program} · {visit.producer} · {formatDate(visit.expectedAt)}</p></td><td>{visit.members.length} {visit.members.length === 1 ? 'persona' : 'personas'}</td><td><span className={expired ? styles.documentWarning : complete ? styles.documentOk : styles.documentMissing}>{expired ? `${expired} vencida` : complete ? 'Completa y vigente' : 'Pendiente'}</span></td><td><span className={`${styles.status} ${styles[visit.status]}`}>{visit.status === 'inside' ? 'Dentro' : visit.status === 'expected' ? 'Esperado' : 'Salida registrada'}</span></td><td><div className={styles.actions}><button className={styles.ghostButton} type="button" onClick={onView}><Eye size={14} /> Ver</button><button className={styles.ghostButton} type="button" disabled={editingDisabled} onClick={onEdit}><Pencil size={14} /> Editar</button>{visit.status === 'expected' && <button className={styles.ghostButton} type="button" disabled={busy} onClick={onEntry}>Registrar entrada</button>}{visit.status === 'inside' && <button className={styles.ghostButton} type="button" disabled={busy} onClick={onExit}>Registrar salida</button>}</div></td></tr> }

function VisitFormModal({ booking, visit, programs, onClose, onSubmit, submitting, error, viewDocument }: { booking: Booking | null; visit: Visit | null; programs: Program[]; onClose: () => void; onSubmit: (values: VisitForm) => void; submitting: boolean; error?: string; viewDocument: (document: DocumentReference) => void }) {
  const initialProgram = visit?.program ?? booking?.program ?? programs[0]?.name ?? ''
  const initialGuests = visit?.members.map((member) => ({
    id: member.id,
    profileId: member.profileId,
    reuseIdentification: true,
    reuseImageRelease: true,
    bookingGuestId: member.bookingGuestId ?? undefined,
    name: member.name,
    role: member.role,
    personType: member.personType,
    programs: member.programs.join(', '),
    identificationType: member.identificationType,
    identificationNumber: member.identificationNumber ?? '',
    curp: member.curp ?? '',
    address: member.address ?? '',
    tutors: member.tutors.map((tutor) => ({ ...tutor, identificationNumber: tutor.identificationNumber ?? '', reuseIdentification: true, reuseImageRelease: true })),
  })) ?? booking?.guests.map((guest) => ({
    bookingGuestId: guest.id,
    name: guest.name,
    role: guest.role,
    personType: 'adult' as const,
    programs: booking.program,
    identificationType: null,
    identificationNumber: '',
    tutors: [],
  })) ?? [{ personType: 'adult' as const, identificationType: null, identificationNumber: '', tutors: [] }]
  const defaultGroupName = visit?.name ?? (booking ? `${booking.program} - ${booking.guests.map((guest) => guest.name).join(', ')}` : '')
  const lockedBooking = Boolean(booking || visit?.bookingId)
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<VisitForm>({
    resolver: zodResolver(visitFormSchema),
    defaultValues: {
      name: defaultGroupName,
      program: initialProgram,
      producer: visit?.producer ?? booking?.producer ?? programs.find((program) => program.name === initialProgram)?.producer ?? '',
      expectedAt: isoToDateTimeLocal(visit?.expectedAt ?? booking?.startsAt ?? new Date().toISOString()),
      members: initialGuests,
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'members' })
  const programField = register('program')
  return <div className={formStyles.backdrop}><div className={formStyles.modal} role="dialog" aria-modal="true" aria-labelledby="visit-form-title">
    <div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Control de acceso</p><h2 className={formStyles.title} id="visit-form-title">{visit ? 'Editar registro de recepción' : booking ? 'Registrar llegada aprobada' : 'Nuevo registro de grupo'}</h2><p className={formStyles.description}>{visit ? 'Actualiza los datos del registro; los documentos existentes se conservan.' : booking ? 'Completa la información y documentación de cada invitado.' : 'Los archivos se guardan junto al registro de cada persona.'}</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></div>
    <form className={formStyles.form} onSubmit={handleSubmit(onSubmit)}>
      <div className={styles.formGrid}>
        <Field label="Nombre del grupo" error={errors.name?.message}><input {...register('name')} placeholder="Ej. Equipo Horizonte" /></Field>
        <Field label="Programa principal" error={errors.program?.message}>{lockedBooking ? <input {...register('program')} readOnly /> : <select {...programField} disabled={programs.length === 0} onChange={(event) => { programField.onChange(event); const selected = programs.find((program) => program.name === event.target.value); if (selected) setValue('producer', selected.producer, { shouldValidate: true }) }}><option value="">Selecciona un programa</option>{(['unife', 'church'] as const).map((category) => { const categoryPrograms = programs.filter((program) => program.category === category); return categoryPrograms.length > 0 && <optgroup key={category} label={category === 'unife' ? 'Programas UNIFE' : 'Programas Iglesia'}>{categoryPrograms.map((program) => <option key={program.id} value={program.name}>{program.name}</option>)}</optgroup> })}</select>}</Field>
        <Field label="Productor responsable" error={errors.producer?.message}><input {...register('producer')} readOnly={lockedBooking} /></Field>
        <Field label="Llegada esperada" error={errors.expectedAt?.message}><input type="datetime-local" {...register('expectedAt')} readOnly={lockedBooking} /></Field>
      </div>
      <div className={styles.memberHeader}><h3 className={styles.memberTitle}>Integrantes</h3>{!booking && !visit && <button className={styles.ghostButton} type="button" onClick={() => append({ name: '', role: '', personType: 'adult', programs: '', identificationType: null, tutors: [] })}><Plus size={14} /> Agregar integrante</button>}</div>
      {fields.map((field, index) => <MemberFields key={field.id} index={index} register={register} control={control} watch={watch} setValue={setValue} errors={errors} remove={() => remove(index)} canRemove={!booking && !visit && fields.length > 1} locked={lockedBooking} editing={Boolean(visit)} existingMember={visit?.members[index]} viewDocument={viewDocument} />)}
      {error && <p className={formStyles.error}>{error}</p>}{!booking && programs.length === 0 && <p className={formStyles.error}>No hay programas disponibles. Pide al supervisor que registre uno primero.</p>}
      <div className={formStyles.footer}><button className={formStyles.secondaryButton} type="button" onClick={onClose}>Cancelar</button><button className={formStyles.primaryButton} type="submit" disabled={submitting || !booking && !visit && programs.length === 0}>{submitting ? 'Guardando...' : <><Upload size={15} /> {visit ? 'Guardar cambios' : 'Guardar registro'}</>}</button></div>
    </form>
  </div></div>
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return debounced
}

function MemberFields({ index, register, control, watch, setValue, errors, remove, canRemove, locked, editing, existingMember, viewDocument }: { index: number; register: ReturnType<typeof useForm<VisitForm>>['register']; control: ReturnType<typeof useForm<VisitForm>>['control']; watch: ReturnType<typeof useForm<VisitForm>>['watch']; setValue: ReturnType<typeof useForm<VisitForm>>['setValue']; errors: ReturnType<typeof useForm<VisitForm>>['formState']['errors']; remove: () => void; canRemove: boolean; locked: boolean; editing: boolean; existingMember?: Visit['members'][number]; viewDocument: (document: DocumentReference) => void }) {
  const personType = watch(`members.${index}.personType`)
  const name = watch(`members.${index}.name`) ?? ''
  const identificationNumber = watch(`members.${index}.identificationNumber`) ?? ''
  const reuseIdentification = Boolean(watch(`members.${index}.reuseIdentification`))
  const reuseImageRelease = Boolean(watch(`members.${index}.reuseImageRelease`))
  const tutors = useFieldArray({ control, name: `members.${index}.tutors` })
  const lookupName = useDebouncedValue(name)
  const lookup = useQuery({
    queryKey: ['reception-person-lookup', 'adult', lookupName, identificationNumber],
    queryFn: () => lookupReceptionPerson(lookupName.trim(), identificationNumber, 'adult'),
    enabled: !editing && personType === 'adult' && lookupName.trim().length >= 4,
    retry: false,
  })
  useEffect(() => {
    if (editing || !lookup.isSuccess) return
    const matches = lookup.data.filter((candidate) => candidate.identificationMatches)
    const match = matches.length === 1 ? matches[0] : undefined
    setValue(`members.${index}.profileId`, match?.profileId, { shouldDirty: true })
    setValue(`members.${index}.reuseIdentification`, Boolean(match?.identificationAvailable), { shouldDirty: true, shouldValidate: true })
    setValue(`members.${index}.reuseImageRelease`, Boolean(match && ['valid', 'expiring_soon'].includes(match.imageReleaseStatus)), { shouldDirty: true, shouldValidate: true })
  }, [editing, index, lookup.data, lookup.isSuccess, setValue])
  return <div className={styles.memberCard}>
    <input type="hidden" {...register(`members.${index}.id`)} />
    <input type="hidden" {...register(`members.${index}.profileId`)} />
    <input type="checkbox" className={styles.formStateCheckbox} aria-hidden="true" tabIndex={-1} {...register(`members.${index}.reuseIdentification`)} />
    <input type="checkbox" className={styles.formStateCheckbox} aria-hidden="true" tabIndex={-1} {...register(`members.${index}.reuseImageRelease`)} />
    <div className={styles.memberHeader}><h4 className={styles.memberTitle}>Integrante {index + 1}</h4>{canRemove && <button className={styles.close} type="button" onClick={remove} aria-label="Eliminar integrante"><Trash2 size={15} /></button>}</div>
    <div className={styles.formGrid}>
      <Field label="Nombre" error={errors.members?.[index]?.name?.message}><input {...register(`members.${index}.name`)} placeholder="Nombre completo" readOnly={locked} /></Field>
      <Field label="Actividad / rol" error={errors.members?.[index]?.role?.message}><input {...register(`members.${index}.role`)} placeholder="Ej. Cantante" readOnly={locked} /></Field>
      <Field label="Tipo de persona">{editing ? <><select value={personType} disabled><option value="adult">Adulto</option><option value="minor">Menor</option></select><input type="hidden" {...register(`members.${index}.personType`)} /></> : <select {...register(`members.${index}.personType`)}><option value="adult">Adulto</option><option value="minor">Menor</option></select>}</Field>
      <Field label="Programas a los que asiste" error={errors.members?.[index]?.programs?.message}><input {...register(`members.${index}.programs`)} placeholder="Noticias UNIFE, Vive Mejor" readOnly={locked} /></Field>
    </div>
    {personType === 'adult' ? <>
      <div className={styles.formGrid}>
        <Field label="Identificación"><select {...register(`members.${index}.identificationType`)}><option value="">Selecciona una opción</option><option value="ine">INE</option><option value="passport">Pasaporte</option><option value="license">Licencia</option></select></Field>
        <Field label="Número de identificación"><input {...register(`members.${index}.identificationNumber`)} placeholder="Número o ID" /></Field>
      </div>
      <PersonArchiveNotice lookup={lookup.data ?? []} loading={lookup.isFetching} failed={lookup.isError} name={name} identificationNumber={identificationNumber} />
      <div className={styles.formGrid}>
        <Field label="CURP"><input {...register(`members.${index}.curp`)} placeholder="CURP" /></Field>
        <Field label="Dirección"><input {...register(`members.${index}.address`)} placeholder="Domicilio" /></Field>
      </div>
      <DocumentFields
        index={index}
        register={register}
        prefix="members"
        editing={editing}
        existingIdentification={existingMember?.identificationFile}
        existingRelease={existingMember?.imageReleaseFile}
        reuseIdentification={reuseIdentification}
        reuseImageRelease={reuseImageRelease}
        onReuseIdentificationChange={(value) => setValue(`members.${index}.reuseIdentification`, value, { shouldDirty: true, shouldValidate: true })}
        onReuseImageReleaseChange={(value) => setValue(`members.${index}.reuseImageRelease`, value, { shouldDirty: true, shouldValidate: true })}
        viewDocument={viewDocument}
      />
    </> : <>
      <div className={styles.minorNotice}>Para menores se requiere autorización firmada y documentos de al menos un tutor.</div>
      <div className={styles.memberHeader}><h4 className={styles.memberTitle}>Tutores</h4>{!editing && <button className={styles.ghostButton} type="button" onClick={() => tutors.append({ name: '', identificationType: 'ine' })}><Plus size={14} /> Agregar tutor</button>}</div>
      {tutors.fields.map((tutor, tutorIndex) => <TutorFields
        key={tutor.id}
        index={index}
        tutorIndex={tutorIndex}
        register={register}
        watch={watch}
        setValue={setValue}
        editing={editing}
        existingTutor={existingMember?.tutors[tutorIndex]}
        errors={errors}
        onRemove={() => tutors.remove(tutorIndex)}
        viewDocument={viewDocument}
      />)}
    </>}
  </div>
}

function TutorFields({ index, tutorIndex, register, watch, setValue, editing, existingTutor, errors, onRemove, viewDocument }: {
  index: number
  tutorIndex: number
  register: ReturnType<typeof useForm<VisitForm>>['register']
  watch: ReturnType<typeof useForm<VisitForm>>['watch']
  setValue: ReturnType<typeof useForm<VisitForm>>['setValue']
  editing: boolean
  existingTutor?: Visit['members'][number]['tutors'][number]
  errors: ReturnType<typeof useForm<VisitForm>>['formState']['errors']
  onRemove: () => void
  viewDocument: (document: DocumentReference) => void
}) {
  const name = watch(`members.${index}.tutors.${tutorIndex}.name`) ?? ''
  const identificationNumber = watch(`members.${index}.tutors.${tutorIndex}.identificationNumber`) ?? ''
  const reuseIdentification = Boolean(watch(`members.${index}.tutors.${tutorIndex}.reuseIdentification`))
  const reuseImageRelease = Boolean(watch(`members.${index}.tutors.${tutorIndex}.reuseImageRelease`))
  const lookupName = useDebouncedValue(name)
  const lookup = useQuery({
    queryKey: ['reception-person-lookup', 'tutor', lookupName, identificationNumber],
    queryFn: () => lookupReceptionPerson(lookupName.trim(), identificationNumber, 'tutor'),
    enabled: !editing && lookupName.trim().length >= 4,
    retry: false,
  })
  useEffect(() => {
    if (editing || !lookup.isSuccess) return
    const matches = lookup.data.filter((candidate) => candidate.identificationMatches)
    const match = matches.length === 1 ? matches[0] : undefined
    setValue(`members.${index}.tutors.${tutorIndex}.profileId`, match?.profileId, { shouldDirty: true })
    setValue(`members.${index}.tutors.${tutorIndex}.reuseIdentification`, Boolean(match?.identificationAvailable), { shouldDirty: true, shouldValidate: true })
    setValue(`members.${index}.tutors.${tutorIndex}.reuseImageRelease`, Boolean(match && ['valid', 'expiring_soon'].includes(match.imageReleaseStatus)), { shouldDirty: true, shouldValidate: true })
  }, [editing, index, lookup.data, lookup.isSuccess, setValue, tutorIndex])
  return <div className={styles.tutorCard}>
    <input type="hidden" {...register(`members.${index}.tutors.${tutorIndex}.id`)} />
    <input type="hidden" {...register(`members.${index}.tutors.${tutorIndex}.profileId`)} />
    <input type="checkbox" className={styles.formStateCheckbox} aria-hidden="true" tabIndex={-1} {...register(`members.${index}.tutors.${tutorIndex}.reuseIdentification`)} />
    <input type="checkbox" className={styles.formStateCheckbox} aria-hidden="true" tabIndex={-1} {...register(`members.${index}.tutors.${tutorIndex}.reuseImageRelease`)} />
    <Field label="Nombre del tutor" error={errors.members?.[index]?.tutors?.[tutorIndex]?.name?.message}><input {...register(`members.${index}.tutors.${tutorIndex}.name`)} placeholder="Nombre completo" /></Field>
    <Field label="Identificación"><select {...register(`members.${index}.tutors.${tutorIndex}.identificationType`)}><option value="ine">INE</option><option value="passport">Pasaporte</option><option value="license">Licencia</option></select></Field>
    <Field label="Número de identificación"><input {...register(`members.${index}.tutors.${tutorIndex}.identificationNumber`)} /></Field>
    <PersonArchiveNotice lookup={lookup.data ?? []} loading={lookup.isFetching} failed={lookup.isError} name={name} identificationNumber={identificationNumber} />
    <DocumentFields
      index={index}
      tutorIndex={tutorIndex}
      register={register}
      prefix="members"
      editing={editing}
      existingIdentification={existingTutor?.identificationFile}
      existingRelease={existingTutor?.imageReleaseFile}
      reuseIdentification={reuseIdentification}
      reuseImageRelease={reuseImageRelease}
      onReuseIdentificationChange={(value) => setValue(`members.${index}.tutors.${tutorIndex}.reuseIdentification`, value, { shouldDirty: true, shouldValidate: true })}
      onReuseImageReleaseChange={(value) => setValue(`members.${index}.tutors.${tutorIndex}.reuseImageRelease`, value, { shouldDirty: true, shouldValidate: true })}
      viewDocument={viewDocument}
    />
    {!editing && <button className={styles.close} type="button" onClick={onRemove} aria-label="Eliminar tutor"><Trash2 size={14} /></button>}
  </div>
}

function PersonArchiveNotice({ lookup, loading, failed, name, identificationNumber }: { lookup: Awaited<ReturnType<typeof lookupReceptionPerson>>; loading: boolean; failed: boolean; name: string; identificationNumber: string }) {
  if (name.trim().length < 4) return null
  if (failed) return <p className={`${styles.archiveNotice} ${styles.archiveNoticeError}`} role="alert">No se pudo consultar el archivo de personas. Revisa la conexión e inténtalo de nuevo.</p>
  if (loading) return <p className={styles.archiveNotice} role="status">Consultando vigencia documental...</p>
  if (lookup.length === 0) return <p className={styles.archiveNotice}>No hay un expediente previo con este nombre. Al guardar, se creará el primero.</p>
  const match = lookup.find((item) => item.identificationMatches)
  if (!identificationNumber.trim() || !match) return <p className={`${styles.archiveNotice} ${styles.archiveNoticeWarning}`}>Hay coincidencias para este nombre. Captura y verifica la identificación para evitar confundir homónimos{lookup.length > 1 ? ` (${lookup.length} expedientes)` : ''}.</p>
  if (match.imageReleaseStatus === 'valid' || match.imageReleaseStatus === 'expiring_soon') {
    const expiry = match.imageReleaseExpiresAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(match.imageReleaseExpiresAt)) : ''
    return <p className={`${styles.archiveNotice} ${match.imageReleaseStatus === 'valid' ? styles.archiveNoticeSuccess : styles.archiveNoticeWarning}`}>Autorización de imagen {match.imageReleaseStatus === 'valid' ? 'vigente' : 'próxima a vencer'}{expiry ? ` hasta ${expiry}` : ''}. Se reutilizará sin reiniciar el plazo anual.</p>
  }
  if (match.imageReleaseStatus === 'expired') return <p className={`${styles.archiveNotice} ${styles.archiveNoticeError}`}>La autorización de imagen venció. Debes cargar una renovación; la versión anterior se conservará.</p>
  return <p className={`${styles.archiveNotice} ${styles.archiveNoticeWarning}`}>Existe un expediente previo, pero no tiene una autorización de imagen vigente. Debes cargarla para continuar.</p>
}

function DocumentFields({ index, tutorIndex, register, prefix, editing = false, existingIdentification, existingRelease, reuseIdentification = false, reuseImageRelease = false, onReuseIdentificationChange, onReuseImageReleaseChange, viewDocument }: {
  index: number
  tutorIndex?: number
  register: ReturnType<typeof useForm<VisitForm>>['register']
  prefix: string
  editing?: boolean
  existingIdentification?: DocumentReference | null
  existingRelease?: DocumentReference | null
  reuseIdentification?: boolean
  reuseImageRelease?: boolean
  onReuseIdentificationChange?: (value: boolean) => void
  onReuseImageReleaseChange?: (value: boolean) => void
  viewDocument?: (document: DocumentReference) => void
}) {
  const base = tutorIndex === undefined ? `${prefix}.${index}` : `${prefix}.${index}.tutors.${tutorIndex}`
  const identificationLabel = tutorIndex === undefined ? 'Identificación escaneada' : 'Identificación del tutor'
  const releaseLabel = tutorIndex === undefined ? 'Carta de uso de imagen' : 'Carta firmada por tutores'
  return <>
    {editing ? <div><span className={formStyles.field}>{identificationLabel}</span>{existingIdentification && viewDocument ? <button className={styles.documentLink} type="button" onClick={() => viewDocument(existingIdentification)}>Ver archivo actual: {existingIdentification.name}</button> : <span className={styles.noDocument}>No hay archivo cargado</span>}<Field label="Reemplazar archivo (opcional)"><input type="file" accept=".pdf,.jpg,.jpeg,.png" {...register(`${base}.identificationFile` as never)} /></Field></div> : reuseIdentification ? <div><span className={formStyles.field}>{identificationLabel}</span><span className={styles.fileHint}>Se usará el archivo archivado.</span><button className={styles.documentLink} type="button" onClick={() => onReuseIdentificationChange?.(false)}>Subir una identificación nueva</button></div> : <Field label={identificationLabel}><input required type="file" accept=".pdf,.jpg,.jpeg,.png" {...register(`${base}.identificationFile` as never)} /></Field>}
    {editing ? <div><span className={formStyles.field}>{releaseLabel}</span>{existingRelease && viewDocument ? <button className={styles.documentLink} type="button" onClick={() => viewDocument(existingRelease)}>Ver archivo actual: {existingRelease.name}</button> : <span className={styles.noDocument}>No hay archivo cargado</span>}<Field label="Renovar autorización (opcional)"><input type="file" accept=".pdf,.jpg,.jpeg,.png" {...register(`${base}.imageReleaseFile` as never)} /></Field></div> : reuseImageRelease ? <div><span className={formStyles.field}>{releaseLabel}</span><span className={styles.fileHint}>Autorización archivada vigente por un año desde su registro.</span><button className={styles.documentLink} type="button" onClick={() => onReuseImageReleaseChange?.(false)}>Subir una renovación</button></div> : <Field label={releaseLabel}><input required type="file" accept=".pdf,.jpg,.jpeg,.png" {...register(`${base}.imageReleaseFile` as never)} /></Field>}
  </>
}
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <div><label className={formStyles.field}><span>{label}</span>{children}</label>{error && <p className={formStyles.fieldError}>{error}</p>}</div> }

function VisitDetailsModal({ visit, onClose, onOpenDocument }: { visit: Visit; onClose: () => void; onOpenDocument: (document: DocumentReference) => void }) {
  return <div className={formStyles.backdrop}><div className={formStyles.modal} role="dialog" aria-modal="true" aria-labelledby="visit-detail-title">
    <div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Control de acceso</p><h2 className={formStyles.title} id="visit-detail-title">{visit.name}</h2><p className={formStyles.description}>{visit.program} · {visit.producer} · {formatDate(visit.expectedAt)}</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
    <div className={styles.detailsContent}>{visit.members.map((member) => <section className={styles.memberCard} key={member.id}>
      <h3 className={styles.memberTitle}>{member.name} · {member.role}</h3>
      <p className={styles.groupMeta}>{member.personType === 'minor' ? 'Menor de edad' : 'Adulto'} · Programas: {member.programs.join(', ')}</p>
      <dl className={styles.detailGrid}><div><dt>Identificación</dt><dd>{member.identificationType ?? 'No especificada'} {member.identificationNumber}</dd></div>{member.curp && <div><dt>CURP</dt><dd>{member.curp}</dd></div>}{member.address && <div className={styles.detailWide}><dt>Dirección</dt><dd>{member.address}</dd></div>}</dl>
      <div className={styles.documentList}><DocumentButton label="Identificación" document={member.identificationFile} onOpen={onOpenDocument} /><DocumentButton label="Uso de imagen" document={member.imageReleaseFile} onOpen={onOpenDocument} /></div>
      {member.tutors.map((tutor) => <div className={styles.tutorDetails} key={tutor.id}><h4 className={styles.memberTitle}>Tutor: {tutor.name}</h4><p className={styles.groupMeta}>{tutor.identificationType} {tutor.identificationNumber}</p><div className={styles.documentList}><DocumentButton label="Identificación del tutor" document={tutor.identificationFile} onOpen={onOpenDocument} /><DocumentButton label="Autorización" document={tutor.imageReleaseFile} onOpen={onOpenDocument} /></div></div>)}
    </section>)}</div>
    <div className={formStyles.footer}><button className={formStyles.primaryButton} type="button" onClick={onClose}>Cerrar</button></div>
  </div></div>
}

function DocumentButton({ label, document, onOpen }: { label: string; document: DocumentReference | null; onOpen: (document: DocumentReference) => void }) {
  return document
    ? <button className={styles.documentLink} type="button" onClick={() => onOpen(document)}><Eye size={14} /> {label}: {document.name}</button>
    : <span className={styles.noDocument}>{label}: No cargado</span>
}
