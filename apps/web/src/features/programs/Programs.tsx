import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createProgram, deleteProgram, getPrograms, getUsers, updateProgram, type Program } from '../../services/api'
import { FormNotice } from '../../components/ui/FormNotice'
import formStyles from '../../styles/FormStyles.module.css'
import styles from './Programs.module.css'

const programSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre del programa').max(100),
  producer: z.string().min(2, 'Selecciona un productor'),
  category: z.enum(['unife', 'church']),
})
type ProgramForm = z.infer<typeof programSchema>
const categories = [
  { id: 'unife', label: 'Programas UNIFE' },
  { id: 'church', label: 'Programas Iglesia' },
] as const

export function Programs() {
  const client = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<Program['category']>('unife')
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const programsQuery = useQuery({ queryKey: ['programs'], queryFn: getPrograms, retry: false })
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false })
  const producers = (usersQuery.data ?? []).filter((user) => user.role === 'producer')
  const visiblePrograms = (programsQuery.data ?? []).filter((program) => program.category === selectedCategory)
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: ProgramForm }) => id ? updateProgram(id, payload) : createProgram(payload),
    onSuccess: async (program, variables) => {
      await client.invalidateQueries({ queryKey: ['programs'] })
      setShowForm(false)
      setEditingProgram(null)
      setConfirmation(variables.id ? `Se actualizaron los datos del programa ${program.name}.` : `Se creó el programa ${program.name} correctamente.`)
      setError('')
      setOperationError('')
    },
    onError: (cause) => setError(cause.message),
  })
  const deleteMutation = useMutation({
    mutationFn: (program: Program) => deleteProgram(program.id),
    onSuccess: async (_result, program) => {
      await client.invalidateQueries({ queryKey: ['programs'] })
      setConfirmation(`Se eliminó el programa ${program.name} del catálogo. Las reservas anteriores se conservaron.`)
      setOperationError('')
    },
    onError: (cause) => setOperationError(cause.message),
  })
  const removeProgram = (program: Program) => {
    if (window.confirm(`¿Eliminar el programa ${program.name} del catálogo? Las reservas anteriores se conservarán.`)) {
      setOperationError('')
      setConfirmation('')
      deleteMutation.mutate(program)
    }
  }

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Administración</p><h1 className={styles.heading}>Programas</h1><p className={styles.description}>Administra ambos catálogos y asigna un productor responsable a cada programa.</p></div>
      <button className={styles.primary} type="button" onClick={() => { setEditingProgram(null); setShowForm(true); setError(''); setOperationError(''); setConfirmation('') }}><Plus size={16} /> Nuevo programa</button>
    </header>
    {confirmation && <FormNotice message={confirmation} onDismiss={() => setConfirmation('')} />}
    {operationError && <p className={styles.error} role="alert">{operationError}</p>}
    {usersQuery.isError && <p className={styles.error}>No se pudo cargar la lista de productores.</p>}
    {usersQuery.isSuccess && producers.length === 0 && <p className={styles.notice}>Primero crea un usuario con rol Productor en Usuarios y roles.</p>}
    <div className={styles.categoryTabs} role="tablist" aria-label="Categoría de programas">
      {categories.map((category) => <button key={category.id} className={`${styles.categoryTab} ${selectedCategory === category.id ? styles.categoryTabActive : ''}`} type="button" role="tab" aria-selected={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.label}<span>{(programsQuery.data ?? []).filter((program) => program.category === category.id).length}</span></button>)}
    </div>
    <div className={styles.panel}>
      {programsQuery.isLoading ? <p className={styles.empty}>Cargando programas...</p> : programsQuery.isError ? <p className={styles.error}>No se pudo cargar el catálogo de programas.</p> : visiblePrograms.length === 0 ? <p className={styles.empty}>Todavía no hay programas en {categories.find((category) => category.id === selectedCategory)?.label}.</p> :
        <table className={styles.table}><thead><tr><th>Programa</th><th>Productor responsable</th><th>Acciones</th></tr></thead><tbody>{visiblePrograms.map((program) =>
          <tr key={program.id}><td>{program.name}</td><td>{program.producer}</td><td><div className={styles.actions}><button className={styles.editButton} type="button" onClick={() => { setEditingProgram(program); setShowForm(true); setError(''); setOperationError(''); setConfirmation('') }}><Pencil size={14} /> Editar</button><button className={styles.deleteButton} type="button" aria-label={`Eliminar ${program.name}`} disabled={deleteMutation.isPending} onClick={() => removeProgram(program)}><Trash2 size={14} /> Eliminar</button></div></td></tr>
        )}</tbody></table>}
    </div>
    {showForm && <ProgramModal key={editingProgram?.id ?? `new-${selectedCategory}`} program={editingProgram} category={selectedCategory} producers={producers.map((producer) => producer.name)} onClose={() => { setShowForm(false); setEditingProgram(null) }} onSubmit={(payload) => mutation.mutate({ id: editingProgram?.id, payload })} submitting={mutation.isPending} error={error} />}
  </section>
}

function ProgramModal({ program, category, producers, onClose, onSubmit, submitting, error }: { program: Program | null; category: Program['category']; producers: string[]; onClose: () => void; onSubmit: (values: ProgramForm) => void; submitting: boolean; error: string }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ProgramForm>({
    resolver: zodResolver(programSchema),
    defaultValues: { name: program?.name ?? '', producer: program?.producer ?? '', category: program?.category ?? category },
  })
  const hasLegacyProducer = Boolean(program && !producers.some((producer) => producer.toLowerCase() === program.producer.toLowerCase()))

  return <div className={formStyles.backdrop}><div className={`${formStyles.modal} ${formStyles.modalCompact}`} role="dialog" aria-modal="true" aria-labelledby="program-form-title">
    <div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Administración</p><h2 className={formStyles.title} id="program-form-title">{program ? 'Editar programa' : 'Registrar programa'}</h2><p className={formStyles.description}>El productor seleccionado quedará asociado al programa.</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
    <form className={formStyles.form} onSubmit={handleSubmit(onSubmit)}>
      <div className={formStyles.field}><label htmlFor="program-name">Nombre del programa</label><input id="program-name" {...register('name')} />{errors.name && <span className={formStyles.fieldError}>{errors.name.message}</span>}</div>
      <div className={formStyles.field}><label htmlFor="program-category">Catálogo</label><select id="program-category" {...register('category')}><option value="unife">Programas UNIFE</option><option value="church">Programas Iglesia</option></select>{errors.category && <span className={formStyles.fieldError}>{errors.category.message}</span>}</div>
      <div className={formStyles.field}><label htmlFor="program-producer">Productor responsable</label><select id="program-producer" {...register('producer')}><option value="">Selecciona un productor</option>{hasLegacyProducer && <option value={program?.producer}>{program?.producer} (asignación actual)</option>}{producers.map((producer) => <option key={producer} value={producer}>{producer}</option>)}</select>{errors.producer && <span className={formStyles.fieldError}>{errors.producer.message}</span>}</div>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.footer}><button className={formStyles.secondaryButton} type="button" onClick={onClose}>Cancelar</button><button className={formStyles.primaryButton} type="submit" disabled={submitting || (!program && producers.length === 0)}>{submitting ? 'Guardando...' : program ? 'Guardar cambios' : 'Crear programa'}</button></div>
    </form>
  </div></div>
}
