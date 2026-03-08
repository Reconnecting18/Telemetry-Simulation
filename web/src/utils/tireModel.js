// ═══════════════════════════════════════════════════════════════════
// Tire Data Model + Color Scale Utilities
// ═══════════════════════════════════════════════════════════════════
// Single source of truth for tire visualization.
// Both the embedded car-model view and the dedicated tire detail panel
// read from this data model. Color functions are defined ONCE here.

// ── TIRE DATA MODEL ─────────────────────────────────────────────
// Builds a per-corner tire state object from frame telemetry.
//
// Input (from frame):
//   tire_temp_C:       { FL, FR, RL, RR }   single value per corner
//   tire_wear:         { FL, FR, RL, RR }   0 = new, 0.95 = worn
//   tire_pressure_psi: { FL, FR, RL, RR }
//   camber_deg:        { FL, FR, RL, RR }
//
// Output (per corner):
//   inner_temp, center_temp, outer_temp   (°C)
//   inner_wear, center_wear, outer_wear   (0-100%, 100% = new)
//   surface_temp   (average of 3 zones)
//   compound       ('soft' | 'medium' | 'hard')
//   pressure       (psi)
//   grain          (boolean — cold, not up to temp)
//   blister        (boolean — overheated)

const GRAIN_THRESHOLD  = 65   // °C — below this, tire is grainy
const BLISTER_THRESHOLD = 112  // °C — above this, blistering starts

// Derive 3-zone temperatures from single temp + camber.
// Physics: camber loads the inner edge more → hotter inner, cooler outer.
// Spread scales with abs(camber): at -3° camber, inner is ~7.5°C hotter.
function deriveZoneTemps(temp, camberDeg) {
  const spread = Math.abs(camberDeg || 0) * 2.5
  return {
    inner:  temp + spread,
    center: temp,
    outer:  temp - spread * 0.4,
  }
}

// Derive 3-zone wear from single wear + camber.
// Inner edge wears faster due to camber load.
// wear input: 0 = new, ~0.95 = worn out
// output: 0-100% where 100% = new, 0% = worn through
function deriveZoneWear(wear, camberDeg) {
  const camberBias = Math.abs(camberDeg || 0) * 0.03  // ~9% extra wear at -3° camber
  const base = (1 - wear) * 100  // flip: 100% = new
  return {
    inner:  Math.max(0, base - camberBias * 100),
    center: Math.max(0, base),
    outer:  Math.max(0, base + camberBias * 40),  // outer wears less
  }
}

// Build complete tire state for one corner
function buildCornerTire(temp, wear, pressure, camberDeg, compound) {
  const temps = deriveZoneTemps(temp, camberDeg)
  const wears = deriveZoneWear(wear, camberDeg)
  const surfaceTemp = (temps.inner + temps.center + temps.outer) / 3

  return {
    inner_temp:  temps.inner,
    center_temp: temps.center,
    outer_temp:  temps.outer,
    surface_temp: surfaceTemp,
    inner_wear:  wears.inner,
    center_wear: wears.center,
    outer_wear:  wears.outer,
    compound,
    pressure,
    grain:   surfaceTemp < GRAIN_THRESHOLD,
    blister: surfaceTemp > BLISTER_THRESHOLD,
  }
}

// Build tire data for all four corners from a telemetry frame
export function buildTireData(frame, compound = 'medium') {
  if (!frame) return null
  const result = {}
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    result[id] = buildCornerTire(
      frame.tire_temp_C?.[id]       || 25,
      frame.tire_wear?.[id]         || 0,
      frame.tire_pressure_psi?.[id] || 25,
      frame.camber_deg?.[id]        || 0,
      compound,
    )
  }
  return result
}


// ═══════════════════════════════════════════════════════════════════
// TEMPERATURE COLOR SCALE
// ═══════════════════════════════════════════════════════════════════
// Fixed scale used everywhere:
//   <60°C  = deep blue   #1a3a6b
//    70°C  = blue        #2a6db5
//    80°C  = cyan        #00b4d8
//    90°C  = teal        #00c896
//   100°C  = green       #00e676  (optimal)
//   105°C  = yellow-grn  #aacc00
//   110°C  = yellow      #ffcc00
//   115°C  = orange      #ff8c00
//   120°C+ = red         #ff3d00

function lerp(a, b, t) { return Math.round(a + (b - a) * t) }
function rgbHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')
}

const TEMP_SCALE = [
  { at:  60, r: 0x1a, g: 0x3a, b: 0x6b },  // deep blue
  { at:  70, r: 0x2a, g: 0x6d, b: 0xb5 },  // blue
  { at:  80, r: 0x00, g: 0xb4, b: 0xd8 },  // cyan
  { at:  90, r: 0x00, g: 0xc8, b: 0x96 },  // teal
  { at: 100, r: 0x00, g: 0xe6, b: 0x76 },  // green (optimal)
  { at: 105, r: 0xaa, g: 0xcc, b: 0x00 },  // yellow-green
  { at: 110, r: 0xff, g: 0xcc, b: 0x00 },  // yellow
  { at: 115, r: 0xff, g: 0x8c, b: 0x00 },  // orange
  { at: 120, r: 0xff, g: 0x3d, b: 0x00 },  // red
]

export function tireTempColor(tempC) {
  if (tempC <= TEMP_SCALE[0].at) return rgbHex(TEMP_SCALE[0].r, TEMP_SCALE[0].g, TEMP_SCALE[0].b)
  for (let i = 1; i < TEMP_SCALE.length; i++) {
    if (tempC <= TEMP_SCALE[i].at) {
      const lo = TEMP_SCALE[i - 1], hi = TEMP_SCALE[i]
      const t = (tempC - lo.at) / (hi.at - lo.at)
      return rgbHex(lerp(lo.r, hi.r, t), lerp(lo.g, hi.g, t), lerp(lo.b, hi.b, t))
    }
  }
  const last = TEMP_SCALE[TEMP_SCALE.length - 1]
  return rgbHex(last.r, last.g, last.b)
}


// ═══════════════════════════════════════════════════════════════════
// WEAR COLOR SCALE
// ═══════════════════════════════════════════════════════════════════
// Input: wear percentage (100% = new, 0% = worn through)
//   100-70% = compound base color (no tint)
//   70-40%  = light grey tint appearing
//   40-20%  = canvas/white showing through rubber
//   <20%    = warning red tint (worn to canvas)
//
// compound base colors: soft=#c62828, medium=#fbc02d, hard=#e0e0e0

const COMPOUND_BASE = {
  soft:   { r: 0xc6, g: 0x28, b: 0x28 },
  medium: { r: 0xfb, g: 0xc0, b: 0x2d },
  hard:   { r: 0xe0, g: 0xe0, b: 0xe0 },
}

export function tireWearColor(wearPct, compound = 'medium') {
  const base = COMPOUND_BASE[compound] || COMPOUND_BASE.medium
  const w = Math.max(0, Math.min(100, wearPct))

  if (w >= 70) {
    // Full rubber — compound base color
    return rgbHex(base.r, base.g, base.b)
  }
  if (w >= 40) {
    // Grey tint appearing — blend toward #999
    const t = 1 - (w - 40) / 30
    return rgbHex(lerp(base.r, 0x99, t), lerp(base.g, 0x99, t), lerp(base.b, 0x99, t))
  }
  if (w >= 20) {
    // Canvas white showing through — blend from grey toward white
    const t = 1 - (w - 20) / 20
    return rgbHex(lerp(0x99, 0xdd, t), lerp(0x99, 0xdd, t), lerp(0x99, 0xdd, t))
  }
  // Below 20% — warning red
  const t = 1 - w / 20
  return rgbHex(lerp(0xdd, 0xff, t), lerp(0xdd, 0x22, t), lerp(0xdd, 0x22, t))
}


// ═══════════════════════════════════════════════════════════════════
// PRESSURE HELPERS
// ═══════════════════════════════════════════════════════════════════
// Optimal: 26-28 psi. Below 24 or above 30 = warning.

const PSI_OPT_LO = 26
const PSI_OPT_HI = 28
const PSI_WARN_LO = 24
const PSI_WARN_HI = 30

export function pressureStatus(psi) {
  if (psi >= PSI_OPT_LO && psi <= PSI_OPT_HI) return 'optimal'
  if (psi >= PSI_WARN_LO && psi <= PSI_WARN_HI) return 'warning'
  return 'critical'
}

export function pressureColor(psi) {
  const s = pressureStatus(psi)
  if (s === 'optimal')  return '#00e676'
  if (s === 'warning')  return '#ffcc00'
  return '#ff3d00'
}

// Fraction for arc gauge (0-1 mapped to 20-35 psi range)
export function pressureFraction(psi) {
  return Math.max(0, Math.min(1, (psi - 20) / 15))
}


// ═══════════════════════════════════════════════════════════════════
// COMPOUND DISPLAY
// ═══════════════════════════════════════════════════════════════════

export const COMPOUND_LABEL = { soft: 'S', medium: 'M', hard: 'H' }
export const COMPOUND_COLOR = { soft: '#c62828', medium: '#fbc02d', hard: '#e0e0e0' }
