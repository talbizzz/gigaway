import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

type FormValues = z.infer<typeof schema>

/**
 * Email + password only — no magic link, no SSO. A magic link depends on
 * mail deliverability, which is exactly the kind of thing an admin might
 * need to log in and fix. There is no sign-up form: accounts are inserted
 * into admin_users by hand (see Milestone 6), so this form's only job is
 * authenticating someone who already has one.
 */
export function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword(values)
    if (signInError) {
      setError('Incorrect email or password.')
      return
    }
    // AuthProvider's onAuthStateChange listener takes it from here: it
    // checks is_admin() and either lands the session or signs it back out.
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl)',
      }}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 'var(--space-xs)' }}>GigAway Admin</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: 'var(--space-xl)' }}>
          Sign in with an admin account.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" {...register('email')} />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </div>

          {error && <span className="field-error">{error}</span>}

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
