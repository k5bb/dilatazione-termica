import { useState, useEffect } from 'react'
import { getBottiglie, calcola } from '../api/client'
import PdfUpload from './PdfUpload'
import { useBottleLibrary } from '../hooks/useBottleLibrary'

const STANDARD_VOLUMES = [375, 500, 750, 1000, 1500, 3000]

const SCENARIOS = [
  {
    id: 'fill_temp',
    label: 'Temp. imbottigliamento',
    desc: 'V nominale rispettato alla temperatura di riempimento',
  },
  {
    id: 'storage_temp',
    label: 'Temp. stoccaggio',
    desc: 'V nominale rispettato alla temperatura di stoccaggio/vendita',
  },
  {
    id: 'ref_20c',
    label: '20 °C (rif. UE)',
    desc: 'V nominale rispettato a 20 °C (riferimento OIV / Dir. UE)',
  },
]

const DEFAULTS = {
  T_fill: 15,
  T_store: 20,
  V_nominal: 750,
  abv: 12,
  reference_scenario: 'fill_temp',
  neck_model: 'TRADITION',
  neck_points: null,
  _neck_select: 'TRADITION',
  h_nominal_mm: 10,
  residuo_zuccherino: 0,
  estratto_secco: 0,
}

function SectionTitle({ children }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-3">
      {children}
    </p>
  )
}

function Slider({ label, unit, value, min, max, step = 0.5, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-xs font-medium text-white/60">{label}</label>
        <span className="text-sm font-mono font-semibold text-blue-300">
          {value} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-[10px] text-white/25 mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

function NumberInput({ label, unit, value, min, max, step = 0.5, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="gi"
        />
        <span className="text-xs text-white/40 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  )
}

export default function CalcoloForm({ onResult, loading, setLoading }) {
  const [form, setForm] = useState(DEFAULTS)
  const [bottiglie, setBottiglie] = useState([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [error, setError] = useState(null)

  const { bottles, addBottle, removeBottle } = useBottleLibrary()

  useEffect(() => {
    getBottiglie().then(setBottiglie).catch(() => {})
  }, [])

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }))

  function applyLibraryBottle(bottle) {
    setForm(f => ({
      ...f,
      neck_model:   bottle.neck_points ? null : (f.neck_model ?? 'TRADITION'),
      neck_points:  bottle.neck_points,
      _neck_select: `lib:${bottle.id}`,
      ...(bottle.h_fill_mm  != null ? { h_nominal_mm: bottle.h_fill_mm }  : {}),
      ...(bottle.volume_mL  != null ? { V_nominal:    bottle.volume_mL }  : {}),
    }))
  }

  function handleNeckSelect(value) {
    if (value.startsWith('lib:')) {
      const id = value.slice(4)
      const bottle = bottles.find(b => b.id === id)
      if (bottle) applyLibraryBottle(bottle)
    } else if (value !== '__custom__') {
      setForm(f => ({
        ...f,
        neck_model:   value,
        neck_points:  null,
        _neck_select: value,
      }))
    }
  }

  const isPreset = STANDARD_VOLUMES.includes(form.V_nominal)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const neckPayload = form.neck_points
        ? { neck_points: form.neck_points }
        : { neck_model: form.neck_model ?? 'TRADITION' }

      const result = await calcola({
        T_fill: form.T_fill,
        T_store: form.T_store,
        V_nominal: form.V_nominal,
        abv: form.abv,
        reference_scenario: form.reference_scenario,
        ...neckPayload,
        h_nominal_mm: form.h_nominal_mm,
        residuo_zuccherino: form.residuo_zuccherino,
        estratto_secco: form.estratto_secco,
      })
      onResult({ ...result, abv: form.abv })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const dT = (form.T_store - form.T_fill).toFixed(1)
  const dTColor = dT > 0 ? 'text-orange-300' : dT < 0 ? 'text-blue-300' : 'text-white/40'

  const activeProfileInfo = (() => {
    if (form.neck_points) {
      const n = form.neck_points.length
      const h0 = form.neck_points[0].h_mm
      const h1 = form.neck_points[n - 1].h_mm
      return `Profilo personalizzato · ${n} punti · h ${h0}–${h1} mm`
    }
    return null
  })()

  return (
    <form onSubmit={handleSubmit} className="space-y-3">

      {/* Scenario */}
      <div className="glass rounded-lg p-5">
        <SectionTitle>Scenario di riferimento</SectionTitle>
        <div className="space-y-1.5">
          {SCENARIOS.map(s => (
            <label
              key={s.id}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                form.reference_scenario === s.id
                  ? 'bg-blue-500/20 border-blue-400/40'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <input
                type="radio" name="scenario" value={s.id}
                checked={form.reference_scenario === s.id}
                onChange={() => set('reference_scenario')(s.id)}
                className="mt-0.5 accent-blue-400"
              />
              <div>
                <p className={`text-xs font-semibold ${form.reference_scenario === s.id ? 'text-blue-300' : 'text-white/70'}`}>
                  {s.label}
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">{s.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Temperature */}
      <div className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Temperature</SectionTitle>
          <span className={`text-xs font-mono font-bold ${dTColor}`}>
            ΔT = {dT > 0 ? '+' : ''}{dT} °C
          </span>
        </div>
        <Slider
          label="Temperatura di imbottigliamento" unit="°C"
          value={form.T_fill} min={-5} max={50}
          onChange={set('T_fill')}
        />
        <Slider
          label="Temperatura di stoccaggio / vendita" unit="°C"
          value={form.T_store} min={-5} max={50}
          onChange={set('T_store')}
        />
      </div>

      {/* Bottiglia */}
      <div className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Bottiglia e prodotto</SectionTitle>
          <PdfUpload
            onApply={(data) => {
              setForm(f => ({
                ...f,
                ...(data.volume_mL  != null ? { V_nominal:    data.volume_mL }  : {}),
                ...(data.h_fill_mm  != null ? { h_nominal_mm: data.h_fill_mm }  : {}),
                ...(data.neck_points?.length >= 2 ? {
                  neck_points:  data.neck_points,
                  neck_model:   null,
                  _neck_select: '__custom__',
                } : {}),
              }))
            }}
            onSave={(data) => addBottle({ ...data, source: 'pdf' })}
          />
        </div>

        {/* Volume */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-2">Volume nominale</label>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {STANDARD_VOLUMES.map(v => (
              <button
                key={v} type="button"
                onClick={() => set('V_nominal')(v)}
                className={`py-1.5 text-xs rounded-md border font-medium transition-all ${
                  form.V_nominal === v
                    ? 'bg-blue-500/70 text-white border-blue-400/50'
                    : 'bg-white/5 text-white/60 border-white/10 hover:border-white/25 hover:text-white/80'
                }`}
              >
                {v < 1000 ? `${v} mL` : `${v / 1000} L`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={50} max={20000} step={1}
              value={form.V_nominal}
              onChange={e => set('V_nominal')(Number(e.target.value))}
              className="gi"
              placeholder="Volume personalizzato"
            />
            <span className="text-xs text-white/40 whitespace-nowrap">mL</span>
          </div>
          {!isPreset && (
            <p className="text-[10px] text-blue-400/80 mt-1">Volume personalizzato</p>
          )}
        </div>

        <Slider
          label="Gradazione alcolica" unit="% vol"
          value={form.abv} min={0} max={96} step={0.5}
          onChange={set('abv')}
        />

        {/* Neck selector */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">Modello collo bottiglia</label>
          <select
            value={form._neck_select}
            onChange={e => handleNeckSelect(e.target.value)}
            className="gi"
          >
            <optgroup label="Modelli integrati">
              {bottiglie.length === 0 && (
                <option value="TRADITION">TRADITION (default)</option>
              )}
              {bottiglie.map(b => (
                <option key={b.name} value={b.name}>
                  {b.name} — {b.description}
                </option>
              ))}
            </optgroup>
            {form._neck_select === '__custom__' && (
              <option value="__custom__" disabled>Profilo importato da PDF</option>
            )}
            {bottles.length > 0 && (
              <optgroup label="Libreria personale">
                {bottles.map(b => (
                  <option key={b.id} value={`lib:${b.id}`}>
                    {b.name}{b.neck_points ? '' : ' (vol./h senza profilo)'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {activeProfileInfo && (
            <p className="text-[10px] text-emerald-400 mt-1">{activeProfileInfo}</p>
          )}
          {form._neck_select.startsWith('lib:') && !form.neck_points && (
            <p className="text-[10px] text-amber-400 mt-1">
              Bottiglia senza profilo collo — usa il modello integrato come approssimazione.
            </p>
          )}
        </div>

        {/* Library */}
        {bottles.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowLibrary(v => !v)}
              className="w-full flex items-center justify-between text-[10px] text-white/40 hover:text-white/60 py-1 uppercase tracking-widest"
            >
              <span>Libreria personale ({bottles.length})</span>
              <span>{showLibrary ? '▲' : '▼'}</span>
            </button>
            {showLibrary && (
              <div className="mt-2 space-y-1.5">
                {bottles.map(b => (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 p-2.5 rounded-md border transition-all ${
                      form._neck_select === `lib:${b.id}`
                        ? 'bg-blue-500/20 border-blue-400/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{b.name}</p>
                      <p className="text-[10px] text-white/35">
                        {b.volume_mL != null && `${b.volume_mL} mL`}
                        {b.h_fill_mm != null && ` · h = ${b.h_fill_mm} mm`}
                        {b.neck_points
                          ? ` · ${b.neck_points.length} pts collo`
                          : ' · senza profilo'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyLibraryBottle(b)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-1 rounded border border-blue-400/30 hover:border-blue-300/50 transition-all flex-shrink-0"
                    >
                      Usa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeBottle(b.id)
                        if (form._neck_select === `lib:${b.id}`) {
                          setForm(f => ({
                            ...f,
                            neck_model: 'TRADITION',
                            neck_points: null,
                            _neck_select: 'TRADITION',
                          }))
                        }
                      }}
                      className="text-[10px] text-white/25 hover:text-red-400 px-1 py-1 flex-shrink-0 transition-colors"
                      title="Rimuovi dalla libreria"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <NumberInput
          label="Livello di riempimento nominale (headspace)"
          unit="mm"
          value={form.h_nominal_mm}
          min={0} max={200} step={0.5}
          onChange={set('h_nominal_mm')}
        />
        <p className="text-[10px] text-white/30 -mt-2">
          Spazio vuoto dalla bocca al pelo del liquido, come da scheda tecnica.
        </p>
      </div>

      {/* Parametri avanzati */}
      <div className="glass rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-white/40 hover:text-white/60 transition-colors"
        >
          <span>Parametri avanzati</span>
          <span>{showAdvanced ? '▲' : '▼'}</span>
        </button>
        {showAdvanced && (
          <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
            <NumberInput
              label="Residuo zuccherino" unit="g/L"
              value={form.residuo_zuccherino} min={0} max={500} step={1}
              onChange={set('residuo_zuccherino')}
            />
            <NumberInput
              label="Estratto secco totale" unit="g/L"
              value={form.estratto_secco} min={0} max={500} step={1}
              onChange={set('estratto_secco')}
            />
            <p className="text-[10px] text-white/30">
              Correzioni sulla densità della miscela (rilevanti per vini dolci e liquorosi).
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-400/30 text-red-300 text-xs px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <button
        type="submit" disabled={loading}
        className="w-full bg-blue-500/80 hover:bg-blue-400/80 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold py-3 rounded-md transition-all text-sm tracking-wide border border-blue-400/30"
      >
        {loading ? 'Calcolo in corso…' : 'Calcola'}
      </button>
    </form>
  )
}
