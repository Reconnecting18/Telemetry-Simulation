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
const ZOOM_MIN  = 0.5
const ZOOM_MAX  = 4.0
const ZOOM_STEP = 0.25

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
  const [followCam, setFollowCam] = useState(false)
  const followRef = useRef(false)
  const [zoomLevel, setZoomLevel] = useState(1.0)
  const zoomRef = useRef(1.0)
  const [zoomVisible, setZoomVisible] = useState(false)
  const zoomFadeRef = useRef(null)
  const panAnimRef = useRef(null)

  const { baseVB, segments, surfacePath, racingLine, dirtyZones, gripOverlay, speedOverlay, startX, startY, cornerPositions } = useMemo(() => {
    if (!trackNodes || !trackNodes.length)
      return { baseVB: null, segments: [], surfacePath: '', racingLine: [], dirtyZones: [], gripOverlay: [], speedOverlay: [], cornerPositions: [] }

    const xs  = trackNodes.map(n => n.x)
    const ys  = trackNodes.map(n => -n.y)
    const rawMinX = Math.min(...xs), rawMaxX = Math.max(...xs)
    const rawMinY = Math.min(...ys), rawMaxY = Math.max(...ys)
    const rawW = rawMaxX - rawMinX || 1, rawH = rawMaxY - rawMinY || 1
    // Auto-fit: pad with TRACK_WIDTH for road edges, then scale to ~85% fill
    const edgePad = TRACK_WIDTH + 16
    const fitScale = 0.85
    const cx0 = (rawMinX + rawMaxX) / 2, cy0 = (rawMinY + rawMaxY) / 2
    const fitW = (rawW + edgePad * 2) / fitScale
    const fitH = (rawH + edgePad * 2) / fitScale
    const minX = cx0 - fitW / 2
    const maxX = cx0 + fitW / 2
    const minY = cy0 - fitH / 2
    const maxY = cy0 + fitH / 2

    const segs = computeSegments(trackNodes)

    // Build closed track surface polygon: left edge forward, right edge reversed
    const hw = TRACK_WIDTH / 2
    const leftEdge = [], rightEdge = []
    for (let i = 0; i < trackNodes.length; i++) {
      const prev = trackNodes[Math.max(0, i - 1)]
      const next = trackNodes[Math.min(trackNodes.length - 1, i + 1)]
      const dx = next.x - prev.x, dy = (-next.y) - (-prev.y)
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const lx = -dy / len, ly = dx / len  // left perpendicular
      leftEdge.push({ x: trackNodes[i].x + lx * hw, y: -trackNodes[i].y + ly * hw })
      rightEdge.push({ x: trackNodes[i].x - lx * hw, y: -trackNodes[i].y - ly * hw })
    }
    const surfacePts = [...leftEdge, ...rightEdge.reverse()]
    const surfacePath = surfacePts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ') + ' Z'
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
      surfacePath,
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

  useEffect(() => () => {
    if (panAnimRef.current) cancelAnimationFrame(panAnimRef.current)
    if (zoomFadeRef.current) clearTimeout(zoomFadeRef.current)
  }, [])

  const vb = vbState || baseVB || { x: 0, y: 0, w: 100, h: 100 }
  const vbStr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

  const flashZoom = useCallback(() => {
    setZoomVisible(true)
    if (zoomFadeRef.current) clearTimeout(zoomFadeRef.current)
    zoomFadeRef.current = setTimeout(() => setZoomVisible(false), 2000)
  }, [])

  const screenToSVG = useCallback((dx, dy) => {
    const svg = svgRef.current
    if (!svg) return { dx: 0, dy: 0 }
    const rect = svg.getBoundingClientRect()
    return { dx: dx / rect.width * vb.w, dy: dy / rect.height * vb.h }
  }, [vb.w, vb.h])

  const zoomTo = useCallback((target) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(target * 4) / 4))
    zoomRef.current = z
    setZoomLevel(z)
    flashZoom()
    if (!followRef.current && baseVB) {
      setVbState(v => {
        if (!v) return v
        const cx = v.x + v.w / 2, cy = v.y + v.h / 2
        const nw = baseVB.w / z, nh = baseVB.h / z
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
      })
    }
  }, [baseVB, flashZoom])

  const zoomIn  = useCallback(() => zoomTo(zoomRef.current + ZOOM_STEP), [zoomTo])
  const zoomOut = useCallback(() => zoomTo(zoomRef.current - ZOOM_STEP), [zoomTo])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    zoomTo(zoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }, [zoomTo])

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 || followRef.current) return
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

  const resetView = useCallback(() => {
    if (!baseVB) return
    setVbState(baseVB)
    zoomRef.current = 1.0; setZoomLevel(1.0)
    followRef.current = false; setFollowCam(false)
  }, [baseVB])

  // Car position (SVG coords)
  const cx = carX ?? 0
  const cy = carY !== undefined ? -carY : 0

  // Project a point onto the nearest racing-line segment, returning the
  // projected position, segment index, and fractional t along that segment.
  const projectOntoRL = useCallback((px, py) => {
    let bestDist = Infinity, bestX = px, bestY = py, bestSeg = 0, bestT = 0
    for (let i = 0; i < racingLine.length - 1; i++) {
      const ax = racingLine[i].x, ay = racingLine[i].y
      const bx = racingLine[i + 1].x, by = racingLine[i + 1].y
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) continue
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
      const projX = ax + t * dx, projY = ay + t * dy
      const dist = (px - projX) ** 2 + (py - projY) ** 2
      if (dist < bestDist) {
        bestDist = dist; bestX = projX; bestY = projY; bestSeg = i; bestT = t
      }
    }
    return { x: bestX, y: bestY, seg: bestSeg, t: bestT }
  }, [racingLine])

  // Smooth car position + heading along the racing line
  const { carPos, headingDeg } = useMemo(() => {
    if (!racingLine.length || carX == null) return { carPos: { x: cx, y: cy }, headingDeg: 0 }
    const proj = projectOntoRL(cx, cy)

    // Heading: blend current segment direction with next segment for smoothness
    const i = proj.seg
    const a = racingLine[i], b = racingLine[Math.min(racingLine.length - 1, i + 1)]
    const dx1 = b.x - a.x, dy1 = b.y - a.y
    const h1 = Math.atan2(dy1, dx1)

    let deg
    if (i + 2 < racingLine.length) {
      const c = racingLine[i + 2]
      const dx2 = c.x - b.x, dy2 = c.y - b.y
      const h2 = Math.atan2(dy2, dx2)
      // Shortest-arc blend
      let diff = h2 - h1
      if (diff > Math.PI) diff -= 2 * Math.PI
      if (diff < -Math.PI) diff += 2 * Math.PI
      deg = (h1 + proj.t * diff) * (180 / Math.PI) + 90
    } else {
      deg = h1 * (180 / Math.PI) + 90
    }

    return { carPos: { x: proj.x, y: proj.y }, headingDeg: deg }
  }, [racingLine, cx, cy, carX, projectOntoRL])

  // Comet trail
  const trail = useMemo(() => buildTrail(frames, currentTime), [frames, currentTime])
  // Project trail onto racing line segments
  const snappedTrail = useMemo(() => {
    if (!racingLine.length || !trail.length) return []
    return trail.map(tp => {
      const proj = projectOntoRL(tp.x, tp.y)
      return { x: proj.x, y: proj.y, t: tp.t }
    })
  }, [racingLine, trail, projectOntoRL])

  // Follow cam: keep viewport centered on car
  useEffect(() => {
    if (!followCam || !baseVB) return
    const z = zoomRef.current
    const w = baseVB.w / z, h = baseVB.h / z
    setVbState({ x: carPos.x - w / 2, y: carPos.y - h / 2, w, h })
  }, [followCam, zoomLevel, carPos.x, carPos.y, baseVB])

  const toggleFollowCam = useCallback(() => {
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    if (!followRef.current && baseVB) {
      // Activating: smooth pan to car over 300ms
      const start = { ...(vbState || baseVB) }
      const z = zoomRef.current
      const w = baseVB.w / z, h = baseVB.h / z
      const end = { x: carPos.x - w / 2, y: carPos.y - h / 2, w, h }
      const t0 = performance.now()
      const anim = (now) => {
        const t = Math.min(1, (now - t0) / 300)
        const e = t * (2 - t) // ease-out quadratic
        setVbState({
          x: start.x + (end.x - start.x) * e,
          y: start.y + (end.y - start.y) * e,
          w: start.w + (end.w - start.w) * e,
          h: start.h + (end.h - start.h) * e,
        })
        if (t < 1) { panAnimRef.current = requestAnimationFrame(anim) }
        else { panAnimRef.current = null; followRef.current = true; setFollowCam(true) }
      }
      panAnimRef.current = requestAnimationFrame(anim)
    } else {
      followRef.current = false; setFollowCam(false)
    }
  }, [baseVB, vbState, carPos])

  const rlPoints = racingLine.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="track-map">
      <div className="track-map-header">
        <h3>Track Map</h3>
        <div className="track-map-btns">
          <button className={`map-btn${followCam ? ' map-btn-active' : ''}`}
            onClick={toggleFollowCam} title="Follow car">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="5" cy="5" r="1.5" fill="currentColor" />
            </svg>
          </button>
          <button className="map-btn" onClick={zoomIn}  title="Zoom in">+</button>
          <button className="map-btn" onClick={zoomOut} title="Zoom out">-</button>
          <button className="map-btn" onClick={resetView} title="Reset view">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M5 1L1 5h2v4h4V5h2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="track-map-viewport"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: followCam ? 'default' : (isDragging.current ? 'grabbing' : 'grab') }}
      >
        <svg
          ref={svgRef}
          viewBox={vbStr}
          preserveAspectRatio="xMidYMid meet"
          width="100%" height="100%"
        >
          {/* ── Track surface fill + border ── */}
          {surfacePath && (
            <>
              <path d={surfacePath} fill="#1a1a1a" stroke="#333333" strokeWidth={1.5}
                strokeLinejoin="round" />
            </>
          )}

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

      <div className={`zoom-indicator${zoomVisible ? ' visible' : ''}`}>
        {zoomLevel.toFixed(1)}x
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
