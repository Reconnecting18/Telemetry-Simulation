/**
 * Corner detection module.
 *
 * analyzeCorners(trackData) — accepts the track object from telemetry.json
 * (the one with .nodes[], each having x, y, curvature).
 *
 * Returns an array of corner objects with:
 *   start_node, apex_node, end_node, turn_direction,
 *   geometric_apex_offset, radius_at_apex, corner_length
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

  return corners
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
    'apex offset': c.geometric_apex_offset,
    'radius (m)': c.radius_at_apex,
    'length (nodes)': c.corner_length,
    '|k| at apex': c.menger_curvature,
  })))

  return corners
}
