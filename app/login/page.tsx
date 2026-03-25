'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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

  return (
    <div style={{ minHeight:'100vh', background:'#F4F2FF', display:'flex', fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif" }}>

      {/* Left — value prop */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#0F1133' }}>
        <div style={{ maxWidth:480 }}>
          <div style={{ fontWeight:800, fontSize:28, color:'#fff', letterSpacing:'-0.03em', marginBottom:8 }}>
            Ad<span style={{ color:'#7C6FFF' }}>Forge</span>
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', marginBottom:56, letterSpacing:'0.02em' }}>
            AI-powered ad creation for DTC brands
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
            {[
              { icon:'🎬', title:'Upload your clips', desc:'Drop in creator videos. AI transcribes, analyses, and cuts them into reusable clips automatically.' },
              { icon:'✦', title:'Generate scripts', desc:'Describe the ad you want. AI writes a direct response script using your brand voice, product claims, and customer pain points.' },
              { icon:'⚡', title:'Forge the ad', desc:'AI matches your clips to each section. Add voiceover, music, captions — then export a Meta-ready MP4.' },
              { icon:'🧠', title:'Platform learns over time', desc:'Log performance data from Meta. AdForge learns which hooks, content types, and creators work best for your brand.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(124,111,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#fff', marginBottom:3 }}>{title}</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div style={{ width:440, display:'flex', alignItems:'center', justifyContent:'center', padding:40, background:'#F4F2FF' }}>
        <div style={{ width:'100%', maxWidth:360 }}>
          <div style={{ fontWeight:800, fontSize:22, color:'#0F1133', letterSpacing:'-0.02em', marginBottom:6 }}>Sign in</div>
          <div style={{ color:'#6B6894', fontSize:14, marginBottom:32 }}>Access your workspace</div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B6894', marginBottom:5, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Email</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@brand.com"
                style={{ width:'100%', background:'#fff', border:'1px solid rgba(91,73,255,0.15)', borderRadius:10, padding:'11px 14px', color:'#0F1133', fontSize:14, outline:'none', boxSizing:'border-box' as any, fontFamily:'inherit' }}
              />
            </div>
            <div style={{ marginBottom:6 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B6894', marginBottom:5, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Password</label>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                required
                placeholder="••••••••"
                style={{ width:'100%', background:'#fff', border:'1px solid rgba(91,73,255,0.15)', borderRadius:10, padding:'11px 14px', color:'#0F1133', fontSize:14, outline:'none', boxSizing:'border-box' as any, fontFamily:'inherit' }}
              />
            </div>
            <div style={{ textAlign:'right' as const, marginBottom:24 }}>
              <span style={{ fontSize:12, color:'#5B49FF', cursor:'pointer' }}>Forgot password?</span>
            </div>
            {error && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#DC2626', marginBottom:16 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width:'100%', background:loading ? '#c4beff' : '#5B49FF', color:'#fff', border:'none', borderRadius:50, padding:'13px', fontSize:14, fontWeight:700, cursor:loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', letterSpacing:'-0.01em' }}
            >
              {loading ? 'Signing in…' : '→ Sign In'}
            </button>
          </form>

          <div style={{ marginTop:32, padding:'16px', background:'rgba(91,73,255,0.06)', borderRadius:12, border:'1px solid rgba(91,73,255,0.12)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#5B49FF', marginBottom:6, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>New to AdForge?</div>
            <div style={{ fontSize:12, color:'#6B6894', lineHeight:1.6 }}>
              Reach out to get access. We onboard new brands personally to make sure your first ad is a winner.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
