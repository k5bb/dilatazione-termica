import ComplianceChart from './ComplianceChart'
import BottleNeckDiagram from './BottleNeckDiagram'

function SectionTitle({ children }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-3">
      {children}
    </p>
  )
}

function VolumeRow({ label, value, vNominal, tne, highlight }) {
  const dev = value - vNominal
  const ok = Math.abs(dev) <= tne
  const sign = dev >= 0 ? '+' : ''
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-md ${highlight ? 'bg-white/[0.06]' : ''}`}>
      <span className="text-xs text-white/55">{label}</span>
      <div className="text-right">
        <span className="font-mono font-semibold text-sm text-white">{value.toFixed(2)} mL</span>
        <span className={`ml-2 text-[10px] font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
          ({sign}{dev.toFixed(2)})
        </span>
      </div>
    </div>
  )
}

function FillBox({ rec }) {
  const adj = rec.h_adjustment_mm
  const isMore = adj > 0.05
  const isLess = adj < -0.05
  const isNone = !isMore && !isLess

  return (
    <div className="glass rounded-lg p-5">
      <SectionTitle>Livello di riempimento consigliato</SectionTitle>
      <p className="text-[10px] text-white/35 mb-4">
        Headspace dalla bocca al pelo del liquido ·
        Scenario: <strong className="text-white/55">{rec.reference_scenario_label}</strong>
      </p>

      <div className="flex items-end gap-4 mb-4">
        <div className="text-center">
          <p className="text-[10px] text-white/40 mb-1">Specifica produttore</p>
          <p className="text-2xl font-mono font-bold text-white/30">{rec.h_nominal_mm} mm</p>
        </div>
        <div className="text-xl text-white/20 mb-1">→</div>
        <div className="text-center">
          <p className="text-[10px] text-white/40 mb-1">Consigliato alla T imbottigliamento</p>
          <p className={`text-3xl font-mono font-bold ${
            isNone ? 'text-white' : isMore ? 'text-orange-300' : 'text-blue-300'
          }`}>
            {rec.h_fill_recommended_mm} mm
          </p>
        </div>
      </div>

      {isMore && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md bg-orange-500/10 border border-orange-400/20 text-orange-300">
          <span className="mt-0.5">▲</span>
          <span>
            <strong>+{adj.toFixed(2)} mm di spazio aggiuntivo</strong> rispetto alla specifica —
            il liquido si espanderà fino al livello nominale a {rec.reference_scenario_label.toLowerCase()}.
          </span>
        </div>
      )}
      {isLess && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md bg-blue-500/10 border border-blue-400/20 text-blue-300">
          <span className="mt-0.5">▼</span>
          <span>
            <strong>Riduci lo spazio di {Math.abs(adj).toFixed(2)} mm</strong> rispetto alla specifica —
            riempi con più liquido, che si contrarrà a {rec.reference_scenario_label.toLowerCase()}.
          </span>
        </div>
      )}
      {isNone && (
        <p className="text-xs text-white/40 bg-white/5 px-3 py-2 rounded-md">
          Nessuna correzione — riempi alla specifica produttore
        </p>
      )}
    </div>
  )
}

function BarRow({ label, value, total, color }) {
  const pct = total !== 0 ? Math.abs(value / total) * 100 : 0
  const bar = {
    blue:  'bg-blue-400',
    green: 'bg-emerald-400',
    gray:  'bg-white/20',
  }[color]
  const sign = value >= 0 ? '+' : ''
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-white/55">{label}</span>
        <span className="font-mono font-medium text-white/80">{sign}{value.toFixed(4)} mL</span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ComplianceBadge({ eu }) {
  const { is_compliant, V_at_20C_mL, V_nominal_mL, TNE_mL, deviation_mL, margin_mL, overflow_risk, underflow_risk } = eu
  const sign = deviation_mL >= 0 ? '+' : ''

  let label, bg, border, text
  if (!is_compliant) {
    label = 'NON CONFORME'
    bg = 'bg-red-500/12'; border = 'border-red-400/25'; text = 'text-red-300'
  } else if (margin_mL < TNE_mL * 0.3) {
    label = 'CONFORME — MARGINE RIDOTTO'
    bg = 'bg-amber-500/12'; border = 'border-amber-400/25'; text = 'text-amber-300'
  } else {
    label = 'CONFORME'
    bg = 'bg-emerald-500/12'; border = 'border-emerald-400/25'; text = 'text-emerald-300'
  }

  return (
    <div className={`rounded-lg border ${bg} ${border} p-5`}>
      <SectionTitle>Conformità UE</SectionTitle>
      <div className="flex items-center gap-3 mb-4">
        <div>
          <p className={`font-bold text-xs tracking-wide ${text}`}>Dir. UE 76/211/CEE — {label}</p>
          <p className="text-[10px] text-white/35 mt-0.5">Volume a 20 °C (T rif. OIV OENO 556-2016)</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'V a 20 °C',      val: `${V_at_20C_mL.toFixed(2)} mL` },
          { label: 'Deviazione',     val: `${sign}${deviation_mL.toFixed(2)} mL`, colored: true },
          { label: 'TNE / Margine',  val: `±${TNE_mL} / ${margin_mL.toFixed(1)} mL` },
        ].map(({ label, val, colored }) => (
          <div key={label} className="bg-white/5 border border-white/8 rounded-md p-2">
            <p className="text-[9px] text-white/40 mb-0.5 uppercase tracking-wider">{label}</p>
            <p className={`font-mono font-bold text-xs ${colored ? (deviation_mL < 0 ? 'text-red-400' : 'text-emerald-400') : 'text-white/80'}`}>
              {val}
            </p>
          </div>
        ))}
      </div>
      {(overflow_risk || underflow_risk) && (
        <p className="mt-3 text-[10px] text-amber-400/80 bg-amber-500/8 border border-amber-400/15 rounded-md px-3 py-2">
          Nel range 0–35 °C il volume esce dalla banda TNE
          {overflow_risk ? ' (rischio eccesso)' : ''}{underflow_risk ? ' (rischio difetto)' : ''}
        </p>
      )}
    </div>
  )
}

export default function ResultsPanel({ result, onAddToComparison }) {
  if (!result) return null

  const { components, fill_recommendation: rec, eu_compliance: eu, T_fill, T_store, V_nominal_mL, neck_points } = result
  const { dV_apparent_mL, dV_water_mL, dV_ethanol_mL, dV_glass_mL } = components

  return (
    <div className="space-y-3">

      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 no-print">
        {onAddToComparison && (
          <button
            onClick={onAddToComparison}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white/55 hover:text-white/90 border border-white/15 hover:border-white/30 rounded-md transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Aggiungi al confronto
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white/55 hover:text-white/90 border border-white/15 hover:border-white/30 rounded-md transition-all"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
          </svg>
          Esporta PDF
        </button>
      </div>

      <FillBox rec={rec} vNominal={V_nominal_mL} />

      {neck_points && neck_points.length >= 2 && (
        <BottleNeckDiagram neckPoints={neck_points} rec={rec} T_store={T_store} />
      )}

      {/* Volume table */}
      <div className="glass rounded-lg p-5">
        <SectionTitle>Volume alle temperature chiave</SectionTitle>
        <div className="divide-y divide-white/8">
          <VolumeRow
            label={`A T imbott. (${T_fill} °C)`}
            value={rec.V_at_fill_mL}
            vNominal={V_nominal_mL} tne={eu.TNE_mL}
            highlight={result.T_fill === 20}
          />
          <VolumeRow
            label={`A T stoccaggio (${T_store} °C)`}
            value={rec.V_at_store_mL}
            vNominal={V_nominal_mL} tne={eu.TNE_mL}
          />
          <VolumeRow
            label="A 20 °C (riferimento UE)"
            value={rec.V_at_20c_mL}
            vNominal={V_nominal_mL} tne={eu.TNE_mL}
            highlight
          />
        </div>
        <p className="text-[10px] text-white/30 mt-3">
          ( ) = deviazione dal volume nominale · verde se entro TNE ±{eu.TNE_mL} mL
        </p>
      </div>

      {/* Components */}
      <div className="glass rounded-lg p-5">
        <SectionTitle>Dilatazione apparente: {T_fill} → {T_store} °C</SectionTitle>
        <p className="text-[10px] text-white/40 mb-4">
          ΔV totale = {dV_apparent_mL > 0 ? '+' : ''}{dV_apparent_mL.toFixed(4)} mL
        </p>
        <div className="space-y-3">
          <BarRow label="Acqua"   value={dV_water_mL}   total={dV_water_mL + dV_ethanol_mL} color="blue" />
          <BarRow label="Etanolo" value={dV_ethanol_mL} total={dV_water_mL + dV_ethanol_mL} color="green" />
          <div className="border-t border-white/8 pt-2">
            <BarRow
              label="Vetro (espansione contenitore)"
              value={-dV_glass_mL}
              total={dV_water_mL + dV_ethanol_mL}
              color="gray"
            />
          </div>
        </div>
      </div>

      <ComplianceBadge eu={eu} />

      {/* Chart */}
      <div className="glass rounded-lg p-5">
        <ComplianceChart
          sweep={eu.sweep}
          vNominal={V_nominal_mL}
          tne={eu.TNE_mL}
          tFill={T_fill}
        />
      </div>

    </div>
  )
}
