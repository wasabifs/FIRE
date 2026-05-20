import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup'

  async function handleSubmit() {
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      const fn = mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })
      const { error: err } = await fn
      if (err) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: 24,
    }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>💹</div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>資產追蹤器</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>個人財務自由之路</p>
      </div>

      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="密碼" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()} />

        {error && <p style={{ fontSize: 12, color: 'var(--loss)', textAlign: 'center' }}>{error}</p>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}
          onClick={handleSubmit} disabled={loading}>
          {loading ? '處理中...' : mode === 'login' ? '登入' : '註冊'}
        </button>

        <button className="btn btn-ghost" style={{ width: '100%' }}
          onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? '沒有帳號？註冊' : '已有帳號？登入'}
        </button>
      </div>
    </div>
  )
}
