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

const MAX_APPROACH_LEAD = 20   // upper bound — actual value is adaptive per corner
const MAX_EXIT_TRAIL   = 25   // upper bound — actual value is adaptive per corner
const EDGE         = 0.85  // how far toward edge for outside positioning
const CLAMP        = 0.9   // max lateral fraction allowed

// Control point priority levels for collision resolution
const PRI_APPROACH_EXIT = 0
const PRI_MID           = 1
const PRI_TURNIN        = 2
const PRI_APEX          = 3

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

  // ── Fix 1: Adaptive lead/trail distances per corner ──
  // Guarantees control points from adjacent corners never overlap
  const leads = new Array(corners.length)
  const trails = new Array(corners.length)
  for (let ci = 0; ci < corners.length; ci++) {
    const c = corners[ci]
    const prevEnd = ci > 0 ? corners[ci - 1].end_node : c.start_node - MAX_APPROACH_LEAD
    const nextStart = ci < corners.length - 1 ? corners[ci + 1].start_node : c.end_node + MAX_EXIT_TRAIL
    const gapBefore = c.start_node - prevEnd
    const gapAfter = nextStart - c.end_node
    leads[ci] = Math.min(MAX_APPROACH_LEAD, Math.max(2, Math.floor(gapBefore / 2)))
    trails[ci] = Math.min(MAX_EXIT_TRAIL, Math.max(2, Math.floor(gapAfter / 2)))
  }

  const controlPoints = []
  const apexNodes = []
  const turnInNodes = []

  for (let ci = 0; ci < corners.length; ci++) {
    const c = corners[ci]
    const nextC = corners[ci + 1]

    // ── Chicane pair: process both corners as a single unit ──
    const isChicanePair = c.corner_type === 4 && nextC?.corner_type === 4
    if (isChicanePair) {
      const out1 = outsideSign(c), in1 = -out1
      const out2 = outsideSign(nextC), in2 = -out2

      // Approach: outside of first corner, adaptive lead distance
      const approachIdx = Math.max(0, c.start_node - leads[ci])
      controlPoints.push({ idx: approachIdx, val: out1 * EDGE, pri: PRI_APPROACH_EXIT })

      // Turn-in for first corner
      controlPoints.push({ idx: c.start_node, val: out1 * 0.3, pri: PRI_TURNIN })
      turnInNodes.push(c.start_node)

      // First apex
      const apex1Depth = (c.recommended_apex_offset || 0.45) * EDGE
      controlPoints.push({ idx: c.apex_node, val: in1 * apex1Depth, pri: PRI_APEX })
      apexNodes.push(c.apex_node)

      // S-curve transition between apexes
      const midIdx = Math.round((c.apex_node + nextC.apex_node) / 2)
      controlPoints.push({ idx: midIdx, val: 0, pri: PRI_MID })

      // Turn-in for second corner
      turnInNodes.push(nextC.start_node)

      // Second apex
      const apex2Depth = (nextC.recommended_apex_offset || 0.60) * EDGE
      controlPoints.push({ idx: nextC.apex_node, val: in2 * apex2Depth, pri: PRI_APEX })
      apexNodes.push(nextC.apex_node)

      // Exit: adaptive trail distance
      const exitIdx = Math.min(N - 1, nextC.end_node + trails[ci + 1])
      controlPoints.push({ idx: exitIdx, val: out2 * EDGE, pri: PRI_APPROACH_EXIT })

      // Straight between chicane exit and next corner approach
      if (ci + 2 < corners.length) {
        const afterC = corners[ci + 2]
        const afterOutside = outsideSign(afterC)
        const afterApproachIdx = Math.max(0, afterC.start_node - leads[ci + 2])
        if (afterApproachIdx > exitIdx + 5) {
          const gapMid = Math.round((exitIdx + afterApproachIdx) / 2)
          controlPoints.push({ idx: gapMid, val: afterOutside * 0.5, pri: PRI_MID })
        }
      }

      ci++ // skip the exit corner — already handled
      continue
    }

    // ── Normal (non-chicane) corner ──
    const outside = outsideSign(c)
    const inside = -outside

    const approachIdx = Math.max(0, c.start_node - leads[ci])
    controlPoints.push({ idx: approachIdx, val: outside * EDGE, pri: PRI_APPROACH_EXIT })

    const turnInIdx = c.start_node
    controlPoints.push({ idx: turnInIdx, val: outside * 0.3, pri: PRI_TURNIN })
    turnInNodes.push(turnInIdx)

    const apexDepth = (c.recommended_apex_offset || 0.5) * EDGE
    controlPoints.push({ idx: c.apex_node, val: inside * apexDepth, pri: PRI_APEX })
    apexNodes.push(c.apex_node)

    const exitIdx = Math.min(N - 1, c.end_node + trails[ci])
    controlPoints.push({ idx: exitIdx, val: outside * EDGE, pri: PRI_APPROACH_EXIT })

    if (ci < corners.length - 1) {
      const nxtC = corners[ci + 1]
      const nxtOutside = outsideSign(nxtC)
      const nxtApproachIdx = Math.max(0, nxtC.start_node - leads[ci + 1])
      if (nxtApproachIdx > exitIdx + 5) {
        const midIdx = Math.round((exitIdx + nxtApproachIdx) / 2)
        controlPoints.push({ idx: midIdx, val: nxtOutside * 0.5, pri: PRI_MID })
      }
    }
  }

  // Add start/end anchors if not covered
  const firstCorner = corners[0]
  const lastCorner = corners[corners.length - 1]
  const firstApproach = Math.max(0, firstCorner.start_node - leads[0])
  const lastExit = Math.min(N - 1, lastCorner.end_node + trails[corners.length - 1])

  if (firstApproach > 0) {
    const outside = outsideSign(firstCorner)
    controlPoints.push({ idx: 0, val: outside * 0.5, pri: PRI_MID })
  }
  if (lastExit < N - 1) {
    const outside = outsideSign(firstCorner)  // wraps to first corner
    controlPoints.push({ idx: N - 1, val: outside * 0.5, pri: PRI_MID })
  }

  // ── Fix 2: Priority-based deduplication + collision detection ──
  // At same index: keep highest priority
  const cpMap = new Map()
  for (const cp of controlPoints) {
    const existing = cpMap.get(cp.idx)
    if (!existing || cp.pri > existing.pri) {
      cpMap.set(cp.idx, cp)
    }
  }
  let resolved = Array.from(cpMap.values()).sort((a, b) => a.idx - b.idx)

  // Proximity collision: if two CPs within 2 nodes, discard lower priority
  const toRemove = new Set()
  for (let i = 0; i < resolved.length - 1; i++) {
    if (toRemove.has(i)) continue
    for (let j = i + 1; j < resolved.length; j++) {
      if (resolved[j].idx - resolved[i].idx > 2) break
      if (toRemove.has(j)) continue
      // Same index already handled by dedup above; this catches 1-2 node gaps
      if (resolved[i].idx === resolved[j].idx) continue
      if (resolved[i].pri >= resolved[j].pri) {
        toRemove.add(j)
      } else {
        toRemove.add(i)
        break // i is removed, stop checking against it
      }
    }
  }
  if (toRemove.size) resolved = resolved.filter((_, i) => !toRemove.has(i))

  // ── Interpolate with Catmull-Rom ──
  const lateral = catmullRomInterpolate(resolved, N)

  // ── Fix 4: Gaussian-weighted smoothing (2 passes) ──
  const GAUSS = [0.1, 0.2, 0.4, 0.2, 0.1]
  for (let pass = 0; pass < 2; pass++) {
    const src = [...lateral]
    for (let i = 0; i < N; i++) {
      let sum = 0
      for (let j = -2; j <= 2; j++) {
        sum += src[((i + j) % N + N) % N] * GAUSS[j + 2]
      }
      lateral[i] = sum
    }
  }

  // Clamp to track boundaries
  for (let i = 0; i < N; i++) {
    lateral[i] = Math.max(-CLAMP, Math.min(CLAMP, lateral[i]))
  }

  // Hard delta clamp: no node-to-node change may exceed 0.15
  // Forward pass then backward pass for symmetric smoothing
  // Use 0.149 to avoid floating-point boundary values at exactly 0.15
  const MAX_DELTA = 0.149
  for (let i = 1; i < N; i++) {
    const delta = lateral[i] - lateral[i - 1]
    if (Math.abs(delta) > MAX_DELTA) {
      lateral[i] = lateral[i - 1] + Math.sign(delta) * MAX_DELTA
    }
  }
  for (let i = N - 2; i >= 0; i--) {
    const delta = lateral[i] - lateral[i + 1]
    if (Math.abs(delta) > MAX_DELTA) {
      lateral[i] = lateral[i + 1] + Math.sign(delta) * MAX_DELTA
    }
  }

  // ── Fix 3: Multi-pass smoothed direction vectors for position conversion ──
  // Compute raw prev→next direction at each node, then Gaussian-smooth 3 times.
  // Effective smoothing window ~15 nodes — eliminates direction snaps even at
  // closely-spaced nodes (e.g. 123-124, only 0.2m apart).
  const halfWidth = 14 / 2  // TRACK_WIDTH / 2
  const positions = new Array(N)
  const dirX = new Array(N), dirY = new Array(N)
  for (let i = 0; i < N; i++) {
    const prev = ((i - 1) % N + N) % N, next = (i + 1) % N
    dirX[i] = nodes[next].x - nodes[prev].x
    dirY[i] = nodes[next].y - nodes[prev].y
  }
  const DIR_GAUSS = [0.1, 0.2, 0.4, 0.2, 0.1]
  for (let pass = 0; pass < 3; pass++) {
    const srcX = [...dirX], srcY = [...dirY]
    for (let i = 0; i < N; i++) {
      let sx = 0, sy = 0
      for (let j = -2; j <= 2; j++) {
        const k = ((i + j) % N + N) % N
        sx += srcX[k] * DIR_GAUSS[j + 2]
        sy += srcY[k] * DIR_GAUSS[j + 2]
      }
      dirX[i] = sx
      dirY[i] = sy
    }
  }
  for (let i = 0; i < N; i++) {
    const len = Math.sqrt(dirX[i] * dirX[i] + dirY[i] * dirY[i]) || 1
    // Perpendicular: (dirY, -dirX) / len is the "right" direction
    const px = dirY[i] / len, py = -dirX[i] / len
    const offset = lateral[i] * halfWidth
    positions[i] = {
      x: nodes[i].x + px * offset,
      y: nodes[i].y + py * offset,
    }
  }

  // Post-process: for closely-spaced node pairs (<1m), distance-weighted
  // interpolation between neighbors to prevent XY ratio spikes
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N
    const dxC = nodes[next].x - nodes[i].x, dyC = nodes[next].y - nodes[i].y
    const d1 = Math.sqrt(dxC * dxC + dyC * dyC)
    if (d1 < 1.0) {
      const next2 = (next + 1) % N
      const dxC2 = nodes[next2].x - nodes[next].x, dyC2 = nodes[next2].y - nodes[next].y
      const d2 = Math.sqrt(dxC2 * dxC2 + dyC2 * dyC2) || 1
      const frac = d1 / (d1 + d2)
      positions[next] = {
        x: positions[i].x * (1 - frac) + positions[next2].x * frac,
        y: positions[i].y * (1 - frac) + positions[next2].y * frac,
      }
    }
  }

  return { lateral, positions, apexNodes, turnInNodes }
}
