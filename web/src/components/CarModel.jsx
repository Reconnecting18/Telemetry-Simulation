import { memo, useMemo } from 'react'
import { tempToColorSmooth, wearToColor } from '../utils/colors'

// ─── BeamNG-style Node-Beam Open-Wheel Race Car ──────────────────
// Origin (0,0) = car centre.  Car faces upward (-Y = nose).
// Every visual element is a node (point) or beam (line between nodes).
// Forces (suspension compression) displace nodes; beams follow.

const WHEEL_R = 6       // tire circle radius (SVG units)
const WHEEL_SPOKES = 8  // nodes per wheel perimeter
const MAX_VIS_DISP = 4  // SVG units at full compression
const MAX_SUSP_MM  = 30 // vehicle max suspension travel

// ── 1. Base node positions ──────────────────────────────────────
// Chassis (monocoque outline)
const CHASSIS = {
  nose_tip:  [0, -48],
  fl_ch:     [-6, -32],
  fr_ch:     [6, -32],
  cockpit_l: [-8, -5],
  cockpit_r: [8, -5],
  rl_ch:     [-6, 25],
  rr_ch:     [6, 25],
  rear_tip:  [0, 33],
}

// Front suspension — left
const FSUSP_L = {
  f_uwi_l: [-6, -31],   // upper wishbone inner (chassis pickup)
  f_uwo_l: [-14, -31],  // upper wishbone outer
  f_lwi_l: [-6, -25],   // lower wishbone inner (chassis pickup)
  f_lwo_l: [-14, -25],  // lower wishbone outer
  f_hub_l: [-19, -28],  // wheel hub centre
}
// Front suspension — right
const FSUSP_R = {
  f_uwi_r: [6, -31],
  f_uwo_r: [14, -31],
  f_lwi_r: [6, -25],
  f_lwo_r: [14, -25],
  f_hub_r: [19, -28],
}
// Rear suspension — left
const RSUSP_L = {
  r_uwi_l: [-6, 23],
  r_uwo_l: [-14, 23],
  r_lwi_l: [-6, 27],
  r_lwo_l: [-14, 27],
  r_hub_l: [-19, 25],
}
// Rear suspension — right
const RSUSP_R = {
  r_uwi_r: [6, 23],
  r_uwo_r: [14, 23],
  r_lwi_r: [6, 27],
  r_lwo_r: [14, 27],
  r_hub_r: [19, 25],
}

// Aerodynamic nodes
const AERO = {
  fw_center: [0, -52],
  fw_l_tip:  [-21, -52],
  fw_r_tip:  [21, -52],
  rw_center: [0, 38],
  rw_l_tip:  [-16, 38],
  rw_r_tip:  [16, 38],
}

// Sidepod nodes
const SIDEPOD = {
  sp_fl: [-11, -3],
  sp_rl: [-11, 18],
  sp_fr: [11, -3],
  sp_rr: [11, 18],
}

// Generate wheel perimeter nodes (8 evenly-spaced points around hub)
function genWheelNodes(hubKey, hx, hy) {
  const nodes = { [hubKey]: [hx, hy] }
  for (let i = 0; i < WHEEL_SPOKES; i++) {
    const a = (i * Math.PI * 2) / WHEEL_SPOKES
    nodes[`${hubKey}_w${i}`] = [hx + Math.cos(a) * WHEEL_R, hy + Math.sin(a) * WHEEL_R]
  }
  return nodes
}

// Assemble all base nodes into one flat map
const BASE_NODES = {
  ...CHASSIS,
  ...FSUSP_L, ...FSUSP_R,
  ...RSUSP_L, ...RSUSP_R,
  ...AERO, ...SIDEPOD,
  ...genWheelNodes('f_hub_l', -19, -28),
  ...genWheelNodes('f_hub_r', 19, -28),
  ...genWheelNodes('r_hub_l', -19, 25),
  ...genWheelNodes('r_hub_r', 19, 25),
}

// ── 2. Beam definitions ─────────────────────────────────────────
// Each beam: [nodeA, nodeB, group]
// Groups: 'chassis', 'brace', 'susp', 'wheel_rim', 'wheel_spoke', 'aero', 'sidepod'

const BEAMS = []

// Chassis outline
const CH_SEQ = ['nose_tip', 'fl_ch', 'cockpit_l', 'rl_ch', 'rear_tip', 'rr_ch', 'cockpit_r', 'fr_ch', 'nose_tip']
for (let i = 0; i < CH_SEQ.length - 1; i++) BEAMS.push([CH_SEQ[i], CH_SEQ[i + 1], 'chassis'])

// Cross-bracing (structural rigidity)
BEAMS.push(['fl_ch', 'fr_ch', 'brace'])       // front bulkhead
BEAMS.push(['rl_ch', 'rr_ch', 'brace'])       // rear bulkhead
BEAMS.push(['cockpit_l', 'cockpit_r', 'brace']) // cockpit cross
BEAMS.push(['fl_ch', 'rr_ch', 'brace'])       // diagonal
BEAMS.push(['fr_ch', 'rl_ch', 'brace'])       // diagonal
BEAMS.push(['fl_ch', 'cockpit_r', 'brace'])   // front-to-cockpit X
BEAMS.push(['fr_ch', 'cockpit_l', 'brace'])
BEAMS.push(['cockpit_l', 'rr_ch', 'brace'])   // cockpit-to-rear X
BEAMS.push(['cockpit_r', 'rl_ch', 'brace'])

// Suspension beams (double-wishbone per corner)
function addSuspBeams(uwi, uwo, lwi, lwo, hub) {
  BEAMS.push([uwi, uwo, 'susp'])  // upper wishbone
  BEAMS.push([uwo, hub, 'susp'])  // upper outer → hub
  BEAMS.push([lwi, lwo, 'susp'])  // lower wishbone
  BEAMS.push([lwo, hub, 'susp'])  // lower outer → hub
}
addSuspBeams('f_uwi_l', 'f_uwo_l', 'f_lwi_l', 'f_lwo_l', 'f_hub_l')
addSuspBeams('f_uwi_r', 'f_uwo_r', 'f_lwi_r', 'f_lwo_r', 'f_hub_r')
addSuspBeams('r_uwi_l', 'r_uwo_l', 'r_lwi_l', 'r_lwo_l', 'r_hub_l')
addSuspBeams('r_uwi_r', 'r_uwo_r', 'r_lwi_r', 'r_lwo_r', 'r_hub_r')

// Wheel beams (rim + spokes per wheel)
function addWheelBeams(hubKey) {
  for (let i = 0; i < WHEEL_SPOKES; i++) {
    const cur = `${hubKey}_w${i}`
    const nxt = `${hubKey}_w${(i + 1) % WHEEL_SPOKES}`
    BEAMS.push([cur, nxt, 'wheel_rim'])     // rim segment
    BEAMS.push([hubKey, cur, 'wheel_spoke']) // spoke
  }
}
addWheelBeams('f_hub_l')
addWheelBeams('f_hub_r')
addWheelBeams('r_hub_l')
addWheelBeams('r_hub_r')

// Aero beams
BEAMS.push(['fw_l_tip', 'fw_center', 'aero'])
BEAMS.push(['fw_center', 'fw_r_tip', 'aero'])
BEAMS.push(['fw_center', 'nose_tip', 'aero'])  // nose to front wing
BEAMS.push(['rw_l_tip', 'rw_center', 'aero'])
BEAMS.push(['rw_center', 'rw_r_tip', 'aero'])
BEAMS.push(['rw_center', 'rear_tip', 'aero'])  // tail to rear wing

// Sidepod beams
BEAMS.push(['sp_fl', 'sp_rl', 'sidepod'])      // left outline
BEAMS.push(['sp_fl', 'cockpit_l', 'sidepod'])   // attach front to chassis
BEAMS.push(['sp_rl', 'rl_ch', 'sidepod'])       // attach rear to chassis
BEAMS.push(['sp_fr', 'sp_rr', 'sidepod'])       // right outline
BEAMS.push(['sp_fr', 'cockpit_r', 'sidepod'])
BEAMS.push(['sp_rr', 'rr_ch', 'sidepod'])
// Sidepod cross-beams (rigidity)
BEAMS.push(['sp_fl', 'rl_ch', 'sidepod'])
BEAMS.push(['sp_fr', 'rr_ch', 'sidepod'])

// ── 3. Suspension displacement ──────────────────────────────────
// Maps each corner to which nodes move and by how much (fraction of hub disp)
const SUSP_MAP = {
  FL: { hub: 'f_hub_l', side: 'L', full: ['f_hub_l'], partial: ['f_uwo_l', 'f_lwo_l'] },
  FR: { hub: 'f_hub_r', side: 'R', full: ['f_hub_r'], partial: ['f_uwo_r', 'f_lwo_r'] },
  RL: { hub: 'r_hub_l', side: 'L', full: ['r_hub_l'], partial: ['r_uwo_l', 'r_lwo_l'] },
  RR: { hub: 'r_hub_r', side: 'R', full: ['r_hub_r'], partial: ['r_uwo_r', 'r_lwo_r'] },
}

function computeDisplacedNodes(suspMm) {
  const nodes = {}
  for (const k in BASE_NODES) nodes[k] = [...BASE_NODES[k]]

  for (const corner of ['FL', 'FR', 'RL', 'RR']) {
    const mm = suspMm[corner] || 0
    const { hub, side, full, partial } = SUSP_MAP[corner]
    const frac = Math.max(-1, Math.min(1, mm / MAX_SUSP_MM))
    const inward = side === 'L' ? 1 : -1
    const dx = frac * MAX_VIS_DISP * inward
    const dy = frac * -1.5

    // Hub + all wheel perimeter nodes get full displacement
    for (const nk of full) {
      nodes[nk][0] += dx
      nodes[nk][1] += dy
    }
    // Wheel perimeter nodes follow hub fully
    for (let i = 0; i < WHEEL_SPOKES; i++) {
      const wk = `${hub}_w${i}`
      nodes[wk][0] += dx
      nodes[wk][1] += dy
    }
    // Wishbone outer nodes get 70% displacement (arc motion)
    for (const nk of partial) {
      nodes[nk][0] += dx * 0.7
      nodes[nk][1] += dy * 0.7
    }
  }
  return nodes
}

// ── 4. Beam style lookup ────────────────────────────────────────
const BEAM_STYLE = {
  chassis:     { stroke: '#444',    width: 1.0,  opacity: 0.9  },
  brace:       { stroke: '#282828', width: 0.4,  opacity: 0.35 },
  susp:        { stroke: '#e10600', width: 0.8,  opacity: 0.65 },
  wheel_rim:   { stroke: null,      width: 1.2,  opacity: 0.9  }, // colored per-tire
  wheel_spoke: { stroke: null,      width: 0.4,  opacity: 0.35 },
  aero:        { stroke: '#888',    width: 1.4,  opacity: 0.8  },
  sidepod:     { stroke: '#555',    width: 0.8,  opacity: 0.5  },
}

// ── 5. Identify which hub each wheel beam belongs to ────────────
const HUB_FOR_CORNER = { f_hub_l: 'FL', f_hub_r: 'FR', r_hub_l: 'RL', r_hub_r: 'RR' }
const HUBS = Object.keys(HUB_FOR_CORNER)

function hubForBeam(a, b) {
  for (const h of HUBS) {
    if (a === h || a.startsWith(h + '_w') || b === h || b.startsWith(h + '_w'))
      return HUB_FOR_CORNER[h]
  }
  return null
}

// Pre-compute which corner each wheel beam belongs to (avoids per-frame string ops)
const BEAM_CORNER = BEAMS.map(([a, b, g]) =>
  (g === 'wheel_rim' || g === 'wheel_spoke') ? hubForBeam(a, b) : null
)

// ── Rendering ───────────────────────────────────────────────────
function CarModel({ frame, vehicle, mode }) {
  const opt = vehicle?.tire_optimal_temp_C || 85
  const ovr = vehicle?.tire_overheat_temp_C || 115

  const nodes = useMemo(() => {
    const s = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
    return computeDisplacedNodes(s)
  }, [frame?.suspension_mm?.FL, frame?.suspension_mm?.FR,
      frame?.suspension_mm?.RL, frame?.suspension_mm?.RR])

  if (!frame) return null

  // Per-corner tire colors
  const tireColor = {}
  const tireLabel = {}
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    const temp = frame.tire_temp_C?.[id] || 25
    const wear = frame.tire_wear?.[id] || 0
    if (mode === 'temp') {
      tireColor[id] = tempToColorSmooth(temp, opt, ovr)
      tireLabel[id] = { primary: `${temp.toFixed(0)}\u00B0`, secondary: `${(wear * 100).toFixed(0)}%` }
    } else {
      tireColor[id] = wearToColor(wear)
      tireLabel[id] = { primary: `${(wear * 100).toFixed(1)}%`, secondary: `${temp.toFixed(0)}\u00B0` }
    }
  }

  // Build wheel fill polygons (the 8-node tire outline, filled with tire color)
  const wheelPolygons = HUBS.map(hubKey => {
    const corner = HUB_FOR_CORNER[hubKey]
    const pts = []
    for (let i = 0; i < WHEEL_SPOKES; i++) {
      const n = nodes[`${hubKey}_w${i}`]
      pts.push(`${n[0]},${n[1]}`)
    }
    return { corner, hubKey, points: pts.join(' '), color: tireColor[corner] }
  })

  return (
    <svg viewBox="-35 -62 70 115" className="car-svg">
      {/* ── Wheel fill polygons (behind everything) ── */}
      {wheelPolygons.map(({ corner, points, color }) => (
        <polygon key={`wf-${corner}`} points={points}
          fill={color} opacity={0.85} />
      ))}

      {/* ── All beams ── */}
      {BEAMS.map(([a, b, group], i) => {
        const na = nodes[a], nb = nodes[b]
        if (!na || !nb) return null
        const style = BEAM_STYLE[group]
        const corner = BEAM_CORNER[i]
        const stroke = style.stroke || (corner ? tireColor[corner] : '#666')
        return (
          <line key={i}
            x1={na[0]} y1={na[1]} x2={nb[0]} y2={nb[1]}
            stroke={stroke} strokeWidth={style.width}
            opacity={style.opacity} strokeLinecap="round" />
        )
      })}

      {/* ── Suspension pivot dots ── */}
      {['f_uwi_l','f_lwi_l','f_uwi_r','f_lwi_r','r_uwi_l','r_lwi_l','r_uwi_r','r_lwi_r'].map(k => (
        <circle key={k} cx={nodes[k][0]} cy={nodes[k][1]} r={0.9}
          fill="#e10600" opacity={0.5} />
      ))}
      {['f_uwo_l','f_lwo_l','f_uwo_r','f_lwo_r','r_uwo_l','r_lwo_l','r_uwo_r','r_lwo_r'].map(k => (
        <circle key={k} cx={nodes[k][0]} cy={nodes[k][1]} r={0.7}
          fill="#c44" opacity={0.4} />
      ))}

      {/* ── Hub centre dots ── */}
      {HUBS.map(h => (
        <circle key={h} cx={nodes[h][0]} cy={nodes[h][1]} r={1.2}
          fill="#222" stroke="#444" strokeWidth={0.3} />
      ))}

      {/* ── Corner labels + values ── */}
      {HUBS.map(h => {
        const corner = HUB_FOR_CORNER[h]
        const [hx, hy] = nodes[h]
        const { primary, secondary } = tireLabel[corner]
        return (
          <g key={`label-${corner}`}>
            <text x={hx} y={hy - WHEEL_R - 2.5} fill="#666" fontSize={4.5}
              textAnchor="middle" fontFamily="monospace">{corner}</text>
            <text x={hx} y={hy + 1} fill="#000" fontSize={5.5}
              textAnchor="middle" fontFamily="monospace" fontWeight="700">{primary}</text>
            <text x={hx} y={hy + 6} fill="rgba(0,0,0,0.45)" fontSize={4}
              textAnchor="middle" fontFamily="monospace">{secondary}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default memo(CarModel)
