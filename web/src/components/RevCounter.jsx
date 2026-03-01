import { memo } from 'react'

const R = 70, CX = 80, CY = 80
const START_ANGLE = -225, END_ANGLE = 45
const RANGE = END_ANGLE - START_ANGLE

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

function RevCounter({ rpm, maxRpm, shiftRpm }) {
  const fraction = Math.min(rpm / maxRpm, 1)
  const redZoneStart = shiftRpm / maxRpm
  const needleAngle = START_ANGLE + fraction * RANGE
  const needleEnd = polarToCart(CX, CY, R - 14, needleAngle)

  // Tick marks every 2000 RPM
  const ticks = []
  const step = 2000
  for (let v = 0; v <= maxRpm; v += step) {
    const a = START_ANGLE + (v / maxRpm) * RANGE
    const outer = polarToCart(CX, CY, R + 2, a)
    const inner = polarToCart(CX, CY, R - 8, a)
    const label = polarToCart(CX, CY, R - 16, a)
    ticks.push(
      <g key={v}>
        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#555" strokeWidth={1.5} />
        <text x={label.x} y={label.y} fill="#666" fontSize={7} textAnchor="middle" dominantBaseline="middle">
          {v / 1000}k
        </text>
      </g>
    )
  }

  return (
    <div className="gauge-card">
      <h4>RPM</h4>
      <svg viewBox="0 0 160 160" width="160" height="140">
        {/* Background arc */}
        <path d={arcPath(CX, CY, R, START_ANGLE, END_ANGLE)} fill="none" stroke="#2a2a2a" strokeWidth={8} strokeLinecap="round" />
        {/* Red zone */}
        <path d={arcPath(CX, CY, R, START_ANGLE + redZoneStart * RANGE, END_ANGLE)} fill="none" stroke="rgba(225,6,0,0.3)" strokeWidth={8} strokeLinecap="round" />
        {ticks}
        {/* Needle */}
        <line x1={CX} y1={CY} x2={needleEnd.x} y2={needleEnd.y}
              stroke={rpm >= shiftRpm ? '#e10600' : '#e0e0e0'} strokeWidth={2} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4} fill="#333" stroke="#666" strokeWidth={1} />
        {/* Center value */}
        <text x={CX} y={CY + 28} fill="#e0e0e0" fontSize={14} fontWeight="700" textAnchor="middle" fontFamily="'Courier New', monospace">
          {Math.round(rpm)}
        </text>
      </svg>
    </div>
  )
}

export default memo(RevCounter)
