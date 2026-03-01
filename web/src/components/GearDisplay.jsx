import { memo } from 'react'

function GearDisplay({ gear }) {
  return (
    <div className="gauge-card gear-display">
      <h4>Gear</h4>
      <span className="gear-value">{gear}</span>
    </div>
  )
}

export default memo(GearDisplay)
