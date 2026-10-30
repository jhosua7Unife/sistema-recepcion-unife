import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Bell, CalendarDays, Check, CheckCircle2, ClipboardList, Clock3, LayoutDashboard, LogOut, Tv, Upload, UserCog, Users, Video, Wifi } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ApiError, getAvatars, getCurrentUser, getDashboard, getMessages, getNotifications, getReceptionWifiCoupons, getSupervisorWifiCoupons, markMessageRead, markNotificationRead, markReceptionWifiCouponDelivered, sendMessage, uploadSupervisorWifiCoupons, type Message, type Notification, type User, type WifiCoupon } from './services/api'
import { Login } from './features/auth/Login'
import { Users as UserAdministration } from './features/users/Users'
import { Reception } from './features/visitors/Reception'
import { ReceptionArchive } from './features/visitors/ReceptionArchive'
import { Agenda } from './features/bookings/Agenda'
import { Programs } from './features/programs/Programs'
import { FormNotice } from './components/ui/FormNotice'
import formStyles from './styles/FormStyles.module.css'
import styles from './components/layout/Dashboard.module.css'

const fallbackDashboard = {
  metrics: { visitorsInside: 0, expectedGroups: 0, completedVisitsToday: 0, todayBookings: 0, pendingBookingReviews: 0, unreadNotifications: 0 },
  visits: [],
  bookings: [],
  notifications: [],
}

const formatTime = (date: string) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(date))
const formatScheduleDate = (date: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short' }).format(new Date(date))
const mexicoToday = () => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'full' }).format(new Date())
const localDateKey = (date: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(() => Boolean(localStorage.getItem('unife_token')))
  const [authError, setAuthError] = useState('')
  const [section, setSection] = useState<'summary' | 'reception' | 'archive' | 'agenda' | 'users' | 'programs'>('summary')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const client = useQueryClient()
  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('unife_token')

    if (!token) return () => { cancelled = true }

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (cause instanceof ApiError && cause.status === 401) {
          localStorage.removeItem('unife_token')
          localStorage.removeItem('unife_user')
          setAuthError('Tu sesión expiró. Inicia sesión nuevamente.')
          return
        }
        setAuthError(cause instanceof Error ? `No se pudo validar la sesión: ${cause.message}` : 'No se pudo validar la sesión.')
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })

    return () => { cancelled = true }
  }, [])
  const authenticated = currentUser !== null
  const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard, retry: false, enabled: authenticated, refetchInterval: 60_000 })
  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, retry: false, enabled: authenticated, refetchInterval: 15_000 })
  const messagesQuery = useQuery({ queryKey: ['messages'], queryFn: getMessages, retry: false, enabled: authenticated, refetchInterval: 15_000 })
  const avatarsQuery = useQuery({ queryKey: ['avatars'], queryFn: getAvatars, retry: false, enabled: authenticated })
  const notifications = notificationsQuery.data ?? []
  const messages = messagesQuery.data ?? []
  const unreadCount = notifications.filter((notification) => !notification.read).length + messages.filter((message) => !message.read).length
  const readMutation = useMutation({ mutationFn: markNotificationRead, onSuccess: () => { client.invalidateQueries({ queryKey: ['notifications'] }); client.invalidateQueries({ queryKey: ['dashboard'] }) } })
  const messageReadMutation = useMutation({ mutationFn: markMessageRead, onSuccess: () => client.invalidateQueries({ queryKey: ['messages'] }) })
  const sendMessageMutation = useMutation({ mutationFn: sendMessage, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['messages'] }) } })
  const dashboard = data ?? fallbackDashboard
  const todayKey = localDateKey(new Date())
  const todayVisits = dashboard.visits.filter((visit) => localDateKey(visit.expectedAt) === todayKey)
  const avatar = avatarsQuery.data?.find((item) => item.id === currentUser?.avatarId)

  if (authLoading) return <main aria-busy="true"><p role="status">Verificando sesión...</p></main>
  if (!currentUser) return <Login initialError={authError} onSuccess={(user) => { client.clear(); setAuthError(''); setCurrentUser(user) }} />
  const logout = () => { localStorage.removeItem('unife_token'); localStorage.removeItem('unife_user'); client.clear(); setCurrentUser(null) }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img className={styles.brandLogo} src="/Logo-login.webp" alt="UNIFE" />
          <span className={styles.brandText}>UNIFE Operación</span>
        </div>
        <nav className={styles.nav} aria-label="Navegación principal">
          <button className={`${styles.navItem} ${section === 'summary' ? styles.navItemActive : ''}`} onClick={() => setSection('summary')}><LayoutDashboard size={16} /><span>Resumen</span></button>
          {(currentUser.role === 'reception' || currentUser.role === 'supervisor') && <button className={`${styles.navItem} ${section === 'reception' ? styles.navItemActive : ''}`} onClick={() => setSection('reception')}><Users size={16} /><span>Recepción</span></button>}
          {currentUser.role === 'reception' && <button className={`${styles.navItem} ${section === 'archive' ? styles.navItemActive : ''}`} onClick={() => setSection('archive')}><Archive size={16} /><span>Archivo documental</span></button>}
          <button className={`${styles.navItem} ${section === 'agenda' ? styles.navItemActive : ''}`} onClick={() => setSection('agenda')}><CalendarDays size={16} /><span>Agenda</span></button>
          {currentUser.role === 'supervisor' && <button className={`${styles.navItem} ${section === 'users' ? styles.navItemActive : ''}`} onClick={() => setSection('users')}><UserCog size={16} /><span>Usuarios</span></button>}
          {currentUser.role === 'supervisor' && <button className={`${styles.navItem} ${section === 'programs' ? styles.navItemActive : ''}`} onClick={() => setSection('programs')}><Tv size={16} /><span>Programas</span></button>}
        </nav>
      </aside>

      <main className={styles.content}>
        <header className={styles.topbar}>
          <div><p className={styles.eyebrow}>{mexicoToday()}</p>{section === 'summary' && <h1 className={styles.title}>Resumen operativo</h1>}<p className={styles.subtitle}>{section === 'reception' ? 'Control de acceso, invitados y documentación.' : section === 'archive' ? 'Revisión de expedientes y preparación para OneDrive.' : section === 'agenda' ? 'Solicitudes, aprobaciones y disponibilidad de recursos.' : section === 'users' ? 'Administra cuentas, roles y avatares institucionales.' : section === 'programs' ? 'Administra programas y productores responsables.' : 'Una vista clara de lo que está ocurriendo hoy en UNIFE.'}</p></div>
          <div className={styles.topbarActions}>
            <div className={styles.notificationMenu}>
              <button className={`${styles.notificationButton} ${unreadCount > 0 ? styles.notificationHasUnread : ''}`} type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Abrir notificaciones" aria-expanded={notificationsOpen}><Bell size={18} />{unreadCount > 0 && <span className={styles.notificationCount}>{unreadCount}</span>}</button>
              {notificationsOpen && <NotificationPanel notifications={notifications} messages={messages} onRead={(notification) => readMutation.mutate(notification.id)} onReadMessage={(message) => messageReadMutation.mutate(message.id)} onSendMessage={async (payload) => { await sendMessageMutation.mutateAsync(payload) }} sendingMessage={sendMessageMutation.isPending} />}
            </div>
            <div className={styles.user}><span className={styles.avatar} style={avatar ? { background: avatar.color } : undefined}>{currentUser.name.slice(0, 2).toUpperCase()}</span><div><p className={styles.userName}>{currentUser.name}</p><p className={styles.userRole}>{currentUser.role === 'supervisor' ? 'Supervisor' : currentUser.role === 'producer' ? 'Productor' : 'Recepción'}</p></div><button className={styles.logoutButton} type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={15} /></button></div>
          </div>
        </header>

        {section === 'reception' ? <Reception /> : section === 'archive' && currentUser.role === 'reception' ? <ReceptionArchive /> : section === 'agenda' ? <Agenda role={currentUser.role} /> : section === 'users' ? <UserAdministration currentUserId={currentUser.id} onCurrentUserUpdated={setCurrentUser} /> : section === 'programs' ? <Programs /> : <>
          {isError && <p className={styles.error}>No se pudo conectar con la API. El resumen no tiene datos actualizados.</p>}
          {isLoading && <p className={styles.loading}>Sincronizando información...</p>}

          <section className={styles.metrics} aria-label="Métricas operativas">
          <Metric icon={<Users size={17} />} label="Dentro de UNIFE" value={dashboard.metrics.visitorsInside} hint="grupos activos" variant="inside" />
          <Metric icon={<Clock3 size={17} />} label="Por recibir" value={dashboard.metrics.expectedGroups} hint="llegadas esperadas" variant="expected" />
          <Metric icon={<Video size={17} />} label="Grabaciones hoy" value={dashboard.metrics.todayBookings} hint="foros y croma" />
          <Metric icon={<Bell size={17} />} label="Pendientes" value={unreadCount} hint={unreadCount ? 'notificaciones sin leer' : 'todo al día'} variant={unreadCount > 0 ? 'alert' : 'default'} />
          </section>

          <div className={styles.grid}>
          <section className={`${styles.glass} ${styles.panel}`}>
            <div className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Recepción de hoy</h2><p className={styles.panelCaption}>{todayVisits.length} {todayVisits.length === 1 ? 'grupo' : 'grupos'} · solo {new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long' }).format(new Date())}</p></div><button className={styles.panelLink} type="button" onClick={() => setSection('reception')}>Ver todos</button></div>
            {todayVisits.length === 0 ? <p className={styles.emptyState}>No hay recepciones registradas para hoy.</p> : todayVisits.map((visit) => <div className={styles.visit} key={visit.id}><div><p className={styles.visitName}>{visit.name}</p><p className={styles.visitMeta}>{visit.program} · {visit.members.length} integrantes · {formatTime(visit.expectedAt)}</p></div><span className={`${styles.badge} ${visit.status === 'inside' ? styles.badgeInside : visit.status === 'completed' ? styles.badgeCompleted : styles.badgeExpected}`}>{visit.status === 'inside' ? 'Dentro' : visit.status === 'expected' ? 'Esperado' : 'Salida registrada'}</span></div>)}
          </section>

          <section className={`${styles.glass} ${styles.panel}`}>
            <div className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Próximas grabaciones</h2><p className={styles.panelCaption}>Reservas vigentes, ordenadas por fecha</p></div><button className={styles.panelLink} type="button" onClick={() => setSection('agenda')}>Cronograma</button></div>
            {dashboard.bookings.length === 0 ? <p className={styles.emptyState}>No hay grabaciones futuras o en curso.</p> : dashboard.bookings.map((booking) => <div className={styles.scheduleRow} key={booking.id}><span className={styles.scheduleTime}>{localDateKey(booking.startsAt) === todayKey ? 'Hoy' : formatScheduleDate(booking.startsAt)}<br />{formatTime(booking.startsAt)}</span><div><p className={styles.scheduleName}>{booking.program}</p><p className={styles.scheduleMeta}>{booking.resource} · {booking.status === 'pending' ? 'Pendiente de aprobación' : 'Confirmada'}</p></div></div>)}
          </section>

          <section className={`${styles.glass} ${styles.panel}`}>
            <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Avisos recientes</h2><Bell size={16} className={styles.metricIcon} /></div>
            {dashboard.notifications.map((notification) => <div className={styles.notification} key={notification.id}><span className={styles.notificationDot} /><div><p className={styles.notificationTitle}>{notification.title}</p><p className={styles.notificationDetail}>{notification.detail}</p></div></div>)}
          </section>

          {currentUser.role === 'reception' ? <ReceptionWifiCoupons /> : currentUser.role === 'supervisor' ? <SupervisorWifiCoupons /> : <DayStatus metrics={dashboard.metrics} role={currentUser.role} />}
          </div>
        </>}
      </main>
    </div>
  )
}

function DayStatus({ metrics, role }: { metrics: typeof fallbackDashboard.metrics; role: User['role'] }) {
  const attentionNeeded = metrics.expectedGroups > 0 || metrics.pendingBookingReviews > 0
  return <section className={`${styles.glass} ${styles.panel} ${styles.dayStatus}`}>
    <div className={styles.panelHeader}>
      <div><h2 className={styles.panelTitle}>Estado del día</h2><p className={styles.panelCaption}>Resumen operativo · {new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long' }).format(new Date())}</p></div>
      {attentionNeeded ? <span className={styles.attentionBadge}><Clock3 size={13} /> Requiere atención</span> : <span className={styles.clearBadge}><CheckCircle2 size={13} /> Al día</span>}
    </div>
    <div className={styles.dayStatusGrid}>
      <DayStatusItem icon={<Clock3 size={15} />} label="Por recibir hoy" value={metrics.expectedGroups} variant="expected" />
      <DayStatusItem icon={<Users size={15} />} label="Dentro de UNIFE" value={metrics.visitorsInside} variant="inside" />
      <DayStatusItem icon={<CheckCircle2 size={15} />} label="Salidas registradas" value={metrics.completedVisitsToday} variant="completed" />
      {role === 'supervisor' && <DayStatusItem icon={<ClipboardList size={15} />} label="Solicitudes por aprobar" value={metrics.pendingBookingReviews} variant="attention" />}
    </div>
    <p className={styles.dayStatusHint}>{attentionNeeded ? 'Revisa las llegadas esperadas y las solicitudes que requieren seguimiento.' : 'No hay llegadas pendientes ni solicitudes de agenda por aprobar.'}</p>
  </section>
}

function ReceptionWifiCoupons() {
  const client = useQueryClient()
  const [requested, setRequested] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['wifi-coupons', 'reception'],
    queryFn: getReceptionWifiCoupons,
    enabled: requested,
    refetchInterval: requested ? 15_000 : false,
    retry: false,
  })
  const deliveryMutation = useMutation({
    mutationFn: (coupon: WifiCoupon) => markReceptionWifiCouponDelivered(coupon.id),
    onSuccess: async (_result, coupon) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['wifi-coupons', 'reception'] }),
        client.invalidateQueries({ queryKey: ['wifi-coupons', 'supervisor'] }),
      ])
      setError('')
      setMessage(`El cupón ${coupon.code} quedó marcado como entregado.`)
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'No se pudo marcar el cupón como entregado.'),
  })
  const requestCoupons = async () => {
    setRequested(true)
    setMessage('')
    setError('')
    const result = await query.refetch()
    if (result.isError) setError(result.error instanceof Error ? result.error.message : 'No se pudieron consultar los cupones.')
  }
  const markDelivered = (coupon: WifiCoupon) => {
    if (!window.confirm(`¿Confirmas que entregaste el cupón ${coupon.code} a un invitado?`)) return
    setMessage('')
    setError('')
    deliveryMutation.mutate(coupon)
  }

  return <section className={`${styles.glass} ${styles.panel} ${styles.wifiPanel}`}>
    <div className={styles.panelHeader}>
      <div><h2 className={styles.panelTitle}>Solicitud de cupones WiFi</h2><p className={styles.panelCaption}>Códigos disponibles para los invitados</p></div>
      <span className={styles.wifiIcon}><Wifi size={18} /></span>
    </div>
    <p className={styles.wifiPolicy}>El cupón se da para los invitados que lo soliciten, no es de uso personal y tiene un tiempo de caducidad de 8 horas.</p>
    <button className={styles.wifiPrimaryButton} type="button" onClick={requestCoupons} disabled={query.isFetching || deliveryMutation.isPending}>
      <Wifi size={15} /> {query.isFetching ? 'Consultando...' : requested ? 'Actualizar cupones disponibles' : 'Solicitar cupones'}
    </button>
    {error && <p className={styles.wifiError} role="alert">{error}</p>}
    {message && <p className={styles.wifiSuccess} role="status">{message}</p>}
    {requested && query.isError && !error && <p className={styles.wifiError} role="alert">No se pudieron cargar los cupones. Inténtalo de nuevo.</p>}
    {requested && !query.isError && <div className={styles.wifiCoupons} aria-live="polite">
      {query.isLoading ? <p className={styles.emptyState}>Cargando cupones...</p> : query.data?.length === 0 ? <p className={styles.emptyState}>No hay cupones disponibles. Solicita al supervisor que cargue más.</p> : query.data?.map((coupon) => <div className={styles.wifiCouponRow} key={coupon.id}>
        <code className={styles.wifiCode}>{coupon.code}</code>
        <button className={styles.wifiDeliveredButton} type="button" disabled={deliveryMutation.isPending} onClick={() => markDelivered(coupon)}><Check size={14} /> Marcar entregado</button>
      </div>)}
    </div>}
  </section>
}

function SupervisorWifiCoupons() {
  const client = useQueryClient()
  const [rawCodes, setRawCodes] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['wifi-coupons', 'supervisor'], queryFn: getSupervisorWifiCoupons, retry: false, refetchInterval: 15_000 })
  const uploadMutation = useMutation({
    mutationFn: uploadSupervisorWifiCoupons,
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['wifi-coupons', 'supervisor'] }),
        client.invalidateQueries({ queryKey: ['wifi-coupons', 'reception'] }),
      ])
      setRawCodes('')
      setError('')
      setMessage(`Se cargaron ${result.added} cupón${result.added === 1 ? '' : 'es'}${result.duplicates ? `. Se omitieron ${result.duplicates} código${result.duplicates === 1 ? ' duplicado' : 's duplicados'}.` : '.'}`)
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los cupones.'),
  })
  const codes = rawCodes.split(/\r?\n/).map((code) => code.trim()).filter(Boolean)
  const submitCodes = () => {
    setMessage('')
    setError('')
    if (codes.length === 0) {
      setError('Escribe uno o más códigos antes de subirlos.')
      return
    }
    if (codes.some((code) => !/^\d+$/.test(code))) {
      setError('Cada cupón debe contener únicamente números y estar en una línea separada.')
      return
    }
    uploadMutation.mutate(codes)
  }

  return <section className={`${styles.glass} ${styles.panel} ${styles.wifiPanel}`}>
    <div className={styles.panelHeader}>
      <div><h2 className={styles.panelTitle}>Cupones WiFi</h2><p className={styles.panelCaption}>Carga manual y control de disponibilidad</p></div>
      <span className={styles.wifiIcon}><Wifi size={18} /></span>
    </div>
    <p className={styles.wifiPolicy}>Pega los códigos numéricos, uno por línea. El inventario no tiene límite de códigos; puedes subir varios lotes. Los duplicados se omiten y cada cupón queda disponible para Recepción.</p>
    <label className={styles.wifiInputLabel} htmlFor="wifi-coupons-input">Códigos WiFi</label>
    <textarea id="wifi-coupons-input" className={styles.wifiTextarea} value={rawCodes} onChange={(event) => setRawCodes(event.target.value)} placeholder={'Ejemplo:\n12345678\n87654321'} rows={4} disabled={uploadMutation.isPending} />
    <button className={styles.wifiPrimaryButton} type="button" onClick={submitCodes} disabled={uploadMutation.isPending}>
      <Upload size={15} /> {uploadMutation.isPending ? 'Subiendo...' : `Subir ${codes.length || ''} cupón${codes.length === 1 ? '' : 'es'}`}
    </button>
    {error && <p className={styles.wifiError} role="alert">{error}</p>}
    {message && <p className={styles.wifiSuccess} role="status">{message}</p>}
    {query.isError && <p className={styles.wifiError} role="alert">No se pudo cargar el inventario de cupones.</p>}
    {query.data && <div className={styles.wifiInventory}>
      <div className={styles.wifiCounts}>
        <span><strong>{query.data.counts.available}</strong> disponibles</span>
        <span><strong>{query.data.counts.delivered}</strong> entregados</span>
        <span><strong>{query.data.counts.total}</strong> total</span>
      </div>
      {query.data.coupons.length === 0 ? <p className={styles.emptyState}>Todavía no hay códigos cargados.</p> : <div className={styles.wifiCouponList}>
        {query.data.coupons.map((coupon) => <div className={styles.wifiInventoryRow} key={coupon.id}>
          <code className={styles.wifiCode}>{coupon.code}</code>
          <span className={coupon.status === 'available' ? styles.wifiAvailable : styles.wifiUsed}>{coupon.status === 'available' ? 'Disponible' : 'Entregado'}</span>
        </div>)}
      </div>}
    </div>}
  </section>
}

function DayStatusItem({ icon, label, value, variant }: { icon: ReactNode; label: string; value: number; variant: 'expected' | 'inside' | 'completed' | 'attention' }) {
  return <div className={`${styles.dayStatusItem} ${styles[`dayStatus_${variant}`]}`}>
    <span className={styles.dayStatusIcon}>{icon}</span>
    <div><p className={styles.dayStatusValue}>{value}</p><p className={styles.dayStatusLabel}>{label}</p></div>
  </div>
}

function NotificationPanel({ notifications, messages, onRead, onReadMessage, onSendMessage, sendingMessage }: { notifications: Notification[]; messages: Message[]; onRead: (notification: Notification) => void; onReadMessage: (message: Message) => void; onSendMessage: (payload: { recipientRole: Message['recipientRole']; subject: string; body: string }) => Promise<void>; sendingMessage: boolean }) {
  const [composing, setComposing] = useState(false)
  const [recipientRole, setRecipientRole] = useState<Message['recipientRole']>('supervisor')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [composeError, setComposeError] = useState('')
  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setConfirmation('')
    setComposeError('')
    if (subject.trim().length < 2 || body.trim().length < 2) {
      setComposeError('Escribe un asunto y un mensaje antes de enviarlo.')
      return
    }
    try {
      await onSendMessage({ recipientRole, subject: subject.trim(), body: body.trim() })
      setSubject('')
      setBody('')
      setComposing(false)
      setConfirmation('La nota se envió correctamente.')
    } catch (cause) {
      setComposeError(cause instanceof Error ? cause.message : 'No fue posible enviar la nota.')
    }
  }
  return <div className={styles.notificationPanel}><div className={styles.notificationPanelHeader}><div><h2 className={styles.notificationPanelTitle}>Centro de comunicación</h2><p className={styles.notificationPanelSubtitle}>Avisos y notas operativas</p></div><Bell size={16} className={styles.metricIcon} /></div>{confirmation && <FormNotice message={confirmation} onDismiss={() => setConfirmation('')} />}<button className={styles.composeButton} type="button" onClick={() => { setComposing((open) => !open); setComposeError('') }}>+ Nueva nota</button>{composing && <form className={`${styles.messageForm} ${formStyles.inlineForm}`} onSubmit={submitMessage}><label className={formStyles.field}>Enviar a<select className={formStyles.control} value={recipientRole} onChange={(event) => setRecipientRole(event.target.value as Message['recipientRole'])}><option value="supervisor">Supervisores</option><option value="producer">Productores</option><option value="reception">Recepción</option></select></label><label className={formStyles.field}>Asunto<input className={formStyles.control} required minLength={2} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Asunto" maxLength={100} /></label><label className={formStyles.field}>Mensaje<textarea className={formStyles.textarea} required minLength={2} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribe una nota operativa" maxLength={1000} /></label>{composeError && <p className={formStyles.error} role="alert">{composeError}</p>}<button className={formStyles.primaryButton} type="submit" disabled={sendingMessage}>{sendingMessage ? 'Enviando...' : 'Enviar nota'}</button></form>}<div className={styles.communicationSection}><p className={styles.communicationLabel}>Notas</p>{messages.length === 0 ? <p className={styles.notificationEmpty}>No hay notas.</p> : messages.slice(0, 5).map((message) => <div className={`${styles.notificationItem} ${!message.read ? styles.notificationUnread : ''}`} key={message.id}><span className={styles.notificationDot} /><div className={styles.notificationItemBody}><p className={styles.notificationTitle}>{message.subject}</p><p className={styles.notificationDetail}>{message.senderName}: {message.body}</p></div>{!message.read && <button className={styles.notificationRead} type="button" onClick={() => onReadMessage(message)}>Leída</button>}</div>)}</div><div className={styles.communicationSection}><p className={styles.communicationLabel}>Avisos</p>{notifications.length === 0 ? <p className={styles.notificationEmpty}>No hay avisos.</p> : notifications.slice(0, 5).map((notification) => <div className={`${styles.notificationItem} ${!notification.read ? styles.notificationUnread : ''}`} key={notification.id}><span className={styles.notificationDot} /><div className={styles.notificationItemBody}><p className={styles.notificationTitle}>{notification.title}</p><p className={styles.notificationDetail}>{notification.detail}</p></div>{!notification.read && <button className={styles.notificationRead} type="button" onClick={() => onRead(notification)}>Leída</button>}</div>)}</div></div>
}

function Metric({ icon, label, value, hint, variant = 'default' }: { icon: ReactNode; label: string; value: number; hint: string; variant?: 'default' | 'inside' | 'expected' | 'alert' }) {
  const variantClass = {
    default: '',
    inside: styles.metricInside,
    expected: styles.metricExpected,
    alert: styles.metricAlert,
  }[variant]
  return <article className={`${styles.glass} ${styles.metric} ${variantClass}`}><div className={styles.metricTop}><span>{label}</span><span className={styles.metricIcon}>{icon}</span></div><p className={styles.metricValue}>{value}</p><p className={styles.metricHint}>{hint}</p></article>
}

export default App
