/**
 * Corner detection and classification module.
 *
 * analyzeCorners(trackData) — accepts the track object from telemetry.json
 * (the one with .nodes[], each having x, y, curvature).
 *
 * Returns an array of corner objects with:
 *   start_node, apex_node, end_node, turn_direction,
 *   geometric_apex_offset, radius_at_apex, corner_length,
 *   menger_curvature, corner_type, type_name, recommended_apex_offset
 *
 * Corner types:
 *   1 — Slow hairpin    (R < 50m)    rec. apex 0.60
 *   2 — Medium apex     (50-150m)    rec. apex 0.55
 *   3 — Fast sweeper    (R > 150m)   rec. apex 0.50
 *   4 — Chicane         (opposite-dir pair within 10 nodes)  rec. 0.45 / 0.60
 *   5 — Decreasing radius (exit R < 80% entry R)  rec. apex 0.40
 */

const CURVATURE_THRESHOLD = 0.002  // entry/exit threshold for Menger curvature

/**
 * Menger curvature from three consecutive 2D points.
 * Returns signed curvature: positive = left turn, negative = right turn.
 * Curvature = 2 * signed_area / (|AB| * |BC| * |CA|)
 */
function mengerCurvature(ax, ay, bx, by, cx, cy) {
  const abx = bx - ax, aby = by - ay
  const bcx = cx - bx, bcy = cy - by
  const cax = ax - cx, cay = ay - cy

  // Twice the signed area of triangle ABC (positive = CCW = left turn)
  const cross = abx * bcy - aby * bcx

  const ab = Math.sqrt(abx * abx + aby * aby)
  const bc = Math.sqrt(bcx * bcx + bcy * bcy)
  const ca = Math.sqrt(cax * cax + cay * cay)
  const denom = ab * bc * ca

  if (denom < 1e-12) return 0
  return (2 * cross) / denom
}

/**
 * Turn direction from cross product of (prev→node) x (node→next).
 * Positive cross = left turn, negative = right turn.
 */
function turnDirection(prev, node, next) {
  const abx = node.x - prev.x, aby = node.y - prev.y
  const bcx = next.x - node.x, bcy = next.y - node.y
  const cross = abx * bcy - aby * bcx
  return cross >= 0 ? 'left' : 'right'
}

/**
 * Analyze track data and return detected corners.
 * @param {object} trackData — the track object with .nodes[] array
 * @returns {Array<object>} corners
 */
export function analyzeCorners(trackData) {
  const nodes = trackData?.nodes
  if (!nodes || nodes.length < 3) return []

  const N = nodes.length

  // Step 1: Compute Menger curvature at every interior node
  const curvatures = new Array(N).fill(0)
  for (let i = 1; i < N - 1; i++) {
    const a = nodes[i - 1], b = nodes[i], c = nodes[i + 1]
    curvatures[i] = mengerCurvature(a.x, a.y, b.x, b.y, c.x, c.y)
  }

  // Step 2: Walk through curvature array and detect corner regions
  const corners = []
  let i = 0
  while (i < N) {
    // Skip nodes below threshold
    if (Math.abs(curvatures[i]) < CURVATURE_THRESHOLD) {
      i++
      continue
    }

    // Found start of a corner region
    const startNode = i

    // Walk forward while curvature stays above threshold
    let apexNode = i
    let maxAbsK = Math.abs(curvatures[i])

    while (i < N && Math.abs(curvatures[i]) >= CURVATURE_THRESHOLD) {
      if (Math.abs(curvatures[i]) > maxAbsK) {
        maxAbsK = Math.abs(curvatures[i])
        apexNode = i
      }
      i++
    }

    const endNode = i - 1 // last node still above threshold
    const cornerLength = endNode - startNode + 1

    // Geometric apex offset: where along the corner the apex falls (0.0 to 1.0)
    const apexOffset = cornerLength > 1
      ? (apexNode - startNode) / (endNode - startNode)
      : 0.5

    // Radius at apex: 1 / |curvature|
    const radiusAtApex = maxAbsK > 1e-9 ? 1 / maxAbsK : Infinity

    // Turn direction at apex
    const apexPrev = nodes[Math.max(0, apexNode - 1)]
    const apexCurr = nodes[apexNode]
    const apexNext = nodes[Math.min(N - 1, apexNode + 1)]
    const direction = turnDirection(apexPrev, apexCurr, apexNext)

    corners.push({
      start_node: startNode,
      apex_node: apexNode,
      end_node: endNode,
      turn_direction: direction,
      geometric_apex_offset: parseFloat(apexOffset.toFixed(3)),
      radius_at_apex: parseFloat(radiusAtApex.toFixed(1)),
      corner_length: cornerLength,
      menger_curvature: parseFloat(maxAbsK.toFixed(6)),
    })
  }

  // Step 3: Classify corners
  classifyCorners(corners, curvatures)

  return corners
}

const CHICANE_MAX_GAP = 5  // max nodes between two corners to form a chicane

/**
 * Classify each corner by type and assign recommended apex offset.
 * Mutates the corner objects in place.
 */
function classifyCorners(corners, curvatures) {
  const paired = new Set()  // indices already paired as chicane

  // Pass 1: Detect chicanes (Type 4) — opposite-direction pairs close together
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1]
    const gap = b.start_node - a.end_node
    if (gap <= CHICANE_MAX_GAP &&
        a.turn_direction !== b.turn_direction) {
      a.corner_type = 4
      a.type_name = 'Chicane entry'
      a.recommended_apex_offset = 0.45
      b.corner_type = 4
      b.type_name = 'Chicane exit'
      b.recommended_apex_offset = 0.60
      paired.add(i)
      paired.add(i + 1)
      i++ // skip the exit corner in the next iteration
    }
  }

  // Pass 2: Classify remaining corners
  for (let i = 0; i < corners.length; i++) {
    if (paired.has(i)) continue
    const c = corners[i]

    // Check for decreasing radius (Type 5):
    // Compare curvature at entry vs exit regions
    const entryK = Math.abs(curvatures[c.start_node] || 0)
    const exitK = Math.abs(curvatures[c.end_node] || 0)
    const entryR = entryK > 1e-9 ? 1 / entryK : Infinity
    const exitR = exitK > 1e-9 ? 1 / exitK : Infinity
    if (entryR < Infinity && exitR < Infinity && exitR < entryR * 0.8) {
      c.corner_type = 5
      c.type_name = 'Decreasing radius'
      c.recommended_apex_offset = 0.40
      continue
    }

    // Classify by apex radius
    const r = c.radius_at_apex
    if (r < 50) {
      c.corner_type = 1
      c.type_name = 'Slow hairpin'
      c.recommended_apex_offset = 0.60
    } else if (r <= 150) {
      c.corner_type = 2
      c.type_name = 'Medium apex'
      c.recommended_apex_offset = 0.55
    } else {
      c.corner_type = 3
      c.type_name = 'Fast sweeper'
      c.recommended_apex_offset = 0.50
    }
  }
}

/**
 * Log detected corners as a console table for verification.
 * @param {object} trackData — the track object with .nodes[]
 */
export function logCornerAnalysis(trackData) {
  const corners = analyzeCorners(trackData)
  if (!corners.length) {
    console.log('[CornerDetection] No corners detected.')
    return corners
  }

  console.log(`[CornerDetection] Found ${corners.length} corners:`)
  console.table(corners.map((c, i) => ({
    '#': i + 1,
    start: c.start_node,
    apex: c.apex_node,
    end: c.end_node,
    dir: c.turn_direction,
    'radius (m)': c.radius_at_apex,
    'len': c.corner_length,
    'type': c.corner_type,
    'class': c.type_name,
    'geo apex': c.geometric_apex_offset,
    'rec apex': c.recommended_apex_offset,
  })))

  return corners
}
