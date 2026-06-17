import { useState } from 'react'

function EditableLabel({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  function commit() {
    onChange(draft.trim() || value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="gi text-xs"
        style={{ maxWidth: 140 }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className="text-left text-xs text-white hover:text-blue-300 transition-colors group"
    >
      {value}
      <span className="ml-1 text-[9px] text-white/25 group-hover:text-blue-300/50">✎</span>
    </button>
  )
}

export default function ComparisonPanel({ comparisons, onRemove, onRename }) {
  if (!comparisons.length) return null

  return (
    <div className="glass rounded-lg mt-6 no-print">
      <div className="px-5 py-3 border-b border-white/10">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40">
          Confronto bottiglie ({comparisons.length})
        </p>
        {comparisons.length < 2 && (
          <p className="text-[10px] text-white/30 mt-0.5">
            Aggiungi un secondo calcolo per confrontare le bottiglie
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/8">
              {[
                ['Bottiglia',  'text-left px-5'],
                ['T imb.',     'text-right px-3'],
                ['T stocc.',   'text-right px-3'],
                ['ABV',        'text-right px-3'],
                ['V nom.',     'text-right px-3'],
                ['h spec.',    'text-right px-3'],
                ['h cons.',    'text-right px-3'],
                ['Δh',         'text-right px-3'],
                ['ΔV app.',    'text-right px-3'],
                ['UE',         'text-center px-3'],
                ['',           'w-8'],
              ].map(([label, cls]) => (
                <th key={label} className={`${cls} py-2.5 text-[9px] font-semibold tracking-widest uppercase text-white/35`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {comparisons.map(({ id, label, result }) => {
              const rec = result.fill_recommendation
              const eu  = result.eu_compliance
              const dh  = rec.h_adjustment_mm
              const dv  = result.components.dV_apparent_mL

              const dhColor = dh > 0.05
                ? 'text-orange-300'
                : dh < -0.05
                ? 'text-blue-300'
                : 'text-white/30'

              let euBadge, euBg
              if (!eu.is_compliant) {
                euBadge = '✗'; euBg = 'bg-red-500/15 text-red-300 border-red-400/25'
              } else if (eu.margin_mL < eu.TNE_mL * 0.3) {
                euBadge = '▲'; euBg = 'bg-amber-500/15 text-amber-300 border-amber-400/25'
              } else {
                euBadge = '✓'; euBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25'
              }

              return (
                <tr key={id} className="hover:bg-white/[0.025] transition-colors">
                  <td className="px-5 py-2.5">
                    <EditableLabel value={label} onChange={v => onRename(id, v)} />
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/55 whitespace-nowrap">
                    {result.T_fill} °C
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/55 whitespace-nowrap">
                    {result.T_store} °C
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/55 whitespace-nowrap">
                    {result.abv != null ? `${result.abv}%` : '—'}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/55 whitespace-nowrap">
                    {result.V_nominal_mL} mL
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/40 whitespace-nowrap">
                    {rec.h_nominal_mm} mm
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono font-semibold text-white whitespace-nowrap">
                    {rec.h_fill_recommended_mm} mm
                  </td>
                  <td className={`text-right px-3 py-2.5 font-mono font-medium whitespace-nowrap ${dhColor}`}>
                    {Math.abs(dh) < 0.05 ? '±0' : (dh > 0 ? '+' : '') + dh.toFixed(1)} mm
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono text-white/55 whitespace-nowrap">
                    {dv >= 0 ? '+' : ''}{dv.toFixed(3)} mL
                  </td>
                  <td className="text-center px-3 py-2.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${euBg}`}>
                      {euBadge}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      onClick={() => onRemove(id)}
                      className="text-white/25 hover:text-red-400/70 transition-colors leading-none"
                      title="Rimuovi dal confronto"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
