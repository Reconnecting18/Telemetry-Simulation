import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { findFrameIndex } from '../utils/interpolate'
import { speedColor } from '../utils/speedEnvelope'

const TRACK_WIDTH   = 14
const KERB_OFFSET   = TRACK_WIDTH / 2 + 0.5
const TRAIL_SECS    = 2.0      // comet tail duration
const TRAIL_POINTS  = 30       // sample count for trail

// Auto-detect corners from curvature data: find local curvature maxima
// and label them generically as T1, T2, ... Works for any track.
const MIN_CURVATURE = 0.006     // |k| threshold to qualify as a corner
const MIN_CORNER_GAP = 4        // minimum node gap between distinct corners
const LABEL_OFFSET = 22         // px offset from track for label placement

function detectCorners(nodes) {
  if (!nodes || nodes.length < 3) return []
  const corners = []
  for (let i = 1; i < nodes.length - 1; i++) {
    const absK = Math.abs(nodes[i].curvature)
    if (absK < MIN_CURVATURE) continue
    // Local maximum: |k| >= both neighbors
    if (absK >= Math.abs(nodes[i - 1].curvature) &&
        absK >= Math.abs(nodes[i + 1].curvature)) {
      // Enforce minimum gap from previous corner
      if (corners.length && i - corners[corners.length - 1].idx < MIN_CORNER_GAP) {
        // Keep the one with higher curvature
        if (absK > Math.abs(nodes[corners[corners.length - 1].idx].curvature)) {
          corners[corners.length - 1].idx = i
        }
        continue
      }
      corners.push({ idx: i })
    }
  }
  // Assign labels and compute offset direction (push label to outside of corner)
  return corners.map((c, ci) => {
    const n = nodes[c.idx]
    const prev = nodes[Math.max(0, c.idx - 1)]
    const next = nodes[Math.min(nodes.length - 1, c.idx + 1)]
    const dx = next.x - prev.x, dy = next.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Perpendicular direction (outside of corner based on curvature sign)
    const sign = n.curvature > 0 ? -1 : 1
    const ox = sign * (dy / len) * LABEL_OFFSET
    const oy = sign * (-dx / len) * LABEL_OFFSET
    return { idx: c.idx, name: `T${ci + 1}`, ox, oy }
  })
}

// Use the C++ racing line from JSON (late-apex, smoothed).
// Falls back to simple curvature-based offset if not available.
function getRacingLine(nodes, jsonRacingLine) {
  if (jsonRacingLine && jsonRacingLine.length === nodes.length) {
    return jsonRacingLine.map(p => ({ x: p.x, y: -p.y }))
  }
  // Fallback: simple offset (should not normally be needed)
  const N = nodes.length
  const MAX_OFFSET = 6
  return nodes.map((node, i) => {
    const prev = nodes[Math.max(0, i - 1)]
    const next = nodes[Math.min(N - 1, i + 1)]
    const dx   = next.x - prev.x
    const dy   = next.y - prev.y
    const len  = Math.sqrt(dx * dx + dy * dy) || 1
    const raw    = -node.curvature * 120
    const offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, raw))
    return {
      x: node.x + (dy / len) * offset,
      y: -node.y + (dx / len) * offset,
    }
  })
}

// Perpendicular vectors for each segment
function computeSegments(nodes) {
  const segs = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i], n2 = nodes[i + 1]
    const dx = n2.x - n.x, dy = (-n2.y) - (-n.y)
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    segs.push({
      x1: n.x, y1: -n.y, x2: n2.x, y2: -n2.y,
      curvature: n.curvature,
      kerb: n.kerb || 0,
      z: n.z || 0,
      rpx: dy / len, rpy: -dx / len,
      lpx: -dy / len, lpy: dx / len,
    })
  }
  return segs
}

// Identify dirty zones: outer edge patches at high-curvature corners
function computeDirtyZones(nodes, segments) {
  const zones = []
  for (let i = 0; i < segments.length; i++) {
    const absK = Math.abs(nodes[i].curvature)
    if (absK < 0.008) continue
    const s = segments[i]
    const k = nodes[i].curvature
    // Dirty is on the OUTSIDE of the corner
    const px = k > 0 ? s.lpx : s.rpx
    const py = k > 0 ? s.lpy : s.rpy
    const off = TRACK_WIDTH / 2 - 1
    zones.push({
      x1: s.x1 + px * off, y1: s.y1 + py * off,
      x2: s.x2 + px * off, y2: s.y2 + py * off,
      intensity: Math.min(1, absK / 0.05),
    })
  }
  return zones
}

// Grip color: high grip = bright green, medium = yellow, low = brown/grey dust
function gripColor(grip) {
  if (grip >= 0.95) return { color: '#00e676', opacity: 0.35 } // bright green — rubber-rich
  if (grip >= 0.90) return { color: '#66bb6a', opacity: 0.20 } // green — clean tarmac
  if (grip >= 0.85) return { color: '#fdd835', opacity: 0.25 } // yellow — slightly dusty
  if (grip >= 0.75) return { color: '#8d6e4a', opacity: 0.30 } // brown — marbles/dust
  return { color: '#6d5a3a', opacity: 0.40 }                    // dark brown — heavy debris
}

// Build trail points from frames
function buildTrail(frames, currentTime) {
  if (!frames || !frames.length || currentTime <= 0) return []
  const startT = Math.max(0, currentTime - TRAIL_SECS)
  const points = []
  const step = (currentTime - startT) / TRAIL_POINTS
  for (let t = startT; t <= currentTime; t += step) {
    const idx = findFrameIndex(frames, t)
    if (idx < frames.length - 1) {
      const a = frames[idx], b = frames[idx + 1]
      const range = b.time_s - a.time_s
      const frac = range > 0 ? (t - a.time_s) / range : 0
      points.push({
        x: a.x + (b.x - a.x) * frac,
        y: -(a.y + (b.y - a.y) * frac),
        t: (t - startT) / TRAIL_SECS,  // 0 = tail, 1 = head
      })
    }
  }
  return points
}

export default function TrackMap({ trackNodes, racingLineData, speedData, brakingPoints, generatedLine, frames, currentTime, carX, carY }) {
  const svgRef = useRef(null)
  const isDragging = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })
  const [vbState, setVbState] = useState(null)

  const { baseVB, segments, racingLine, dirtyZones, gripOverlay, speedOverlay, startX, startY, cornerPositions } = useMemo(() => {
    if (!trackNodes || !trackNodes.length)
      return { baseVB: null, segments: [], racingLine: [], dirtyZones: [], gripOverlay: [], speedOverlay: [], cornerPositions: [] }

    const xs  = trackNodes.map(n => n.x)
    const ys  = trackNodes.map(n => -n.y)
    const pad = 40 + TRACK_WIDTH
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const segs = computeSegments(trackNodes)
    // Prefer generated racing line positions, fall back to C++ JSON / simple offset
    let rl
    if (generatedLine?.positions?.length === trackNodes.length) {
      rl = generatedLine.positions.map(p => ({ x: p.x, y: -p.y }))
    } else {
      rl = getRacingLine(trackNodes, racingLineData)
    }
    const dirty = computeDirtyZones(trackNodes, segs)

    // Grip overlay: color each segment by its surface grip level
    const grip = segs.map((s, i) => {
      const g = trackNodes[i].surface_grip
      if (g === undefined || g === null) return null
      const gc = gripColor(g)
      return { ...s, gripColor: gc.color, gripOpacity: gc.opacity, grip: g }
    }).filter(Boolean)

    // Speed overlay: color each segment by speed envelope
    let spdOverlay = []
    if (speedData && speedData.length === trackNodes.length) {
      const minSpd = Math.min(...speedData)
      const maxSpd = Math.max(...speedData)
      spdOverlay = segs.map((s, i) => ({
        ...s,
        color: speedColor(speedData[i], minSpd, maxSpd),
      }))
    }

    // Corner label positions (auto-detected from curvature)
    const detectedCorners = detectCorners(trackNodes)
    const cPos = detectedCorners.map(cl => {
      const n = trackNodes[cl.idx]
      if (!n) return null
      return { name: cl.name, x: n.x + cl.ox, y: -n.y + cl.oy }
    }).filter(Boolean)

    return {
      baseVB: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      segments: segs,
      racingLine: rl,
      dirtyZones: dirty,
      gripOverlay: grip,
      speedOverlay: spdOverlay,
      startX: trackNodes[0].x,
      startY: -trackNodes[0].y,
      cornerPositions: cPos,
    }
  }, [trackNodes, racingLineData, speedData, generatedLine])

  // Brake marker boards — computed from dynamic brakingPoints prop
  const brakeMarkers = useMemo(() => {
    if (!brakingPoints || !trackNodes || !trackNodes.length) return []
    const N = trackNodes.length
    return brakingPoints
      .filter(c => c.braking_point_node !== undefined && c.braking_point_node < N)
      .map(c => {
        const idx = c.braking_point_node
        const n = trackNodes[idx]
        const prev = trackNodes[Math.max(0, idx - 1)]
        const next = trackNodes[Math.min(N - 1, idx + 1)]
        // Track direction
        const dx = next.x - prev.x, dy = next.y - prev.y
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        // Perpendicular (normal to track)
        const nx = -dy / len, ny = dx / len
        const hw = TRACK_WIDTH / 2 + 2  // half-width of marker line
        return {
          x1: n.x + nx * hw,  y1: -n.y - ny * hw,
          x2: n.x - nx * hw,  y2: -n.y + ny * hw,
          labelX: n.x + nx * (hw + 10),
          labelY: -n.y - ny * (hw + 10),
          dist: c.braking_distance_m,
        }
      })
  }, [brakingPoints, trackNodes])

  // Apex diamonds and turn-in ticks from generated racing line
  const { apexMarkers, turnInMarkers } = useMemo(() => {
    if (!generatedLine || !trackNodes?.length) return { apexMarkers: [], turnInMarkers: [] }
    const N = trackNodes.length

    const mkApex = (generatedLine.apexNodes || []).map(idx => {
      if (idx >= N || !generatedLine.positions[idx]) return null
      const p = generatedLine.positions[idx]
      return { x: p.x, y: -p.y }
    }).filter(Boolean)

    const mkTurnIn = (generatedLine.turnInNodes || []).map(idx => {
      if (idx >= N) return null
      const n = trackNodes[idx]
      const prev = trackNodes[Math.max(0, idx - 1)]
      const next = trackNodes[Math.min(N - 1, idx + 1)]
      const dx = next.x - prev.x, dy = next.y - prev.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / len, ny = dx / len
      const hw = 4  // tick half-length
      // Position on the racing line
      const p = generatedLine.positions[idx]
      if (!p) return null
      return {
        x1: p.x + nx * hw, y1: -p.y - ny * hw,
        x2: p.x - nx * hw, y2: -p.y + ny * hw,
      }
    }).filter(Boolean)

    return { apexMarkers: mkApex, turnInMarkers: mkTurnIn }
  }, [generatedLine, trackNodes])

  useEffect(() => {
    if (baseVB && !vbState) setVbState(baseVB)
  }, [baseVB]) // eslint-disable-line

  const vb = vbState || baseVB || { x: 0, y: 0, w: 100, h: 100 }
  const vbStr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

  const screenToSVG = useCallback((dx, dy) => {
    const svg = svgRef.current
    if (!svg) return { dx: 0, dy: 0 }
    const rect = svg.getBoundingClientRect()
    return { dx: dx / rect.width * vb.w, dy: dy / rect.height * vb.h }
  }, [vb.w, vb.h])

  const zoomAround = useCallback((clientX, clientY, factor) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = (clientX - rect.left) / rect.width  * vb.w + vb.x
    const py = (clientY - rect.top)  / rect.height * vb.h + vb.y
    setVbState(v => ({
      x: px + (v.x - px) * factor,
      y: py + (v.y - py) * factor,
      w: v.w * factor,
      h: v.h * factor,
    }))
  }, [vb.x, vb.y, vb.w, vb.h])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    zoomAround(e.clientX, e.clientY, e.deltaY < 0 ? 0.82 : 1.22)
  }, [zoomAround])

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return
    const { dx, dy } = screenToSVG(
      -(e.clientX - lastMouse.current.x),
      -(e.clientY - lastMouse.current.y)
    )
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setVbState(v => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [screenToSVG])

  const handleMouseUp = useCallback(() => { isDragging.current = false }, [])
  const resetView    = useCallback(() => baseVB && setVbState(baseVB), [baseVB])
  const zoomIn       = useCallback(() => setVbState(v => ({ x: v.x + v.w*0.1, y: v.y + v.h*0.1, w: v.w*0.8, h: v.h*0.8 })), [])
  const zoomOut      = useCallback(() => setVbState(v => ({ x: v.x - v.w*0.125, y: v.y - v.h*0.125, w: v.w*1.25, h: v.h*1.25 })), [])

  // Car position (SVG coords)
  const cx = carX ?? 0
  const cy = carY !== undefined ? -carY : 0

  // Snap car to nearest racing line point + get heading
  const { carPos, headingDeg } = useMemo(() => {
    if (!racingLine.length || carX == null) return { carPos: { x: cx, y: cy }, headingDeg: 0 }
    let best = 0, bestD = Infinity
    racingLine.forEach((p, i) => {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    const pos = racingLine[best]
    // Heading from prev→next RL point
    const prev = racingLine[Math.max(0, best - 1)]
    const next = racingLine[Math.min(racingLine.length - 1, best + 1)]
    const hdx = next.x - prev.x, hdy = next.y - prev.y
    const deg = Math.atan2(hdy, hdx) * (180 / Math.PI) + 90  // +90 so "up" is forward
    return { carPos: pos, headingDeg: deg }
  }, [racingLine, cx, cy, carX])

  // Comet trail
  const trail = useMemo(() => buildTrail(frames, currentTime), [frames, currentTime])
  // Snap trail to racing line
  const snappedTrail = useMemo(() => {
    if (!racingLine.length || !trail.length) return []
    return trail.map(tp => {
      let best = 0, bestD = Infinity
      racingLine.forEach((p, i) => {
        const d = (p.x - tp.x) ** 2 + (p.y - tp.y) ** 2
        if (d < bestD) { bestD = d; best = i }
      })
      return { ...racingLine[best], t: tp.t }
    })
  }, [racingLine, trail])

  const rlPoints = racingLine.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="track-map">
      <div className="track-map-header">
        <h3>Track Map</h3>
        <div className="track-map-btns">
          <button className="map-btn" onClick={zoomIn}  title="Zoom in">+</button>
          <button className="map-btn" onClick={zoomOut} title="Zoom out">-</button>
          <button className="map-btn" onClick={resetView} title="Reset view">R</button>
        </div>
      </div>

      <div
        className="track-map-viewport"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
      >
        <svg
          ref={svgRef}
          viewBox={vbStr}
          preserveAspectRatio="xMidYMid meet"
          width="100%" height="100%"
        >
          {/* ── Track outer edge (dark border) ── */}
          {segments.map((s, i) => (
            <line key={`edge-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#1a1a1a" strokeWidth={TRACK_WIDTH + 4} strokeLinecap="round" />
          ))}

          {/* ── Track surface (road) ── */}
          {segments.map((s, i) => (
            <line key={`road-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#2a2a2a" strokeWidth={TRACK_WIDTH} strokeLinecap="round" />
          ))}

          {/* ── Lighter edge stripes (road edge markings) ── */}
          {segments.map((s, i) => (
            <line key={`stripe-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#3a3a3a" strokeWidth={TRACK_WIDTH + 1} strokeLinecap="round"
              opacity={0.4} />
          ))}

          {/* ── Darker center fill (inner road surface) ── */}
          {segments.map((s, i) => (
            <line key={`inner-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#222" strokeWidth={TRACK_WIDTH - 4} strokeLinecap="round" />
          ))}

          {/* ── Grip overlay (surface grip heatmap on road) ── */}
          {gripOverlay.map((go, i) => (
            <line key={`grip-${i}`}
              x1={go.x1} y1={go.y1} x2={go.x2} y2={go.y2}
              stroke={go.gripColor} strokeWidth={TRACK_WIDTH - 2}
              strokeLinecap="round" opacity={go.gripOpacity} />
          ))}

          {/* ── Speed envelope overlay (blue→green→red) ── */}
          {speedOverlay.map((s, i) => (
            <line key={`spd-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.color} strokeWidth={TRACK_WIDTH - 2}
              strokeLinecap="round" opacity={0.55} />
          ))}

          {/* ── Dirty zones (outside of corners) ── */}
          {dirtyZones.map((dz, i) => (
            <line key={`dirty-${i}`}
              x1={dz.x1} y1={dz.y1} x2={dz.x2} y2={dz.y2}
              stroke="#3a2e20" strokeWidth={4}
              strokeLinecap="round" opacity={0.35 * dz.intensity} />
          ))}

          {/* ── Left kerbs ── */}
          {segments.map((s, i) => {
            if (!(s.kerb & 1)) return null
            const ex = s.lpx * KERB_OFFSET, ey = s.lpy * KERB_OFFSET
            return (
              <g key={`lk-${i}`}>
                <line x1={s.x1+ex} y1={s.y1+ey} x2={s.x2+ex} y2={s.y2+ey}
                  stroke="white" strokeWidth={2.5} strokeLinecap="round" />
                <line x1={s.x1+ex} y1={s.y1+ey} x2={s.x2+ex} y2={s.y2+ey}
                  stroke="#ff3d3d" strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray="5 5" />
              </g>
            )
          })}

          {/* ── Right kerbs ── */}
          {segments.map((s, i) => {
            if (!(s.kerb & 2)) return null
            const ex = s.rpx * KERB_OFFSET, ey = s.rpy * KERB_OFFSET
            return (
              <g key={`rk-${i}`}>
                <line x1={s.x1+ex} y1={s.y1+ey} x2={s.x2+ex} y2={s.y2+ey}
                  stroke="white" strokeWidth={2.5} strokeLinecap="round" />
                <line x1={s.x1+ex} y1={s.y1+ey} x2={s.x2+ex} y2={s.y2+ey}
                  stroke="#ff3d3d" strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray="5 5" />
              </g>
            )
          })}

          {/* ── Braking point markers (orange boards) ── */}
          {brakeMarkers.map((bm, i) => (
            <g key={`brake-${i}`}>
              <line x1={bm.x1} y1={bm.y1} x2={bm.x2} y2={bm.y2}
                stroke="#ff8c00" strokeWidth={2.5} strokeLinecap="round" />
              <text x={bm.labelX} y={bm.labelY}
                fill="#ff8c00" fontSize={9}
                fontFamily="'Segoe UI', system-ui, sans-serif"
                fontWeight="700" textAnchor="middle"
                dominantBaseline="central"
                opacity={0.9}>
                {Math.round(bm.dist)}m
              </text>
            </g>
          ))}

          {/* ── Racing line: dark teal base layer ── */}
          {rlPoints && (
            <polyline
              points={rlPoints}
              stroke="#006655" strokeWidth={3}
              fill="none" opacity={0.9}
              strokeLinecap="round" strokeLinejoin="round"
            />
          )}
          {/* ── Racing line: bright cyan top layer ── */}
          {rlPoints && (
            <polyline
              points={rlPoints}
              stroke="#00a8a8" strokeWidth={1.5}
              fill="none" opacity={0.85}
              strokeLinecap="round" strokeLinejoin="round"
            />
          )}

          {/* ── Turn-in tick marks (white) ── */}
          {turnInMarkers.map((tm, i) => (
            <line key={`turnin-${i}`}
              x1={tm.x1} y1={tm.y1} x2={tm.x2} y2={tm.y2}
              stroke="white" strokeWidth={1.5} strokeLinecap="round"
              opacity={0.8} />
          ))}

          {/* ── Apex diamond markers (yellow) ── */}
          {apexMarkers.map((am, i) => (
            <polygon key={`apex-${i}`}
              points={`${am.x},${am.y-3.5} ${am.x+2.5},${am.y} ${am.x},${am.y+3.5} ${am.x-2.5},${am.y}`}
              fill="#ffd700" stroke="#b8860b" strokeWidth={0.6}
              opacity={0.9} />
          ))}

          {/* ── Corner labels ── */}
          {cornerPositions.map((cp, i) => (
            <text key={`corner-${i}`}
              x={cp.x} y={cp.y}
              fill="#888" fontSize={12}
              fontFamily="'Segoe UI', system-ui, sans-serif"
              fontWeight="600" textAnchor="middle"
              opacity={0.7}>
              {cp.name}
            </text>
          ))}

          {/* ── Start/finish marker ── */}
          {startX !== undefined && (
            <g>
              <rect x={startX - 6} y={startY - 9} width={12} height={18}
                fill="none" stroke="white" strokeWidth={1.5} rx={1} opacity={0.5} />
              <line x1={startX - 8} y1={startY} x2={startX + 8} y2={startY}
                stroke="white" strokeWidth={1} opacity={0.4} />
            </g>
          )}

          {/* ── Comet trail ── */}
          {snappedTrail.length > 1 && snappedTrail.map((pt, i) => {
            if (i === 0) return null
            const prev = snappedTrail[i - 1]
            return (
              <line key={`trail-${i}`}
                x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                stroke="#00a8a8" strokeWidth={Math.max(0.5, pt.t * 4)}
                strokeLinecap="round"
                opacity={pt.t * 0.7} />
            )
          })}

          {/* ── Car arrow (directional triangle) ── */}
          <g transform={`translate(${carPos.x},${carPos.y}) rotate(${headingDeg.toFixed(1)})`}>
            <polygon points="0,-8 5,6 -5,6"
              fill="#00a8a8" stroke="white" strokeWidth={1.2}
              strokeLinejoin="round" />
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="track-legend">
        <span className="legend-item">
          <svg width="18" height="6" style={{ display:'inline-block', verticalAlign:'middle' }}>
            <line x1="0" y1="3" x2="18" y2="3" stroke="#006655" strokeWidth="3" />
            <line x1="0" y1="3" x2="18" y2="3" stroke="#00a8a8" strokeWidth="1.5" />
          </svg>
          &nbsp;Racing line
        </span>
        {apexMarkers.length > 0 && (
          <span className="legend-item">
            <svg width="8" height="8" style={{ display:'inline-block', verticalAlign:'middle' }}>
              <polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill="#ffd700" stroke="#b8860b" strokeWidth="0.6" />
            </svg>
            &nbsp;Apex
          </span>
        )}
        <span className="legend-item">
          <svg width="10" height="10" style={{ display:'inline-block', verticalAlign:'middle' }}>
            <polygon points="5,1 9,9 1,9" fill="#00a8a8" stroke="white" strokeWidth="1" />
          </svg>
          &nbsp;Car
        </span>
        {brakeMarkers.length > 0 && (
          <span className="legend-item">
            <svg width="12" height="8" style={{ display:'inline-block', verticalAlign:'middle' }}>
              <line x1="1" y1="4" x2="11" y2="4" stroke="#ff8c00" strokeWidth="2.5" />
            </svg>
            &nbsp;Brake
          </span>
        )}
        {speedOverlay.length > 0 && (
          <span className="legend-item">
            <svg width="30" height="6" style={{ display:'inline-block', verticalAlign:'middle' }}>
              <rect x="0"  width="10" height="6" fill="rgb(0,0,220)" />
              <rect x="10" width="10" height="6" fill="rgb(0,200,0)" />
              <rect x="20" width="10" height="6" fill="rgb(230,0,0)" />
            </svg>
            &nbsp;Speed
          </span>
        )}
        <span className="legend-item">
          <span className="legend-line" style={{ background: '#00e676' }} />High grip
        </span>
        <span className="legend-item">
          <span className="legend-line" style={{ background: '#8d6e4a' }} />Low grip
        </span>
        <span className="legend-item">
          <svg width="18" height="4" style={{ display:'inline-block', verticalAlign:'middle' }}>
            <line x1="0" y1="2" x2="18" y2="2" stroke="white" strokeWidth="2.5" />
            <line x1="0" y1="2" x2="18" y2="2" stroke="#ff3d3d" strokeWidth="2.5" strokeDasharray="5 5" />
          </svg>
          &nbsp;Kerbs
        </span>
      </div>
    </div>
  )
}
