import { memo } from 'react'

const R = 70, CX = 80, CY = 80
const START_ANGLE = -225, END_ANGLE = 45
const RANGE = END_ANGLE - START_ANGLE // 270 degrees

function polarToCart(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polarToCart(cx, cy, r, startDeg)
  const e = polarToCart(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`
}

function Speedometer({ velocity_ms, maxSpeed }) {
  const kmh = velocity_ms * 3.6
  const maxKmh = maxSpeed * 3.6
  const fraction = Math.min(velocity_ms / maxSpeed, 1)
  const angle = START_ANGLE + fraction * RANGE

  // Color based on speed fraction
  const color = fraction < 0.5 ? '#00e676' : fraction < 0.8 ? '#f5a623' : '#ff3d3d'

  // Tick marks
  const ticks = []
  const numTicks = 8
  for (let i = 0; i <= numTicks; i++) {
    const a = START_ANGLE + (i / numTicks) * RANGE
    const outer = polarToCart(CX, CY, R + 2, a)
    const inner = polarToCart(CX, CY, R - 8, a)
    const label = polarToCart(CX, CY, R - 16, a)
    ticks.push(
      <g key={i}>
        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#555" strokeWidth={1.5} />
        <text x={label.x} y={label.y} fill="#666" fontSize={7} textAnchor="middle" dominantBaseline="middle">
          {Math.round((i / numTicks) * maxKmh)}
        </text>
      </g>
    )
  }

  return (
    <div className="gauge-card">
      <h4>Speed</h4>
      <svg viewBox="0 0 160 160" width="160" height="140">
        {/* Background arc */}
        <path d={arcPath(CX, CY, R, START_ANGLE, END_ANGLE)} fill="none" stroke="#2a2a2a" strokeWidth={8} strokeLinecap="round" />
        {/* Value arc */}
        {fraction > 0.001 && (
          <path d={arcPath(CX, CY, R, START_ANGLE, angle)} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
        )}
        {ticks}
        {/* Center value */}
        <text x={CX} y={CY - 2} fill="#e0e0e0" fontSize={22} fontWeight="700" textAnchor="middle" fontFamily="'Courier New', monospace">
          {Math.round(kmh)}
        </text>
        <text x={CX} y={CY + 14} fill="#666" fontSize={9} textAnchor="middle">km/h</text>
      </svg>
    </div>
  )
}

export default memo(Speedometer)
