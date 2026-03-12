import { useMemo } from 'react'

const COMPOUND_COLORS = { soft: '#ff3d3d', medium: '#f5c623', hard: '#999999', intermediate: '#00c853', wet: '#2979ff' }

function formatLapTime(seconds) {
  if (seconds == null || !isFinite(seconds)) return '-:--:---'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  const whole = Math.floor(s)
  const ms = Math.round((s - whole) * 1000)
  return `${m}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function formatDelta(val) {
  if (val == null || !isFinite(val)) return '--'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(1)}s`
}

/**
 * Compute per-lap timing from frame data.
 * Returns [{lap, time_s, compound}] for completed laps.
 */
function computeLapTimes(frames) {
  if (!frames?.length) return []
  const lapMap = new Map()
  for (const fr of frames) {
    const lap = fr.lap
    if (!lap) continue
    if (!lapMap.has(lap)) lapMap.set(lap, { min: fr.time_s, max: fr.time_s, compound: fr.compound })
    const entry = lapMap.get(lap)
    entry.min = Math.min(entry.min, fr.time_s)
    entry.max = Math.max(entry.max, fr.time_s)
    if (fr.compound) entry.compound = fr.compound
  }
  const laps = []
  for (const [lap, { min, max, compound }] of lapMap) {
    if (lap < 2) continue // lap 1 includes standing start, use it only for delta
    laps.push({ lap, time_s: max - min, compound: compound || 'medium' })
  }
  // Add lap 1 separately (use raw delta even with standing start)
  if (lapMap.has(1)) {
    const l1 = lapMap.get(1)
    laps.unshift({ lap: 1, time_s: l1.max - l1.min, compound: l1.compound || 'soft' })
  }
  return laps.sort((a, b) => a.lap - b.lap)
}

export default function LapTimePanel({ frames, pitStops, currentLap }) {
  const lapTimes = useMemo(() => computeLapTimes(frames), [frames])

  const { avgTime, bestTime, bestLap, pitLaps, stintAnalysis } = useMemo(() => {
    if (!lapTimes.length) return { avgTime: null, bestTime: null, bestLap: null, pitLaps: [], stintAnalysis: null }

    // Find current stint laps for avg calculation
    const pits = (pitStops || []).map(p => p.after_lap)
    const curLap = currentLap || lapTimes[lapTimes.length - 1]?.lap || 1

    // Determine current stint boundaries
    let stintStart = 1
    for (const p of pits) {
      if (p < curLap) stintStart = p + 1
    }
    const stintLaps = lapTimes.filter(l => l.lap >= stintStart && l.lap <= curLap)
    const avg = stintLaps.length > 0
      ? stintLaps.reduce((s, l) => s + l.time_s, 0) / stintLaps.length
      : null

    // Best lap overall
    let best = Infinity, bLap = null
    for (const l of lapTimes) {
      if (l.time_s < best) { best = l.time_s; bLap = l.lap }
    }

    // Stint analysis for delta indicators
    // Group laps into stints
    const stints = []
    let sStart = 1
    for (const p of [...pits, Infinity]) {
      const sLaps = lapTimes.filter(l => l.lap >= sStart && l.lap <= p)
      if (sLaps.length > 1) stints.push(sLaps)
      sStart = p + 1
    }

    // Use the current (or latest completed) stint
    const activeStint = stints.length > 0 ? stints[stints.length - 1] : null
    let warmUp = null, degradation = null, fuelEffect = null
    if (activeStint && activeStint.length >= 2) {
      // Warm up: improvement from lap 1 of stint to best lap in stint
      const stintBest = Math.min(...activeStint.map(l => l.time_s))
      warmUp = stintBest - activeStint[0].time_s // negative = improvement

      // Degradation: loss from best to last lap
      const lastLap = activeStint[activeStint.length - 1].time_s
      degradation = lastLap - stintBest // positive = slower

      // Fuel effect estimate: ~0.03s per lap per kg of fuel burned
      // Assume ~2.3 kg/lap fuel burn, 0.03s/kg lap time sensitivity
      const fuelLapGain = 0.03 * 2.3 // ~0.069s per lap
      fuelEffect = -(fuelLapGain * (activeStint.length - 1)) // negative = faster
    }

    return {
      avgTime: avg,
      bestTime: best < Infinity ? best : null,
      bestLap: bLap,
      pitLaps: pits,
      stintAnalysis: { warmUp, degradation, fuelEffect },
    }
  }, [lapTimes, pitStops, currentLap])

  const hasData = lapTimes.length > 0

  return (
    <div style={{
      background: '#111111',
      border: '1px solid #1e1e1e',
      borderRight: '1px solid #1e1e1e',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Component 1: Primary lap time display */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        marginBottom: 12,
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555', marginBottom: 4 }}>
            Avg Lap
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: '1.15rem', color: '#e0e0e0', fontWeight: 600 }}>
            {hasData ? formatLapTime(avgTime) : '-:--:---'}
          </div>
          <div style={{ fontSize: '0.5rem', color: '#444', marginTop: 2 }}>
            {hasData ? 'current stint' : ''}
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: '#2a2a2a', flexShrink: 0 }} />

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555', marginBottom: 4 }}>
            Best Lap
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: '1.15rem', color: '#aa44ff', fontWeight: 600 }}>
            {hasData ? formatLapTime(bestTime) : '-:--:---'}
          </div>
          <div style={{ fontSize: '0.5rem', color: '#444', marginTop: 2 }}>
            {hasData && bestLap ? `lap ${bestLap}` : ''}
          </div>
        </div>
      </div>

      {/* Component 2: Lap time trend chart */}
      <div style={{ flex: 1, minHeight: 0, marginBottom: 10 }}>
        <LapChart lapTimes={lapTimes} bestTime={bestTime} pitLaps={pitLaps} />
      </div>

      {/* Component 3: Delta indicators */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexShrink: 0,
      }}>
        <DeltaBlock label="Warm Up" value={stintAnalysis?.warmUp} good={true} />
        <DeltaBlock label="Degradation" value={stintAnalysis?.degradation} good={false} />
        <DeltaBlock label="Fuel Effect" value={stintAnalysis?.fuelEffect} good={true} />
      </div>
    </div>
  )
}

function DeltaBlock({ label, value, good }) {
  const hasVal = value != null && isFinite(value)
  const isPositive = hasVal && value > 0
  // For "good" metrics (warm up, fuel), negative = green. For "bad" (degradation), positive = red.
  const color = !hasVal ? '#444'
    : good ? (value <= 0 ? '#00e676' : '#ff5252')
    : (value >= 0 ? '#ff5252' : '#00e676')

  return (
    <div style={{
      flex: 1,
      background: '#0a0a0a',
      borderRadius: 4,
      padding: '6px 8px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.48rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Courier New', monospace",
        fontSize: '0.85rem',
        fontWeight: 600,
        color,
      }}>
        {hasVal ? formatDelta(value) : '--'}
      </div>
    </div>
  )
}

function LapChart({ lapTimes, bestTime, pitLaps }) {
  if (!lapTimes.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '0.6rem' }}>
        No lap data
      </div>
    )
  }

  const PAD = { top: 14, right: 10, bottom: 20, left: 36 }
  const times = lapTimes.map(l => l.time_s)
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const range = maxT - minT || 1
  // Add 5% padding to Y range
  const yMin = minT - range * 0.05
  const yMax = maxT + range * 0.05
  const yRange = yMax - yMin

  const N = lapTimes.length
  const maxLap = lapTimes[N - 1].lap

  return (
    <svg width="100%" height="100%" viewBox="0 0 300 140" preserveAspectRatio="none" style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => {
        const y = PAD.top + (1 - frac) * (140 - PAD.top - PAD.bottom)
        const val = yMin + frac * yRange
        return (
          <g key={frac}>
            <line x1={PAD.left} x2={300 - PAD.right} y1={y} y2={y} stroke="#1a1a1a" strokeWidth={0.5} />
            <text x={PAD.left - 3} y={y + 1.5} fill="#444" fontSize={6} textAnchor="end" fontFamily="'Courier New', monospace">
              {val.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* Best lap horizontal line */}
      {bestTime != null && (
        <>
          <line
            x1={PAD.left} x2={300 - PAD.right}
            y1={PAD.top + (1 - (bestTime - yMin) / yRange) * (140 - PAD.top - PAD.bottom)}
            y2={PAD.top + (1 - (bestTime - yMin) / yRange) * (140 - PAD.top - PAD.bottom)}
            stroke="#ffffff" strokeWidth={0.5} strokeDasharray="3,2"
          />
        </>
      )}

      {/* Shaded region between actual and best */}
      {bestTime != null && lapTimes.length > 1 && (
        <path
          d={(() => {
            const chartW = 300 - PAD.left - PAD.right
            const chartH = 140 - PAD.top - PAD.bottom
            const bestY = PAD.top + (1 - (bestTime - yMin) / yRange) * chartH
            let path = ''
            // Forward: actual times
            for (let i = 0; i < lapTimes.length; i++) {
              const x = PAD.left + (lapTimes[i].lap - 1) / Math.max(1, maxLap - 1) * chartW
              const y = PAD.top + (1 - (lapTimes[i].time_s - yMin) / yRange) * chartH
              path += (i === 0 ? 'M' : 'L') + `${x},${y} `
            }
            // Backward: best line
            for (let i = lapTimes.length - 1; i >= 0; i--) {
              const x = PAD.left + (lapTimes[i].lap - 1) / Math.max(1, maxLap - 1) * chartW
              path += `L${x},${bestY} `
            }
            path += 'Z'
            return path
          })()}
          fill="#ff3d3d"
          fillOpacity={0.08}
        />
      )}

      {/* Pit stop lines */}
      {pitLaps.map(pl => {
        const chartW = 300 - PAD.left - PAD.right
        const x = PAD.left + (pl - 1) / Math.max(1, maxLap - 1) * chartW
        return (
          <g key={`pit-${pl}`}>
            <line x1={x} x2={x} y1={PAD.top} y2={140 - PAD.bottom} stroke="#00a8a8" strokeWidth={0.6} strokeDasharray="2,2" />
            <text x={x} y={PAD.top - 3} fill="#00a8a8" fontSize={5} textAnchor="middle" fontFamily="'Courier New', monospace">PIT</text>
          </g>
        )
      })}

      {/* Lap time line segments colored by compound */}
      {lapTimes.map((lt, i) => {
        if (i === 0) return null
        const prev = lapTimes[i - 1]
        const chartW = 300 - PAD.left - PAD.right
        const chartH = 140 - PAD.top - PAD.bottom
        const x1 = PAD.left + (prev.lap - 1) / Math.max(1, maxLap - 1) * chartW
        const y1 = PAD.top + (1 - (prev.time_s - yMin) / yRange) * chartH
        const x2 = PAD.left + (lt.lap - 1) / Math.max(1, maxLap - 1) * chartW
        const y2 = PAD.top + (1 - (lt.time_s - yMin) / yRange) * chartH
        const color = COMPOUND_COLORS[lt.compound] || '#999'
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.2} />
      })}

      {/* Data points */}
      {lapTimes.map((lt, i) => {
        const chartW = 300 - PAD.left - PAD.right
        const chartH = 140 - PAD.top - PAD.bottom
        const x = PAD.left + (lt.lap - 1) / Math.max(1, maxLap - 1) * chartW
        const y = PAD.top + (1 - (lt.time_s - yMin) / yRange) * chartH
        const color = COMPOUND_COLORS[lt.compound] || '#999'
        return <circle key={i} cx={x} cy={y} r={1.5} fill={color} />
      })}

      {/* X axis labels */}
      {(() => {
        const labels = []
        const step = Math.max(1, Math.ceil(maxLap / 8))
        for (let lap = 1; lap <= maxLap; lap += step) {
          const chartW = 300 - PAD.left - PAD.right
          const x = PAD.left + (lap - 1) / Math.max(1, maxLap - 1) * chartW
          labels.push(
            <text key={lap} x={x} y={140 - PAD.bottom + 10} fill="#444" fontSize={5.5} textAnchor="middle" fontFamily="'Courier New', monospace">
              {lap}
            </text>
          )
        }
        return labels
      })()}
    </svg>
  )
}
