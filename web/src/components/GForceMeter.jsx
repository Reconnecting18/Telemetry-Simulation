import { memo } from 'react'

const SIZE = 160
const CX = SIZE / 2, CY = SIZE / 2
const SCALE = 14 // pixels per G
const MAX_G = 5

function GForceMeter({ lateralG, longitudinalG }) {
  // X = lateral (positive = right), Y = longitudinal (positive up = accel)
  const dotX = CX + lateralG * SCALE
  const dotY = CY - longitudinalG * SCALE
  const totalG = Math.sqrt(lateralG * lateralG + longitudinalG * longitudinalG)
  const color = totalG < 2 ? '#00e676' : totalG < 4 ? '#f5a623' : '#ff3d3d'

  const circles = []
  for (let g = 1; g <= MAX_G; g++) {
    circles.push(
      <circle key={g} cx={CX} cy={CY} r={g * SCALE} fill="none" stroke="#2a2a2a" strokeWidth={0.8} />
    )
  }

  return (
    <div className="gauge-card">
      <h4>G-Force</h4>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {circles}
        {/* Crosshair */}
        <line x1={CX} y1={8} x2={CX} y2={SIZE - 8} stroke="#333" strokeWidth={0.5} />
        <line x1={8} y1={CY} x2={SIZE - 8} y2={CY} stroke="#333" strokeWidth={0.5} />
        {/* Labels */}
        <text x={CX} y={12} fill="#555" fontSize={8} textAnchor="middle">ACCEL</text>
        <text x={CX} y={SIZE - 5} fill="#555" fontSize={8} textAnchor="middle">BRAKE</text>
        <text x={SIZE - 4} y={CY + 3} fill="#555" fontSize={8} textAnchor="end">R</text>
        <text x={6} y={CY + 3} fill="#555" fontSize={8} textAnchor="start">L</text>
        {/* G dot */}
        <circle cx={dotX} cy={dotY} r={6} fill={color} stroke="white" strokeWidth={1.5} />
        {/* Value */}
        <text x={CX} y={SIZE - 16} fill="#888" fontSize={9} textAnchor="middle">
          {totalG.toFixed(1)}G
        </text>
      </svg>
    </div>
  )
}

export default memo(GForceMeter)
