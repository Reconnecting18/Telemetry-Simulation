import { memo } from 'react'
import { buildTireData, tireTempColor, tireWearColor, pressureColor, pressureFraction } from '../utils/tireModel'

const CORNERS = ['FL', 'FR', 'RL', 'RR']

function TireCard({ id, td, mode }) {
  if (!td) return <div className="tire-card tire-card--empty">{id}</div>

  const isTemp = mode === 'temp'
  const isWear = mode === 'wear'

  // Zone colors
  const zoneColors = isTemp
    ? [tireTempColor(td.outer_temp), tireTempColor(td.center_temp), tireTempColor(td.inner_temp)]
    : isWear
    ? [tireWearColor(td.outer_wear, td.compound), tireWearColor(td.center_wear, td.compound), tireWearColor(td.inner_wear, td.compound)]
    : ['#333', '#444', '#333']

  // Pressure arc
  const pFrac = pressureFraction(td.pressure)
  const pColor = pressureColor(td.pressure)
  // SVG arc: 180deg sweep from left to right
  const arcR = 18
  const arcAngle = pFrac * Math.PI
  const arcX = arcR * Math.cos(Math.PI - arcAngle)
  const arcY = -arcR * Math.sin(Math.PI - arcAngle)

  return (
    <div className="tire-card">
      <div className="tire-card-header">
        <span className="tire-card-id">{id}</span>
        <span className="tire-card-psi" style={{ color: pColor }}>
          {td.pressure.toFixed(1)} psi
        </span>
      </div>

      <div className="tire-card-body">
        {/* Tire shape with 3 zones */}
        <svg viewBox="0 0 40 60" className="tire-card-svg">
          {/* Outer zone */}
          <rect x={1} y={2} width={12} height={56} rx={3}
            fill={zoneColors[0]} opacity={0.85} />
          {/* Center zone */}
          <rect x={13} y={2} width={14} height={56} rx={0}
            fill={zoneColors[1]} opacity={0.85} />
          {/* Inner zone */}
          <rect x={27} y={2} width={12} height={56} rx={3}
            fill={zoneColors[2]} opacity={0.85} />
          {/* Tire outline */}
          <rect x={1} y={2} width={38} height={56} rx={5}
            fill="none" stroke="#555" strokeWidth={1} />
          {/* Zone divider lines */}
          <line x1={13} y1={4} x2={13} y2={56} stroke="#222" strokeWidth={0.5} opacity={0.5} />
          <line x1={27} y1={4} x2={27} y2={56} stroke="#222" strokeWidth={0.5} opacity={0.5} />

          {/* Grain stipple (cold tire) */}
          {td.grain && (
            <g opacity={0.4}>
              {[8,16,24,32,40,48].map(y => [6,20,34].map(x => (
                <circle key={`g${x}${y}`} cx={x} cy={y} r={0.8} fill="#88aaff" />
              )))}
            </g>
          )}
          {/* Blister spots (overheated) */}
          {td.blister && (
            <g opacity={0.6}>
              {[12,30,48].map(y => [10,20,30].map(x => (
                <circle key={`b${x}${y}`} cx={x} cy={y} r={2} fill="#ff4400" opacity={0.4} />
              )))}
            </g>
          )}
        </svg>

        {/* Pressure arc gauge */}
        <svg viewBox="-22 -22 44 24" className="tire-card-arc">
          {/* Track */}
          <path d={`M -${arcR} 0 A ${arcR} ${arcR} 0 0 1 ${arcR} 0`}
            fill="none" stroke="#222" strokeWidth={3} />
          {/* Fill */}
          <path d={`M -${arcR} 0 A ${arcR} ${arcR} 0 ${pFrac > 0.5 ? 1 : 0} 1 ${arcX.toFixed(1)} ${arcY.toFixed(1)}`}
            fill="none" stroke={pColor} strokeWidth={3} strokeLinecap="round" />
        </svg>
      </div>

      <div className="tire-card-stats">
        <div className="tire-stat">
          <span className="tire-stat-label">O</span>
          <span className="tire-stat-val">
            {isTemp ? `${td.outer_temp.toFixed(0)}°` : isWear ? `${td.outer_wear.toFixed(0)}%` : '--'}
          </span>
        </div>
        <div className="tire-stat">
          <span className="tire-stat-label">C</span>
          <span className="tire-stat-val">
            {isTemp ? `${td.center_temp.toFixed(0)}°` : isWear ? `${td.center_wear.toFixed(0)}%` : '--'}
          </span>
        </div>
        <div className="tire-stat">
          <span className="tire-stat-label">I</span>
          <span className="tire-stat-val">
            {isTemp ? `${td.inner_temp.toFixed(0)}°` : isWear ? `${td.inner_wear.toFixed(0)}%` : '--'}
          </span>
        </div>
      </div>
    </div>
  )
}

function TireDetailPanel({ frame, mode }) {
  const tireData = buildTireData(frame) || {}

  return (
    <div className="tire-detail-panel">
      <div className="tire-detail-grid">
        {CORNERS.map(id => (
          <TireCard key={id} id={id} td={tireData[id]} mode={mode} />
        ))}
      </div>
    </div>
  )
}

export default memo(TireDetailPanel)
