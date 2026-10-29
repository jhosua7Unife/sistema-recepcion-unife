import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Download, FileText, Search, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { completeReceptionArchive, downloadReceptionArchive, getDocumentBlob, getReceptionArchive, getReceptionArchivePdf, reviewReceptionArchive, type DocumentReference, type VisitArchive } from '../../services/api'
import { FormNotice } from '../../components/ui/FormNotice'
import styles from './ReceptionArchive.module.css'

const statusLabels: Record<VisitArchive['status'], string> = {
  pending_review: 'Pendiente de revisión',
  needs_update: 'Requiere actualización',
  ready_to_download: 'Listo para descargar',
  pending_onedrive: 'Pendiente de subir a OneDrive',
  archived: 'Archivado',
}

const formatDate = (date: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))

export function ReceptionArchive() {
  const client = useQueryClient()
  const [view, setView] = useState<'pending' | 'archived'>('pending')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['reception-archive', view, search],
    queryFn: () => getReceptionArchive(view, search),
    retry: false,
    refetchInterval: 30_000,
  })
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ['reception-archive'] }),
    client.invalidateQueries({ queryKey: ['visits'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ])
  const review = useMutation({
    mutationFn: reviewReceptionArchive,
    onSuccess: async () => { await invalidate(); setError(''); setNotice('Expediente revisado. Ya puedes descargar el paquete.') },
    onError: (cause) => { setNotice(''); setError(cause instanceof Error ? cause.message : 'No se pudo revisar el expediente.') },
  })
  const complete = useMutation({
    mutationFn: completeReceptionArchive,
    onSuccess: async () => { await invalidate(); setError(''); setNotice('Expediente marcado como archivado. La carga en OneDrive fue confirmada manualmente.') },
    onError: (cause) => { setNotice(''); setError(cause instanceof Error ? cause.message : 'No se pudo completar el expediente.') },
  })
  const busy = review.isPending || complete.isPending

  const openPdf = async (archive: VisitArchive) => {
    const tab = window.open('', '_blank')
    if (!tab) {
      setError('Permite las ventanas emergentes para revisar el PDF.')
      return
    }
    try {
      const url = URL.createObjectURL(await getReceptionArchivePdf(archive.visit.id))
      tab.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setError('')
    } catch (cause) {
      tab.close()
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el PDF.')
    }
  }

  const downloadPackage = async (archive: VisitArchive) => {
    try {
      const blob = await downloadReceptionArchive(archive.visit.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${new Date(archive.visit.expectedAt).toISOString().slice(0, 10)}_${safeName(archive.visit.name)}.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      await invalidate()
      setError('')
      setNotice('Paquete descargado. Súbelo manualmente a la carpeta institucional de OneDrive y después marca la ficha como archivada.')
    } catch (cause) {
      setNotice('')
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar el paquete.')
    }
  }

  const openDocument = async (document: DocumentReference) => {
    const tab = window.open('', '_blank')
    if (!tab) {
      setError('Permite las ventanas emergentes para abrir los documentos.')
      return
    }
    try {
      const url = URL.createObjectURL(await getDocumentBlob(document.id))
      tab.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setError('')
    } catch (cause) {
      tab.close()
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el documento.')
    }
  }

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Recepción · gestión documental</p><h1 className={styles.heading}>Archivo de expedientes</h1><p className={styles.description}>Revisa formularios y documentos, prepara el paquete y confirma la carga manual en OneDrive.</p></div>
      <Archive size={24} aria-hidden="true" />
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <FormNotice message={notice} onDismiss={() => setNotice('')} />}
    <p className={styles.instructions}>Abre el PDF y los originales para revisarlos. Después de validar, descarga el ZIP y súbelo a la carpeta institucional definida por UNIFE. La confirmación final es manual; esta aplicación no verifica OneDrive.</p>
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Expedientes">
          <button type="button" role="tab" aria-selected={view === 'pending'} className={view === 'pending' ? styles.tabActive : styles.tab} onClick={() => setView('pending')}>Pendientes</button>
          <button type="button" role="tab" aria-selected={view === 'archived'} className={view === 'archived' ? styles.tabActive : styles.tab} onClick={() => setView('archived')}>Historial archivado</button>
        </div>
        <label className={styles.search}><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar grupo, invitado o programa" aria-label="Buscar expediente" /></label>
      </div>
    </section>
    {query.isError && <p className={styles.error}>No se pudo cargar el archivo. Verifica que la API esté disponible y vuelve a intentarlo.</p>}
    {query.isLoading ? <p className={styles.empty}>Cargando expedientes...</p> : query.data?.length === 0 ? <p className={styles.empty}>{view === 'pending' ? 'No hay expedientes pendientes de subir.' : 'Aún no hay expedientes archivados.'}</p> : <div className={styles.cards}>
      {query.data?.map((archive) => <ArchiveCard
        key={archive.visit.id}
        archive={archive}
        busy={busy}
        onOpenPdf={() => openPdf(archive)}
        onOpenDocument={openDocument}
        onReview={() => { setNotice(''); setError(''); review.mutate(archive.visit.id) }}
        onDownload={() => downloadPackage(archive)}
        onComplete={() => {
          if (window.confirm('¿Confirmas que ya subiste este paquete a OneDrive? El sistema conservará la ficha y los documentos locales.')) {
            setNotice('')
            setError('')
            complete.mutate(archive.visit.id)
          }
        }}
      />)}
    </div>}
  </section>
}

function ArchiveCard({ archive, busy, onOpenPdf, onOpenDocument, onReview, onDownload, onComplete }: {
  archive: VisitArchive
  busy: boolean
  onOpenPdf: () => void
  onOpenDocument: (document: DocumentReference) => void
  onReview: () => void
  onDownload: () => void
  onComplete: () => void
}) {
  const { visit } = archive
  const memberDocuments = visit.members.flatMap((member) => [member.identificationFile, member.imageReleaseFile, ...member.tutors.flatMap((tutor) => [tutor.identificationFile, tutor.imageReleaseFile])]).filter((document): document is DocumentReference => document !== null)
  const documents = memberDocuments.length
  const hasExpired = memberDocuments.some((document) => document.status === 'expired')
  const hasExpiringSoon = memberDocuments.some((document) => document.status === 'expiring_soon')
  return <article className={styles.card}>
    <div className={styles.cardHeader}>
      <div><p className={styles.kicker}>{visit.program} · {formatDate(visit.expectedAt)}</p><h2 className={styles.cardTitle}>{visit.name}</h2><p className={styles.meta}>{visit.producer} · {visit.members.length} {visit.members.length === 1 ? 'integrante' : 'integrantes'} · {documents} documentos disponibles</p></div>
      <span className={`${styles.status} ${styles[`status_${archive.status}`]}`}>{hasExpired && archive.status !== 'archived' && <ShieldAlert size={13} />}{statusLabels[archive.status]}</span>
    </div>
    {hasExpired && <p className={styles.expiredNotice}>Hay documentos vencidos. Revisa y actualiza el expediente antes de marcarlo como listo.</p>}
    {!hasExpired && hasExpiringSoon && <p className={styles.expiringNotice}>Hay documentos que vencerán en menos de tres meses. Verifica su fecha antes de subirlos.</p>}
    {archive.status === 'needs_update' && <p className={styles.updateInstructions}>Para corregir documentos, vuelve a Recepción, busca este grupo y selecciona «Editar»; después regresa aquí y valida de nuevo.</p>}
    <div className={styles.people}>
      {visit.members.map((member) => <section key={member.id} className={styles.person}>
        <h3>{member.name} <span>{member.personType === 'minor' ? '· Menor' : '· Adulto'}</span></h3>
        {member.personType === 'adult' && <div className={styles.documents}>
          <DocumentLink label="Identificación" document={member.identificationFile} onOpen={onOpenDocument} />
          <DocumentLink label="Uso de imagen" document={member.imageReleaseFile} onOpen={onOpenDocument} />
        </div>}
        {member.tutors.map((tutor) => <div className={styles.tutor} key={tutor.id}>
          <p>Tutor: {tutor.name}</p>
          <div className={styles.documents}>
            <DocumentLink label="Identificación" document={tutor.identificationFile} onOpen={onOpenDocument} />
            <DocumentLink label="Autorización" document={tutor.imageReleaseFile} onOpen={onOpenDocument} />
          </div>
        </div>)}
      </section>)}
    </div>
    <div className={styles.actions}>
      <button className={styles.secondaryButton} type="button" onClick={onOpenPdf}><FileText size={15} /> Ver formulario PDF</button>
      {archive.status === 'pending_review' || archive.status === 'needs_update' ? <button className={styles.primaryButton} type="button" disabled={busy} onClick={onReview}><Check size={15} /> Validar expediente</button> : null}
      {(archive.status === 'ready_to_download' || archive.status === 'pending_onedrive') && <button className={styles.primaryButton} type="button" disabled={busy} onClick={onDownload}><Download size={15} /> Descargar ZIP</button>}
      {archive.status === 'pending_onedrive' && <button className={styles.completeButton} type="button" disabled={busy} onClick={onComplete}><Check size={15} /> Marcar como archivado</button>}
      {archive.status === 'archived' && <span className={styles.archivedAt}><Check size={14} /> Carga confirmada {archive.uploadedAt ? formatDate(archive.uploadedAt) : ''}</span>}
    </div>
  </article>
}

function DocumentLink({ label, document, onOpen }: { label: string; document: DocumentReference | null; onOpen: (document: DocumentReference) => void }) {
  if (!document) return <span className={styles.missingDocument}><X size={13} /> {label}: faltante</span>
  const status = document.status === 'expired' ? 'vencido' : document.status === 'expiring_soon' ? 'por vencer' : 'disponible'
  const statusClass = document.status === 'expired' ? styles.documentExpired : document.status === 'expiring_soon' ? styles.documentExpiring : ''
  return <button type="button" className={`${styles.documentLink} ${statusClass}`} onClick={() => onOpen(document)} title={`${label}: ${document.name}`}>
    <FileText size={13} /> {label}: {status}
  </button>
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'expediente'
}
