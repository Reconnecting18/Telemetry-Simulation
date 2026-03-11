import { useEffect, useState } from 'react'

/**
 * Remove near-coincident track nodes (< 1.0m apart).
 * These break Menger curvature calculations and cause speed/heading snaps.
 * Also deduplicates the racing_line array to stay in sync.
 */
function deduplicateNodes(track) {
  if (!track?.nodes || track.nodes.length < 3) return track
  const nodes = track.nodes
  const rl = track.racing_line
  const keep = [0]
  let removed = 0
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[keep[keep.length - 1]]
    const dx = nodes[i].x - prev.x, dy = nodes[i].y - prev.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1.0) {
      console.log(`[Track] Dedup: removed node ${i} (dist=${dist.toFixed(2)}m to previous)`)
      removed++
    } else {
      keep.push(i)
    }
  }
  // Wrap-around check: if last kept node is < 1.0m from first, remove it
  if (keep.length > 2) {
    const last = nodes[keep[keep.length - 1]], first = nodes[keep[0]]
    const dx2 = last.x - first.x, dy2 = last.y - first.y
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
    if (d2 < 1.0) {
      console.log(`[Track] Dedup: removed last node (dist=${d2.toFixed(2)}m to first, wrap-around)`)
      keep.pop()
      removed++
    }
  }
  if (removed === 0) return track
  console.log(`[Track] Dedup: removed ${removed} near-coincident node(s), ${nodes.length} -> ${keep.length} nodes`)
  const newTrack = { ...track, nodes: keep.map(i => nodes[i]) }
  if (rl && rl.length === nodes.length) {
    newTrack.racing_line = keep.map(i => rl[i])
  }
  return newTrack
}

export function useTelemetryData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/telemetry.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        setData({
          session: json.session,
          vehicle: json.vehicle,
          track: deduplicateNodes(json.track),
          frames: json.frames,
          pitStops: json.pit_stops || [],
        })
      })
      .catch(e => setError(e.message))
  }, [])

  return { data, error }
}
