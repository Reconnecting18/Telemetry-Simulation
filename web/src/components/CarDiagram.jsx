import { memo } from 'react'
import { tempToColor } from '../utils/colors'

// Top-down F1-style car with tire temp colors and suspension deflection
function CarDiagram({ frame, vehicle }) {
  if (!frame) return null
  const opt = vehicle?.tire_optimal_temp_C || 90
  const ovr = vehicle?.tire_overheat_temp_C || 120
  const maxTravel = vehicle?.suspension_travel_mm || 30

  const tires = [
    { id: 'FL', x: 12,  y: 28,  temp: frame.tire_temp_C?.FL, susp: frame.suspension_mm?.FL, wear: frame.tire_wear?.FL },
    { id: 'FR', x: 88,  y: 28,  temp: frame.tire_temp_C?.FR, susp: frame.suspension_mm?.FR, wear: frame.tire_wear?.FR },
    { id: 'RL', x: 12,  y: 148, temp: frame.tire_temp_C?.RL, susp: frame.suspension_mm?.RL, wear: frame.tire_wear?.RL },
    { id: 'RR', x: 88,  y: 148, temp: frame.tire_temp_C?.RR, susp: frame.suspension_mm?.RR, wear: frame.tire_wear?.RR },
  ]

  return (
    <div className="gauge-card car-diagram-card">
      <h4>Car</h4>
      <svg viewBox="0 0 120 200" width="120" height="200">
        {/* Car body */}
        <path
          d="M35,178 L25,140 L20,65 L38,14 L82,14 L100,65 L95,140 L85,178 Z"
          fill="#1a1a1a" stroke="#444" strokeWidth={1.5}
        />
        {/* Center line */}
        <line x1={60} y1={18} x2={60} y2={175} stroke="#333" strokeWidth={0.5} strokeDasharray="3 3" />

        {tires.map(t => {
          const color = tempToColor(t.temp || 25, opt, ovr)
          const suspFrac = Math.abs(t.susp || 0) / maxTravel
          const suspH = Math.min(suspFrac * 20, 20)
          const suspColor = (t.susp || 0) > 0 ? '#e10600' : '#4a90e2'

          return (
            <g key={t.id}>
              {/* Tire rectangle */}
              <rect x={t.x} y={t.y} width={20} height={32} rx={4} fill={color} opacity={0.9} />
              {/* Tire label */}
              <text x={t.x + 10} y={t.y + 18} fill="#000" fontSize={8} fontWeight="700" textAnchor="middle">
                {t.id}
              </text>
              {/* Temp value */}
              <text x={t.x + 10} y={t.y + 44} fill="#aaa" fontSize={7} textAnchor="middle">
                {(t.temp || 0).toFixed(0)}C
              </text>
              {/* Suspension bar */}
              <rect x={t.x + 8} y={t.y - suspH - 2} width={4} height={suspH}
                    fill={suspColor} rx={1} opacity={0.8} />
              {/* Wear */}
              <text x={t.x + 10} y={t.y + 54} fill="#666" fontSize={6} textAnchor="middle">
                {((t.wear || 0) * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default memo(CarDiagram)
