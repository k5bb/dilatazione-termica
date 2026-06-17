import { useState, useRef } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage      from './pages/LoginPage'
import CalcoloForm    from './components/CalcoloForm'
import ResultsPanel   from './components/ResultsPanel'
import ComparisonPanel from './components/ComparisonPanel'
import PrintReport    from './components/PrintReport'
import IntroSection   from './components/IntroSection'
import AdminPanel     from './components/AdminPanel'

function AppInner() {
  const { user, logout } = useAuth()
  const [result,       setResult]       = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [comparisons,  setComparisons]  = useState([])
  const [showAdmin,    setShowAdmin]    = useState(false)
  const countRef = useRef(0)

  if (!user) return <LoginPage />

  function addToComparison() {
    if (!result) return
    countRef.current += 1
    setComparisons(prev => [...prev, { id: Date.now(), label: `Calcolo ${countRef.current}`, result }])
  }

  function removeFromComparison(id) {
    setComparisons(prev => prev.filter(c => c.id !== id))
  }

  function renameComparison(id, label) {
    setComparisons(prev => prev.map(c => c.id === id ? { ...c, label } : c))
  }

  return (
    <>
      <PrintReport result={result} comparisons={comparisons} />

      <div className="min-h-screen no-print-wrapper">

        {/* Header */}
        <header className="glass border-b border-white/10 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-sm font-bold text-white leading-none tracking-wide uppercase">
                Dilatazione Termica Apparente
              </h1>
              <p className="text-xs text-white/40 mt-0.5">
                Bevande alcoliche in bottiglia · Conformità Dir. UE 76/211/CEE
              </p>
            </div>

            {/* User controls */}
            <div className="flex items-center gap-3">
              {user.is_admin && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 border border-blue-400/30 hover:border-blue-300/50 px-2.5 py-1 rounded transition-all"
                >
                  Admin
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/35">{user.username}</span>
                <button
                  onClick={logout}
                  className="text-[10px] text-white/35 hover:text-white/70 transition-colors"
                >
                  Esci
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-5xl mx-auto px-4 py-6">

          <IntroSection />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div>
              <CalcoloForm onResult={setResult} loading={loading} setLoading={setLoading} />
            </div>
            <div>
              {loading && (
                <div className="flex items-center justify-center h-48 text-white/40">
                  <div className="text-center">
                    <div className="text-2xl mb-2 animate-spin inline-block">◌</div>
                    <p className="text-sm mt-2 tracking-wide">Calcolo in corso…</p>
                  </div>
                </div>
              )}
              {!loading && result && (
                <ResultsPanel result={result} onAddToComparison={addToComparison} />
              )}
              {!loading && !result && (
                <div className="flex items-center justify-center h-64 rounded-lg border border-white/10 text-white/30">
                  <div className="text-center">
                    <p className="text-3xl mb-3 opacity-40">◫</p>
                    <p className="text-sm">I risultati appariranno qui dopo il calcolo</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {comparisons.length > 0 && (
            <ComparisonPanel
              comparisons={comparisons}
              onRemove={removeFromComparison}
              onRename={renameComparison}
            />
          )}
        </main>

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      </div>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
