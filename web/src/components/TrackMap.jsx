import { useMemo } from 'react'
import { curvatureToColor } from '../utils/colors'

export default function TrackMap({ trackNodes, carX, carY }) {
  const { viewBox, segments, startX, startY } = useMemo(() => {
    if (!trackNodes || trackNodes.length === 0) return { viewBox: '0 0 100 100', segments: [] }

    const xs = trackNodes.map(n => n.x)
    const ys = trackNodes.map(n => -n.y) // negate y for SVG
    const pad = 40
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const segs = []
    for (let i = 0; i < trackNodes.length - 1; i++) {
      segs.push({
        x1: trackNodes[i].x,
        y1: -trackNodes[i].y,
        x2: trackNodes[i + 1].x,
        y2: -trackNodes[i + 1].y,
        color: curvatureToColor(trackNodes[i].curvature),
      })
    }

    return {
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
      segments: segs,
      startX: trackNodes[0].x,
      startY: -trackNodes[0].y,
    }
  }, [trackNodes])

  const cx = carX ?? 0
  const cy = carY ? -carY : 0

  return (
    <div className="track-map">
      <h3>Track Map</h3>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {/* Track background */}
        {segments.map((s, i) => (
          <line key={`bg-${i}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="#222" strokeWidth={12} strokeLinecap="round"
          />
        ))}
        {/* Track segments color-coded by curvature */}
        {segments.map((s, i) => (
          <line key={i}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color} strokeWidth={6} strokeLinecap="round"
          />
        ))}
        {/* Start/finish marker */}
        {startX !== undefined && (
          <rect x={startX - 6} y={startY - 10} width={12} height={20}
                fill="none" stroke="white" strokeWidth={1.5} rx={2} />
        )}
        {/* Car position */}
        <circle cx={cx} cy={cy} r={8} fill="#e10600" stroke="white" strokeWidth={2} />
      </svg>
    </div>
  )
}
