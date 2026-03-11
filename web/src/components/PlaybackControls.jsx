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

// Extract lap boundaries from frames
function buildLaps(frames) {
  if (!frames || !frames.length) return []
  const map = {}
  for (const f of frames) {
    if (!map[f.lap]) map[f.lap] = { lap: f.lap, start: f.time_s, end: f.time_s, compound: f.compound }
    else map[f.lap].end = f.time_s
  }
  return Object.values(map).sort((a, b) => a.lap - b.lap)
}

// Build stints from pit stop data + lap boundaries
function buildStints(laps, pitStops) {
  if (!laps.length) return []

  const stints = []
  const pits = (pitStops || []).slice().sort((a, b) => a.after_lap - b.after_lap)

  if (pits.length === 0) {
    // No pit stops — single stint, derive compound from first frame
    const compound = laps[0].compound || 'medium'
    return [{ compound, startLap: laps[0].lap, endLap: laps[laps.length - 1].lap,
              startTime: laps[0].start, endTime: laps[laps.length - 1].end }]
  }

  // First stint: start to first pit
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

  // Middle stints
  for (let i = 0; i < pits.length; i++) {
    const compound = pits[i].to_compound || 'medium'
    const startLap = pits[i].after_lap + 1
    const endLap = (i + 1 < pits.length) ? pits[i + 1].after_lap : laps[laps.length - 1].lap
    const startEntry = laps.find(l => l.lap === startLap)
    const endEntry = laps.find(l => l.lap === endLap)
    if (startEntry && endEntry) {
      stints.push({
        compound,
        startLap,
        endLap,
        startTime: startEntry.start,
        endTime: endEntry.end,
      })
    }
  }

  return stints
}

// Build pit marker data with time positions
function buildPitMarkers(pitStops, laps) {
  if (!pitStops || !pitStops.length || !laps.length) return []
  return pitStops.map(ps => {
    const lapEntry = laps.find(l => l.lap === ps.after_lap)
    return {
      ...ps,
      time: lapEntry ? lapEntry.end : 0,
    }
  })
}

export default function PlaybackControls({
  currentTime, maxTime, isPlaying, playbackSpeed,
  frames, pitStops, onToggle, onSeek, onSetSpeed,
}) {
  const barRef = useRef(null)
  const [hoveredPit, setHoveredPit] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const laps = useMemo(() => buildLaps(frames), [frames])
  const stints = useMemo(() => buildStints(laps, pitStops), [laps, pitStops])
  const pitMarkers = useMemo(() => buildPitMarkers(pitStops, laps), [pitStops, laps])
  const totalLaps = laps.length

  // Fraction of current time across total race
  const frac = maxTime > 0 ? currentTime / maxTime : 0

  // Convert time to bar fraction
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

  // Lap label intervals — show every N laps depending on total
  const labelInterval = totalLaps > 40 ? 10 : totalLaps > 20 ? 5 : totalLaps > 10 ? 2 : 1

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
      <div className="race-timeline" ref={barRef} onPointerDown={onPointerDown}>
        {/* Stint compound color blocks */}
        {stints.map((st, i) => {
          const left = timeToFrac(st.startTime) * 100
          const width = Math.max(0, (timeToFrac(st.endTime) - timeToFrac(st.startTime)) * 100)
          const c = COMPOUND[st.compound] || COMPOUND.medium
          return (
            <div key={`stint-${i}`} className="stint-bg"
              style={{ left: `${left}%`, width: `${width}%`, background: c.bg,
                       borderBottom: `2px solid ${c.block}` }} />
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

        {/* Pit stop markers */}
        {pitMarkers.map((pit, i) => {
          const x = timeToFrac(pit.time) * 100
          return (
            <div key={`pit-${i}`} className="pit-marker"
              style={{ left: `${x}%` }}
              onMouseEnter={(e) => onPitEnter(e, pit)}
              onMouseLeave={onPitLeave}>
              <span className="pit-marker-label">P</span>
              <div className="pit-marker-line" />
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

        {/* Track bar fill (subtle progress) */}
        <div className="timeline-progress" style={{ width: `${frac * 100}%` }} />

        {/* Current position triangle */}
        <div className="timeline-cursor" style={{ left: `${frac * 100}%` }}>
          <svg width="10" height="8" viewBox="0 0 10 8">
            <polygon points="5,0 10,8 0,8" fill="#00a8a8" />
          </svg>
        </div>

        {/* Lap labels below the bar */}
        <div className="lap-labels">
          {laps.map((lap) => {
            if (lap.lap !== 1 && lap.lap % labelInterval !== 0 && lap.lap !== totalLaps) return null
            const x = timeToFrac(lap.start) * 100
            return (
              <span key={`lbl-${lap.lap}`} className="lap-label"
                style={{ left: `${x}%` }}>{lap.lap}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
