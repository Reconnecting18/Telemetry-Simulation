import { useState, memo } from 'react'
import { tempToColorSmooth, wearToColor } from '../utils/colors'

function statusColor(frac) {
  if (frac < 0.4) return '#7ed321'
  if (frac < 0.7) return '#f5a623'
  if (frac < 0.9) return '#ff6b00'
  return '#e10600'
}

function StatusBar({ label, value, fraction }) {
  const color = statusColor(fraction)
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <div className="status-track">
        <div className="status-fill" style={{ width: `${fraction * 100}%`, background: color }} />
      </div>
      <span className="status-value" style={{ color }}>{value}</span>
    </div>
  )
}

const TIRES = [
  { id: 'FL', cx: 30,  cy: 44  },
  { id: 'FR', cx: 130, cy: 44  },
  { id: 'RL', cx: 30,  cy: 156 },
  { id: 'RR', cx: 130, cy: 156 },
]

const TW = 28, TH = 42

function TelemetrySidebar({ frame, vehicle, maxRpm }) {
  const [mode, setMode] = useState('temp')

  if (!frame) return null

  const opt = vehicle?.tire_optimal_temp_C || 85
  const ovr = vehicle?.tire_overheat_temp_C || 115
  const rpm = frame.rpm || 0
  const mRpm = maxRpm || vehicle?.max_rpm || 9000

  // Mechanical indicators (derived from frame data)
  const engineLoad = Math.min(1, (rpm / mRpm) * 0.65 + (frame.throttle || 0) * 0.35)
  const brakeHeat  = frame.brake || 0
  const avgWear    = ((frame.tire_wear?.FL || 0) + (frame.tire_wear?.FR || 0)
                    + (frame.tire_wear?.RL || 0) + (frame.tire_wear?.RR || 0)) / 4
  const gearboxWear = Math.min(1, avgWear * 0.4)

  return (
    <div className="telemetry-sidebar">
      {/* Toggle */}
      <div className="sidebar-toggle">
        <button className={`toggle-btn ${mode === 'temp' ? 'active' : ''}`}
          onClick={() => setMode('temp')}>Tire Temp</button>
        <button className={`toggle-btn ${mode === 'wear' ? 'active' : ''}`}
          onClick={() => setMode('wear')}>Tire Wear</button>
      </div>

      {/* Car schematic */}
      <svg viewBox="0 0 160 200" className="car-svg">
        {/* Car body */}
        <path d="M56,185 L46,148 L42,72 L52,18 L108,18 L118,72 L114,148 L104,185 Z"
          fill="#151515" stroke="#333" strokeWidth={1.2} />
        <line x1={80} y1={22} x2={80} y2={182} stroke="#252525" strokeWidth={0.6} strokeDasharray="3 2" />

        {/* Tires */}
        {TIRES.map(({ id, cx, cy }) => {
          const temp = frame.tire_temp_C?.[id] || 25
          const wear = frame.tire_wear?.[id] || 0
          const x = cx - TW / 2
          const y = cy - TH / 2

          let fill, primary, secondary
          if (mode === 'temp') {
            fill = tempToColorSmooth(temp, opt, ovr)
            primary = `${temp.toFixed(0)}\u00B0`
            secondary = `${(wear * 100).toFixed(0)}%`
          } else {
            fill = wearToColor(wear)
            primary = `${(wear * 100).toFixed(1)}%`
            secondary = `${temp.toFixed(0)}\u00B0`
          }

          return (
            <g key={id}>
              <rect x={x} y={y} width={TW} height={TH} rx={4}
                fill={fill} opacity={0.9} />
              <rect x={x} y={y} width={TW} height={TH} rx={4}
                fill="none" stroke="#000" strokeWidth={0.6} opacity={0.35} />
              {/* Corner label */}
              <text x={cx} y={y - 4} fill="#666" fontSize={7}
                textAnchor="middle" fontFamily="monospace">{id}</text>
              {/* Primary value */}
              <text x={cx} y={cy + 2} fill="#000" fontSize={10}
                textAnchor="middle" fontFamily="monospace" fontWeight="700">
                {primary}
              </text>
              {/* Secondary value (smaller, below) */}
              <text x={cx} y={cy + 13} fill="rgba(0,0,0,0.5)" fontSize={7}
                textAnchor="middle" fontFamily="monospace">
                {secondary}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Mechanical status bars */}
      <div className="status-bars">
        <StatusBar label="Engine"  value={`${(engineLoad * 100).toFixed(0)}%`}  fraction={engineLoad} />
        <StatusBar label="Brakes"  value={`${(brakeHeat * 100).toFixed(0)}%`}   fraction={brakeHeat} />
        <StatusBar label="Gearbox" value={`${(gearboxWear * 100).toFixed(1)}%`} fraction={gearboxWear} />
      </div>
    </div>
  )
}

export default memo(TelemetrySidebar)
