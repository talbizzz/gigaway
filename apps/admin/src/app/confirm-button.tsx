import { useEffect, useState } from 'react'

/**
 * A button that requires a second click to actually fire — for reversible
 * actions (suspend, reinstate) that still shouldn't go off on a stray
 * click. Irreversible actions (delete) use a typed-confirmation field
 * instead; see delete-panel.tsx.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = 'secondary',
  disabled,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  variant?: 'secondary' | 'danger'
  disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  if (armed) {
    return (
      <div style={{ display: 'inline-flex', gap: 'var(--space-sm)' }}>
        <button
          type="button"
          className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            setArmed(false)
            onConfirm()
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={disabled}
      onClick={() => setArmed(true)}
    >
      {label}
    </button>
  )
}
