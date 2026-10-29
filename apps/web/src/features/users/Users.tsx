import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createUser, deleteUser, getAvatars, getPrograms, getUsers, updateUser, type Avatar, type User } from '../../services/api'
import { FormNotice } from '../../components/ui/FormNotice'
import formStyles from '../../styles/FormStyles.module.css'
import styles from './Users.module.css'

const defaultAvatar: Avatar = { id: 'avatar-01', name: 'Azul', color: '#000050', accent: '#dce4ff' }
const roles = { reception: 'Recepción', producer: 'Productor', supervisor: 'Supervisor' }
const formSchema = (editing: boolean) => z.object({
  name: z.string().min(2, 'Escribe el nombre').max(80),
  email: z.string().email('Escribe un correo válido'),
  role: z.enum(['reception', 'producer', 'supervisor']),
  password: z.string(),
  avatarId: z.string().min(1, 'Selecciona un avatar'),
}).superRefine((values, context) => {
  if ((!editing || values.password) && values.password.length < 8) {
    context.addIssue({ code: 'custom', path: ['password'], message: 'La contraseña debe tener al menos 8 caracteres' })
  }
})
type UserForm = { name: string; email: string; role: User['role']; password: string; avatarId: string }
type UserPayload = Omit<UserForm, 'password'> & { password?: string }

export function Users({ currentUserId, onCurrentUserUpdated }: { currentUserId: string; onCurrentUserUpdated: (user: User) => void }) {
  const client = useQueryClient()
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false })
  const avatarsQuery = useQuery({ queryKey: ['avatars'], queryFn: getAvatars, retry: false })
  const programsQuery = useQuery({ queryKey: ['programs'], queryFn: getPrograms, retry: false })
  const users = usersQuery.data ?? []
  const avatars = avatarsQuery.data ?? [defaultAvatar]
  const mutation = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: UserPayload }) => {
      if (id) return updateUser(id, payload)
      if (!payload.password) throw new Error('La contraseña inicial es obligatoria')
      return createUser({ ...payload, password: payload.password })
    },
    onSuccess: async ({ user }, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['users'] }),
        client.invalidateQueries({ queryKey: ['programs'] }),
      ])
      if (user.id === currentUserId) onCurrentUserUpdated(user)
      setShowForm(false)
      setEditingUser(null)
      setConfirmation(variables.id ? `Se actualizaron los datos de ${user.name}.` : `Se creó el usuario ${user.name} correctamente.`)
      setError('')
      setOperationError('')
    },
    onError: (cause) => setError(cause.message),
  })
  const deleteMutation = useMutation({
    mutationFn: (user: User) => deleteUser(user.id),
    onSuccess: async (_result, user) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['users'] }),
        client.invalidateQueries({ queryKey: ['programs'] }),
      ])
      setConfirmation(`Se eliminó el acceso de ${user.name}. Sus registros históricos se conservaron.`)
      setOperationError('')
    },
    onError: (cause) => setOperationError(cause.message),
  })
  const openNewUser = () => {
    setEditingUser(null)
    setShowForm(true)
    setError('')
    setOperationError('')
    setConfirmation('')
  }
  const removeUser = (user: User) => {
    if (window.confirm(`¿Eliminar al usuario ${user.name}? Su acceso se desactivará y se conservarán sus registros históricos.`)) {
      setOperationError('')
      setConfirmation('')
      deleteMutation.mutate(user)
    }
  }
  const activeSupervisors = users.filter((user) => user.role === 'supervisor').length

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Administración</p><h1 className={styles.heading}>Usuarios y roles</h1><p className={styles.description}>Registra quién puede entrar y define sus responsabilidades operativas.</p></div>
      <button className={styles.primary} type="button" onClick={openNewUser}><Plus size={16} /> Nuevo usuario</button>
    </header>
    {confirmation && <FormNotice message={confirmation} onDismiss={() => setConfirmation('')} />}
    {operationError && <p className={styles.error} role="alert">{operationError}</p>}
    {programsQuery.isError && <p className={styles.error} role="alert">No se pudieron verificar los programas asignados; la API validará las relaciones antes de eliminar.</p>}
    <div className={styles.panel}>
      {usersQuery.isLoading ? <p className={styles.empty}>Cargando usuarios...</p> : usersQuery.isError ? <p className={styles.error}>No se pudo cargar el catálogo de usuarios.</p> : users.length === 0 ? <p className={styles.empty}>Todavía no hay usuarios.</p> :
        <table className={styles.table}><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead><tbody>{users.map((user) => {
          const avatar = avatars.find((item) => item.id === user.avatarId) ?? defaultAvatar
          const assignedPrograms = programsQuery.data?.filter((program) => program.producerId === user.id).length ?? 0
          const deleteRestriction = user.id === currentUserId
            ? 'No puedes eliminar tu propio usuario'
            : user.role === 'supervisor' && activeSupervisors <= 1
              ? 'No puedes eliminar al único supervisor activo'
              : programsQuery.isLoading
                ? 'Espera mientras se verifican sus programas'
                : assignedPrograms > 0
                ? 'Reasigna sus programas antes de eliminarlo'
                : undefined
          return <tr key={user.id}><td><span className={styles.avatar} style={{ background: avatar.color }}>{user.name.slice(0, 2).toUpperCase()}</span>{user.name}</td><td>{user.email}</td><td><span className={styles.role}>{roles[user.role]}</span></td><td><div className={styles.actions}><button className={styles.editButton} type="button" aria-label={`Editar ${user.name}`} onClick={() => { setEditingUser(user); setShowForm(true); setError(''); setOperationError(''); setConfirmation('') }}><Pencil size={14} /> Editar</button><button className={styles.deleteButton} type="button" aria-label={`Eliminar ${user.name}`} title={deleteRestriction} disabled={Boolean(deleteRestriction) || deleteMutation.isPending} onClick={() => removeUser(user)}><Trash2 size={14} /> Eliminar</button></div>{deleteRestriction && <span className={styles.actionHint}>{deleteRestriction}</span>}</td></tr>
        })}</tbody></table>}
    </div>
    {showForm && <UserModal key={editingUser?.id ?? 'new'} user={editingUser} avatars={avatars} onClose={() => { setShowForm(false); setEditingUser(null) }} onSubmit={(payload) => mutation.mutate({ id: editingUser?.id, payload })} submitting={mutation.isPending} error={error} />}
  </section>
}

function UserModal({ user, avatars, onClose, onSubmit, submitting, error }: { user: User | null; avatars: Avatar[]; onClose: () => void; onSubmit: (values: UserPayload) => void; submitting: boolean; error: string }) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<UserForm>({
    resolver: zodResolver(formSchema(Boolean(user))),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'producer', password: '', avatarId: user?.avatarId ?? avatars[0]?.id ?? defaultAvatar.id },
  })
  const selectedAvatar = watch('avatarId')
  const submit = (values: UserForm) => {
    const { password, ...details } = values
    onSubmit(password ? { ...details, password } : details)
  }

  return <div className={formStyles.backdrop}><div className={`${formStyles.modal} ${formStyles.modalCompact}`} role="dialog" aria-modal="true" aria-labelledby="user-form-title">
    <div className={formStyles.modalHeader}><div><p className={formStyles.eyebrow}>Administración</p><h2 className={formStyles.title} id="user-form-title">{user ? 'Editar usuario' : 'Registrar usuario'}</h2><p className={formStyles.description}>Elige su rol y avatar institucional.</p></div><button className={formStyles.close} type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
    <form className={formStyles.form} onSubmit={handleSubmit(submit)}>
      <div className={formStyles.formGrid}>
        <div className={formStyles.field}><label htmlFor="user-name">Nombre</label><input id="user-name" autoComplete="name" {...register('name')} />{errors.name && <span className={formStyles.fieldError}>{errors.name.message}</span>}</div>
        <div className={formStyles.field}><label htmlFor="user-email">Correo</label><input id="user-email" type="email" autoComplete="email" {...register('email')} />{errors.email && <span className={formStyles.fieldError}>{errors.email.message}</span>}</div>
      </div>
      <div className={formStyles.formGrid}>
        <div className={formStyles.field}><label htmlFor="user-role">Rol</label><select id="user-role" {...register('role')}><option value="reception">Recepción</option><option value="producer">Productor</option><option value="supervisor">Supervisor</option></select></div>
        <div className={formStyles.field}><label htmlFor="user-password">{user ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}</label><input id="user-password" type="password" autoComplete="new-password" {...register('password')} />{errors.password && <span className={formStyles.fieldError}>{errors.password.message}</span>}</div>
      </div>
      <div className={formStyles.field}><span className={styles.label}>Avatar</span><div className={styles.avatarGrid}>{avatars.map((avatar) => <button className={`${styles.avatarOption} ${selectedAvatar === avatar.id ? styles.avatarOptionSelected : ''}`} style={{ background: avatar.color }} type="button" key={avatar.id} onClick={() => setValue('avatarId', avatar.id, { shouldValidate: true })} aria-pressed={selectedAvatar === avatar.id} title={avatar.name}>{avatar.name.slice(0, 1)}</button>)}</div></div>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.footer}><button className={formStyles.secondaryButton} type="button" onClick={onClose}>Cancelar</button><button className={formStyles.primaryButton} type="submit" disabled={submitting}>{submitting ? 'Guardando...' : user ? 'Guardar cambios' : 'Crear usuario'}</button></div>
    </form>
  </div></div>
}
