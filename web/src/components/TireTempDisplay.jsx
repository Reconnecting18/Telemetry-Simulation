import { useState, memo } from 'react'
import { tempToColorSmooth } from '../utils/colors'

const OPTIMAL  = 85
const OVERHEAT = 115

function zoneTemps(avgTemp, camber) {
  const off = Math.abs(camber || 0) * 2.5
  return { outer: avgTemp - off, mid: avgTemp, inner: avgTemp + off }
}

// ── Mode 1: Simple GT7-style ─────────────────────────────────────────────────
// Each tire block renders a left→right thermal gradient using outer/inner zone temps.
// Outer zone is on the track edge (left for FL/RL, right for FR/RR).
// Inner zone is warmer due to negative camber (inner sidewall takes more load).
function SimpleView({ frame, vehicle, optimal, overheat }) {
  if (!frame) return null
  const TW = 34, TH = 56
  const camDeg = vehicle?.camber_deg || {}
  const tirePos = [
    { id: 'FL', x: 10,  y: 30,  isLeft: true  },
    { id: 'FR', x: 156, y: 30,  isLeft: false },
    { id: 'RL', x: 10,  y: 140, isLeft: true  },
    { id: 'RR', x: 156, y: 140, isLeft: false },
  ]
  return (
    <svg viewBox="0 0 200 218" width="200" height="218" className="tire-svg">
      <defs>
        {tirePos.map(({ id, isLeft }) => {
          const avgTemp = frame.tire_temp_C?.[id] || 25
          const camber  = camDeg[id] || 0
          const { outer, inner } = zoneTemps(avgTemp, camber)
          const outerCol = tempToColorSmooth(outer, optimal, overheat)
          const innerCol = tempToColorSmooth(inner, optimal, overheat)
          // Left tires: x=0 is track-outer edge, x=1 is track-inner (hotter at camber)
          // Right tires: x=0 is track-inner (hotter), x=1 is track-outer
          return (
            <linearGradient key={`g-${id}`} id={`tg-${id}`}
              x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor={isLeft ? outerCol : innerCol} />
              <stop offset="100%" stopColor={isLeft ? innerCol : outerCol} />
            </linearGradient>
          )
        })}
      </defs>
      <path d="M78,205 L65,155 L60,80 L72,22 L128,22 L140,80 L135,155 L122,205 Z"
        fill="#111" stroke="#333" strokeWidth={1.5} />
      <ellipse cx={100} cy={112} rx={20} ry={34} fill="#0a0a0a" stroke="#222" strokeWidth={1} />
      {tirePos.map(({ id, x, y }) => {
        const temp = frame.tire_temp_C?.[id] || 25
        return (
          <g key={id}>
            <rect x={x} y={y} width={TW} height={TH} rx={4}
              fill={`url(#tg-${id})`} opacity={0.92} />
            <rect x={x} y={y} width={TW} height={TH} rx={4}
              fill="none" stroke="#000" strokeWidth={0.8} opacity={0.5} />
            <text x={x + TW/2} y={y - 5} fill="#888" fontSize={8}
              textAnchor="middle" fontFamily="monospace">{id}</text>
            <text x={x + TW/2} y={y + TH/2 + 4} fill="#000" fontSize={9}
              textAnchor="middle" fontFamily="monospace" fontWeight="700">
              {temp.toFixed(0)}&deg;
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Mode 2: GT7 3-zone detailed ──────────────────────────────────────────────
function DetailedView({ frame, vehicle, optimal, overheat }) {
  if (!frame) return null
  const camDeg  = vehicle?.camber_deg || {}
  const coldPsi = vehicle?.cold_pressure_psi || 25
  const TW = 34, TH = 56, ZW = TW / 3

  const tires = [
    { id: 'FL', x: 8,   y: 30,  isLeft: true  },
    { id: 'FR', x: 258, y: 30,  isLeft: false },
    { id: 'RL', x: 8,   y: 140, isLeft: true  },
    { id: 'RR', x: 258, y: 140, isLeft: false },
  ]

  return (
    <svg viewBox="0 0 300 218" width="300" height="218" className="tire-svg">
      <text x={150} y={12} fill="#444" fontSize={6.5} textAnchor="middle" fontFamily="monospace">
        O·M·I (inner toward center) I·M·O
      </text>
      <path d="M118,205 L105,155 L100,80 L112,22 L188,22 L200,80 L195,155 L182,205 Z"
        fill="#111" stroke="#333" strokeWidth={1.5} />
      <ellipse cx={150} cy={112} rx={20} ry={34} fill="#0a0a0a" stroke="#222" strokeWidth={1} />

      {tires.map(({ id, x, y, isLeft }) => {
        const avgTemp = frame.tire_temp_C?.[id] || 25
        const camber  = camDeg[id] || 0
        const psi     = frame.tire_pressure_psi?.[id] || coldPsi
        const { outer, mid, inner } = zoneTemps(avgTemp, camber)
        const zones = isLeft ? [outer, mid, inner] : [inner, mid, outer]
        const absZones = [outer, mid, inner]  // always O,M,I for text labels
        const textX = isLeft ? x - 4 : x + TW + 4
        const anchor = isLeft ? 'end' : 'start'
        const psiDiff = Math.abs(psi - coldPsi)
        const psiColor = psiDiff < 1 ? '#7ed321' : psiDiff < 2.5 ? '#f5a623' : '#e10600'

        return (
          <g key={id}>
            {zones.map((t, i) => (
              <rect key={i} x={x + i*ZW} y={y} width={ZW} height={TH}
                fill={tempToColorSmooth(t, optimal, overheat)} opacity={0.93}
                rx={i === 0 ? 3 : 0} />
            ))}
            <line x1={x+ZW}   y1={y} x2={x+ZW}   y2={y+TH} stroke="#000" strokeWidth={0.5} opacity={0.4} />
            <line x1={x+2*ZW} y1={y} x2={x+2*ZW} y2={y+TH} stroke="#000" strokeWidth={0.5} opacity={0.4} />
            <rect x={x} y={y} width={TW} height={TH} rx={3} fill="none" stroke="#555" strokeWidth={0.8} />
            <text x={x+TW/2} y={y-5} fill="#777" fontSize={7.5} textAnchor="middle" fontFamily="monospace">{id}</text>
            {absZones.map((t, i) => (
              <text key={i} x={textX} y={y + (i + 0.72) * (TH/3)}
                fill={tempToColorSmooth(t, optimal, overheat)}
                fontSize={7} textAnchor={anchor} fontFamily="monospace" fontWeight="600">
                {['O','M','I'][i]} {t.toFixed(0)}&deg;
              </text>
            ))}
            <text x={x+TW/2} y={y+TH+10} fill={psiColor} fontSize={6.5}
              textAnchor="middle" fontFamily="monospace">
              {psi.toFixed(1)} psi
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
function TireTempDisplay({ frame, vehicle }) {
  const [mode, setMode] = useState(1)
  const optimal  = vehicle?.tire_optimal_temp_C  || OPTIMAL
  const overheat = vehicle?.tire_overheat_temp_C || OVERHEAT

  return (
    <div className="gauge-card tire-temp-card">
      <div className="tire-temp-header">
        <h4>Tire Temp</h4>
        <div className="mode-toggle">
          <button className={`mode-btn ${mode===1?'active':''}`} onClick={()=>setMode(1)} title="Simple">1</button>
          <button className={`mode-btn ${mode===2?'active':''}`} onClick={()=>setMode(2)} title="3-zone">2</button>
        </div>
      </div>

      {mode === 1
        ? <SimpleView   frame={frame} vehicle={vehicle} optimal={optimal} overheat={overheat} />
        : <DetailedView frame={frame} vehicle={vehicle} optimal={optimal} overheat={overheat} />
      }

      <div className="temp-gradient-legend">
        <span className="temp-grad-label">Cold</span>
        <div className="temp-grad-bar" />
        <span className="temp-grad-label">Hot</span>
      </div>
    </div>
  )
}

export default memo(TireTempDisplay)
