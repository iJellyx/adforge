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
    <div style={{ minHeight:'100vh', background:'#0a0a0f', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ background:'#13131a', border:'1px solid #2a2a3a', borderRadius:16, padding:40, width:'100%', maxWidth:400 }}>
        <div style={{ fontWeight:800, fontSize:24, color:'#6c63ff', marginBottom:8 }}>AdForge</div>
        <div style={{ color:'#7a7a9a', fontSize:14, marginBottom:32 }}>Sign in to your workspace</div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#7a7a9a', marginBottom:6 }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
              style={{ width:'100%', background:'#0a0a0f', border:'1px solid #2a2a3a', borderRadius:8, padding:'10px 12px', color:'#f0f0f5', fontSize:14, outline:'none', boxSizing:'border-box' as any }} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#7a7a9a', marginBottom:6 }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
              style={{ width:'100%', background:'#0a0a0f', border:'1px solid #2a2a3a', borderRadius:8, padding:'10px 12px', color:'#f0f0f5', fontSize:14, outline:'none', boxSizing:'border-box' as any }} />
          </div>
          {error && (
            <div style={{ background:'#ef444422', border:'1px solid #ef444433', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#ef4444', marginBottom:16 }}>{error}</div>
          )}
          <button type="submit" disabled={loading}
            style={{ width:'100%', background:loading ? '#2a2a3a' : '#6c63ff', color:'#fff', border:'none', borderRadius:10, padding:12, fontSize:15, fontWeight:600, cursor:loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}