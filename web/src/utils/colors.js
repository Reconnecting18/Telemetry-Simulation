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

export function tempToColor(temp, optimal, overheat) {
  if (temp < optimal * 0.7) return '#4a90e2'    // cold (blue)
  if (temp < optimal * 0.9) return '#7ed321'    // warming (green)
  if (temp < optimal * 1.1) return '#f5a623'    // optimal (amber)
  if (temp < overheat)      return '#e10600'    // hot (red)
  return '#ff00ff'                               // overheating (magenta)
}

export function wearToColor(fraction) {
  if (fraction < 0.25) return '#7ed321'
  if (fraction < 0.50) return '#f5a623'
  if (fraction < 0.75) return '#ff8c00'
  return '#e10600'
}

export function curvatureToColor(k) {
  const absK = Math.abs(k)
  if (absK < 0.002) return '#555'       // straight (dim)
  if (absK < 0.008) return '#f5a623'    // mild curve
  return '#e10600'                       // tight curve
}
