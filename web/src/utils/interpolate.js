// Linear interpolation between two frames at fraction t in [0,1]
export function interpolateFrame(a, b, t) {
  const lerp = (x, y) => x + (y - x) * t
  return {
    node: a.node,
    lap: t < 0.5 ? a.lap : b.lap,
    time_s: lerp(a.time_s, b.time_s),
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    velocity_ms: lerp(a.velocity_ms, b.velocity_ms),
    lateral_g: lerp(a.lateral_g, b.lateral_g),
    longitudinal_g: lerp(a.longitudinal_g, b.longitudinal_g),
    lateral_force_N: lerp(a.lateral_force_N, b.lateral_force_N),
    drag_force_N: lerp(a.drag_force_N, b.drag_force_N),
    fuel_L: lerp(a.fuel_L, b.fuel_L),
    gear: t < 0.5 ? a.gear : b.gear,
    rpm: lerp(a.rpm, b.rpm),
    throttle: lerp(a.throttle, b.throttle),
    brake: lerp(a.brake, b.brake),
    tire_wear: {
      FL: lerp(a.tire_wear.FL, b.tire_wear.FL),
      FR: lerp(a.tire_wear.FR, b.tire_wear.FR),
      RL: lerp(a.tire_wear.RL, b.tire_wear.RL),
      RR: lerp(a.tire_wear.RR, b.tire_wear.RR),
    },
    tire_temp_C: {
      FL: lerp(a.tire_temp_C.FL, b.tire_temp_C.FL),
      FR: lerp(a.tire_temp_C.FR, b.tire_temp_C.FR),
      RL: lerp(a.tire_temp_C.RL, b.tire_temp_C.RL),
      RR: lerp(a.tire_temp_C.RR, b.tire_temp_C.RR),
    },
    tire_pressure_psi: {
      FL: lerp(a.tire_pressure_psi.FL, b.tire_pressure_psi.FL),
      FR: lerp(a.tire_pressure_psi.FR, b.tire_pressure_psi.FR),
      RL: lerp(a.tire_pressure_psi.RL, b.tire_pressure_psi.RL),
      RR: lerp(a.tire_pressure_psi.RR, b.tire_pressure_psi.RR),
    },
    suspension_mm: {
      FL: lerp(a.suspension_mm.FL, b.suspension_mm.FL),
      FR: lerp(a.suspension_mm.FR, b.suspension_mm.FR),
      RL: lerp(a.suspension_mm.RL, b.suspension_mm.RL),
      RR: lerp(a.suspension_mm.RR, b.suspension_mm.RR),
    },
    camber_deg: {
      FL: lerp(a.camber_deg.FL, b.camber_deg.FL),
      FR: lerp(a.camber_deg.FR, b.camber_deg.FR),
      RL: lerp(a.camber_deg.RL, b.camber_deg.RL),
      RR: lerp(a.camber_deg.RR, b.camber_deg.RR),
    },
  }
}

// Find the frame index for a given time via binary search
export function findFrameIndex(frames, time) {
  if (time <= frames[0].time_s) return 0
  if (time >= frames[frames.length - 1].time_s) return frames.length - 1
  let lo = 0, hi = frames.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (frames[mid].time_s <= time) lo = mid
    else hi = mid
  }
  return lo
}
