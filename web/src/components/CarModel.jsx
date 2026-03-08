import { memo, useMemo } from 'react'
import { tempToColorSmooth, wearToColor } from '../utils/colors'

// ─── Node-Edge Open-Wheel Race Car (top-down) ───────────────────
// ViewBox: 0 0 160 200   Car centred at (80, 100)
// All geometry defined as named nodes; edges connect them.
// Suspension hubs move inward+forward when compressed.

const CX = 80, CY = 100

// ── Static body nodes ──────────────────────────────────────────
const MONO = {
  nose:     [CX,     CY - 47],
  noseL:    [CX - 4, CY - 43],
  noseR:    [CX + 4, CY - 43],
  fBulkL:   [CX - 6, CY - 30],
  fBulkR:   [CX + 6, CY - 30],
  cockpitL: [CX - 7, CY - 8],
  cockpitR: [CX + 7, CY - 8],
  midL:     [CX - 7, CY + 5],
  midR:     [CX + 7, CY + 5],
  rBulkL:   [CX - 6, CY + 22],
  rBulkR:   [CX + 6, CY + 22],
  tailL:    [CX - 5, CY + 32],
  tailR:    [CX + 5, CY + 32],
}

const FRONT_WING = {
  mainL: [CX - 20, CY - 48],
  mainR: [CX + 20, CY - 48],
  flapL: [CX - 18, CY - 51],
  flapR: [CX + 18, CY - 51],
  epLT:  [CX - 20, CY - 53],
  epLB:  [CX - 20, CY - 46],
  epRT:  [CX + 20, CY - 53],
  epRB:  [CX + 20, CY - 46],
}

const REAR_WING = {
  mainL: [CX - 16, CY + 38],
  mainR: [CX + 16, CY + 38],
  flapL: [CX - 14, CY + 35],
  flapR: [CX + 14, CY + 35],
  epLT:  [CX - 16, CY + 34],
  epLB:  [CX - 16, CY + 41],
  epRT:  [CX + 16, CY + 34],
  epRB:  [CX + 16, CY + 41],
}

const SIDEPOD = {
  lFront: [CX - 7,  CY - 8],
  lPeak:  [CX - 14, CY + 2],
  lRear:  [CX - 7,  CY + 18],
  rFront: [CX + 7,  CY - 8],
  rPeak:  [CX + 14, CY + 2],
  rRear:  [CX + 7,  CY + 18],
}

// ── Wheel assemblies (base positions, before suspension offset) ─
// Each wheel: { chassis, wishboneA, wishboneB, hub }
//   chassis  = pickup on monocoque edge (fixed)
//   wishboneA/B = upper/lower wishbone midpoints (move with hub)
//   hub      = wheel centre (displaced by suspension)
const WHEEL_BASE = {
  FL: {
    chassis:   [CX - 6,  CY - 28],
    wishboneA: [CX - 12, CY - 31],
    wishboneB: [CX - 12, CY - 25],
    hub:       [CX - 19, CY - 28],
  },
  FR: {
    chassis:   [CX + 6,  CY - 28],
    wishboneA: [CX + 12, CY - 31],
    wishboneB: [CX + 12, CY - 25],
    hub:       [CX + 19, CY - 28],
  },
  RL: {
    chassis:   [CX - 6,  CY + 25],
    wishboneA: [CX - 12, CY + 22],
    wishboneB: [CX - 12, CY + 28],
    hub:       [CX - 19, CY + 25],
  },
  RR: {
    chassis:   [CX + 6,  CY + 25],
    wishboneA: [CX + 12, CY + 22],
    wishboneB: [CX + 12, CY + 28],
    hub:       [CX + 19, CY + 25],
  },
}

// Tire dimensions around hub
const TIRE_W = 10, TIRE_H = 18, RIM_R = 3.5

// Suspension: max_travel_mm maps to this many SVG units of hub displacement
const MAX_VIS_DISP = 4  // SVG units at full compression
const MAX_SUSP_MM  = 30 // vehicle suspension travel (mm)

// Compute displaced wheel nodes from suspension_mm value
function displaceWheel(base, suspMm, side) {
  // suspMm > 0 = compressed: hub moves inward (toward CX) and slightly forward (-Y)
  // suspMm < 0 = extended:   hub moves outward and slightly back
  const frac = Math.max(-1, Math.min(1, suspMm / MAX_SUSP_MM))
  const inward = side === 'L' ? 1 : -1  // +X = inward for left, -X for right
  const dx = frac * MAX_VIS_DISP * inward
  const dy = frac * -1.5  // slight forward shift on compression

  const hub = [base.hub[0] + dx, base.hub[1] + dy]
  // Wishbones interpolate: they move ~60% of hub displacement
  const wf = 0.6
  const wishA = [base.wishboneA[0] + dx * wf, base.wishboneA[1] + dy * wf]
  const wishB = [base.wishboneB[0] + dx * wf, base.wishboneB[1] + dy * wf]
  return { chassis: base.chassis, wishboneA: wishA, wishboneB: wishB, hub }
}

function pt(node) { return `${node[0]},${node[1]}` }

// ── Rendering ──────────────────────────────────────────────────
function CarModel({ frame, vehicle, mode }) {
  const opt = vehicle?.tire_optimal_temp_C || 85
  const ovr = vehicle?.tire_overheat_temp_C || 115

  // Compute displaced wheel positions
  const wheels = useMemo(() => {
    const s = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
    return {
      FL: displaceWheel(WHEEL_BASE.FL, s.FL, 'L'),
      FR: displaceWheel(WHEEL_BASE.FR, s.FR, 'R'),
      RL: displaceWheel(WHEEL_BASE.RL, s.RL, 'L'),
      RR: displaceWheel(WHEEL_BASE.RR, s.RR, 'R'),
    }
  }, [frame?.suspension_mm?.FL, frame?.suspension_mm?.FR,
      frame?.suspension_mm?.RL, frame?.suspension_mm?.RR])

  if (!frame) return null

  // Monocoque path
  const monoPath = [
    `M${pt(MONO.nose)}`,
    `L${pt(MONO.noseL)}`, `L${pt(MONO.fBulkL)}`,
    `L${pt(MONO.cockpitL)}`, `L${pt(MONO.midL)}`,
    `L${pt(MONO.rBulkL)}`, `L${pt(MONO.tailL)}`,
    `L${pt(MONO.tailR)}`,
    `L${pt(MONO.rBulkR)}`, `L${pt(MONO.midR)}`,
    `L${pt(MONO.cockpitR)}`, `L${pt(MONO.fBulkR)}`,
    `L${pt(MONO.noseR)}`, 'Z',
  ].join(' ')

  // Sidepod paths
  const sideL = `M${pt(SIDEPOD.lFront)} Q${pt(SIDEPOD.lPeak)} ${pt(SIDEPOD.lRear)}`
  const sideR = `M${pt(SIDEPOD.rFront)} Q${pt(SIDEPOD.rPeak)} ${pt(SIDEPOD.rRear)}`

  return (
    <svg viewBox="0 0 160 200" className="car-svg">
      {/* ── Front wing ── */}
      <line x1={FRONT_WING.mainL[0]} y1={FRONT_WING.mainL[1]}
            x2={FRONT_WING.mainR[0]} y2={FRONT_WING.mainR[1]}
            stroke="#888" strokeWidth={1.8} />
      <line x1={FRONT_WING.flapL[0]} y1={FRONT_WING.flapL[1]}
            x2={FRONT_WING.flapR[0]} y2={FRONT_WING.flapR[1]}
            stroke="#666" strokeWidth={1} />
      {/* Endplates */}
      <line x1={FRONT_WING.epLT[0]} y1={FRONT_WING.epLT[1]}
            x2={FRONT_WING.epLB[0]} y2={FRONT_WING.epLB[1]}
            stroke="#888" strokeWidth={1.4} />
      <line x1={FRONT_WING.epRT[0]} y1={FRONT_WING.epRT[1]}
            x2={FRONT_WING.epRB[0]} y2={FRONT_WING.epRB[1]}
            stroke="#888" strokeWidth={1.4} />

      {/* ── Nose cone connector ── */}
      <line x1={CX} y1={MONO.nose[1]} x2={CX} y2={FRONT_WING.mainL[1]}
            stroke="#555" strokeWidth={1} />

      {/* ── Monocoque ── */}
      <path d={monoPath} fill="#151515" stroke="#444" strokeWidth={1} />
      {/* Centre line */}
      <line x1={CX} y1={MONO.nose[1] + 4} x2={CX} y2={MONO.tailL[1] - 2}
            stroke="#252525" strokeWidth={0.5} strokeDasharray="2 1.5" />

      {/* ── Sidepods ── */}
      <path d={sideL} fill="none" stroke="#555" strokeWidth={2.5} strokeLinecap="round" />
      <path d={sideR} fill="none" stroke="#555" strokeWidth={2.5} strokeLinecap="round" />

      {/* ── Rear wing ── */}
      <line x1={REAR_WING.mainL[0]} y1={REAR_WING.mainL[1]}
            x2={REAR_WING.mainR[0]} y2={REAR_WING.mainR[1]}
            stroke="#888" strokeWidth={2} />
      <line x1={REAR_WING.flapL[0]} y1={REAR_WING.flapL[1]}
            x2={REAR_WING.flapR[0]} y2={REAR_WING.flapR[1]}
            stroke="#666" strokeWidth={1} />
      <line x1={REAR_WING.epLT[0]} y1={REAR_WING.epLT[1]}
            x2={REAR_WING.epLB[0]} y2={REAR_WING.epLB[1]}
            stroke="#888" strokeWidth={1.4} />
      <line x1={REAR_WING.epRT[0]} y1={REAR_WING.epRT[1]}
            x2={REAR_WING.epRB[0]} y2={REAR_WING.epRB[1]}
            stroke="#888" strokeWidth={1.4} />

      {/* ── Tail connector ── */}
      <line x1={CX} y1={MONO.tailL[1]} x2={CX} y2={REAR_WING.mainL[1]}
            stroke="#555" strokeWidth={1} />

      {/* ── Wheel assemblies + suspension ── */}
      {['FL', 'FR', 'RL', 'RR'].map(id => {
        const w = wheels[id]
        const temp = frame.tire_temp_C?.[id] || 25
        const wear = frame.tire_wear?.[id] || 0

        let tireFill, primary, secondary
        if (mode === 'temp') {
          tireFill = tempToColorSmooth(temp, opt, ovr)
          primary = `${temp.toFixed(0)}\u00B0`
          secondary = `${(wear * 100).toFixed(0)}%`
        } else {
          tireFill = wearToColor(wear)
          primary = `${(wear * 100).toFixed(1)}%`
          secondary = `${temp.toFixed(0)}\u00B0`
        }

        const [hx, hy] = w.hub
        const tireX = hx - TIRE_W / 2
        const tireY = hy - TIRE_H / 2

        return (
          <g key={id}>
            {/* Suspension wishbones: chassis → wishbone → hub */}
            <line x1={w.chassis[0]} y1={w.chassis[1]}
                  x2={w.wishboneA[0]} y2={w.wishboneA[1]}
                  stroke="#e10600" strokeWidth={0.7} opacity={0.7} />
            <line x1={w.wishboneA[0]} y1={w.wishboneA[1]}
                  x2={hx} y2={hy}
                  stroke="#e10600" strokeWidth={0.7} opacity={0.7} />
            <line x1={w.chassis[0]} y1={w.chassis[1]}
                  x2={w.wishboneB[0]} y2={w.wishboneB[1]}
                  stroke="#e10600" strokeWidth={0.7} opacity={0.5} />
            <line x1={w.wishboneB[0]} y1={w.wishboneB[1]}
                  x2={hx} y2={hy}
                  stroke="#e10600" strokeWidth={0.7} opacity={0.5} />

            {/* Wishbone pivot dots */}
            <circle cx={w.chassis[0]} cy={w.chassis[1]} r={1.2}
                    fill="#e10600" opacity={0.6} />
            <circle cx={w.wishboneA[0]} cy={w.wishboneA[1]} r={0.9}
                    fill="#c44" opacity={0.5} />
            <circle cx={w.wishboneB[0]} cy={w.wishboneB[1]} r={0.9}
                    fill="#c44" opacity={0.5} />

            {/* Tire */}
            <rect x={tireX} y={tireY} width={TIRE_W} height={TIRE_H} rx={3}
                  fill={tireFill} opacity={0.9} />
            <rect x={tireX} y={tireY} width={TIRE_W} height={TIRE_H} rx={3}
                  fill="none" stroke="#000" strokeWidth={0.6} opacity={0.4} />

            {/* Rim circle */}
            <circle cx={hx} cy={hy} r={RIM_R}
                    fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />

            {/* Hub dot */}
            <circle cx={hx} cy={hy} r={1} fill="#333" />

            {/* Corner label */}
            <text x={hx} y={tireY - 3} fill="#666" fontSize={6}
                  textAnchor="middle" fontFamily="monospace">{id}</text>

            {/* Primary value */}
            <text x={hx} y={hy + 1.5} fill="#000" fontSize={8}
                  textAnchor="middle" fontFamily="monospace" fontWeight="700">
              {primary}
            </text>
            {/* Secondary value */}
            <text x={hx} y={hy + 9} fill="rgba(0,0,0,0.5)" fontSize={6}
                  textAnchor="middle" fontFamily="monospace">
              {secondary}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default memo(CarModel)
