import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { curvatureToColor } from '../utils/colors'

const TRACK_WIDTH   = 14
const MAX_RL_OFFSET = 5
const KERB_OFFSET   = TRACK_WIDTH / 2 + 0.5

function computeRacingLine(nodes) {
  const N = nodes.length
  return nodes.map((node, i) => {
    const prev = nodes[Math.max(0, i - 1)]
    const next = nodes[Math.min(N - 1, i + 1)]
    const dx   = next.x - prev.x
    const dy   = next.y - prev.y
    const len  = Math.sqrt(dx * dx + dy * dy) || 1
    const raw    = -node.curvature * 100
    const offset = Math.max(-MAX_RL_OFFSET, Math.min(MAX_RL_OFFSET, raw))
    return {
      x: node.x + (dy / len) * offset,
      y: -node.y + (dx / len) * offset,
    }
  })
}

// Elevation → blue-green-yellow-orange gradient
function elevToColor(z, minZ, maxZ) {
  if (maxZ <= minZ) return '#7ed321'
  const t = (z - minZ) / (maxZ - minZ)
  if (t < 0.33) {
    const s = t / 0.33
    return `rgb(${Math.round(74 + s * 26)},${Math.round(144 + s * 90)},${Math.round(226 - s * 191)})`
  }
  if (t < 0.67) {
    const s = (t - 0.33) / 0.34
    return `rgb(${Math.round(100 + s * 145)},${Math.round(234 - s * 68)},${Math.round(35)})`
  }
  const s = (t - 0.67) / 0.33
  return `rgb(${Math.round(245 - s * 20)},${Math.round(166 - s * 86)},${Math.round(35 - s * 25)})`
}

export default function TrackMap({ trackNodes, carX, carY }) {
  const svgRef = useRef(null)
  const isDragging = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })

  // viewBox state: { x, y, w, h }
  const [vbState, setVbState] = useState(null)

  const { baseVB, segments, racingLine, startX, startY, minZ, maxZ } = useMemo(() => {
    if (!trackNodes || trackNodes.length === 0)
      return { baseVB: null, segments: [], racingLine: [], startX: undefined, startY: undefined, minZ: 0, maxZ: 1 }

    const xs  = trackNodes.map(n => n.x)
    const ys  = trackNodes.map(n => -n.y)
    const zs  = trackNodes.map(n => n.z || 0)
    const pad = 40 + TRACK_WIDTH
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const segs = []
    for (let i = 0; i < trackNodes.length - 1; i++) {
      const n  = trackNodes[i]
      const n2 = trackNodes[i + 1]
      const sdx  = n2.x - n.x
      const sdy  = (-n2.y) - (-n.y)
      const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1
      segs.push({
        x1: n.x,  y1: -n.y,
        x2: n2.x, y2: -n2.y,
        color: curvatureToColor(n.curvature),
        kerb:  n.kerb || 0,
        z:     n.z || 0,
        rpx:   sdy / slen,  rpy: -sdx / slen,
        lpx:  -sdy / slen,  lpy:  sdx / slen,
      })
    }

    return {
      baseVB: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      segments: segs,
      racingLine: computeRacingLine(trackNodes),
      startX: trackNodes[0].x,
      startY: -trackNodes[0].y,
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    }
  }, [trackNodes])

  // Initialize viewBox once data is ready
  useEffect(() => {
    if (baseVB && !vbState) setVbState(baseVB)
  }, [baseVB]) // eslint-disable-line

  const vb = vbState || baseVB || { x: 0, y: 0, w: 100, h: 100 }
  const vbStr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

  // Convert screen pixel delta → SVG coordinate delta
  const screenToSVG = useCallback((dx, dy) => {
    const svg = svgRef.current
    if (!svg) return { dx: 0, dy: 0 }
    const rect = svg.getBoundingClientRect()
    return { dx: dx / rect.width * vb.w, dy: dy / rect.height * vb.h }
  }, [vb.w, vb.h])

  // Zoom around a point in SVG space
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
    const factor = e.deltaY < 0 ? 0.82 : 1.22
    zoomAround(e.clientX, e.clientY, factor)
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

  const handleMouseUp   = useCallback(() => { isDragging.current = false }, [])
  const resetView       = useCallback(() => baseVB && setVbState(baseVB),   [baseVB])
  const zoomIn          = useCallback(() => setVbState(v => ({ x: v.x + v.w*0.1, y: v.y + v.h*0.1, w: v.w*0.8, h: v.h*0.8 })), [])
  const zoomOut         = useCallback(() => setVbState(v => ({ x: v.x - v.w*0.125, y: v.y - v.h*0.125, w: v.w*1.25, h: v.h*1.25 })), [])

  // Car snapped to nearest RL point
  const cx = carX ?? 0
  const cy = carY !== undefined ? -carY : 0
  const carRlPos = useMemo(() => {
    if (!racingLine.length || carX == null) return { x: cx, y: cy }
    let best = 0, bestD = Infinity
    racingLine.forEach((p, i) => {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    return racingLine[best]
  }, [racingLine, cx, cy, carX])

  const rlPoints = racingLine.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="track-map">
      <div className="track-map-header">
        <h3>Track Map</h3>
        <div className="track-map-btns">
          <button className="map-btn" onClick={zoomIn}  title="Zoom in">+</button>
          <button className="map-btn" onClick={zoomOut} title="Zoom out">−</button>
          <button className="map-btn" onClick={resetView} title="Reset view">⊡</button>
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
          {/* ── Outer track shadow / border ── */}
          {segments.map((s, i) => (
            <line key={`shadow-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#000" strokeWidth={TRACK_WIDTH + 4} strokeLinecap="round"
            />
          ))}

          {/* ── Track surface ── */}
          {segments.map((s, i) => (
            <line key={`surf-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="#282828" strokeWidth={TRACK_WIDTH} strokeLinecap="round"
            />
          ))}

          {/* ── Elevation color centerline (thin overlay) ── */}
          {segments.map((s, i) => (
            <line key={`elev-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={elevToColor(s.z, minZ, maxZ)} strokeWidth={3}
              strokeLinecap="round" opacity={0.75}
            />
          ))}

          {/* ── Curvature overlay (subtle) ── */}
          {segments.map((s, i) => (
            <line key={`col-${i}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.color} strokeWidth={TRACK_WIDTH - 6}
              strokeLinecap="round" opacity={0.18}
            />
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
                  stroke="#e10600" strokeWidth={2.5} strokeLinecap="round"
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
                  stroke="#e10600" strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray="5 5" />
              </g>
            )
          })}

          {/* ── Racing line ── */}
          {rlPoints && (
            <polyline
              points={rlPoints}
              stroke="#f5c518" strokeWidth={1.8}
              fill="none" opacity={0.9}
              strokeDasharray="10 6"
              strokeLinecap="round"
            />
          )}

          {/* ── Start/finish marker ── */}
          {startX !== undefined && (
            <g>
              <rect x={startX - 6} y={startY - 9} width={12} height={18}
                fill="none" stroke="white" strokeWidth={1.5} rx={1} opacity={0.5} />
              <line x1={startX - 8} y1={startY} x2={startX + 8} y2={startY}
                stroke="white" strokeWidth={1} opacity={0.4} />
            </g>
          )}

          {/* ── Car indicator ── */}
          <circle cx={carRlPos.x} cy={carRlPos.y} r={14}
            fill="none" stroke="#e10600" strokeWidth={1} opacity={0.3} />
          <circle cx={carRlPos.x} cy={carRlPos.y} r={7}
            fill="#e10600" stroke="white" strokeWidth={1.5} />
        </svg>
      </div>

      {/* Elevation gradient legend */}
      <div className="track-elev-legend">
        <span className="elev-label">↓ Low</span>
        <div className="elev-gradient-bar" />
        <span className="elev-label">High ↑</span>
      </div>

      <div className="track-legend">
        <span className="legend-item">
          <span className="legend-line legend-yellow" />Racing line
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-red" />Car
        </span>
        <span className="legend-item">
          <svg width="18" height="4" style={{ display:'inline-block', verticalAlign:'middle' }}>
            <line x1="0" y1="2" x2="18" y2="2" stroke="white" strokeWidth="2.5" />
            <line x1="0" y1="2" x2="18" y2="2" stroke="#e10600" strokeWidth="2.5" strokeDasharray="5 5" />
          </svg>
          &nbsp;Kerbs
        </span>
      </div>
    </div>
  )
}
