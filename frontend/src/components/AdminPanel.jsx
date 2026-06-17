import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-[10px] text-blue-400 hover:text-blue-300 font-medium px-2 py-0.5 border border-blue-400/30 rounded transition-colors flex-shrink-0"
    >
      {copied ? '✓ Copiato' : 'Copia'}
    </button>
  )
}

export default function AdminPanel({ onClose }) {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [invites, setInvites] = useState([])
  const [users,   setUsers]   = useState([])
  const [note,    setNote]    = useState('')
  const [days,    setDays]    = useState(7)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)

  const appUrl = window.location.origin

  async function fetchData() {
    const [ri, ru] = await Promise.all([
      fetch('/admin/invitations', { headers }),
      fetch('/admin/users',       { headers }),
    ])
    if (ri.ok) setInvites(await ri.json())
    if (ru.ok) setUsers(await ru.json())
  }

  useEffect(() => { fetchData() }, [])

  async function createInvite(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res  = await fetch('/admin/invitations', {
      method: 'POST', headers,
      body: JSON.stringify({ note, days }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.detail); return }
    setInvites(prev => [data, ...prev])
    setNote('')
  }

  async function deactivateUser(id) {
    if (!confirm('Disattivare questo utente?')) return
    await fetch(`/admin/users/${id}`, { method: 'DELETE', headers })
    fetchData()
  }

  const fmt = (d) => new Date(d).toLocaleDateString('it-IT')

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-bold text-white">Pannello amministratore</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Create invitation */}
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-3">
              Nuovo codice invito
            </p>
            <form onSubmit={createInvite} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[10px] text-white/40 mb-1">Nota (opzionale)</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                       placeholder="Es. Per Mario Rossi" className="gi" />
              </div>
              <div className="w-20">
                <label className="block text-[10px] text-white/40 mb-1">Scadenza</label>
                <select value={days} onChange={e => setDays(Number(e.target.value))} className="gi">
                  {[3,7,14,30].map(d => <option key={d} value={d}>{d}gg</option>)}
                </select>
              </div>
              <button type="submit" disabled={busy}
                      className="px-4 py-2 text-xs bg-blue-500/70 hover:bg-blue-400/70 text-white font-semibold rounded-md border border-blue-400/30 transition-all disabled:opacity-40 flex-shrink-0">
                Genera
              </button>
            </form>
            {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
          </div>

          {/* Invitations list */}
          {invites.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-2">
                Inviti ({invites.length})
              </p>
              <div className="space-y-1.5">
                {invites.map(inv => {
                  const registerUrl = `${appUrl}?invite=${inv.code}`
                  return (
                    <div key={inv.code}
                         className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs ${
                           inv.is_used ? 'bg-white/[0.03] text-white/30' : 'bg-white/[0.06]'
                         }`}>
                      <span className="font-mono text-[11px] text-blue-300/80 flex-shrink-0">{inv.code}</span>
                      <span className="flex-1 truncate text-white/50">{inv.note || '—'}</span>
                      <span className="text-white/30 whitespace-nowrap">
                        {inv.is_used ? `usato da ${inv.used_by}` : `scade ${fmt(inv.expires_at)}`}
                      </span>
                      {!inv.is_used && <CopyButton text={registerUrl} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Users list */}
          {users.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-2">
                Utenti ({users.length})
              </p>
              <div className="space-y-1">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/[0.04] text-xs">
                    <span className={`font-medium ${u.is_active ? 'text-white/80' : 'text-white/25 line-through'}`}>
                      {u.username}
                    </span>
                    {u.is_admin && <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-400/25">admin</span>}
                    <span className="text-white/35 flex-1">{u.email}</span>
                    <span className="text-white/25 whitespace-nowrap">{fmt(u.created_at)}</span>
                    {!u.is_admin && u.is_active && (
                      <button onClick={() => deactivateUser(u.id)}
                              className="text-[10px] text-white/25 hover:text-red-400 transition-colors">
                        Disattiva
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
