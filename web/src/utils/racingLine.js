/**
 * Racing line generator.
 *
 * generateRacingLine(trackData, corners) returns:
 *   {
 *     lateral:   number[]  — lateral offset per node, -1.0 (left) to +1.0 (right)
 *     positions: {x,y}[]   — world-space racing line positions
 *     apexNodes: number[]  — node indices where apex markers go
 *     turnInNodes: number[] — node indices where turn-in markers go
 *   }
 */

const APPROACH_LEAD = 20   // nodes before corner start for approach control point
const EXIT_TRAIL   = 25   // nodes after corner end for exit control point
const EDGE         = 0.85  // how far toward edge for outside positioning
const CLAMP        = 0.9   // max lateral fraction allowed

/**
 * Catmull-Rom spline interpolation.
 * Given control points as {idx, val} sorted by idx, returns a value array
 * for every node index from 0 to N-1.
 */
function catmullRomInterpolate(controlPoints, N) {
  if (!controlPoints.length) return new Array(N).fill(0)

  // Sort by index
  const pts = [...controlPoints].sort((a, b) => a.idx - b.idx)

  const result = new Array(N).fill(0)

  // For each segment between consecutive control points, interpolate
  for (let seg = 0; seg < pts.length - 1; seg++) {
    const p0 = pts[Math.max(0, seg - 1)]
    const p1 = pts[seg]
    const p2 = pts[seg + 1]
    const p3 = pts[Math.min(pts.length - 1, seg + 2)]

    const startIdx = p1.idx
    const endIdx = p2.idx
    if (startIdx === endIdx) continue

    for (let i = startIdx; i <= endIdx; i++) {
      const t = (i - startIdx) / (endIdx - startIdx)
      result[i] = catmullRom(p0.val, p1.val, p2.val, p3.val, t)
    }
  }

  // Fill before first control point
  if (pts.length > 0) {
    for (let i = 0; i < pts[0].idx; i++) result[i] = pts[0].val
  }
  // Fill after last control point
  if (pts.length > 0) {
    const last = pts[pts.length - 1]
    for (let i = last.idx + 1; i < N; i++) result[i] = last.val
  }

  return result
}

/**
 * Catmull-Rom interpolation between p1 and p2, with p0 and p3 as neighbors.
 * t in [0, 1]
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

/**
 * Determine which side is "outside" for a corner.
 * Returns +1 (right) or -1 (left).
 * Outside = opposite of turn direction.
 */
function outsideSign(corner) {
  return corner.turn_direction === 'left' ? 1 : -1
}

/**
 * Generate the racing line.
 *
 * @param {object} trackData — track object with .nodes[]
 * @param {Array}  corners   — output of analyzeCorners() with classification
 * @returns {{ lateral: number[], positions: {x,y}[], apexNodes: number[], turnInNodes: number[] }}
 */
export function generateRacingLine(trackData, corners) {
  const nodes = trackData?.nodes
  if (!nodes || nodes.length < 3 || !corners || !corners.length) {
    return { lateral: [], positions: [], apexNodes: [], turnInNodes: [] }
  }

  const N = nodes.length
  const controlPoints = []
  const apexNodes = []
  const turnInNodes = []

  for (let ci = 0; ci < corners.length; ci++) {
    const c = corners[ci]
    const nextC = corners[ci + 1]

    // ── Chicane pair: process both corners as a single unit ──
    // This avoids the exit/approach control points of individual corners
    // from extending 20-25 nodes and overlapping with unrelated corners.
    const isChicanePair = c.corner_type === 4 && nextC?.corner_type === 4
    if (isChicanePair) {
      const out1 = outsideSign(c), in1 = -out1
      const out2 = outsideSign(nextC), in2 = -out2

      // Approach: outside of first corner, normal lead distance
      const approachIdx = Math.max(0, c.start_node - APPROACH_LEAD)
      controlPoints.push({ idx: approachIdx, val: out1 * EDGE })

      // Turn-in for first corner
      controlPoints.push({ idx: c.start_node, val: out1 * 0.3 })
      turnInNodes.push(c.start_node)

      // First apex: reduced depth (chicane entry = 0.45)
      const apex1Depth = (c.recommended_apex_offset || 0.45) * EDGE
      controlPoints.push({ idx: c.apex_node, val: in1 * apex1Depth })
      apexNodes.push(c.apex_node)

      // Smooth S-curve transition: centerline crossing between the two apexes
      const midIdx = Math.round((c.apex_node + nextC.apex_node) / 2)
      controlPoints.push({ idx: midIdx, val: 0 })

      // Turn-in for second corner
      turnInNodes.push(nextC.start_node)

      // Second apex: aggressive depth (chicane exit = 0.60)
      const apex2Depth = (nextC.recommended_apex_offset || 0.60) * EDGE
      controlPoints.push({ idx: nextC.apex_node, val: in2 * apex2Depth })
      apexNodes.push(nextC.apex_node)

      // Exit: outside of second corner, normal trail distance
      const exitIdx = Math.min(N - 1, nextC.end_node + EXIT_TRAIL)
      controlPoints.push({ idx: exitIdx, val: out2 * EDGE })

      // Straight between chicane exit and next corner approach
      if (ci + 2 < corners.length) {
        const afterC = corners[ci + 2]
        const afterOutside = outsideSign(afterC)
        const afterApproachIdx = Math.max(0, afterC.start_node - APPROACH_LEAD)
        if (afterApproachIdx > exitIdx + 5) {
          const gapMid = Math.round((exitIdx + afterApproachIdx) / 2)
          controlPoints.push({ idx: gapMid, val: afterOutside * 0.5 })
        }
      }

      ci++ // skip the exit corner — already handled
      continue
    }

    // ── Normal (non-chicane) corner ──
    const outside = outsideSign(c)
    const inside = -outside

    const approachIdx = Math.max(0, c.start_node - APPROACH_LEAD)
    controlPoints.push({ idx: approachIdx, val: outside * EDGE })

    const turnInIdx = c.start_node
    controlPoints.push({ idx: turnInIdx, val: outside * 0.3 })
    turnInNodes.push(turnInIdx)

    const apexDepth = (c.recommended_apex_offset || 0.5) * EDGE
    controlPoints.push({ idx: c.apex_node, val: inside * apexDepth })
    apexNodes.push(c.apex_node)

    const exitIdx = Math.min(N - 1, c.end_node + EXIT_TRAIL)
    controlPoints.push({ idx: exitIdx, val: outside * EDGE })

    if (ci < corners.length - 1) {
      const nxtC = corners[ci + 1]
      const nxtOutside = outsideSign(nxtC)
      const nxtApproachIdx = Math.max(0, nxtC.start_node - APPROACH_LEAD)
      if (nxtApproachIdx > exitIdx + 5) {
        const midIdx = Math.round((exitIdx + nxtApproachIdx) / 2)
        controlPoints.push({ idx: midIdx, val: nxtOutside * 0.5 })
      }
    }
  }

  // Add start/end anchors if not covered
  const firstCorner = corners[0]
  const lastCorner = corners[corners.length - 1]
  const firstApproach = Math.max(0, firstCorner.start_node - APPROACH_LEAD)
  const lastExit = Math.min(N - 1, lastCorner.end_node + EXIT_TRAIL)

  if (firstApproach > 0) {
    // Before first corner: position for its approach
    const outside = outsideSign(firstCorner)
    controlPoints.push({ idx: 0, val: outside * 0.5 })
  }
  if (lastExit < N - 1) {
    // After last corner: drift back toward center / next lap approach
    const outside = outsideSign(firstCorner)  // wraps to first corner
    controlPoints.push({ idx: N - 1, val: outside * 0.5 })
  }

  // Deduplicate: if multiple control points at same index, keep the last one
  const cpMap = new Map()
  for (const cp of controlPoints) {
    cpMap.set(cp.idx, cp)
  }
  const dedupedCPs = Array.from(cpMap.values()).sort((a, b) => a.idx - b.idx)

  // Interpolate with Catmull-Rom
  const lateral = catmullRomInterpolate(dedupedCPs, N)

  // Smoothing pass: 5-node moving average to eliminate spline jank
  const raw = [...lateral]
  for (let i = 0; i < N; i++) {
    let sum = 0, count = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(N - 1, i + 2); j++) {
      sum += raw[j]
      count++
    }
    lateral[i] = sum / count
  }

  // Clamp to track boundaries
  for (let i = 0; i < N; i++) {
    lateral[i] = Math.max(-CLAMP, Math.min(CLAMP, lateral[i]))
  }

  // Convert lateral offsets to world positions
  const halfWidth = 14 / 2  // TRACK_WIDTH / 2
  const positions = new Array(N)
  for (let i = 0; i < N; i++) {
    const prev = nodes[Math.max(0, i - 1)]
    const next = nodes[Math.min(N - 1, i + 1)]
    const dx = next.x - prev.x, dy = next.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Perpendicular: (dy, -dx) / len is the "right" direction
    const px = dy / len, py = -dx / len
    const offset = lateral[i] * halfWidth
    positions[i] = {
      x: nodes[i].x + px * offset,
      y: nodes[i].y + py * offset,
    }
  }

  return { lateral, positions, apexNodes, turnInNodes }
}
