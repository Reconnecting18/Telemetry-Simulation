export const COLORS = {
  accent:     '#e10600',
  velocity:   '#e10600',
  lateral_g:  '#f5a623',
  long_g:     '#4a90e2',
  drag:       '#7ed321',
  fuel:       '#9b9b9b',
  throttle:   '#7ed321',
  brake:      '#e10600',
  FL:         '#e10600',
  FR:         '#f5a623',
  RL:         '#4a90e2',
  RR:         '#7ed321',
}

// Simple 5-step temp color (for legacy use / chart lines)
export function tempToColor(temp, optimal, overheat) {
  if (temp < optimal * 0.7) return '#4a90e2'    // cold (blue)
  if (temp < optimal * 0.9) return '#7ed321'    // warming (green)
  if (temp < optimal * 1.1) return '#f5a623'    // optimal (amber)
  if (temp < overheat)      return '#e10600'    // hot (red)
  return '#ff00ff'                               // overheating (magenta)
}

// Smooth gradient: blue → purple → orange → red → white
// Mimics thermal camera imagery used in motorsport displays
function lerpChannel(a, b, t) { return Math.round(a + (b - a) * t) }

const TEMP_STOPS = [
  // [fraction, r, g, b]
  [0.00,  20,  60, 200],  // deep blue  (cold ~20°C)
  [0.28, 140,  20, 200],  // purple     (~55°C)
  [0.58, 245, 155,  15],  // orange     (~90°C optimal)
  [0.80, 230,  25,  25],  // red        (~105°C)
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
  if (fraction < 0.25) return '#7ed321'
  if (fraction < 0.50) return '#f5a623'
  if (fraction < 0.75) return '#ff8c00'
  return '#e10600'
}

export function curvatureToColor(k) {
  const absK = Math.abs(k)
  if (absK < 0.002) return '#555'       // straight
  if (absK < 0.008) return '#f5a623'    // mild curve
  return '#e10600'                       // tight curve
}
