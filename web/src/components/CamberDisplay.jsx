import { useState, memo } from 'react'

function CamberWheel({ camberDeg, isLeftSide }) {
  // Negative camber = top tilts inward. Left side: inward = clockwise in SVG.
  // Scale 1.5x so ~3° is visible without being exaggerated.
  const visualAngle = (isLeftSide ? -camberDeg : camberDeg) * 1.5

  return (
    <svg viewBox="0 0 30 40" width="30" height="40">
      <line x1={2} y1={37} x2={28} y2={37} stroke="#444" strokeWidth={1} />
      <rect x={10} y={4} width={10} height={28} rx={2}
            fill="#777" stroke="#aaa" strokeWidth={0.5}
            transform={`rotate(${visualAngle}, 15, 20)`} />
    </svg>
  )
}

function perfNote(camber, toe, axle) {
  const notes = []
  if (camber < -4.0) notes.push('Very high inner wear')
  else if (camber < -3.0) notes.push('Aggressive grip')
  else if (camber < -1.5) notes.push('Balanced')
  else notes.push('Reduced lateral grip')

  if (axle === 'front') {
    if (toe > 0.05) notes.push('understeer')
    else if (toe < -0.05) notes.push('oversteer tendency')
  } else {
    if (toe > 0.05) notes.push('stable')
    else if (toe < 0) notes.push('loose')
  }
  return notes.join(' · ')
}

function CamberDisplay({ vehicle, onSetupChange }) {
  const staticCam = vehicle?.camber_deg || { FL: -3.0, FR: -3.0, RL: -1.8, RR: -1.8 }
  const staticToe = vehicle?.toe_deg   || { FL: 0.05, FR: 0.05, RL: 0, RR: 0 }

  const [frontCamber, setFrontCamber] = useState(staticCam.FL ?? -3.0)
  const [rearCamber,  setRearCamber]  = useState(staticCam.RL ?? -1.8)
  const [frontToe,    setFrontToe]    = useState(staticToe.FL ?? 0.05)
  const [rearToe,     setRearToe]     = useState(staticToe.RL ?? 0.0)

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

  function handleFrontCamber(e) {
    const v = clamp(parseFloat(e.target.value) || 0, -6, 0)
    setFrontCamber(v)
    onSetupChange?.({ frontCamber: v, rearCamber, frontToe, rearToe })
  }
  function handleRearCamber(e) {
    const v = clamp(parseFloat(e.target.value) || 0, -5, 0)
    setRearCamber(v)
    onSetupChange?.({ frontCamber, rearCamber: v, frontToe, rearToe })
  }
  function handleFrontToe(e) {
    const v = clamp(parseFloat(e.target.value) || 0, -0.3, 0.3)
    setFrontToe(v)
    onSetupChange?.({ frontCamber, rearCamber, frontToe: v, rearToe })
  }
  function handleRearToe(e) {
    const v = clamp(parseFloat(e.target.value) || 0, -0.2, 0.2)
    setRearToe(v)
    onSetupChange?.({ frontCamber, rearCamber, frontToe, rearToe: v })
  }

  return (
    <div className="gauge-card camber-card">
      <h4>Camber / Toe</h4>

      {/* Wheel visualisation */}
      <div className="camber-axle-row">
        <div className="camber-axle">
          <span className="camber-axle-label">Front</span>
          <div className="camber-wheels">
            <div className="camber-item">
              <CamberWheel camberDeg={frontCamber} isLeftSide />
              <span className="camber-corner">FL</span>
            </div>
            <div className="camber-item">
              <CamberWheel camberDeg={frontCamber} />
              <span className="camber-corner">FR</span>
            </div>
          </div>
          <span className="camber-value">{frontCamber.toFixed(1)}&deg;</span>
        </div>

        <div className="camber-axle">
          <span className="camber-axle-label">Rear</span>
          <div className="camber-wheels">
            <div className="camber-item">
              <CamberWheel camberDeg={rearCamber} isLeftSide />
              <span className="camber-corner">RL</span>
            </div>
            <div className="camber-item">
              <CamberWheel camberDeg={rearCamber} />
              <span className="camber-corner">RR</span>
            </div>
          </div>
          <span className="camber-value">{rearCamber.toFixed(1)}&deg;</span>
        </div>
      </div>

      {/* User inputs */}
      <div className="camber-inputs">
        <label className="camber-input-row">
          <span>Front camber</span>
          <input type="number" step="0.1" min="-6" max="0"
                 value={frontCamber}
                 onChange={handleFrontCamber} />
          <span>&deg;</span>
        </label>
        <label className="camber-input-row">
          <span>Rear camber</span>
          <input type="number" step="0.1" min="-5" max="0"
                 value={rearCamber}
                 onChange={handleRearCamber} />
          <span>&deg;</span>
        </label>
        <label className="camber-input-row">
          <span>Front toe</span>
          <input type="number" step="0.01" min="-0.3" max="0.3"
                 value={frontToe}
                 onChange={handleFrontToe} />
          <span>&deg;</span>
        </label>
        <label className="camber-input-row">
          <span>Rear toe</span>
          <input type="number" step="0.01" min="-0.2" max="0.2"
                 value={rearToe}
                 onChange={handleRearToe} />
          <span>&deg;</span>
        </label>
      </div>

      {/* Performance hints */}
      <div className="camber-perf">
        <span className="perf-front">{perfNote(frontCamber, frontToe, 'front')}</span>
        <span className="perf-rear">{perfNote(rearCamber, rearToe, 'rear')}</span>
      </div>
    </div>
  )
}

export default memo(CamberDisplay)
