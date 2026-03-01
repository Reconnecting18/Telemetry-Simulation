import { useMemo } from 'react'
import { curvatureToColor } from '../utils/colors'

// Track is ~14m wide (typical circuit)
const TRACK_WIDTH   = 14   // SVG units = meters (centerline half-width 7)
const MAX_RL_OFFSET = 5    // meters — how far inside the racing line goes at apex
const KERB_OFFSET   = TRACK_WIDTH / 2 + 0.5  // m — strip at track edge

/**
 * Compute the ideal racing line as a lateral offset from the centerline.
 * Right turn (curvature < 0) → offset toward inside (right → positive x when heading N).
 * Derivation uses SVG-space right-perpendicular = (dy_real/len, dx_real/len).
 */
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
      y: -node.y + (dx / len) * offset,  // SVG y is negated real y
    }
  })
}

export default function TrackMap({ trackNodes, carX, carY }) {
  const { viewBox, segments, racingLine, startX, startY } = useMemo(() => {
    if (!trackNodes || trackNodes.length === 0)
      return { viewBox: '0 0 100 100', segments: [], racingLine: [], startX: undefined, startY: undefined }

    const xs  = trackNodes.map(n => n.x)
    const ys  = trackNodes.map(n => -n.y)
    const pad = 40 + TRACK_WIDTH
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const segs = []
    for (let i = 0; i < trackNodes.length - 1; i++) {
      const n   = trackNodes[i]
      const n2  = trackNodes[i + 1]
      // SVG coords (y flipped)
      const sdx = n2.x - n.x
      const sdy = (-n2.y) - (-n.y)
      const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1
      // Right-perp in SVG:  ( sdy/slen, -sdx/slen)
      // Left-perp  in SVG:  (-sdy/slen,  sdx/slen)
      segs.push({
        x1: n.x,   y1: -n.y,
        x2: n2.x,  y2: -n2.y,
        color: curvatureToColor(n.curvature),
        kerb:  n.kerb || 0,
        rpx:  sdy / slen,  rpy: -sdx / slen,
        lpx: -sdy / slen,  lpy:  sdx / slen,
      })
    }

    const racingLine = computeRacingLine(trackNodes)

    return {
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
      segments: segs,
      racingLine,
      startX: trackNodes[0].x,
      startY: -trackNodes[0].y,
    }
  }, [trackNodes])

  const cx = carX ?? 0
  const cy = carY !== undefined ? -carY : 0

  // Snap car indicator to nearest racing-line point for visual alignment
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
      <h3>Track Map</h3>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">

        {/* ── Track surface (width band) ── */}
        {segments.map((s, i) => (
          <line key={`surf-${i}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="#2a2a2a" strokeWidth={TRACK_WIDTH} strokeLinecap="round"
          />
        ))}

        {/* ── Speed / curvature colour overlay ── */}
        {segments.map((s, i) => (
          <line key={`col-${i}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color} strokeWidth={TRACK_WIDTH - 2} strokeLinecap="round"
            opacity={0.35}
          />
        ))}

        {/* ── Left kerb strips (kerb & 1): white base + red dash overlay ── */}
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

        {/* ── Right kerb strips (kerb & 2): white base + red dash overlay ── */}
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

        {/* ── Ideal racing line ── */}
        {rlPoints && (
          <polyline
            points={rlPoints}
            stroke="#f5c518" strokeWidth={1.5}
            fill="none" opacity={0.8}
            strokeDasharray="10 7"
            strokeLinecap="round"
          />
        )}

        {/* ── Start/finish box ── */}
        {startX !== undefined && (
          <rect
            x={startX - 5} y={startY - 8} width={10} height={16}
            fill="white" opacity={0.15} stroke="white" strokeWidth={1} rx={1}
          />
        )}

        {/* ── Car position ── */}
        <circle cx={carRlPos.x} cy={carRlPos.y} r={6}
          fill="#e10600" stroke="white" strokeWidth={1.5} />
      </svg>

      <div className="track-legend">
        <span className="legend-item">
          <span className="legend-line legend-yellow"></span>Racing line
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-red"></span>Car
        </span>
        <span className="legend-item">
          <svg width="18" height="4" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <line x1="0" y1="2" x2="18" y2="2" stroke="white" strokeWidth="2.5" />
            <line x1="0" y1="2" x2="18" y2="2" stroke="#e10600" strokeWidth="2.5" strokeDasharray="5 5" />
          </svg>
          &nbsp;Kerbs
        </span>
      </div>
    </div>
  )
}
