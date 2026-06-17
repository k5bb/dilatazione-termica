import { useMemo } from 'react'
import { pchip, densifyProfile } from '../utils/spline'

const WALL_MM = 3.5
const SCALE   = 3.2
const PAD_T   = 22
const PAD_B   = 16
const PAD_L   = 30
const PAD_R   = 12

const C_GLASS  = 'rgba(148,163,184,0.25)'   // glass wall fill
const C_LIQUID = 'rgba(96,165,250,0.18)'    // liquid fill
const C_TICK   = 'rgba(255,255,255,0.2)'
const C_LABEL  = 'rgba(255,255,255,0.35)'
const C_CENTER = 'rgba(255,255,255,0.06)'

function poly(arr) {
  return arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export default function BottleNeckDiagram({ neckPoints, rec, T_store }) {
  const sorted = useMemo(
    () => [...neckPoints].sort((a, b) => a.h_mm - b.h_mm),
    [neckPoints]
  )

  const { h_nominal_mm, h_fill_recommended_mm, h_at_store_mm, h_at_20c_mm } = rec

  const maxH = Math.ceil(
    Math.max(h_nominal_mm, h_fill_recommended_mm, h_at_store_mm, h_at_20c_mm) + 15
  )

  const interpD = useMemo(() => {
    const xs = sorted.map(p => p.h_mm)
    const ys = sorted.map(p => p.d_int_mm)
    return pchip(xs, ys)
  }, [sorted])

  const pts = useMemo(() => {
    const dense   = densifyProfile(sorted, 1)
    const clipped = dense.filter(p => p.h_mm <= maxH)
    if (!clipped.length || clipped[clipped.length - 1].h_mm < maxH - 0.5) {
      clipped.push({ h_mm: maxH, d_int_mm: interpD(maxH) })
    }
    return clipped
  }, [sorted, maxH, interpD])

  const maxOuterR = useMemo(
    () => Math.max(...pts.map(p => p.d_int_mm / 2 + WALL_MM)),
    [pts]
  )
  const cx = PAD_L + maxOuterR * SCALE

  const toY = h => PAD_T + h * SCALE
  const iL  = d => cx - (d / 2) * SCALE
  const iR  = d => cx + (d / 2) * SCALE
  const oL  = d => cx - (d / 2 + WALL_MM) * SCALE
  const oR  = d => cx + (d / 2 + WALL_MM) * SCALE

  const svgW = Math.round(cx + maxOuterR * SCALE + PAD_R)
  const svgH = Math.round(PAD_T + maxH * SCALE + PAD_B)

  const leftGlass = poly([
    ...pts.map(p => [oL(p.d_int_mm), toY(p.h_mm)]),
    ...pts.slice().reverse().map(p => [iL(p.d_int_mm), toY(p.h_mm)]),
  ])
  const rightGlass = poly([
    ...pts.map(p => [iR(p.d_int_mm), toY(p.h_mm)]),
    ...pts.slice().reverse().map(p => [oR(p.d_int_mm), toY(p.h_mm)]),
  ])

  const liquidPoly = (() => {
    const h0   = h_fill_recommended_mm
    const top  = { h_mm: h0, d_int_mm: interpD(h0) }
    const lPts = [top, ...pts.filter(p => p.h_mm > h0)]
    return poly([
      ...lPts.map(p => [iL(p.d_int_mm), toY(p.h_mm)]),
      ...lPts.slice().reverse().map(p => [iR(p.d_int_mm), toY(p.h_mm)]),
    ])
  })()

  const levels = (() => {
    const defs = [
      { key: 'nom',   h: h_nominal_mm,         color: 'rgba(255,255,255,0.25)', dash: '4,3', label: 'Specifica produttore' },
      { key: 'fill',  h: h_fill_recommended_mm, color: '#60a5fa',               dash: null,  label: 'Riempimento consigliato' },
      { key: 'store', h: h_at_store_mm,         color: '#34d399',               dash: '6,3', label: `Livello a T stoccaggio (${T_store} °C)` },
    ]
    if (Math.abs(h_at_20c_mm - h_at_store_mm) > 0.4) {
      defs.push({ key: '20c', h: h_at_20c_mm, color: '#fbbf24', dash: '2,4', label: 'Livello a 20 °C (rif. UE)' })
    }
    return defs.map(d => ({ ...d, d_int: interpD(d.h) }))
  })()

  const bore_d = sorted[0].d_int_mm
  const ticks  = []
  for (let h = 0; h <= maxH; h += 10) ticks.push(h)

  return (
    <div className="glass rounded-lg p-5">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 mb-1">
        Profilo collo — livelli di riempimento
      </p>
      <p className="text-[10px] text-white/25 mb-4">
        Sezione longitudinale · spessore vetro ipotizzato {WALL_MM} mm · quote mm dalla bocca
      </p>

      <div className="flex justify-center overflow-x-auto">
        <svg width={svgW} height={svgH} aria-label="Sezione collo bottiglia">

          <polygon points={liquidPoly} fill={C_LIQUID} />
          <polygon points={leftGlass}  fill={C_GLASS} />
          <polygon points={rightGlass} fill={C_GLASS} />

          {/* Ring cap */}
          <rect
            x={oL(bore_d)} y={PAD_T - 5}
            width={oR(bore_d) - oL(bore_d)} height={5}
            fill="rgba(148,163,184,0.4)"
          />
          <text x={cx} y={PAD_T - 8} textAnchor="middle" fontSize={7} fill={C_LABEL}>
            bocca (h = 0)
          </text>

          {/* Centerline */}
          <line x1={cx} y1={PAD_T} x2={cx} y2={PAD_T + maxH * SCALE}
                stroke={C_CENTER} strokeWidth={1} strokeDasharray="4,4" />

          {/* Y-axis ticks */}
          {ticks.map(h => (
            <g key={h}>
              <line x1={PAD_L - 4} y1={toY(h)} x2={PAD_L - 1} y2={toY(h)}
                    stroke={C_TICK} strokeWidth={1} />
              <text x={PAD_L - 6} y={toY(h) + 3} textAnchor="end" fontSize={7} fill={C_LABEL}>
                {h}
              </text>
            </g>
          ))}

          {/* Level lines */}
          {levels.map(({ key, h, d_int, color, dash }) => (
            <line
              key={key}
              x1={oL(d_int)} y1={toY(h)}
              x2={oR(d_int)} y2={toY(h)}
              stroke={color}
              strokeWidth={1.8}
              strokeDasharray={dash || undefined}
            />
          ))}

        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 space-y-1.5">
        {levels.map(({ key, color, dash, label, h }) => (
          <div key={key} className="flex items-center gap-2">
            <svg width={28} height={10} className="flex-shrink-0">
              <line x1={0} y1={5} x2={28} y2={5}
                stroke={color} strokeWidth={2.5}
                strokeDasharray={dash || undefined} />
            </svg>
            <span className="text-[10px] text-white/55">{label}</span>
            <span className="text-[10px] font-mono text-white/35 ml-auto">{h.toFixed(1)} mm</span>
          </div>
        ))}
        <div className="flex items-center gap-4 pt-1.5 mt-0.5 border-t border-white/8">
          <div className="flex items-center gap-1.5">
            <svg width={12} height={8}><rect x={0} y={1} width={12} height={6} fill={C_LIQUID} /></svg>
            <span className="text-[10px] text-white/35">Liquido</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width={12} height={8}><rect x={0} y={1} width={12} height={6} fill={C_GLASS} /></svg>
            <span className="text-[10px] text-white/35">Vetro (spessore ipotizzato)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
