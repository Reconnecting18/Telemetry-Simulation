export const COLORS = {
  accent:     '#00d4d4',
  velocity:   '#00d4d4',
  lateral_g:  '#f5a623',
  long_g:     '#4a90e2',
  drag:       '#00e676',
  fuel:       '#9b9b9b',
  throttle:   '#00e676',
  brake:      '#ff3d3d',
  FL:         '#ff3d3d',
  FR:         '#f5a623',
  RL:         '#4a90e2',
  RR:         '#00e676',
}

// Simple 5-step temp color (for legacy use / chart lines)
export function tempToColor(temp, optimal, overheat) {
  if (temp < optimal * 0.7) return '#4a90e2'    // cold (blue)
  if (temp < optimal * 0.9) return '#00e676'    // warming (green)
  if (temp < optimal * 1.1) return '#f5a623'    // optimal (amber)
  if (temp < overheat)      return '#ff3d3d'    // hot (red)
  return '#ff00ff'                               // overheating (magenta)
}

// Smooth gradient: blue -> purple -> orange -> red -> white
// Mimics thermal camera imagery used in motorsport displays
function lerpChannel(a, b, t) { return Math.round(a + (b - a) * t) }

const TEMP_STOPS = [
  // [fraction, r, g, b]
  [0.00,  20,  60, 200],  // deep blue  (cold ~20C)
  [0.28, 140,  20, 200],  // purple     (~55C)
  [0.58, 245, 155,  15],  // orange     (~90C optimal)
  [0.80, 230,  25,  25],  // red        (~105C)
  [1.00, 255, 255, 255],  // white      (overheating)
]

export function tempToColorSmooth(temp, optimal = 85, overheat = 115) {
  const cold = 20
  const frac = Math.max(0, Math.min(1, (temp - cold) / (overheat - cold)))
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    if (frac <= TEMP_STOPS[i][0]) {
      const lo = TEMP_STOPS[i - 1]
      const hi = TEMP_STOPS[i]
      const s  = (frac - lo[0]) / (hi[0] - lo[0])
      return `rgb(${lerpChannel(lo[1],hi[1],s)},${lerpChannel(lo[2],hi[2],s)},${lerpChannel(lo[3],hi[3],s)})`
    }
  }
  return 'rgb(255,255,255)'
}

export function wearToColor(fraction) {
  if (fraction < 0.25) return '#00e676'
  if (fraction < 0.50) return '#f5a623'
  if (fraction < 0.75) return '#ff8c00'
  return '#ff3d3d'
}

export function curvatureToColor(k) {
  const absK = Math.abs(k)
  if (absK < 0.002) return '#555555'   // straight
  if (absK < 0.008) return '#f5a623'   // mild curve
  return '#ff3d3d'                      // tight curve
}
