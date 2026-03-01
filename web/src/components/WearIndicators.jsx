import { memo } from 'react'
import { wearToColor } from '../utils/colors'

function WearIndicators({ frame }) {
  if (!frame) return null
  const tires = [
    { id: 'FL', wear: frame.tire_wear?.FL || 0 },
    { id: 'FR', wear: frame.tire_wear?.FR || 0 },
    { id: 'RL', wear: frame.tire_wear?.RL || 0 },
    { id: 'RR', wear: frame.tire_wear?.RR || 0 },
  ]

  return (
    <div className="gauge-card wear-card">
      <h4>Tire Wear</h4>
      {tires.map(t => {
        const pct = t.wear * 100
        return (
          <div key={t.id} className="wear-row">
            <span className="wear-label">{t.id}</span>
            <div className="wear-track">
              <div className="wear-fill" style={{ width: `${pct}%`, background: wearToColor(t.wear) }} />
            </div>
            <span className="wear-value">{pct.toFixed(2)}%</span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(WearIndicators)
