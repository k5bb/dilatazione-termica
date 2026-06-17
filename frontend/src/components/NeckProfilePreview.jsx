import { useMemo } from 'react'
import { pchip, densifyProfile } from '../utils/spline'

const WALL  = 3.5
const SCALE = 2.8
const PAD_T = 18
const PAD_B = 14
const PAD_L = 28
const PAD_R = 68

const C_GLASS  = 'rgba(148,163,184,0.25)'
const C_LIQUID = 'rgba(96,165,250,0.18)'
const C_TICK   = 'rgba(255,255,255,0.18)'
const C_LABEL  = 'rgba(255,255,255,0.35)'

function poly(arr) {
  return arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export default function NeckProfilePreview({ neckPoints, hFillMm }) {
  const sorted = useMemo(
    () => [...neckPoints].sort((a, b) => a.h_mm - b.h_mm),
    [neckPoints]
  )

  const interpD = useMemo(() => {
    const xs = sorted.map(p => p.h_mm)
    const ys = sorted.map(p => p.d_int_mm)
    return pchip(xs, ys)
  }, [sorted])

  const pts = useMemo(() => densifyProfile(sorted, 1), [sorted])

  const maxOuterR = useMemo(
    () => Math.max(...pts.map(p => p.d_int_mm / 2 + WALL)),
    [pts]
  )
  const cx = PAD_L + maxOuterR * SCALE

  const toY = h => PAD_T + h * SCALE
  const iL  = d => cx - (d / 2) * SCALE
  const iR  = d => cx + (d / 2) * SCALE
  const oL  = d => cx - (d / 2 + WALL) * SCALE
  const oR  = d => cx + (d / 2 + WALL) * SCALE

  const maxH      = sorted[sorted.length - 1].h_mm
  const bore      = sorted[0].d_int_mm
  const dShoulder = sorted[sorted.length - 1].d_int_mm
  const svgW      = Math.round(cx + maxOuterR * SCALE + PAD_R)
  const svgH      = Math.round(PAD_T + maxH * SCALE + PAD_B)

  const leftGlass = poly([
    ...pts.map(p => [oL(p.d_int_mm), toY(p.h_mm)]),
    ...pts.slice().reverse().map(p => [iL(p.d_int_mm), toY(p.h_mm)]),
  ])
  const rightGlass = poly([
    ...pts.map(p => [iR(p.d_int_mm), toY(p.h_mm)]),
    ...pts.slice().reverse().map(p => [oR(p.d_int_mm), toY(p.h_mm)]),
  ])

  const liquidPoly = hFillMm != null ? (() => {
    const h0   = hFillMm
    const top  = { h_mm: h0, d_int_mm: interpD(h0) }
    const lPts = [top, ...pts.filter(p => p.h_mm > h0)]
    return poly([
      ...lPts.map(p => [iL(p.d_int_mm), toY(p.h_mm)]),
      ...lPts.slice().reverse().map(p => [iR(p.d_int_mm), toY(p.h_mm)]),
    ])
  })() : null

  const annotations = [
    { h: 0,    label: `ø${bore.toFixed(1)}`,      sub: 'bocca' },
    { h: maxH, label: `ø${dShoulder.toFixed(1)}`, sub: 'spalla' },
  ]
  if (hFillMm != null) {
    annotations.push({ h: hFillMm, label: `${hFillMm} mm`, sub: 'fill', isFill: true })
  }

  const ticks = []
  for (let h = 0; h <= maxH; h += 20) ticks.push(h)

  return (
    <div>
      <div className="flex justify-center overflow-x-auto">
        <svg width={svgW} height={svgH} aria-label="Anteprima profilo collo">

          {liquidPoly && <polygon points={liquidPoly} fill={C_LIQUID} />}
          <polygon points={leftGlass}  fill={C_GLASS} />
          <polygon points={rightGlass} fill={C_GLASS} />

          {/* Ring cap */}
          <rect
            x={oL(bore)} y={PAD_T - 5}
            width={oR(bore) - oL(bore)} height={5}
            fill="rgba(148,163,184,0.4)"
          />

          {/* Centerline */}
          <line x1={cx} y1={PAD_T} x2={cx} y2={PAD_T + maxH * SCALE}
                stroke="rgba(255,255,255,0.05)" strokeWidth={0.8} strokeDasharray="3,3" />

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

          {/* Fill level line */}
          {hFillMm != null && (() => {
            const d = interpD(hFillMm)
            return (
              <line x1={iL(d)} y1={toY(hFillMm)} x2={iR(d)} y2={toY(hFillMm)}
                    stroke="#60a5fa" strokeWidth={1.8} />
            )
          })()}

          {/* Annotations */}
          {annotations.map(({ h, label, sub, isFill }) => {
            const d   = interpD(h)
            const y   = toY(h)
            const xA  = oR(d) + 4
            const col = isFill ? '#60a5fa' : 'rgba(255,255,255,0.5)'
            const fw  = isFill ? '600' : '400'
            return (
              <g key={h}>
                <line x1={oR(d)} y1={y} x2={xA + 2} y2={y}
                      stroke={isFill ? '#60a5fa' : 'rgba(255,255,255,0.18)'} strokeWidth={1} />
                <text x={xA + 4} y={y - 1} fontSize={7.5} fill={col} fontWeight={fw}>{label}</text>
                <text x={xA + 4} y={y + 8} fontSize={6.5} fill="rgba(255,255,255,0.25)">{sub}</text>
              </g>
            )
          })}

        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 justify-center flex-wrap">
        <div className="flex items-center gap-1">
          <svg width={12} height={8}><rect x={0} y={1} width={12} height={6} fill={C_GLASS} /></svg>
          <span className="text-[9px] text-white/30">Vetro</span>
        </div>
        <div className="flex items-center gap-1">
          <svg width={12} height={8}><rect x={0} y={1} width={12} height={6} fill={C_LIQUID} /></svg>
          <span className="text-[9px] text-white/30">Liquido</span>
        </div>
        {hFillMm != null && (
          <div className="flex items-center gap-1">
            <svg width={14} height={8}>
              <line x1={0} y1={4} x2={14} y2={4} stroke="#60a5fa" strokeWidth={2} />
            </svg>
            <span className="text-[9px] text-blue-400/70 font-medium">Fill {hFillMm} mm</span>
          </div>
        )}
      </div>
    </div>
  )
}
