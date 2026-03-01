import { memo } from 'react'

function CamberWheel({ label, camberDeg, isLeftSide }) {
  // Negative camber = top of wheel tilts inward (toward car center).
  // Left side: inward = rightward in SVG = clockwise = positive angle → negate camberDeg
  // Right side: inward = leftward in SVG = counterclockwise = keep camberDeg sign
  // Scale 3x so small angles (~3-4 deg) are visible in the icon.
  const visualAngle = (isLeftSide ? -camberDeg : camberDeg) * 2

  return (
    <div className="camber-item">
      <svg viewBox="0 0 40 50" width="40" height="50">
        {/* Ground */}
        <line x1={2} y1={46} x2={38} y2={46} stroke="#444" strokeWidth={1} />
        {/* Wheel */}
        <rect x={14} y={6} width={12} height={34} rx={3}
              fill="#888" stroke="#aaa" strokeWidth={0.5}
              transform={`rotate(${visualAngle}, 20, 25)`} />
      </svg>
      <span className="camber-label">{label}</span>
      <span className="camber-value">{camberDeg?.toFixed(1)}&deg;</span>
    </div>
  )
}

function CamberDisplay({ frame, vehicle }) {
  if (!frame) return null
  const cam = frame.camber_deg || {}
  const toe = vehicle?.toe_deg || {}

  return (
    <div className="gauge-card camber-card">
      <h4>Camber / Toe</h4>
      <div className="camber-grid">
        <CamberWheel label="FL" camberDeg={cam.FL} isLeftSide />
        <CamberWheel label="FR" camberDeg={cam.FR} />
        <CamberWheel label="RL" camberDeg={cam.RL} isLeftSide />
        <CamberWheel label="RR" camberDeg={cam.RR} />
      </div>
      <div className="toe-row">
        <span className="toe-item">Front toe: {toe.FL?.toFixed(2)}&deg;</span>
        <span className="toe-item">Rear toe: {toe.RL?.toFixed(2)}&deg;</span>
      </div>
    </div>
  )
}

export default memo(CamberDisplay)
