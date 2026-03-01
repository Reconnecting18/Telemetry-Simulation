import { useState, memo } from 'react'
import { tempToColor } from '../utils/colors'

const OPTIMAL  = 85
const OVERHEAT = 110

// Simulate 3-zone temps from a single average: negative camber makes
// inner edge run ~(|camber| * 2.5)°C hotter, outer correspondingly cooler.
function zoneTemps(avgTemp, camber) {
  const offset = Math.abs(camber || 0) * 2.5
  return {
    outer: avgTemp - offset,
    mid:   avgTemp,
    inner: avgTemp + offset,
  }
}

// ── Mode 1: Simple top-down 4-block layout ───────────────────────────────────
function SimpleView({ frame, optimal, overheat }) {
  if (!frame) return null
  const tires = [
    { id: 'FL', temp: frame.tire_temp_C?.FL },
    { id: 'FR', temp: frame.tire_temp_C?.FR },
    { id: 'RL', temp: frame.tire_temp_C?.RL },
    { id: 'RR', temp: frame.tire_temp_C?.RR },
  ]

  return (
    <div className="tire-simple-grid">
      {tires.map(t => {
        const color = tempToColor(t.temp || 0, optimal, overheat)
        return (
          <div key={t.id} className="tire-simple-block">
            <span className="tire-corner-label">{t.id}</span>
            <div className="tire-temp-swatch" style={{ background: color }} />
            <span className="tire-temp-value" style={{ color }}>
              {(t.temp || 0).toFixed(0)}&deg;C
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Mode 2: 3-zone detailed per-tire strip ────────────────────────────────────
function ZoneBar({ temp, label, optimal, overheat }) {
  const color = tempToColor(temp, optimal, overheat)
  return (
    <div className="zone-bar">
      <div className="zone-swatch" style={{ background: color }} />
      <span className="zone-temp" style={{ color }}>{temp.toFixed(0)}</span>
      <span className="zone-label">{label}</span>
    </div>
  )
}

function DetailedView({ frame, vehicle, optimal, overheat }) {
  if (!frame) return null
  const camDeg = vehicle?.camber_deg || {}
  const coldPsi = vehicle?.cold_pressure_psi || 25

  const corners = [
    { id: 'FL', isLeft: true,  camber: camDeg.FL, temp: frame.tire_temp_C?.FL, psi: frame.tire_pressure_psi?.FL },
    { id: 'FR', isLeft: false, camber: camDeg.FR, temp: frame.tire_temp_C?.FR, psi: frame.tire_pressure_psi?.FR },
    { id: 'RL', isLeft: true,  camber: camDeg.RL, temp: frame.tire_temp_C?.RL, psi: frame.tire_pressure_psi?.RL },
    { id: 'RR', isLeft: false, camber: camDeg.RR, temp: frame.tire_temp_C?.RR, psi: frame.tire_pressure_psi?.RR },
  ]

  return (
    <div className="tire-detail-grid">
      {corners.map(c => {
        const { outer, mid, inner } = zoneTemps(c.temp || 0, c.camber || 0)
        const psiDiff = Math.abs((c.psi || coldPsi) - coldPsi)
        const psiColor = psiDiff < 1 ? '#7ed321' : psiDiff < 2.5 ? '#f5a623' : '#e10600'
        // For left-side tires: inner is on the right; for right-side: inner on the left
        const zones = c.isLeft
          ? [{ t: outer, l: 'O' }, { t: mid, l: 'M' }, { t: inner, l: 'I' }]
          : [{ t: inner, l: 'I' }, { t: mid, l: 'M' }, { t: outer, l: 'O' }]

        return (
          <div key={c.id} className="tire-detail-col">
            <span className="tire-corner-label">{c.id}</span>
            <div className="tire-zones">
              {zones.map(z => (
                <ZoneBar key={z.l} temp={z.t} label={z.l} optimal={optimal} overheat={overheat} />
              ))}
            </div>
            <span className="tire-psi" style={{ color: psiColor }}>
              {(c.psi || coldPsi).toFixed(1)} psi
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
function TireTempDisplay({ frame, vehicle }) {
  const [mode, setMode] = useState(1)

  const optimal  = vehicle?.tire_optimal_temp_C  || OPTIMAL
  const overheat = vehicle?.tire_overheat_temp_C || OVERHEAT

  return (
    <div className="gauge-card tire-temp-card">
      <div className="tire-temp-header">
        <h4>Tire Temp</h4>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 1 ? 'active' : ''}`}
            onClick={() => setMode(1)}
            title="Simple view"
          >1</button>
          <button
            className={`mode-btn ${mode === 2 ? 'active' : ''}`}
            onClick={() => setMode(2)}
            title="3-zone detail"
          >2</button>
        </div>
      </div>

      {mode === 1
        ? <SimpleView  frame={frame} optimal={optimal} overheat={overheat} />
        : <DetailedView frame={frame} vehicle={vehicle} optimal={optimal} overheat={overheat} />
      }

      {/* Temperature scale legend */}
      <div className="temp-legend">
        <span className="temp-legend-dot" style={{ background: '#4a90e2' }} />Cold
        <span className="temp-legend-dot" style={{ background: '#7ed321' }} />Warm
        <span className="temp-legend-dot" style={{ background: '#f5a623' }} />Opt
        <span className="temp-legend-dot" style={{ background: '#e10600' }} />Hot
        <span className="temp-legend-dot" style={{ background: '#ff00ff' }} />Over
      </div>
    </div>
  )
}

export default memo(TireTempDisplay)
