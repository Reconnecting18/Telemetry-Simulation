import { useMemo, useRef, useCallback } from 'react'

const SPEEDS = [0.25, 0.5, 1, 2, 5]

// Compound colors for stint backgrounds and pit markers
const COMPOUND = {
  soft:   { bg: 'rgba(255,61,61,0.12)',   mark: '#ff3d3d' },
  medium: { bg: 'rgba(245,166,35,0.12)',  mark: '#f5a623' },
  hard:   { bg: 'rgba(204,204,204,0.12)', mark: '#cccccc' },
}

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
    if (!map[f.lap]) map[f.lap] = { lap: f.lap, start: f.time_s, end: f.time_s }
    else map[f.lap].end = f.time_s
  }
  return Object.values(map).sort((a, b) => a.lap - b.lap)
}

// Derive stints — for now single compound, but supports future pit data
function buildStints(laps) {
  if (!laps.length) return []
  // Single stint: all laps on medium compound
  return [{ compound: 'medium', startLap: laps[0].lap, endLap: laps[laps.length - 1].lap,
            startTime: laps[0].start, endTime: laps[laps.length - 1].end }]
}

export default function PlaybackControls({
  currentTime, maxTime, isPlaying, playbackSpeed,
  frames, onToggle, onSeek, onSetSpeed,
}) {
  const barRef = useRef(null)

  const laps = useMemo(() => buildLaps(frames), [frames])
  const stints = useMemo(() => buildStints(laps), [laps])
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
        {/* Stint backgrounds */}
        {stints.map((st, i) => {
          const left = timeToFrac(st.startTime) * 100
          const width = (timeToFrac(st.endTime) - timeToFrac(st.startTime)) * 100
          const c = COMPOUND[st.compound] || COMPOUND.medium
          return (
            <div key={`stint-${i}`} className="stint-bg"
              style={{ left: `${left}%`, width: `${width}%`, background: c.bg }} />
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

        {/* Track bar fill (subtle progress) */}
        <div className="timeline-progress" style={{ width: `${frac * 100}%` }} />

        {/* Current position triangle */}
        <div className="timeline-cursor" style={{ left: `${frac * 100}%` }}>
          <svg width="10" height="8" viewBox="0 0 10 8">
            <polygon points="5,0 10,8 0,8" fill="#00d4d4" />
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
