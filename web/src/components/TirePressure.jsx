import { memo } from 'react'

function pressureColor(psi, cold) {
  const diff = Math.abs(psi - cold)
  if (diff < 1.0) return '#7ed321'
  if (diff < 2.5) return '#f5a623'
  return '#e10600'
}

function TirePressure({ frame, coldPressure }) {
  if (!frame) return null
  const cold = coldPressure || 21.0
  const tires = [
    { id: 'FL', psi: frame.tire_pressure_psi?.FL },
    { id: 'FR', psi: frame.tire_pressure_psi?.FR },
    { id: 'RL', psi: frame.tire_pressure_psi?.RL },
    { id: 'RR', psi: frame.tire_pressure_psi?.RR },
  ]

  return (
    <div className="gauge-card pressure-card">
      <h4>Tire Pressure</h4>
      <div className="pressure-grid">
        {tires.map(t => (
          <div key={t.id} className="pressure-item">
            <span className="pressure-label">{t.id}</span>
            <span className="pressure-value" style={{ color: pressureColor(t.psi || cold, cold) }}>
              {(t.psi || cold).toFixed(1)}
            </span>
            <span className="pressure-unit">psi</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(TirePressure)
