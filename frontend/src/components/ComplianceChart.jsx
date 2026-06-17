import {
  ComposedChart, Line, ReferenceLine, ReferenceArea,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

function CustomTooltip({ active, payload, label, vNominal, tne }) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  const dev = v - vNominal
  return (
    <div style={{ background: 'rgba(6,14,31,0.92)', border: '1px solid rgba(255,255,255,0.12)' }}
         className="rounded-md shadow-xl px-3 py-2 text-xs backdrop-blur-xl">
      <p className="font-semibold text-white/70 mb-1">{label} °C</p>
      <p className="text-blue-300 font-mono">V = {v?.toFixed(2)} mL</p>
      <p className={`font-medium font-mono ${Math.abs(dev) <= tne ? 'text-emerald-400' : 'text-red-400'}`}>
        {dev >= 0 ? '+' : ''}{dev?.toFixed(2)} mL
      </p>
    </div>
  )
}

export default function ComplianceChart({ sweep, vNominal, tne, tFill }) {
  if (!sweep?.length) return null

  const data = sweep.map(pt => ({
    T: pt.T_celsius,
    V: parseFloat(pt.V_mL.toFixed(3)),
  }))

  const yPad = tne * 1.8
  const yMin = Math.floor(vNominal - yPad)
  const yMax = Math.ceil(vNominal + yPad)

  const tickStyle = { fontSize: 10, fill: 'rgba(255,255,255,0.35)' }

  return (
    <div>
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-4">
        Volume a temperatura variabile (sweep 0–35 °C)
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />

          {/* TNE band */}
          <ReferenceArea
            y1={vNominal - tne} y2={vNominal + tne}
            fill="rgba(52,211,153,0.08)"
            label={{ value: `±${tne} mL`, position: 'insideTopRight', fontSize: 9, fill: 'rgba(52,211,153,0.6)' }}
          />

          {/* Nominal */}
          <ReferenceLine
            y={vNominal} stroke="rgba(255,255,255,0.2)" strokeDasharray="6 3"
            label={{ value: `${vNominal} mL`, position: 'insideTopLeft', fontSize: 9, fill: 'rgba(255,255,255,0.35)' }}
          />

          {/* 20°C */}
          <ReferenceLine
            x={20} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4"
            label={{ value: '20 °C', position: 'top', fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
          />

          {/* T fill */}
          {tFill !== 20 && (
            <ReferenceLine
              x={tFill} stroke="rgba(96,165,250,0.4)" strokeDasharray="3 6"
              label={{ value: 'T imbott.', position: 'insideTopLeft', fontSize: 8, fill: 'rgba(96,165,250,0.6)' }}
            />
          )}

          <XAxis
            dataKey="T" unit=" °C"
            tick={tickStyle} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={tickStyle} tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            width={52}
            unit=" mL"
          />
          <Tooltip content={<CustomTooltip vNominal={vNominal} tne={tne} />} />

          <Line
            dataKey="V" type="monotone"
            stroke="#60a5fa" strokeWidth={2}
            dot={{ r: 2.5, fill: '#60a5fa', stroke: 'none' }}
            activeDot={{ r: 4, fill: '#93c5fd' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
