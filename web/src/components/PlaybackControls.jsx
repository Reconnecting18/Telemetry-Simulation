import { useMemo, useRef, useCallback, useState } from 'react'

const SPEEDS = [0.25, 0.5, 1, 2, 5]

// Compound colors for stint backgrounds and pit markers
const COMPOUND = {
  soft:   { bg: 'rgba(255,61,61,0.18)',   block: '#ff3d3d' },
  medium: { bg: 'rgba(245,166,35,0.18)',  block: '#f5a623' },
  hard:   { bg: 'rgba(160,160,160,0.18)', block: '#999' },
}

const PIT_TIME_S = 21 // default pit lane time loss

function formatTime(s) {
  const mins = Math.floor(s / 60)
  const secs = (s % 60).toFixed(1)
  return `${mins}:${secs.padStart(4, '0')}`
}

function formatRaceTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Extract lap boundaries from frames, plus fuel snapshot per lap
function buildLaps(frames) {
  if (!frames || !frames.length) return []
  const map = {}
  for (const f of frames) {
    if (!map[f.lap]) map[f.lap] = { lap: f.lap, start: f.time_s, end: f.time_s, compound: f.compound, fuel: f.fuel_L }
    else {
      map[f.lap].end = f.time_s
      map[f.lap].fuel = f.fuel_L // last frame fuel for that lap
    }
  }
  return Object.values(map).sort((a, b) => a.lap - b.lap)
}

// Build stints from pit stop data + lap boundaries
function buildStints(laps, pitStops) {
  if (!laps.length) return []

  const stints = []
  const pits = (pitStops || []).slice().sort((a, b) => a.after_lap - b.after_lap)

  if (pits.length === 0) {
    const compound = laps[0].compound || 'medium'
    return [{ compound, startLap: laps[0].lap, endLap: laps[laps.length - 1].lap,
              startTime: laps[0].start, endTime: laps[laps.length - 1].end }]
  }

  const firstCompound = pits[0].from_compound || laps[0].compound || 'medium'
  const firstPitLap = pits[0].after_lap
  const firstEnd = laps.find(l => l.lap === firstPitLap)
  stints.push({
    compound: firstCompound,
    startLap: laps[0].lap,
    endLap: firstPitLap,
    startTime: laps[0].start,
    endTime: firstEnd ? firstEnd.end : laps[0].end,
  })

  for (let i = 0; i < pits.length; i++) {
    const compound = pits[i].to_compound || 'medium'
    const startLap = pits[i].after_lap + 1
    const endLap = (i + 1 < pits.length) ? pits[i + 1].after_lap : laps[laps.length - 1].lap
    const startEntry = laps.find(l => l.lap === startLap)
    const endEntry = laps.find(l => l.lap === endLap)
    if (startEntry && endEntry) {
      stints.push({ compound, startLap, endLap, startTime: startEntry.start, endTime: endEntry.end })
    }
  }

  return stints
}

// Build stints directly from submitted strategy payload (authoritative source)
function buildStintsFromStrategy(strategyStints, laps) {
  if (!strategyStints?.length || !laps.length) return []
  const result = []
  let lapStart = laps[0].lap
  const maxLap = laps[laps.length - 1].lap

  for (const st of strategyStints) {
    const endLap = Math.min(lapStart + st.lap_count - 1, maxLap)
    const startEntry = laps.find(l => l.lap >= lapStart) || laps[0]
    const endEntry = [...laps].reverse().find(l => l.lap <= endLap) || laps[laps.length - 1]

    result.push({
      compound: st.compound,
      startLap: lapStart,
      endLap,
      startTime: startEntry.start,
      endTime: endEntry.end,
    })

    lapStart = endLap + 1
    if (lapStart > maxLap) break
  }
  return result
}

// Build pit marker data with time positions
function buildPitMarkers(pitStops, laps) {
  if (!pitStops || !pitStops.length || !laps.length) return []
  return pitStops.map(ps => {
    const lapEntry = laps.find(l => l.lap === ps.after_lap)
    return { ...ps, time: lapEntry ? lapEntry.end : 0 }
  })
}

// Find lap info at a given time
function lapAtTime(laps, stints, pitStops, time) {
  if (!laps.length) return null
  let lap = laps[0]
  for (const l of laps) {
    if (l.start <= time) lap = l
    else break
  }

  // Determine stint for tire age
  const pits = (pitStops || []).map(p => p.after_lap).sort((a, b) => a - b)
  let stintStart = 1
  for (const p of pits) {
    if (p < lap.lap) stintStart = p + 1
  }
  const tireAge = lap.lap - stintStart + 1

  // Find compound from stints
  let compound = lap.compound || 'medium'
  for (const st of stints) {
    if (lap.lap >= st.startLap && lap.lap <= st.endLap) {
      compound = st.compound
      break
    }
  }

  return { lap: lap.lap, compound, tireAge, fuel: lap.fuel, raceTime: time }
}

export default function PlaybackControls({
  currentTime, maxTime, isPlaying, playbackSpeed,
  frames, pitStops, lastSubmittedStrategy, onToggle, onSeek, onSetSpeed,
}) {
  const barRef = useRef(null)
  const [hoveredPit, setHoveredPit] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [hoverInfo, setHoverInfo] = useState(null)
  const [hoverX, setHoverX] = useState(0)

  const laps = useMemo(() => buildLaps(frames), [frames])
  const stints = useMemo(() => {
    if (lastSubmittedStrategy?.stints?.length) {
      return buildStintsFromStrategy(lastSubmittedStrategy.stints, laps)
    }
    return buildStints(laps, pitStops)
  }, [laps, pitStops, lastSubmittedStrategy])
  const pitMarkers = useMemo(() => buildPitMarkers(pitStops, laps), [pitStops, laps])
  const totalLaps = laps.length

  // Pit lap numbers for label display
  const pitLapSet = useMemo(() => new Set((pitStops || []).map(p => p.after_lap)), [pitStops])

  // Average lap time for pit gap scaling
  const avgLapTime = useMemo(() => {
    if (laps.length < 2) return 90
    const times = laps.slice(1).map(l => l.end - l.start) // skip lap 1 (standing start)
    return times.reduce((a, b) => a + b, 0) / times.length
  }, [laps])

  const frac = maxTime > 0 ? currentTime / maxTime : 0
  const timeToFrac = useCallback((t) => maxTime > 0 ? t / maxTime : 0, [maxTime])

  // Drag handling
  const seekFromPointer = useCallback((clientX) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(x * maxTime)
  }, [maxTime, onSeek])

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    seekFromPointer(e.clientX)
    const onMove = (ev) => seekFromPointer(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [seekFromPointer])

  // Pit marker hover handlers
  const onPitEnter = useCallback((e, pit) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    setHoveredPit(pit)
    setTooltipPos({ x: e.clientX - rect.left, y: -8 })
  }, [])

  const onPitLeave = useCallback(() => setHoveredPit(null), [])

  // Bar hover for general tooltip
  const onBarMove = useCallback((e) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = xFrac * maxTime
    const info = lapAtTime(laps, stints, pitStops, time)
    setHoverInfo(info)
    setHoverX(e.clientX - rect.left)
  }, [laps, stints, pitStops, maxTime])

  const onBarLeave = useCallback(() => { setHoverInfo(null); setHoveredPit(null) }, [])

  // Lap label intervals — show every N laps depending on total, plus pit laps always
  const labelInterval = totalLaps > 40 ? 10 : totalLaps > 20 ? 5 : totalLaps > 10 ? 2 : 1

  // Pit gap width as fraction of bar (pit time / total time)
  const pitGapFrac = maxTime > 0 ? PIT_TIME_S / maxTime : 0

  return (
    <div className="playback-controls">
      {/* Left: play + speed + time */}
      <div className="playback-left">
        <button className="play-btn" onClick={onToggle}>
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>
        <div className="speed-btns">
          {SPEEDS.map(s => (
            <button key={s}
              className={`speed-btn ${playbackSpeed === s ? 'active' : ''}`}
              onClick={() => onSetSpeed(s)}>{s}x</button>
          ))}
        </div>
        <span className="time-display">
          {formatTime(currentTime)} / {formatTime(maxTime)}
        </span>
      </div>

      {/* Race Timeline Bar */}
      <div className="race-timeline" ref={barRef} onPointerDown={onPointerDown}
        onMouseMove={onBarMove} onMouseLeave={onBarLeave}>
        {/* Stint compound color blocks */}
        {stints.map((st, i) => {
          const left = timeToFrac(st.startTime) * 100
          const width = Math.max(0, (timeToFrac(st.endTime) - timeToFrac(st.startTime)) * 100)
          const c = COMPOUND[st.compound] || COMPOUND.medium
          return (
            <div key={`stint-${i}`} className="stint-bg"
              style={{ left: `${left}%`, width: `${width}%`, background: c.bg }} />
          )
        })}

        {/* Compound strip along bottom edge */}
        {stints.map((st, i) => {
          const left = timeToFrac(st.startTime) * 100
          const width = Math.max(0, (timeToFrac(st.endTime) - timeToFrac(st.startTime)) * 100)
          const c = COMPOUND[st.compound] || COMPOUND.medium
          return (
            <div key={`compound-strip-${i}`} style={{
              position: 'absolute',
              bottom: 0,
              left: `${left}%`,
              width: `${width}%`,
              height: 3,
              background: c.block,
              opacity: 0.85,
              pointerEvents: 'none',
              borderRadius: i === 0 ? '0 0 0 4px' : i === stints.length - 1 ? '0 0 4px 0' : 0,
            }} />
          )
        })}

        {/* Lap tick marks */}
        {laps.map((lap) => {
          const x = timeToFrac(lap.start) * 100
          const isMajor = lap.lap % 5 === 0 || lap.lap === 1
          return (
            <div key={`tick-${lap.lap}`}
              className={`lap-tick ${isMajor ? 'major' : ''}`}
              style={{ left: `${x}%` }} />
          )
        })}

        {/* Pit stop markers with window shading and gap */}
        {pitMarkers.map((pit, i) => {
          const x = timeToFrac(pit.time) * 100
          // Pit window: ~1 lap earlier/later
          const windowFrac = avgLapTime / (maxTime || 1) * 100
          const windowWidth = Math.min(windowFrac, 3) // cap at 3% bar width
          // Pit gap width proportional to pit time
          const gapWidth = pitGapFrac * 100
          return (
            <div key={`pit-${i}`}>
              {/* Pit window shading (±1 lap) */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: `${Math.max(0, x - windowWidth)}%`,
                width: `${windowWidth * 2}%`,
                height: '100%',
                background: 'rgba(0, 168, 168, 0.06)',
                pointerEvents: 'none',
                borderRadius: 2,
              }} />
              {/* Pit duration gap */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: `${x}%`,
                width: `${Math.max(0.3, gapWidth)}%`,
                height: '100%',
                background: '#0a0a0a',
                borderLeft: '1px solid rgba(0, 168, 168, 0.3)',
                borderRight: '1px solid rgba(0, 168, 168, 0.3)',
                pointerEvents: 'none',
                zIndex: 1,
              }} />
              {/* Pit marker line + label */}
              <div className="pit-marker"
                style={{ left: `${x}%` }}
                onMouseEnter={(e) => onPitEnter(e, pit)}
                onMouseLeave={onPitLeave}>
                <span className="pit-marker-label">P</span>
                <div className="pit-marker-line" />
              </div>
            </div>
          )
        })}

        {/* Pit tooltip */}
        {hoveredPit && (
          <div className="pit-tooltip"
            style={{ left: `${tooltipPos.x}px`, bottom: '32px' }}>
            <div className="pit-tooltip-title">Pit Stop — Lap {hoveredPit.after_lap}</div>
            <div className="pit-tooltip-row">
              <span className="pit-tooltip-dot" style={{ background: (COMPOUND[hoveredPit.from_compound] || COMPOUND.medium).block }} />
              {hoveredPit.from_compound}
              <span className="pit-tooltip-arrow">&rarr;</span>
              <span className="pit-tooltip-dot" style={{ background: (COMPOUND[hoveredPit.to_compound] || COMPOUND.medium).block }} />
              {hoveredPit.to_compound}
            </div>
            {hoveredPit.fuel_added_L > 0 && (
              <div className="pit-tooltip-row">Fuel: +{hoveredPit.fuel_added_L.toFixed(1)} L</div>
            )}
            <div className="pit-tooltip-row">Time loss: ~{PIT_TIME_S}s</div>
          </div>
        )}

        {/* General hover tooltip */}
        {hoverInfo && !hoveredPit && (
          <div className="bar-tooltip" style={{ left: `${hoverX}px` }}>
            <div className="bar-tooltip-row">
              <span style={{ color: '#aaa' }}>Lap</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{hoverInfo.lap}</span>
            </div>
            <div className="bar-tooltip-row">
              <span style={{ color: '#aaa' }}>Compound</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: (COMPOUND[hoverInfo.compound] || COMPOUND.medium).block,
                }} />
                <span style={{ color: (COMPOUND[hoverInfo.compound] || COMPOUND.medium).block }}>
                  {hoverInfo.compound}
                </span>
              </span>
            </div>
            <div className="bar-tooltip-row">
              <span style={{ color: '#aaa' }}>Tire age</span>
              <span style={{ color: '#ccc' }}>{hoverInfo.tireAge} laps</span>
            </div>
            <div className="bar-tooltip-row">
              <span style={{ color: '#aaa' }}>Fuel</span>
              <span style={{ color: '#ccc' }}>{hoverInfo.fuel != null ? `${hoverInfo.fuel.toFixed(1)} L` : '--'}</span>
            </div>
            <div className="bar-tooltip-row">
              <span style={{ color: '#aaa' }}>Race time</span>
              <span style={{ color: '#666' }}>{formatRaceTime(hoverInfo.raceTime)}</span>
            </div>
          </div>
        )}

        {/* Track bar fill (subtle progress) */}
        <div className="timeline-progress" style={{ width: `${frac * 100}%` }} />

        {/* Current position triangle */}
        <div className="timeline-cursor" style={{ left: `${frac * 100}%` }}>
          <svg width="10" height="8" viewBox="0 0 10 8">
            <polygon points="5,0 10,8 0,8" fill="#00a8a8" />
          </svg>
        </div>

        {/* Lap labels below the bar — every Nth lap + pit laps always shown */}
        <div className="lap-labels">
          {laps.map((lap) => {
            const showByInterval = lap.lap === 1 || lap.lap % labelInterval === 0 || lap.lap === totalLaps
            const showAsPit = pitLapSet.has(lap.lap)
            if (!showByInterval && !showAsPit) return null
            const x = timeToFrac(lap.start) * 100
            return (
              <span key={`lbl-${lap.lap}`}
                className={`lap-label ${showAsPit ? 'pit-lap' : ''}`}
                style={{ left: `${x}%` }}>{lap.lap}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
