import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { login, type User } from '../../services/api'
import styles from './Login.module.css'

const schema = z.object({
  email: z.string().trim().email('Escribe un correo válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})
type LoginForm = z.infer<typeof schema>

export function Login({ onSuccess, initialError = '' }: { onSuccess: (user: User) => void; initialError?: string }) {
  const [error, setError] = useState(initialError)
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'supervisor@unife.mx', password: 'demo1234' },
  })

  const submit = async (values: LoginForm) => {
    setError('')
    try {
      const result = await login(values.email, values.password)
      localStorage.setItem('unife_user', JSON.stringify(result.user))
      onSuccess(result.user)
    } catch (cause) {
      setError(cause instanceof TypeError
        ? 'No se pudo conectar con el servidor. Verifica que la API esté activa.'
        : cause instanceof Error ? cause.message : 'No fue posible iniciar sesión.')
    }
  }

  return <main className={styles.page}>
    <div className={styles.ambient} aria-hidden="true" />
    <div className={styles.orbBlue} aria-hidden="true" />
    <div className={styles.orbCyan} aria-hidden="true" />
    <section className={styles.panel} aria-labelledby="login-title">
      <div className={styles.topLine} aria-hidden="true" />
      <header className={styles.brand}>
        <img className={styles.logo} src="/Logo-login.webp" alt="UNIFE" />
        <span className={styles.brandLabel}>PLATAFORMA DE OPERACIÓN</span>
      </header>

      <div className={styles.intro}>
        <span className={styles.secureBadge}><ShieldCheck size={14} /> Acceso seguro</span>
        <h1 className={styles.title} id="login-title">Bienvenido</h1>
        <p className={styles.subtitle}>Ingresa con tu cuenta institucional para continuar.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit(submit)} noValidate>
        <div className={styles.field}>
          <label htmlFor="email">Correo institucional</label>
          <div className={`${styles.inputWrap} ${errors.email ? styles.inputInvalid : ''}`}>
            <Mail className={styles.inputIcon} size={17} aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="nombre@unife.mx"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </div>
          {errors.email && <span className={styles.fieldError} id="email-error">{errors.email.message}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Contraseña</label>
          <div className={`${styles.inputWrap} ${errors.password ? styles.inputInvalid : ''}`}>
            <LockKeyhole className={styles.inputIcon} size={17} aria-hidden="true" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Ingresa tu contraseña"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <button
              className={styles.visibilityButton}
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && <span className={styles.fieldError} id="password-error">{errors.password.message}</span>}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? 'Validando acceso...' : 'Iniciar sesión'}</span>
          {isSubmitting ? <span className={styles.spinner} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
        </button>
      </form>

      <aside className={styles.demo}>
        <p className={styles.demoTitle}>Accesos de demostración</p>
        <p><strong>Supervisor:</strong> supervisor@unife.mx</p>
        <p><strong>Recepción:</strong> recepcion@unife.mx</p>
        <p><strong>Productor:</strong> productor@unife.mx</p>
        <p className={styles.demoPassword}>Contraseña para las cuentas demo: <code>demo1234</code></p>
      </aside>
      <p className={styles.footer}>UNIFE · Acceso exclusivo para personal autorizado</p>
    </section>
  </main>
}
