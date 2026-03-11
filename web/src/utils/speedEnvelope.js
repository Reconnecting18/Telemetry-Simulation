/**
 * Speed envelope calculator.
 *
 * calculateSpeedEnvelope(trackData, corners, carParams)
 *
 * Computes the maximum possible speed at every track node using:
 *   1. Cornering limit: v = sqrt(grip * g * radius)
 *   2. Forward pass:    acceleration-limited from node to node
 *   3. Backward pass:   braking-limited from node to node
 *
 * Stores result as trackData.nodes[i].speed_kph (mutates in place).
 * Returns the speed array (kph) for convenience.
 */

const G = 9.81  // m/s^2

const DEFAULT_CAR_PARAMS = {
  max_grip: 1.8,              // g-force lateral grip
  max_speed: 330,             // kph
  max_braking_deceleration: 5.5, // g-force
  mass: 798,                  // kg (unused currently, here for future aero calcs)
  drag_coefficient: 0.9,      // simplified drag factor
}

/**
 * Compute Euclidean distance between two nodes.
 */
function nodeDist(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Menger curvature magnitude from three consecutive 2D points.
 */
function mengerCurvatureAbs(ax, ay, bx, by, cx, cy) {
  const abx = bx - ax, aby = by - ay
  const bcx = cx - bx, bcy = cy - by
  const cax = ax - cx, cay = ay - cy
  const cross = Math.abs(abx * bcy - aby * bcx)
  const ab = Math.sqrt(abx * abx + aby * aby)
  const bc = Math.sqrt(bcx * bcx + bcy * bcy)
  const ca = Math.sqrt(cax * cax + cay * cay)
  const denom = ab * bc * ca
  if (denom < 1e-12) return 0
  return (2 * cross) / denom
}

/**
 * @param {object} trackData - track object with .nodes[] (x, y, curvature, ...)
 * @param {Array}  corners   - output of analyzeCorners() (currently unused, reserved)
 * @param {object} carParams - override defaults
 * @returns {number[]} speed_kph per node
 */
export function calculateSpeedEnvelope(trackData, corners, carParams) {
  const params = { ...DEFAULT_CAR_PARAMS, ...carParams }
  const nodes = trackData?.nodes
  if (!nodes || nodes.length < 3) return []

  const N = nodes.length
  const maxV = params.max_speed / 3.6  // m/s
  const gripAccel = params.max_grip * G  // m/s^2 lateral
  const maxAccel = gripAccel * 0.7       // longitudinal accel ~ 70% of lateral grip
  const maxBrake = params.max_braking_deceleration * G  // m/s^2

  // Step 1: Compute Menger curvature at each node
  const curvature = new Array(N).fill(0)
  for (let i = 1; i < N - 1; i++) {
    const a = nodes[i - 1], b = nodes[i], c = nodes[i + 1]
    curvature[i] = mengerCurvatureAbs(a.x, a.y, b.x, b.y, c.x, c.y)
  }

  // Step 2: Cornering speed limit at each node
  // v = sqrt(grip * g / curvature), capped at max_speed
  // Minimum radius guard: replace R < 10m with average of 5 nearest valid radii
  const MIN_RADIUS = 10  // meters
  const MIN_SPEED_KPH = 30  // kph floor

  const vCorner = new Array(N)
  for (let i = 0; i < N; i++) {
    let k = curvature[i]
    if (k > 1e-6) {
      const r = 1 / k
      if (r < MIN_RADIUS) {
        // Average radius from nearest valid neighbors
        let sumR = 0, count = 0
        for (let d = 1; count < 5 && d < N; d++) {
          for (const j of [i - d, i + d]) {
            if (j < 0 || j >= N) continue
            if (curvature[j] > 1e-6) {
              const rj = 1 / curvature[j]
              if (rj >= MIN_RADIUS) { sumR += rj; count++ }
            }
            if (count >= 5) break
          }
        }
        const avgR = count > 0 ? sumR / count : MIN_RADIUS
        console.warn(`[SpeedEnvelope] WARNING: node ${i} radius ${r.toFixed(1)}m < 10m, replaced with ${avgR.toFixed(1)}m`)
        k = 1 / avgR
      }
    }
    if (k < 1e-6) {
      vCorner[i] = maxV
    } else {
      vCorner[i] = Math.min(maxV, Math.sqrt(gripAccel / k))
    }
  }

  // Step 3: Forward pass (acceleration-limited)
  // v_next^2 = v_prev^2 + 2 * a * dist
  const vForward = new Array(N)
  vForward[0] = vCorner[0]
  for (let i = 1; i < N; i++) {
    const dist = nodeDist(nodes[i - 1], nodes[i])
    const vMax = Math.sqrt(vForward[i - 1] ** 2 + 2 * maxAccel * dist)
    vForward[i] = Math.min(vCorner[i], vMax)
  }

  // Step 4: Backward pass (braking-limited)
  // v_prev^2 = v_next^2 + 2 * brake * dist
  const vBackward = new Array(N)
  vBackward[N - 1] = vForward[N - 1]
  for (let i = N - 2; i >= 0; i--) {
    const dist = nodeDist(nodes[i], nodes[i + 1])
    const vMax = Math.sqrt(vBackward[i + 1] ** 2 + 2 * maxBrake * dist)
    vBackward[i] = Math.min(vForward[i], vMax)
  }

  // Step 5: Final envelope = min(cornering, forward, backward) — already folded
  // vBackward is the final result since it takes min with vForward at each step
  const minV = MIN_SPEED_KPH / 3.6
  const speedKph = new Array(N)
  const forwardKph = new Array(N)
  for (let i = 0; i < N; i++) {
    // Speed floor: no node below 30 kph
    if (vBackward[i] < minV) {
      const r = curvature[i] > 1e-6 ? (1 / curvature[i]).toFixed(1) : 'inf'
      console.warn(`[SpeedEnvelope] WARNING: node ${i} speed ${(vBackward[i] * 3.6).toFixed(1)} kph < ${MIN_SPEED_KPH} kph floor (R=${r}m)`)
      vBackward[i] = minV
    }
    speedKph[i] = vBackward[i] * 3.6
    forwardKph[i] = vForward[i] * 3.6
    nodes[i].speed_kph = speedKph[i]
  }

  // Attach forward-only profile for braking point detection
  speedKph._forwardKph = forwardKph

  return speedKph
}

/**
 * Calculate braking points for each corner.
 *
 * For each corner, walks backward from the corner start_node along the speed
 * envelope. The braking point is the first node where the car must begin
 * braking to reach the corner entry speed.
 *
 * Dynamic adjustments:
 *   - Extra fuel above base weight: +2m per 10kg of extra fuel
 *   - Tire wear: multiply braking distance by (1 + avg_wear * 0.15)
 *
 * @param {object}   trackData  - track object with .nodes[]
 * @param {number[]} speedKph   - speed envelope (kph per node)
 * @param {Array}    corners    - output of analyzeCorners()
 * @param {object}   [carParams]
 * @param {object}   [conditions] - { fuel_L, tire_wear: {FL,FR,RL,RR}, base_fuel_L }
 * @returns {Array} corners with braking_point_node, braking_distance_m added
 */
export function calculateBrakingPoints(trackData, speedKph, corners, carParams, conditions) {
  const params = { ...DEFAULT_CAR_PARAMS, ...carParams }
  const nodes = trackData?.nodes
  if (!nodes || !speedKph || !corners) return corners || []

  const N = nodes.length
  const maxBrake = params.max_braking_deceleration * G  // m/s^2

  // Dynamic adjustments
  const baseFuel = conditions?.base_fuel_L ?? params.fuel_capacity_L ?? 120
  const currentFuel = conditions?.fuel_L ?? baseFuel
  const extraFuelKg = Math.max(0, currentFuel - baseFuel * 0.5) * 0.74  // fuel density ~0.74 kg/L, base = half tank
  const fuelExtension = extraFuelKg / 10 * 2  // +2m per 10kg extra

  const wear = conditions?.tire_wear
  const avgWear = wear
    ? ((wear.FL || 0) + (wear.FR || 0) + (wear.RL || 0) + (wear.RR || 0)) / 4
    : 0
  const wearMultiplier = 1 + avgWear * 0.15

  // Forward-only profile (no braking constraint) for comparison
  const fwdKph = speedKph._forwardKph || speedKph

  for (const corner of corners) {
    const entryNode = corner.start_node

    // The braking point is where the final envelope first drops below the
    // forward-only profile — i.e., where braking begins constraining speed.
    // Walk backward from entry to find where they converge.
    let brakeNode = -1
    let brakeDist = 0

    for (let i = entryNode; i >= 0; i--) {
      const finalSpd = speedKph[i] || 0
      const fwdSpd = fwdKph[i] || 0

      // When final envelope matches forward profile (within 2%), braking
      // hasn't kicked in yet — the previous node was the braking point
      if (finalSpd >= fwdSpd * 0.98) {
        brakeNode = i
        // Compute distance from braking node to corner entry
        brakeDist = 0
        for (let j = i; j < entryNode; j++) {
          brakeDist += nodeDist(nodes[j], nodes[j + 1])
        }
        break
      }
    }

    if (brakeNode < 0 || brakeDist < 5) {
      corner.braking_point_node = undefined
      corner.braking_distance_m = 0
      continue
    }

    // Apply dynamic adjustments to braking distance
    const rawDist = brakeDist
    const adjustedDist = (rawDist + fuelExtension) * wearMultiplier

    // Walk back from entry by adjustedDist to find the adjusted braking node
    let accumDist = 0
    let adjNode = brakeNode
    for (let i = entryNode - 1; i >= 0; i--) {
      accumDist += nodeDist(nodes[i], nodes[i + 1])
      if (accumDist >= adjustedDist) {
        adjNode = i
        break
      }
    }

    corner.braking_point_node = adjNode
    corner.braking_distance_m = parseFloat(adjustedDist.toFixed(1))
  }

  return corners
}

/**
 * Map speed (kph) to a color: light grey (slow) → yellow (mid) → red (fast).
 * Motorsport-standard: white/grey for braking zones, red for full-speed sections.
 * Returns a CSS color string.
 */
export function speedColor(speedKph, minSpeed, maxSpeed) {
  const range = maxSpeed - minSpeed || 1
  const t = Math.max(0, Math.min(1, (speedKph - minSpeed) / range))

  // #cccccc (0) → #ffdd00 (0.5) → #ff3d00 (1.0)
  let r, g, b
  if (t < 0.5) {
    const s = t / 0.5
    r = Math.round(204 + (255 - 204) * s)  // 204 → 255
    g = Math.round(204 + (221 - 204) * s)  // 204 → 221
    b = Math.round(204 * (1 - s))          // 204 → 0
  } else {
    const s = (t - 0.5) / 0.5
    r = 255                                 // 255 → 255
    g = Math.round(221 * (1 - s))          // 221 → 0
    b = 0                                   // 0   → 0
  }
  return `rgb(${r},${g},${b})`
}
