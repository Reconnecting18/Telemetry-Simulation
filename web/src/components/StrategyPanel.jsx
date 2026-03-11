import { useState, useEffect, useRef, memo, useCallback } from 'react'

// ── Constants ──
const COMPOUNDS = [
  { id: 'S', label: 'Soft',   color: '#ff3d3d', bg: 'rgba(255,61,61,0.15)' },
  { id: 'M', label: 'Medium', color: '#f5a623', bg: 'rgba(245,166,35,0.15)' },
  { id: 'H', label: 'Hard',   color: '#cccccc', bg: 'rgba(204,204,204,0.1)' },
]

const WEATHER_OPTIONS = ['Dry', 'Damp', 'Wet']
const MAX_STINTS = 4
const MAX_FUEL_KG = 110

function defaultStint(num) {
  return {
    id: Date.now() + num,
    compound: 'M',
    tireAge: 0,
    fuelLoad: 100,
    changeTires: true,
    refuelAmount: 80,
    frontWingAdj: false,
    repair: false,
  }
}

function defaultModifiers() {
  return {
    wearMultiplier: '1x',
    fuelMultiplier: '1x',
    weather: 'Dry',
    trackTemp: 35,
    ambientTemp: 25,
  }
}

// ── Compound Button ──
function CompoundBtn({ compound, selected, onClick }) {
  const c = COMPOUNDS.find(x => x.id === compound)
  return (
    <button
      className={`compound-btn ${selected ? 'active' : ''}`}
      style={{
        borderColor: selected ? c.color : '#333',
        color: selected ? c.color : '#555',
        background: selected ? c.bg : 'transparent',
      }}
      onClick={onClick}
    >
      {c.id}
    </button>
  )
}

// ── Toggle Switch ──
function Toggle({ label, value, onChange }) {
  return (
    <div className="strat-toggle-row">
      <span className="strat-toggle-label">{label}</span>
      <button
        className={`strat-toggle-switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="strat-toggle-knob" />
      </button>
    </div>
  )
}

// ── Slider ──
function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="strat-slider-row">
      <span className="strat-slider-label">{label}</span>
      <input
        type="range"
        className="strat-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="strat-slider-value">{value}{unit}</span>
    </div>
  )
}

// ── Multi-Button Selector ──
function MultiBtn({ label, options, value, onChange }) {
  return (
    <div className="strat-multi-row">
      <span className="strat-multi-label">{label}</span>
      <div className="strat-multi-btns">
        {options.map(opt => (
          <button key={opt.value ?? opt}
            className={`strat-multi-btn ${value === (opt.value ?? opt) ? 'active' : ''}`}
            onClick={() => onChange(opt.value ?? opt)}
          >
            {opt.label ?? opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Stint Row ──
function StintRow({ stint, index, totalLaps, stints, onChange, onRemove }) {
  // Calculate lap range for this stint
  let lapStart = 1
  for (let i = 0; i < index; i++) {
    // Each prior stint covers equal share (simplified)
    lapStart += Math.floor(totalLaps / stints.length)
  }
  const isLast = index === stints.length - 1
  const lapEnd = isLast
    ? totalLaps
    : lapStart + Math.floor(totalLaps / stints.length) - 1

  const compoundData = COMPOUNDS.find(c => c.id === stint.compound)

  return (
    <div className="stint-row" style={{ borderLeftColor: compoundData.color }}>
      <div className="stint-header">
        <span className="stint-number">Stint {index + 1}</span>
        <span className="stint-laps">L{lapStart}-{lapEnd}</span>
        {stints.length > 1 && (
          <button className="stint-remove" onClick={onRemove}>&times;</button>
        )}
      </div>

      <div className="stint-body">
        {/* Compound selector */}
        <div className="stint-field">
          <span className="stint-field-label">Compound</span>
          <div className="compound-btns">
            {COMPOUNDS.map(c => (
              <CompoundBtn key={c.id} compound={c.id}
                selected={stint.compound === c.id}
                onClick={() => onChange({ ...stint, compound: c.id })} />
            ))}
          </div>
        </div>

        {/* Tire age + fuel */}
        <div className="stint-field-pair">
          <div className="stint-field">
            <span className="stint-field-label">Tire Age</span>
            <div className="stint-input-group">
              <input type="number" className="stint-input" min={0} max={50}
                value={stint.tireAge}
                onChange={e => onChange({ ...stint, tireAge: Math.max(0, Number(e.target.value)) })} />
              <span className="stint-input-unit">laps</span>
            </div>
          </div>
          <div className="stint-field">
            <span className="stint-field-label">Fuel Load</span>
            <div className="stint-input-group">
              <input type="number" className="stint-input" min={0} max={MAX_FUEL_KG}
                value={stint.fuelLoad}
                onChange={e => onChange({ ...stint, fuelLoad: Math.max(0, Math.min(MAX_FUEL_KG, Number(e.target.value))) })} />
              <span className="stint-input-unit">kg</span>
            </div>
          </div>
        </div>

        {/* Pit actions (only for stints after the first) */}
        {index > 0 && (
          <div className="stint-pit-actions">
            <span className="stint-field-label">Pit Actions</span>
            <div className="pit-action-checks">
              <label className="pit-check">
                <input type="checkbox" checked={stint.changeTires}
                  onChange={e => onChange({ ...stint, changeTires: e.target.checked })} />
                <span>Tires</span>
              </label>
              <label className="pit-check">
                <input type="checkbox" checked={stint.refuelAmount > 0}
                  onChange={e => onChange({ ...stint, refuelAmount: e.target.checked ? 80 : 0 })} />
                <span>Refuel</span>
              </label>
              <label className="pit-check">
                <input type="checkbox" checked={stint.frontWingAdj}
                  onChange={e => onChange({ ...stint, frontWingAdj: e.target.checked })} />
                <span>Wing Adj</span>
              </label>
              <label className="pit-check">
                <input type="checkbox" checked={stint.repair}
                  onChange={e => onChange({ ...stint, repair: e.target.checked })} />
                <span>Repair</span>
              </label>
            </div>
            {stint.refuelAmount > 0 && (
              <div className="refuel-slider">
                <input type="range" className="strat-slider" min={0} max={MAX_FUEL_KG}
                  value={stint.refuelAmount}
                  onChange={e => onChange({ ...stint, refuelAmount: Number(e.target.value) })} />
                <span className="strat-slider-value">{stint.refuelAmount} kg</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tire Wear Mini Indicator ──
function TireWearMini({ wear, compound }) {
  const c = COMPOUNDS.find(x => x.id === compound) || COMPOUNDS[1]
  const pct = ((wear || 0) * 100).toFixed(0)
  const color = wear < 0.4 ? '#00e676' : wear < 0.7 ? '#f5a623' : wear < 0.9 ? '#ff6b00' : '#ff3d3d'
  return (
    <div className="tire-wear-mini">
      <div className="tire-wear-mini-bar">
        <div className="tire-wear-mini-fill" style={{ width: `${wear * 100}%`, background: color }} />
      </div>
      <span className="tire-wear-mini-val" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY BUILDER — controlled component, state owned by parent
// ═══════════════════════════════════════════════════════════════════
function StrategyBuilder({
  totalLaps, setTotalLaps,
  durationType, setDurationType,
  durationMinutes, setDurationMinutes,
  stints, setStints,
  modifiers, setModifiers,
  onRunSimulation, simStatus, onReset,
}) {
  // Button visual state: tracks the displayed state separately so we can
  // hold success/fallback for a brief flash before returning to idle.
  const [btnState, setBtnState] = useState('idle') // idle | simulating | success | fallback
  const timerRef = useRef(null)
  const lastPayloadRef = useRef(null)

  useEffect(() => {
    // Clear any pending reset timer on unmount
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  useEffect(() => {
    if (simStatus === 'simulating') {
      setBtnState('simulating')
      if (timerRef.current) clearTimeout(timerRef.current)
    } else if (simStatus === 'success') {
      setBtnState('success')
      timerRef.current = setTimeout(() => setBtnState('idle'), 800)
    } else if (simStatus === 'fallback') {
      setBtnState('fallback')
      timerRef.current = setTimeout(() => setBtnState('idle'), 2000)
    }
  }, [simStatus])

  const addStint = useCallback(() => {
    if (stints.length >= MAX_STINTS) return
    setStints(prev => [...prev, defaultStint(prev.length)])
  }, [stints.length, setStints])

  const removeStint = useCallback((idx) => {
    setStints(prev => prev.filter((_, i) => i !== idx))
  }, [setStints])

  const updateStint = useCallback((idx, newStint) => {
    setStints(prev => prev.map((s, i) => i === idx ? newStint : s))
  }, [setStints])

  const setMod = useCallback((key, val) => {
    setModifiers(prev => ({ ...prev, [key]: val }))
  }, [setModifiers])

  const handleRun = useCallback(() => {
    if (btnState === 'simulating') return // prevent double-click
    const effectiveLaps = durationType === 'laps' ? totalLaps : Math.round(durationMinutes / 1.5)
    const payload = {
      totalLaps: durationType === 'laps' ? totalLaps : null,
      durationMinutes: durationType === 'time' ? durationMinutes : null,
      durationType,
      stints: stints.map((s, i) => ({
        compound: s.compound,
        tireAge: s.tireAge,
        fuelLoad: s.fuelLoad,
        lapCount: Math.max(1, Math.floor(effectiveLaps / stints.length)),
        pitActions: i > 0 ? {
          changeTires: s.changeTires,
          refuelAmount: s.refuelAmount,
          frontWingAdj: s.frontWingAdj,
          repair: s.repair,
        } : null,
      })),
      modifiers: {
        wearMultiplier: parseFloat(modifiers.wearMultiplier),
        fuelMultiplier: parseFloat(modifiers.fuelMultiplier),
        weather: modifiers.weather,
        trackTemp: modifiers.trackTemp,
        ambientTemp: modifiers.ambientTemp,
      },
    }
    lastPayloadRef.current = payload
    onRunSimulation?.(payload)
  }, [btnState, totalLaps, durationType, durationMinutes, stints, modifiers, onRunSimulation])

  // Status text above button
  const effectiveLaps = durationType === 'laps' ? totalLaps : Math.round(durationMinutes / 1.5)
  let statusText = null
  if (btnState === 'simulating') {
    statusText = `Simulating ${effectiveLaps} laps...`
  } else if (btnState === 'success') {
    const p = lastPayloadRef.current
    const nStints = p?.stints?.length || stints.length
    const nLaps = p?.totalLaps || effectiveLaps
    statusText = `Physics simulation complete \u2014 ${nLaps} laps across ${nStints} stint${nStints > 1 ? 's' : ''}`
  } else if (btnState === 'fallback') {
    statusText = 'Live engine unavailable \u2014 using strategy estimate'
  }

  // Button label + class
  const btnDisabled = btnState === 'simulating'
  const btnClass = `strat-run-btn strat-run-${btnState}`
  const btnLabel = btnState === 'simulating' ? 'Simulating...'
    : btnState === 'success' ? 'Complete \u2713'
    : btnState === 'fallback' ? 'Using Estimate'
    : 'RUN SIMULATION'

  return (
    <div className="strategy-builder">
      {/* Race parameters row */}
      <div className="strat-params-row">
        <div className="strat-param">
          <span className="strat-param-label">Race Duration</span>
          <div className="strat-duration-group">
            <div className="strat-duration-toggle">
              <button className={`strat-dur-btn ${durationType === 'laps' ? 'active' : ''}`}
                onClick={() => setDurationType('laps')}>Laps</button>
              <button className={`strat-dur-btn ${durationType === 'time' ? 'active' : ''}`}
                onClick={() => setDurationType('time')}>Time</button>
            </div>
            {durationType === 'laps' ? (
              <div className="stint-input-group">
                <input type="number" className="stint-input stint-input-lg" min={1} max={70}
                  value={totalLaps}
                  onChange={e => setTotalLaps(Math.max(1, Math.min(70, Number(e.target.value))))} />
                <span className="stint-input-unit">laps</span>
              </div>
            ) : (
              <div className="stint-input-group">
                <input type="number" className="stint-input stint-input-lg" min={10} max={360}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Math.max(10, Math.min(360, Number(e.target.value))))} />
                <span className="stint-input-unit">min</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stint builder */}
      <div className="strat-stints-section">
        <div className="strat-section-header">
          <span className="strat-section-title">Stints</span>
          <div className="strat-section-header-btns">
            <button className="strat-reset-btn" onClick={onReset}>Reset</button>
            <button className="strat-add-stint" onClick={addStint}
              disabled={stints.length >= MAX_STINTS}>
              + Add Pit Stop
            </button>
          </div>
        </div>

        <div className="strat-stint-list">
          {stints.map((stint, i) => (
            <StintRow key={stint.id} stint={stint} index={i}
              totalLaps={effectiveLaps}
              stints={stints}
              onChange={s => updateStint(i, s)}
              onRemove={() => removeStint(i)} />
          ))}
        </div>
      </div>

      {/* Simulation modifiers */}
      <div className="strat-modifiers">
        <span className="strat-section-title">Simulation Modifiers</span>
        <div className="strat-mod-grid">
          <MultiBtn label="Tire Wear" value={modifiers.wearMultiplier}
            onChange={v => setMod('wearMultiplier', v)}
            options={[{ value: '1x', label: '1x' }, { value: '2x', label: '2x' }, { value: '3x', label: '3x' }]} />
          <MultiBtn label="Fuel Cons." value={modifiers.fuelMultiplier}
            onChange={v => setMod('fuelMultiplier', v)}
            options={[{ value: '1x', label: '1x' }, { value: '2x', label: '2x' }]} />
          <MultiBtn label="Weather" value={modifiers.weather}
            onChange={v => setMod('weather', v)}
            options={WEATHER_OPTIONS} />
          <Slider label="Track Temp" value={modifiers.trackTemp} min={20} max={60} step={1} unit="°C"
            onChange={v => setMod('trackTemp', v)} />
          <Slider label="Ambient" value={modifiers.ambientTemp} min={10} max={40} step={1} unit="°C"
            onChange={v => setMod('ambientTemp', v)} />
        </div>
      </div>

      {/* Status line + Run button */}
      {statusText && (
        <div className={`strat-run-status strat-run-status-${btnState}`}>{statusText}</div>
      )}
      <button className={btnClass} onClick={handleRun} disabled={btnDisabled}>
        {btnState === 'simulating' && <span className="strat-run-spinner" />}
        {btnLabel}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGY SUMMARY
// ═══════════════════════════════════════════════════════════════════
function StrategySummary({ session, frames, stints: stintData }) {
  if (!session || !frames || frames.length === 0) return null

  const totalTime = frames[frames.length - 1]?.time_s || 0
  const totalLaps = session.total_laps || 0

  // Find fastest lap
  let fastestLap = Infinity
  let fastestLapNum = 0
  const lapTimes = {}
  let prevLapTime = 0
  for (const f of frames) {
    if (f.lap && f.time_s) {
      if (!lapTimes[f.lap]) lapTimes[f.lap] = { start: prevLapTime, end: f.time_s }
      lapTimes[f.lap].end = f.time_s
    }
    if (f.lap && f.lap > 1) prevLapTime = f.time_s
  }
  // Compute lap times
  const lapTimeArr = []
  const lapNums = Object.keys(lapTimes).map(Number).sort((a, b) => a - b)
  for (let i = 1; i < lapNums.length; i++) {
    const lap = lapNums[i]
    const dur = lapTimes[lap].end - lapTimes[lap - 1]?.end
    if (dur > 0) {
      lapTimeArr.push({ lap, time: dur })
      if (dur < fastestLap) { fastestLap = dur; fastestLapNum = lap }
    }
  }

  // Average lap time
  const avgLapTime = lapTimeArr.length > 0
    ? lapTimeArr.reduce((s, l) => s + l.time, 0) / lapTimeArr.length : 0

  // Fuel used
  const startFuel = frames[0]?.fuel_L || 0
  const endFuel = frames[frames.length - 1]?.fuel_L || 0
  const fuelUsed = Math.max(0, startFuel - endFuel)

  // End-of-race tire state
  const lastFrame = frames[frames.length - 1]
  const tireWear = lastFrame?.tire_wear || {}
  const compound = 'M' // default

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(3)
    return `${m}:${sec.padStart(6, '0')}`
  }

  return (
    <div className="strategy-summary">
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="summary-stat-label">Total Time</span>
          <span className="summary-stat-value">{formatTime(totalTime)}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">Laps</span>
          <span className="summary-stat-value">{totalLaps}</span>
        </div>
        <div className="summary-stat highlight">
          <span className="summary-stat-label">Fastest Lap</span>
          <span className="summary-stat-value">
            {fastestLap < Infinity ? `L${fastestLapNum} ${formatTime(fastestLap)}` : '--'}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">Avg Lap</span>
          <span className="summary-stat-value">{avgLapTime > 0 ? formatTime(avgLapTime) : '--'}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">Fuel Used</span>
          <span className="summary-stat-value">{fuelUsed.toFixed(1)} L</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-label">End Reason</span>
          <span className="summary-stat-value">{session.end_reason || '--'}</span>
        </div>
      </div>

      {/* Tire state at end */}
      <div className="summary-tires">
        <span className="strat-section-title">Final Tire State</span>
        <div className="summary-tire-grid">
          {['FL', 'FR', 'RL', 'RR'].map(id => (
            <div key={id} className="summary-tire-card">
              <span className="summary-tire-id">{id}</span>
              <TireWearMini wear={tireWear[id] || 0} compound={compound} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PANEL — owns strategy state, toggles between Builder/Summary
// ═══════════════════════════════════════════════════════════════════
function StrategyPanel({ session, frames, onRunSimulation, simStatus }) {
  const [view, setView] = useState('builder')
  const hasData = session && frames && frames.length > 0

  // ── Persistent strategy state (survives tab switches) ──
  const [totalLaps, setTotalLaps] = useState(26)
  const [durationType, setDurationType] = useState('laps')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [stints, setStints] = useState([defaultStint(0)])
  const [modifiers, setModifiers] = useState(defaultModifiers)

  const handleReset = useCallback(() => {
    setTotalLaps(26)
    setDurationType('laps')
    setDurationMinutes(60)
    setStints([defaultStint(0)])
    setModifiers(defaultModifiers())
  }, [])

  return (
    <div className="strategy-panel-container">
      <div className="strat-panel-header">
        <h4 className="panel-title">Race Strategy</h4>
        <div className="strat-view-toggle">
          <button className={`strat-view-btn ${view === 'builder' ? 'active' : ''}`}
            onClick={() => setView('builder')}>Builder</button>
          <button className={`strat-view-btn ${view === 'summary' ? 'active' : ''}`}
            onClick={() => setView('summary')}
            disabled={!hasData}>Summary</button>
        </div>
      </div>

      {view === 'builder' ? (
        <StrategyBuilder
          totalLaps={totalLaps} setTotalLaps={setTotalLaps}
          durationType={durationType} setDurationType={setDurationType}
          durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes}
          stints={stints} setStints={setStints}
          modifiers={modifiers} setModifiers={setModifiers}
          onRunSimulation={onRunSimulation}
          simStatus={simStatus}
          onReset={handleReset}
        />
      ) : (
        <StrategySummary session={session} frames={frames} />
      )}
    </div>
  )
}

export default memo(StrategyPanel)
