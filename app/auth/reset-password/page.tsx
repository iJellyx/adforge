'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Wand2, Lock, Check, AlertTriangle, ArrowRight } from 'lucide-react'

/**
 * /auth/reset-password
 *
 * The user lands here AFTER /auth/callback has already exchanged the
 * recovery code for a session. So when this page mounts they're already
 * authenticated (with a recovery-type session) and we just need a form to
 * set the new password via supabase.auth.updateUser().
 */
export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  // Verify the user actually has a session (recovery flow). If they hit
  // this URL directly without going through the email link, they won't.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      setHasSession(!!data.session && !error)
      setSessionChecked(true)
    })
    return () => { mounted = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
    // Brief pause so the user sees the success state, then go to the app
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--af-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", letterSpacing: '-0.005em' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#8B7FFF,#5B49FF)', boxShadow: '0 8px 20px rgba(139,127,255,0.4)' }}>
            <Wand2 size={20} color="#fff" strokeWidth={2.5}/>
          </span>
          <span style={{ fontWeight: 800, fontSize: 26, color: 'var(--af-text)', letterSpacing: '-0.03em' }}>
            Ad<span style={{ color: 'var(--af-accent)' }}>Forge</span>
          </span>
        </div>

        {/* If session check is still running, show a spinner */}
        {!sessionChecked && (
          <div style={{ textAlign: 'center', color: 'var(--af-text-secondary)', fontSize: 13 }}>
            Verifying recovery link...
          </div>
        )}

        {/* No session — recovery link expired or invalid */}
        {sessionChecked && !hasSession && !success && (
          <div style={{ background: 'var(--af-card)', border: '1px solid var(--af-border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
            <AlertTriangle size={32} color="var(--af-yellow)" style={{ marginBottom: 12 }}/>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--af-text)', marginBottom: 8 }}>Recovery link invalid or expired</div>
            <div style={{ fontSize: 13, color: 'var(--af-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              The password reset link has expired or already been used. Request a new one from the login page.
            </div>
            <button
              onClick={() => router.push('/login')}
              style={{ background: 'var(--af-accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Back to login <ArrowRight size={14}/>
            </button>
          </div>
        )}

        {/* Set-new-password form */}
        {sessionChecked && hasSession && !success && (
          <div style={{ background: 'var(--af-card)', border: '1px solid var(--af-border)', borderRadius: 14, padding: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--af-text)', marginBottom: 6, letterSpacing: '-0.02em' }}>Set a new password</div>
            <div style={{ color: 'var(--af-text-secondary)', fontSize: 13, marginBottom: 24 }}>
              Choose a new password to finish recovering your account.
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  autoFocus
                  style={{ width: '100%', background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 10, padding: '11px 14px', color: 'var(--af-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as any, fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--af-accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--af-border)'}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--af-muted)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Re-enter the password"
                  style={{ width: '100%', background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 10, padding: '11px 14px', color: 'var(--af-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as any, fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--af-accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--af-border)'}
                />
              </div>

              {error && (
                <div style={{ background: 'var(--af-red-soft)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--af-red)', marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', background: loading ? 'var(--af-muted)' : 'var(--af-accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '-0.005em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent-hover)' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent)' }}
              >
                <Lock size={14}/> {loading ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </div>
        )}

        {/* Success — about to redirect */}
        {success && (
          <div style={{ background: 'var(--af-card)', border: '1px solid var(--af-border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--af-green-soft)', marginBottom: 16 }}>
              <Check size={28} color="var(--af-green)" strokeWidth={3}/>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--af-text)', marginBottom: 8 }}>Password updated</div>
            <div style={{ fontSize: 13, color: 'var(--af-text-secondary)' }}>Taking you to the dashboard...</div>
          </div>
        )}
      </div>
    </div>
  )
}
