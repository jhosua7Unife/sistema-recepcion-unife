import { CheckCircle2, X } from 'lucide-react'
import styles from '../../styles/FormStyles.module.css'

export function FormNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div className={styles.successNotice} role="status" aria-live="polite">
    <CheckCircle2 className={styles.successIcon} size={19} aria-hidden="true" />
    <p>{message}</p>
    {onDismiss && <button className={styles.dismissNotice} type="button" onClick={onDismiss} aria-label="Cerrar confirmación"><X size={16} /></button>}
  </div>
}
