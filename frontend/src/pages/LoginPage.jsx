import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-widest uppercase text-white/45 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="gi"
        autoComplete={type === 'password' ? 'current-password' : 'username'}
      />
    </div>
  )
}

export default function LoginPage() {
  const { login, register } = useAuth()
  const [mode,   setMode]   = useState('login')   // 'login' | 'register'
  const [error,  setError]  = useState(null)
  const [busy,   setBusy]   = useState(false)

  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [code,     setCode]     = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite')
    if (invite) {
      setCode(invite)
      setMode('register')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(code, username, email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">

      {/* Logo / title */}
      <div className="text-center mb-8">
        <h1 className="text-lg font-bold tracking-wide uppercase text-white">
          Dilatazione Termica Apparente
        </h1>
        <p className="text-xs text-white/35 mt-1">
          Bevande alcoliche · Conformità Dir. UE 76/211/CEE
        </p>
      </div>

      <div className="glass rounded-lg w-full max-w-sm p-7">

        {/* Mode toggle */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-md p-1">
          {[['login','Accedi'],['register','Registrati']].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all ${
                mode === m
                  ? 'bg-blue-500/70 text-white border border-blue-400/40'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Codice invito" value={code} onChange={setCode}
                   placeholder="ricevuto dall'amministratore" />
          )}
          <Field label="Username" value={username} onChange={setUsername} placeholder="il tuo username" />
          {mode === 'register' && (
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="mario@esempio.it" />
          )}
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

          {error && (
            <p className="text-xs text-red-300 bg-red-500/12 border border-red-400/25 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password || (mode === 'register' && (!code || !email))}
            className="w-full py-2.5 text-sm font-semibold rounded-md bg-blue-500/80 hover:bg-blue-400/80
                       disabled:bg-white/10 disabled:text-white/25 text-white transition-all
                       border border-blue-400/30 mt-2"
          >
            {busy ? '…' : mode === 'login' ? 'Accedi' : 'Crea account'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-[10px] text-white/30 text-center mt-4">
            Il codice invito ti viene fornito dall'amministratore
          </p>
        )}
      </div>
    </div>
  )
}
