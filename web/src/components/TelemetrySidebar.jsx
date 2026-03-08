import { useState, memo } from 'react'
import CarModel from './CarModel'

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

function TelemetrySidebar({ frame, vehicle, maxRpm }) {
  const [mode, setMode] = useState('default')

  if (!frame) return null

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
      {/* Toggle: Default / Temp / Wear */}
      <div className="sidebar-toggle">
        {['default', 'temp', 'wear'].map(m => (
          <button key={m} className={`toggle-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}>{m === 'default' ? 'Default' : m === 'temp' ? 'Temp' : 'Wear'}</button>
        ))}
      </div>

      {/* Car schematic (node-edge model with animated suspension) */}
      <CarModel frame={frame} vehicle={vehicle} mode={mode} />

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
