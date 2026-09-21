import { useState } from 'react'

/**
 * The typed-confirmation gate for every irreversible action in this app —
 * there is no database backup, so the button stays disabled until the
 * admin has typed the exact text identifying what they're about to destroy.
 * `expected` is compared case-insensitively; trimmed on both sides.
 */
export function DeletePanel({
  expected,
  expectedLabel,
  onDelete,
  isDeleting,
  error,
}: {
  expected: string
  expectedLabel: string
  onDelete: () => void
  isDeleting: boolean
  error?: string | null
}) {
  const [value, setValue] = useState('')
  const matches = value.trim().toLowerCase() === expected.trim().toLowerCase()

  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <h2 style={{ fontSize: 15, marginBottom: 'var(--space-sm)', color: 'var(--danger)' }}>
        Delete
      </h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        This cannot be undone — there is no database backup. Type <strong>{expectedLabel}</strong>{' '}
        to confirm.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-md)',
          alignItems: 'flex-start',
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={expectedLabel}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-sm) var(--space-md)',
          }}
        />
        <button
          type="button"
          className="btn btn-danger"
          disabled={!matches || isDeleting}
          onClick={onDelete}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && (
        <p className="field-error" style={{ marginTop: 'var(--space-md)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
