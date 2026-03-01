import { memo } from 'react'

function ThrottleBrakeBar({ throttle, brake }) {
  return (
    <div className="gauge-card pedal-card">
      <h4>Pedals</h4>
      <div className="pedal-bars">
        <div className="pedal-col">
          <div className="pedal-track">
            <div className="pedal-fill throttle" style={{ height: `${throttle * 100}%` }} />
          </div>
          <span className="pedal-label">THR</span>
          <span className="pedal-value">{Math.round(throttle * 100)}%</span>
        </div>
        <div className="pedal-col">
          <div className="pedal-track">
            <div className="pedal-fill brake" style={{ height: `${brake * 100}%` }} />
          </div>
          <span className="pedal-label">BRK</span>
          <span className="pedal-value">{Math.round(brake * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

export default memo(ThrottleBrakeBar)
