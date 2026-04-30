'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Video, Wand2, Zap, Brain, ArrowRight, Mail, ChevronLeft } from 'lucide-react'

type Mode = 'login' | 'forgot' | 'forgot_sent'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // If /auth/callback bounced back with an error (e.g. expired link), surface it
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      setError(decodeURIComponent(err))
      // Clean the URL so a refresh doesn't re-show the error
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    // After clicking the email link, Supabase redirects here, the callback
    // exchanges the code, then sends them to /auth/reset-password.
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setMode('forgot_sent')
  }

  const features = [
    { Icon: Video, title: 'Upload your clips', desc: 'Drop in creator videos. AI transcribes, analyses, and cuts them into reusable clips automatically.' },
    { Icon: Wand2, title: 'Generate scripts', desc: 'Describe the ad you want. AI writes a direct response script using your brand voice, product claims, and customer pain points.' },
    { Icon: Zap, title: 'Forge the ad', desc: 'AI matches your clips to each section. Add voiceover, music, captions — then export a Meta-ready MP4.' },
    { Icon: Brain, title: 'Platform learns over time', desc: 'Log performance data from Meta. AdForge learns which hooks, content types, and creators work best for your brand.' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'var(--af-bg)', display:'flex', fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif", letterSpacing:'-0.005em' }}>

      {/* Left — value prop */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#07080f', position:'relative', overflow:'hidden' }}>
        {/* Subtle gradient glow */}
        <div style={{ position:'absolute', top:'-20%', left:'-10%', width:500, height:500, background:'radial-gradient(circle, rgba(139,127,255,0.15) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:500, height:500, background:'radial-gradient(circle, rgba(91,73,255,0.10) 0%, transparent 70%)', pointerEvents:'none' }}/>

        <div style={{ maxWidth:480, position:'relative', zIndex:1 }}>
          <div style={{ fontWeight:800, fontSize:30, color:'#fff', letterSpacing:'-0.03em', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:11, background:'linear-gradient(135deg,#8B7FFF,#5B49FF)', boxShadow:'0 8px 20px rgba(139,127,255,0.4)' }}>
              <Wand2 size={20} color="#fff" strokeWidth={2.5}/>
            </span>
            Ad<span style={{ color:'#8B7FFF' }}>Forge</span>
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)', marginBottom:56, letterSpacing:'0.005em' }}>
            AI-powered ad creation for DTC brands
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            {features.map(({ Icon, title, desc }) => (
              <div key={title} style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'rgba(139,127,255,0.12)', border:'1px solid rgba(139,127,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon size={17} color="#a097ff" strokeWidth={2}/>
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:'#fff', marginBottom:3 }}>{title}</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div style={{ width:460, display:'flex', alignItems:'center', justifyContent:'center', padding:40, background:'var(--af-bg)', borderLeft:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ width:'100%', maxWidth:360 }}>
          <div style={{ fontWeight:700, fontSize:24, color:'var(--af-text)', letterSpacing:'-0.02em', marginBottom:6 }}>Sign in</div>
          <div style={{ color:'var(--af-text-secondary)', fontSize:14, marginBottom:32 }}>Access your workspace</div>

          {/* ── Mode: login (default) ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--af-muted)', marginBottom:7, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>Email</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@brand.com"
                  style={{ width:'100%', background:'var(--af-card)', border:'1px solid var(--af-border)', borderRadius:10, padding:'11px 14px', color:'var(--af-text)', fontSize:14, outline:'none', boxSizing:'border-box' as any, fontFamily:'inherit', transition:'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--af-accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--af-border)'}
                />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--af-muted)', marginBottom:7, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>Password</label>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  required
                  placeholder="••••••••"
                  style={{ width:'100%', background:'var(--af-card)', border:'1px solid var(--af-border)', borderRadius:10, padding:'11px 14px', color:'var(--af-text)', fontSize:14, outline:'none', boxSizing:'border-box' as any, fontFamily:'inherit', transition:'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--af-accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--af-border)'}
                />
              </div>
              <div style={{ textAlign:'right' as const, marginBottom:24 }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError('') }}
                  style={{ background:'none', border:'none', padding:0, fontSize:12, color:'var(--af-accent)', cursor:'pointer', fontFamily:'inherit', textDecoration:'none' }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                >
                  Forgot password?
                </button>
              </div>
              {error && (
                <div style={{ background:'var(--af-red-soft)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--af-red)', marginBottom:16 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{ width:'100%', background:loading ? 'var(--af-muted)' : 'var(--af-accent)', color:'#fff', border:'none', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', letterSpacing:'-0.005em', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'background 0.15s' }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent-hover)' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent)' }}
              >
                {loading ? 'Signing in…' : <>Sign in <ArrowRight size={15} strokeWidth={2.5}/></>}
              </button>
            </form>
          )}

          {/* ── Mode: forgot — request reset email ── */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <button
                type="button"
                onClick={() => { setMode('login'); setError('') }}
                style={{ background:'none', border:'none', padding:0, fontSize:12, color:'var(--af-text-secondary)', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, marginBottom:16 }}
              >
                <ChevronLeft size={12}/> Back to sign in
              </button>
              <div style={{ fontWeight:700, fontSize:18, color:'var(--af-text)', marginBottom:6, letterSpacing:'-0.02em' }}>Reset your password</div>
              <div style={{ color:'var(--af-text-secondary)', fontSize:13, marginBottom:20, lineHeight:1.5 }}>
                Enter your email and we'll send a link to set a new password.
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--af-muted)', marginBottom:7, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>Email</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  required
                  autoFocus
                  placeholder="you@brand.com"
                  style={{ width:'100%', background:'var(--af-card)', border:'1px solid var(--af-border)', borderRadius:10, padding:'11px 14px', color:'var(--af-text)', fontSize:14, outline:'none', boxSizing:'border-box' as any, fontFamily:'inherit', transition:'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--af-accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--af-border)'}
                />
              </div>
              {error && (
                <div style={{ background:'var(--af-red-soft)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--af-red)', marginBottom:16 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{ width:'100%', background:loading ? 'var(--af-muted)' : 'var(--af-accent)', color:'#fff', border:'none', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', letterSpacing:'-0.005em', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'background 0.15s' }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent-hover)' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--af-accent)' }}
              >
                <Mail size={14}/> {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {/* ── Mode: forgot_sent — confirmation ── */}
          {mode === 'forgot_sent' && (
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:'50%', background:'var(--af-green-soft)', marginBottom:16 }}>
                <Mail size={22} color="var(--af-green)" strokeWidth={2.2}/>
              </div>
              <div style={{ fontWeight:700, fontSize:20, color:'var(--af-text)', marginBottom:6, letterSpacing:'-0.02em' }}>Check your email</div>
              <div style={{ color:'var(--af-text-secondary)', fontSize:13, lineHeight:1.6, marginBottom:20 }}>
                We sent a password reset link to <strong style={{ color:'var(--af-text)' }}>{email}</strong>.
                Click the link to set a new password. The link expires in 1 hour.
              </div>
              <div style={{ background:'var(--af-card)', border:'1px solid var(--af-border)', borderRadius:10, padding:'12px 14px', fontSize:12, color:'var(--af-text-secondary)', marginBottom:20, lineHeight:1.6 }}>
                Didn't get the email? Check your spam folder, or wait a couple of minutes and try again.
              </div>
              <button
                type="button"
                onClick={() => { setMode('login'); setError('') }}
                style={{ width:'100%', background:'none', color:'var(--af-text)', border:'1px solid var(--af-border)', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}
              >
                <ChevronLeft size={14}/> Back to sign in
              </button>
            </div>
          )}

          <div style={{ marginTop:32, padding:'16px', background:'var(--af-accent-soft)', borderRadius:12, border:'1px solid rgba(139,127,255,0.15)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--af-accent)', marginBottom:6, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>New to AdForge?</div>
            <div style={{ fontSize:13, color:'var(--af-text-secondary)', lineHeight:1.6 }}>
              Reach out to get access. We onboard new brands personally to make sure your first ad is a winner.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
