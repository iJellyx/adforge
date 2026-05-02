import { SignUp } from '@clerk/nextjs'
import { Wand2 } from 'lucide-react'

/**
 * /sign-up — Clerk-hosted sign-up. Same wrapper styling as /sign-in
 * so the brand chrome stays consistent across both flows.
 */
export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--af-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      letterSpacing: '-0.005em',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40, height: 40,
            borderRadius: 11,
            background: 'var(--af-accent)',
            color: 'var(--af-accent-text)',
            border: '1px solid var(--af-border)',
          }}>
            <Wand2 size={20} strokeWidth={2.5}/>
          </span>
          <span style={{ fontWeight: 800, fontSize: 26, color: 'var(--af-text)', letterSpacing: '-0.03em' }}>
            adforge
          </span>
        </div>

        <SignUp
          appearance={{
            elements: {
              rootBox: { width: '100%' },
              card: {
                background: 'var(--af-card)',
                border: '1px solid var(--af-border)',
                borderRadius: 16,
                boxShadow: 'none',
              },
              headerTitle: { color: 'var(--af-text)', fontFamily: 'inherit' },
              headerSubtitle: { color: 'var(--af-text-secondary)', fontFamily: 'inherit' },
              formButtonPrimary: {
                background: 'var(--af-accent)',
                color: 'var(--af-accent-text)',
                borderRadius: 9999,
                fontFamily: 'inherit',
                textTransform: 'none',
                fontWeight: 600,
              },
              formFieldInput: {
                background: 'var(--af-surface)',
                border: '1px solid var(--af-border)',
                color: 'var(--af-text)',
                fontFamily: 'inherit',
              },
              footerActionLink: { color: 'var(--af-text)' },
            },
            variables: {
              colorPrimary: '#1A1A1A',
              fontFamily: "'Inter', system-ui, sans-serif",
              borderRadius: '12px',
            },
          }}
          forceRedirectUrl="/dashboard"
        />
      </div>
    </div>
  )
}
