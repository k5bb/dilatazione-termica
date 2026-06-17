import { useRef, useState } from 'react'
import { parsePdf } from '../api/client'
import NeckProfilePreview from './NeckProfilePreview'

function ConfidenceBadge({ confidence }) {
  const styles = {
    high:   'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25',
    medium: 'bg-amber-500/15   text-amber-300   border border-amber-400/25',
    low:    'bg-red-500/15     text-red-300     border border-red-400/25',
  }
  const labels = { high: 'Alta', medium: 'Media', low: 'Bassa' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${styles[confidence]}`}>
      Affidabilità: {labels[confidence]}
    </span>
  )
}

function Field({ label, value, unit, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-white/50 mb-1 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={placeholder ?? 'non trovato'}
          className={`gi ${value == null ? 'border-amber-400/30' : ''}`}
        />
        {unit && <span className="text-xs text-white/35 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  )
}

export default function PdfUpload({ onApply, onSave }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [extracted, setExtracted] = useState(null)
  const [edited, setEdited] = useState({})
  const [saved, setSaved] = useState(false)

  function reset() {
    setStatus('idle')
    setError(null)
    setExtracted(null)
    setEdited({})
    setSaved(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('loading')
    setError(null)
    setSaved(false)
    try {
      const data = await parsePdf(file)
      setExtracted(data)
      setEdited({
        name:             data.name,
        volume_mL:        data.volume_mL,
        h_fill_mm:        data.h_fill_mm,
        bore_diameter_mm: data.bore_diameter_mm,
        neck_points:      data.neck_points ?? null,
      })
      setStatus('confirm')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  function handleApply() {
    onApply({
      name:             edited.name,
      volume_mL:        edited.volume_mL,
      h_fill_mm:        edited.h_fill_mm,
      bore_diameter_mm: edited.bore_diameter_mm,
      neck_points:      edited.neck_points,
    })
    reset()
  }

  function handleSave() {
    onSave?.({
      name:             edited.name,
      volume_mL:        edited.volume_mL,
      h_fill_mm:        edited.h_fill_mm,
      bore_diameter_mm: edited.bore_diameter_mm,
      neck_points:      edited.neck_points,
      source:           'pdf',
    })
    setSaved(true)
  }

  const set = (key) => (val) => setEdited(e => ({ ...e, [key]: val }))

  const hasProfile = Array.isArray(edited.neck_points) && edited.neck_points.length >= 2
  const canApply   = edited.h_fill_mm != null && edited.volume_mL != null

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-medium py-1 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
        </svg>
        Importa PDF
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFile}
      />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass rounded-lg p-8 text-center max-w-sm mx-4">
            <div className="text-2xl animate-spin inline-block mb-4 text-blue-400">◌</div>
            <p className="text-sm font-medium text-white">Analisi PDF in corso…</p>
            <p className="text-xs text-white/40 mt-1">Potrebbe richiedere qualche secondo</p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 mt-2 text-xs text-red-300 bg-red-500/10 border border-red-400/25 rounded-md px-3 py-2">
          <span>▲</span>
          <span>{error}</span>
          <button onClick={reset} className="ml-auto font-medium hover:text-red-200 transition-colors">Chiudi</button>
        </div>
      )}

      {/* Confirm modal */}
      {status === 'confirm' && extracted && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Dati estratti dal PDF</h3>
                <ConfidenceBadge confidence={extracted.confidence} />
              </div>
              {extracted.source === 'vision' && (
                <p className="text-[10px] text-blue-400/70 mt-1">Analisi visiva (IA) — PDF senza testo estraibile</p>
              )}
              {extracted.source === 'partial' && (
                <p className="text-[10px] text-amber-400/70 mt-1">Estrazione parziale — alcuni campi integrati con IA</p>
              )}
            </div>

            {/* Body */}
            <div className="flex overflow-y-auto flex-1 min-h-0">

              {/* Left: fields */}
              <div className="flex-1 px-6 py-4 space-y-3 min-w-0">

                <div>
                  <label className="block text-[10px] font-medium text-white/50 mb-1 uppercase tracking-wider">Nome / modello</label>
                  <input
                    type="text"
                    value={edited.name ?? ''}
                    onChange={e => set('name')(e.target.value || null)}
                    placeholder="non trovato"
                    className="gi"
                  />
                </div>

                <Field label="Volume nominale"            value={edited.volume_mL}        unit="mL" onChange={set('volume_mL')} />
                <Field label="Livello di riempimento"     value={edited.h_fill_mm}         unit="mm" onChange={set('h_fill_mm')} />
                <Field label="Diametro interno imboccatura" value={edited.bore_diameter_mm} unit="mm" onChange={set('bore_diameter_mm')} />

                {/* Neck profile status */}
                <div className={`flex items-start gap-2 text-[10px] rounded-md px-3 py-2 border ${
                  hasProfile
                    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                    : 'bg-white/5 border-white/8 text-white/35'
                }`}>
                  <span className="mt-0.5 flex-shrink-0">{hasProfile ? '✓' : '○'}</span>
                  <span>
                    {hasProfile
                      ? `Profilo collo: ${edited.neck_points.length} punti · h ${edited.neck_points[0].h_mm}–${edited.neck_points[edited.neck_points.length-1].h_mm} mm`
                      : 'Profilo collo non estratto — sarà usato il modello integrato selezionato'}
                  </span>
                </div>

                {/* Warnings */}
                {extracted.warnings?.length > 0 && (
                  <div className="space-y-1">
                    {extracted.warnings.map((w, i) => (
                      <p key={i} className="text-[10px] text-amber-300/80 bg-amber-500/8 border border-amber-400/15 rounded-md px-3 py-1.5">
                        ▲ {w}
                      </p>
                    ))}
                  </div>
                )}
                {edited.h_fill_mm == null && (
                  <p className="text-[10px] text-amber-300/80 bg-amber-500/8 border border-amber-400/15 rounded-md px-3 py-1.5">
                    ▲ Livello di riempimento non trovato — inseriscilo manualmente.
                  </p>
                )}
                {edited.volume_mL == null && (
                  <p className="text-[10px] text-amber-300/80 bg-amber-500/8 border border-amber-400/15 rounded-md px-3 py-1.5">
                    ▲ Volume nominale non trovato — inseriscilo manualmente.
                  </p>
                )}

                {/* Save */}
                {onSave && (
                  <div className="border border-white/8 rounded-md px-4 py-3">
                    <p className="text-[10px] text-white/35 mb-2">
                      Salva questa bottiglia nella libreria personale per riutilizzarla.
                    </p>
                    {saved ? (
                      <p className="text-[10px] font-medium text-emerald-400">✓ Salvata in libreria</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={!edited.name}
                        className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 disabled:text-white/25 transition-colors"
                      >
                        + Salva in libreria
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: neck diagram */}
              {hasProfile && (
                <div className="w-52 flex-shrink-0 border-l border-white/8 px-4 py-4">
                  <p className="text-[10px] font-medium text-white/40 mb-3 text-center uppercase tracking-wider">
                    Profilo collo estratto
                  </p>
                  <NeckProfilePreview
                    neckPoints={edited.neck_points}
                    hFillMm={edited.h_fill_mm}
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 text-xs text-white/50 hover:text-white/80 font-medium transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!canApply}
                className="px-5 py-2 text-xs bg-blue-500/70 hover:bg-blue-400/70 disabled:bg-white/10 disabled:text-white/25 text-white font-semibold rounded-md transition-all border border-blue-400/30"
              >
                Applica al calcolo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
