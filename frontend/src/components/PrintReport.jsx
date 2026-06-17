/* Rendered only @media print — hidden on screen */
const S = {
  root:      { fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontSize: 11, color: '#1e293b', lineHeight: 1.5 },
  h1:        { fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#0f172a' },
  sub:       { fontSize: 10, color: '#64748b', marginBottom: 20 },
  h2:        { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 10, marginTop: 18 },
  grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 4 },
  grid3:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 4 },
  card:      { border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', background: '#f8fafc' },
  label:     { fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 2 },
  value:     { fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' },
  subvalue:  { fontSize: 10, color: '#64748b', marginTop: 1 },
  badge:     (ok, warn) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
    border: '1px solid',
    ...(ok && !warn ? { background: '#f0fdf4', color: '#166534', borderColor: '#86efac' }
      : ok && warn  ? { background: '#fffbeb', color: '#92400e', borderColor: '#fcd34d' }
      :               { background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }),
  }),
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 4 },
  th:        { padding: '5px 8px', background: '#f1f5f9', fontWeight: 600, textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' },
  thR:       { padding: '5px 8px', background: '#f1f5f9', fontWeight: 600, textAlign: 'right', borderBottom: '2px solid #e2e8f0', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' },
  td:        { padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' },
  tdR:       { padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b' },
  divider:   { border: 'none', borderTop: '1px solid #e2e8f0', margin: '16px 0' },
}

function ReportDate() {
  const now = new Date()
  return (
    <p style={S.sub}>
      Dilatazione Termica Apparente — Bevande alcoliche in bottiglia
      &nbsp;·&nbsp;
      {now.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
      &nbsp;{now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
    </p>
  )
}

function Kv({ label, value, sub }) {
  return (
    <div style={S.card}>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{value}</div>
      {sub && <div style={S.subvalue}>{sub}</div>}
    </div>
  )
}

function SingleResult({ result, label }) {
  if (!result) return null
  const { components, fill_recommendation: rec, eu_compliance: eu, T_fill, T_store, V_nominal_mL, abv } = result
  const { dV_apparent_mL, dV_water_mL, dV_ethanol_mL, dV_glass_mL } = components
  const dh = rec.h_adjustment_mm
  const isCompliant = eu.is_compliant
  const warnMargin  = eu.margin_mL < eu.TNE_mL * 0.3

  return (
    <div style={{ marginBottom: 24 }}>
      {label && <h2 style={{ ...S.h2, color: '#1e40af' }}>{label}</h2>}

      {/* Params row */}
      <h2 style={S.h2}>Parametri</h2>
      <div style={S.grid2}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Kv label="T imbottigliamento" value={`${T_fill} °C`} />
          <Kv label="T stoccaggio" value={`${T_store} °C`} sub={`ΔT = ${(T_store - T_fill).toFixed(1)} °C`} />
          {abv != null && <Kv label="Gradazione alcolica" value={`${abv} % vol`} />}
          <Kv label="Volume nominale" value={`${V_nominal_mL} mL`} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Kv label="h specifica produttore" value={`${rec.h_nominal_mm} mm`} sub="dalla bocca" />
          <Kv label="Scenario riferimento" value={rec.reference_scenario_label} />
          <Kv label="ΔV apparente" value={`${dV_apparent_mL >= 0 ? '+' : ''}${dV_apparent_mL.toFixed(4)} mL`}
               sub={`acqua ${dV_water_mL >= 0 ? '+' : ''}${dV_water_mL.toFixed(4)} · EtOH ${dV_ethanol_mL >= 0 ? '+' : ''}${dV_ethanol_mL.toFixed(4)} · vetro ${(-dV_glass_mL).toFixed(4)}`} />
          <Kv label="V nominale confermato a" value={rec.reference_scenario_label} />
        </div>
      </div>

      {/* Fill recommendation */}
      <h2 style={S.h2}>Livello di riempimento consigliato</h2>
      <div style={{ ...S.grid3, marginBottom: 8 }}>
        <Kv label="h consigliato" value={`${rec.h_fill_recommended_mm} mm`} sub="dalla bocca" />
        <Kv label="Correzione Δh"
             value={`${Math.abs(dh) < 0.05 ? '±0' : (dh > 0 ? '+' : '') + dh.toFixed(2)} mm`}
             sub={dh > 0.05 ? 'spazio aggiuntivo' : dh < -0.05 ? 'riduci spazio' : 'nessuna correzione'} />
        <Kv label="Livello a T stoccaggio" value={`${rec.h_at_store_mm} mm`} sub="verifica espansione" />
      </div>
      {dh > 0.05 && (
        <p style={{ fontSize: 10, color: '#c2410c', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 4, padding: '6px 10px' }}>
          ▲ Lascia +{dh.toFixed(2)} mm di spazio aggiuntivo — il liquido si espanderà fino allo h nominale a {rec.reference_scenario_label.toLowerCase()}.
        </p>
      )}
      {dh < -0.05 && (
        <p style={{ fontSize: 10, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, padding: '6px 10px' }}>
          ▼ Riduci lo spazio di {Math.abs(dh).toFixed(2)} mm — riempi con più liquido, che si contrarrà a {rec.reference_scenario_label.toLowerCase()}.
        </p>
      )}

      {/* Volume table */}
      <h2 style={S.h2}>Volumi alle temperature chiave</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Temperatura</th>
            <th style={S.thR}>Volume</th>
            <th style={S.thR}>Deviazione</th>
            <th style={S.thR}>Entro TNE?</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: `T imbottigliamento (${T_fill} °C)`, v: rec.V_at_fill_mL },
            { label: `T stoccaggio (${T_store} °C)`,      v: rec.V_at_store_mL },
            { label: '20 °C (riferimento UE)',             v: rec.V_at_20c_mL },
          ].map(({ label: l, v }) => {
            const dev = v - V_nominal_mL
            const ok  = Math.abs(dev) <= eu.TNE_mL
            return (
              <tr key={l}>
                <td style={S.td}>{l}</td>
                <td style={S.tdR}>{v.toFixed(3)} mL</td>
                <td style={{ ...S.tdR, color: ok ? '#166534' : '#991b1b' }}>
                  {dev >= 0 ? '+' : ''}{dev.toFixed(3)} mL
                </td>
                <td style={{ ...S.tdR, color: ok ? '#166534' : '#991b1b', fontWeight: 600 }}>
                  {ok ? 'Sì' : 'No'} (TNE ±{eu.TNE_mL} mL)
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Compliance */}
      <h2 style={S.h2}>Conformità UE — Dir. 76/211/CEE</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={S.badge(isCompliant, warnMargin)}>
          {isCompliant && !warnMargin ? 'CONFORME' : isCompliant ? 'CONFORME — MARGINE RIDOTTO' : 'NON CONFORME'}
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          V a 20 °C = {eu.V_at_20C_mL.toFixed(3)} mL
          &nbsp;·&nbsp;
          Deviazione = {eu.deviation_mL >= 0 ? '+' : ''}{eu.deviation_mL.toFixed(3)} mL
          &nbsp;·&nbsp;
          Margine = {eu.margin_mL.toFixed(2)} mL / TNE = ±{eu.TNE_mL} mL
        </span>
      </div>
      {(eu.overflow_risk || eu.underflow_risk) && (
        <p style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, padding: '5px 10px' }}>
          ▲ Nel range 0–35 °C il volume esce dalla banda TNE
          {eu.overflow_risk ? ' (rischio eccesso)' : ''}{eu.underflow_risk ? ' (rischio difetto)' : ''}
        </p>
      )}
    </div>
  )
}

function ComparisonTable({ comparisons }) {
  if (!comparisons.length) return null
  return (
    <div>
      <h2 style={S.h2}>Confronto bottiglie</h2>
      <table style={S.table}>
        <thead>
          <tr>
            {['Bottiglia', 'T imb.', 'T stocc.', 'ABV', 'V nom.', 'h spec.', 'h cons.', 'Δh', 'ΔV app.', 'V a 20°C', 'UE'].map(h => (
              <th key={h} style={h === 'Bottiglia' ? S.th : S.thR}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisons.map(({ id, label, result }) => {
            const rec = result.fill_recommendation
            const eu  = result.eu_compliance
            const dh  = rec.h_adjustment_mm
            const dv  = result.components.dV_apparent_mL
            const ok  = eu.is_compliant
            const warn = eu.margin_mL < eu.TNE_mL * 0.3
            return (
              <tr key={id}>
                <td style={S.td}>{label}</td>
                <td style={S.tdR}>{result.T_fill} °C</td>
                <td style={S.tdR}>{result.T_store} °C</td>
                <td style={S.tdR}>{result.abv != null ? `${result.abv}%` : '—'}</td>
                <td style={S.tdR}>{result.V_nominal_mL} mL</td>
                <td style={{ ...S.tdR, color: '#64748b' }}>{rec.h_nominal_mm} mm</td>
                <td style={{ ...S.tdR, fontWeight: 700 }}>{rec.h_fill_recommended_mm} mm</td>
                <td style={{ ...S.tdR, color: Math.abs(dh) < 0.05 ? '#94a3b8' : dh > 0 ? '#c2410c' : '#1d4ed8' }}>
                  {Math.abs(dh) < 0.05 ? '±0' : (dh > 0 ? '+' : '') + dh.toFixed(1)} mm
                </td>
                <td style={S.tdR}>{dv >= 0 ? '+' : ''}{dv.toFixed(3)} mL</td>
                <td style={S.tdR}>{eu.V_at_20C_mL.toFixed(2)} mL</td>
                <td style={{ ...S.tdR, color: ok && !warn ? '#166534' : ok ? '#92400e' : '#991b1b', fontWeight: 700 }}>
                  {ok && !warn ? '✓' : ok ? '▲' : '✗'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PrintReport({ result, comparisons }) {
  if (!result && (!comparisons || !comparisons.length)) return null

  const multipleResults = comparisons && comparisons.length >= 2

  return (
    <div id="print-report" style={{ display: 'none' }}>
      <div style={S.root}>
        <h1 style={S.h1}>Dilatazione Termica Apparente — Bevande Alcoliche</h1>
        <ReportDate />
        <hr style={S.divider} />

        {/* Single current result */}
        {result && !multipleResults && (
          <SingleResult result={result} />
        )}

        {/* Comparison list — print each if there are <= 4 */}
        {multipleResults && comparisons.length <= 3 && comparisons.map(c => (
          <div key={c.id} style={{ pageBreakInside: 'avoid' }}>
            <SingleResult result={c.result} label={c.label} />
            <hr style={S.divider} />
          </div>
        ))}

        {/* Always show the comparison table when 2+ */}
        {multipleResults && (
          <div style={{ pageBreakBefore: comparisons.length > 3 ? 'always' : 'avoid' }}>
            <ComparisonTable comparisons={comparisons} />
          </div>
        )}

        <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          Calcolo basato su Reg. UE 2019/787, Dir. 76/211/CEE, OIV OENO 556-2016 · Dilatazione termica apparente secondo Lallemand-Vinogradov
        </p>
      </div>
    </div>
  )
}
