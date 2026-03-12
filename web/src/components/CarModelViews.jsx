import { memo, useRef, useState } from 'react'
import CarModel from './CarModel'

// ═══════════════════════════════════════════════════════════════════
// Multi-view car model panel with TOP, FRONT, SIDE, REAR tabs.
// TOP = existing CarModel. Others are simplified wireframe projections
// using the same node-beam data with Z-height coordinates.
// ═══════════════════════════════════════════════════════════════════

// Z-height assignments for nodes (ground=0, higher=up)
// F1 car: ground contact at Z=0, hub center ~16, chassis floor ~12,
// cockpit ~30, wing elements vary
const NODE_Z = {}

function setZ(name, z) { NODE_Z[name] = z }

// Chassis spine — monocoque cross-section
setZ('ch.nose',  22)
setZ('ch.fbL',   18)
setZ('ch.fbR',   18)
setZ('ch.cpL',   16)
setZ('ch.cpR',   16)
setZ('ch.rbL',   18)
setZ('ch.rbR',   18)
setZ('ch.tail',  20)

// Hub centers at wheel center height
const HUB_Z = 16
for (const p of ['fl', 'fr', 'rl', 'rr']) {
  setZ(`${p}.hub`, HUB_Z)
  setZ(`${p}.upr`, HUB_Z)
  setZ(`${p}.uwi`, HUB_Z + 6)  // upper wishbone inner — higher
  setZ(`${p}.uwo`, HUB_Z + 4)  // upper wishbone outer
  setZ(`${p}.lwi`, HUB_Z - 6)  // lower wishbone inner — lower
  setZ(`${p}.lwo`, HUB_Z - 4)  // lower wishbone outer
  setZ(`${p}.pri`, HUB_Z + 2)  // pushrod inner
  setZ(`${p}.pro`, HUB_Z - 2)  // pushrod outer
  // Wheel/tire nodes at hub height ± tire radius
  setZ(`${p}.rim.t`, HUB_Z + 5)
  setZ(`${p}.rim.b`, HUB_Z - 5)
  setZ(`${p}.tire.ot`, HUB_Z + 9)
  setZ(`${p}.tire.ob`, HUB_Z - 9)
  setZ(`${p}.tire.it`, HUB_Z + 9)
  setZ(`${p}.tire.ib`, HUB_Z - 9)
}

// Front wing — low and forward
for (const k of ['fw.lt','fw.rt','fw.cL','fw.cR']) setZ(k, 8)
for (const k of ['fw.csL','fw.csR']) setZ(k, 10)
for (const k of ['fw.lepT','fw.repT']) setZ(k, 10)
for (const k of ['fw.lepB','fw.repB']) setZ(k, 6)
setZ('fw.aL', 14); setZ('fw.aR', 14)

// Rear wing — high
for (const k of ['rw.lt','rw.rt','rw.cL','rw.cR']) setZ(k, 42)
for (const k of ['rw.lepT','rw.repT']) setZ(k, 38)
for (const k of ['rw.lepB','rw.repB']) setZ(k, 46)
setZ('rw.piL', 42); setZ('rw.piR', 42)
setZ('rw.baL', 22); setZ('rw.baR', 22)

// Sidepods — mid height
for (const k of ['lsp.ft','lsp.fb','rsp.ft','rsp.fb']) setZ(k, 16)
for (const k of ['lsp.rt','lsp.rb','rsp.rt','rsp.rb']) setZ(k, 14)

// Import node/beam data from CarModel module scope
// Since these are not exported, we replicate the minimal structure needed
// by reading the shared NODES/BEAMS that CarModel defines at module scope.
// Instead, we use CarModel's exported solve approach and build our own
// minimal node set for the alternate views.

// Minimal node rest positions (X=lateral, Y=longitudinal from CarModel)
const NODE_REST = {
  'ch.nose': [0, -48], 'ch.fbL': [-6, -32], 'ch.fbR': [6, -32],
  'ch.cpL': [-8, -5], 'ch.cpR': [8, -5],
  'ch.rbL': [-6, 25], 'ch.rbR': [6, 25], 'ch.tail': [0, 33],
  'fl.hub': [-20, -28], 'fr.hub': [20, -28], 'rl.hub': [-20, 35], 'rr.hub': [20, 35],
  'fl.uwi': [-7, -31], 'fl.lwi': [-7, -25], 'fl.uwo': [-16, -31], 'fl.lwo': [-16, -25],
  'fl.upr': [-18, -28], 'fl.pri': [-7, -27], 'fl.pro': [-17, -26],
  'fr.uwi': [7, -31], 'fr.lwi': [7, -25], 'fr.uwo': [16, -31], 'fr.lwo': [16, -25],
  'fr.upr': [18, -28], 'fr.pri': [7, -27], 'fr.pro': [17, -26],
  'rl.uwi': [-7, 38], 'rl.lwi': [-7, 32], 'rl.uwo': [-16, 38], 'rl.lwo': [-16, 32],
  'rl.upr': [-18, 35], 'rl.pri': [-7, 36], 'rl.pro': [-17, 37],
  'rr.uwi': [7, 38], 'rr.lwi': [7, 32], 'rr.uwo': [16, 38], 'rr.lwo': [16, 32],
  'rr.upr': [18, 35], 'rr.pri': [7, 36], 'rr.pro': [17, 37],
  // Tires
  'fl.tire.ot': [-24.5, -37], 'fl.tire.ob': [-24.5, -19], 'fl.tire.it': [-15.5, -37], 'fl.tire.ib': [-15.5, -19],
  'fr.tire.ot': [24.5, -37], 'fr.tire.ob': [24.5, -19], 'fr.tire.it': [15.5, -37], 'fr.tire.ib': [15.5, -19],
  'rl.tire.ot': [-25.5, 26], 'rl.tire.ob': [-25.5, 44], 'rl.tire.it': [-14.5, 26], 'rl.tire.ib': [-14.5, 44],
  'rr.tire.ot': [25.5, 26], 'rr.tire.ob': [25.5, 44], 'rr.tire.it': [14.5, 26], 'rr.tire.ib': [14.5, 44],
  'fl.rim.t': [-20, -33], 'fl.rim.b': [-20, -23], 'fr.rim.t': [20, -33], 'fr.rim.b': [20, -23],
  'rl.rim.t': [-20, 30], 'rl.rim.b': [-20, 40], 'rr.rim.t': [20, 30], 'rr.rim.b': [20, 40],
  // Wings
  'fw.lt': [-22, -53], 'fw.rt': [22, -53], 'fw.cL': [-4, -53], 'fw.cR': [4, -53],
  'fw.csL': [-19, -50], 'fw.csR': [19, -50],
  'fw.lepT': [-25, -58], 'fw.lepB': [-25, -40], 'fw.repT': [25, -58], 'fw.repB': [25, -40],
  'fw.aL': [-2, -49], 'fw.aR': [2, -49],
  'rw.lt': [-17, 43], 'rw.rt': [17, 43], 'rw.cL': [-4, 43], 'rw.cR': [4, 43],
  'rw.lepT': [-21, 32], 'rw.lepB': [-21, 53], 'rw.repT': [21, 32], 'rw.repB': [21, 53],
  'rw.piL': [-4, 43], 'rw.piR': [4, 43], 'rw.baL': [-4, 34], 'rw.baR': [4, 34],
  // Sidepods
  'lsp.ft': [-8, -3], 'lsp.fb': [-14, -1], 'lsp.rt': [-8, 20], 'lsp.rb': [-14, 18],
  'rsp.ft': [8, -3], 'rsp.fb': [14, -1], 'rsp.rt': [8, 20], 'rsp.rb': [14, 18],
}

// Beam connections (subset for wireframe views)
const BEAM_DEFS = [
  // Chassis
  ['ch.nose','ch.fbL','chassis'], ['ch.fbL','ch.cpL','chassis'], ['ch.cpL','ch.rbL','chassis'],
  ['ch.rbL','ch.tail','chassis'], ['ch.tail','ch.rbR','chassis'], ['ch.rbR','ch.cpR','chassis'],
  ['ch.cpR','ch.fbR','chassis'], ['ch.fbR','ch.nose','chassis'],
  // Suspension
  ...['fl','fr','rl','rr'].flatMap(p => [
    [`${p}.uwi`, `${p}.uwo`, 'susp'], [`${p}.lwi`, `${p}.lwo`, 'susp'],
    [`${p}.pri`, `${p}.pro`, 'susp'], [`${p}.uwo`, `${p}.upr`, 'upright'],
    [`${p}.lwo`, `${p}.upr`, 'upright'], [`${p}.upr`, `${p}.hub`, 'hub_link'],
  ]),
  // Tires (outline)
  ...['fl','fr','rl','rr'].flatMap(p => [
    [`${p}.tire.ot`, `${p}.tire.ob`, 'tire'], [`${p}.tire.it`, `${p}.tire.ib`, 'tire'],
    [`${p}.tire.ot`, `${p}.tire.it`, 'tire'], [`${p}.tire.ob`, `${p}.tire.ib`, 'tire'],
  ]),
  // Front wing
  ['fw.lt','fw.rt','wing'], ['fw.csL','fw.csR','wing'],
  ['fw.lepT','fw.lepB','wing'], ['fw.repT','fw.repB','wing'],
  ['fw.aL','ch.nose','wing'], ['fw.aR','ch.nose','wing'],
  // Rear wing
  ['rw.lt','rw.rt','wing'], ['rw.lepT','rw.lepB','wing'], ['rw.repT','rw.repB','wing'],
  ['rw.piL','rw.baL','wing'], ['rw.piR','rw.baR','wing'],
  ['rw.baL','ch.tail','wing'], ['rw.baR','ch.tail','wing'],
  // Sidepods
  ['lsp.ft','lsp.fb','sidepod'], ['lsp.fb','lsp.rb','sidepod'],
  ['lsp.rb','lsp.rt','sidepod'], ['lsp.rt','lsp.ft','sidepod'],
  ['rsp.ft','rsp.fb','sidepod'], ['rsp.fb','rsp.rb','sidepod'],
  ['rsp.rb','rsp.rt','sidepod'], ['rsp.rt','rsp.ft','sidepod'],
]

const BEAM_STYLE = {
  chassis: { w: 0.9, color: '#555', op: 0.9 },
  susp:    { w: 0.7, color: '#888', op: 0.7 },
  upright: { w: 0.7, color: '#ccc', op: 0.6 },
  hub_link:{ w: 0.5, color: '#888', op: 0.5 },
  tire:    { w: 0.6, color: '#666', op: 0.5 },
  wing:    { w: 0.8, color: '#888', op: 0.6 },
  sidepod: { w: 0.5, color: '#888', op: 0.4 },
}

const MAX_SUSP_MM = 30
const HUB_DY = 1.4
const HUB_DX = 1.4
const LERP_K = 0.15
const STEER_GAIN = 12.5
const STEER_MAX = 25

// Solve 3D positions from frame data
function solve3D(ride, steerDeg) {
  const pos = {}
  for (const k in NODE_REST) {
    const [x, y] = NODE_REST[k]
    pos[k] = { x, y, z: NODE_Z[k] || 16 }
  }

  const corners = [
    { id: 'FL', p: 'fl', side: 'L', steers: true },
    { id: 'FR', p: 'fr', side: 'R', steers: true },
    { id: 'RL', p: 'rl', side: 'L', steers: false },
    { id: 'RR', p: 'rr', side: 'R', steers: false },
  ]

  for (const { id, p, side, steers } of corners) {
    const rh = ride[id]
    const inward = side === 'L' ? 1 : -1
    const dxSusp = rh * HUB_DX * inward
    const dySusp = rh * -HUB_DY
    // Z displacement from suspension: compressed = lower
    const dzSusp = -(rh - 0.5) * 4 // ±2 units from neutral

    // Hub, upright: full displacement
    for (const sfx of ['.hub', '.upr']) {
      const k = `${p}${sfx}`
      if (!pos[k]) continue
      pos[k].x += dxSusp
      pos[k].y += dySusp
      pos[k].z += dzSusp
    }
    // Wishbone outers
    for (const sfx of ['.uwo', '.lwo', '.pro']) {
      const k = `${p}${sfx}`
      if (!pos[k]) continue
      pos[k].x += dxSusp * 0.7
      pos[k].y += dySusp * 0.7
      pos[k].z += dzSusp * 0.7
    }

    // Steering rotation (XY plane only for front)
    if (steers && Math.abs(steerDeg) > 0.01) {
      const angle = steerDeg * (Math.PI / 180)
      const cx = pos[`${p}.upr`].x, cy = pos[`${p}.upr`].y
      const cos = Math.cos(angle), sin = Math.sin(angle)
      for (const sfx of ['.uwo', '.lwo', '.hub', '.pro']) {
        const k = `${p}${sfx}`
        if (!pos[k]) continue
        const rx = pos[k].x - cx, ry = pos[k].y - cy
        pos[k].x = cx + rx * cos - ry * sin
        pos[k].y = cy + rx * sin + ry * cos
      }
    }

    // Propagate to tire/rim child nodes
    const hubKey = `${p}.hub`
    if (!pos[hubKey]) continue
    const hubRestX = NODE_REST[hubKey][0], hubRestY = NODE_REST[hubKey][1]
    const hubRestZ = NODE_Z[hubKey] || HUB_Z
    for (const sfx of ['.rim.t','.rim.b','.tire.ot','.tire.ob','.tire.it','.tire.ib']) {
      const k = `${p}${sfx}`
      if (!pos[k] || !NODE_REST[k]) continue
      let offX = NODE_REST[k][0] - hubRestX
      let offY = NODE_REST[k][1] - hubRestY
      const offZ = (NODE_Z[k] || HUB_Z) - hubRestZ
      if (steers && Math.abs(steerDeg) > 0.01) {
        const angle = steerDeg * (Math.PI / 180)
        const cos = Math.cos(angle), sin = Math.sin(angle)
        const rx = offX, ry = offY
        offX = rx * cos - ry * sin
        offY = rx * sin + ry * cos
      }
      pos[k].x = pos[hubKey].x + offX
      pos[k].y = pos[hubKey].y + offY
      pos[k].z = pos[hubKey].z + offZ
    }
  }

  return pos
}

// Project 3D to 2D for a given view
// ── Alternate view projection + rendering ──
// Front: camera at -Y (looking toward +Y), project X,Z to screen
// Side:  camera at -X (looking toward +X), project Y,Z to screen
// Rear:  camera at +Y (looking toward -Y), project -X,Z to screen

function AltViewSvg({ pos3d, view }) {
  // Project all nodes to 2D screen coords + depth value
  const proj = {}
  let minD = Infinity, maxD = -Infinity
  for (const k in pos3d) {
    const { x, y, z } = pos3d[k]
    let sx, sy, d
    switch (view) {
      case 'front': sx = x;  sy = -z; d = y;  break
      case 'side':  sx = y;  sy = -z; d = x;  break
      case 'rear':  sx = -x; sy = -z; d = -y; break
      default: sx = x; sy = y; d = 0
    }
    proj[k] = { x: sx, y: sy, d }
    if (d < minD) minD = d
    if (d > maxD) maxD = d
  }
  const dRange = maxD - minD || 1

  // Depth cueing: closer=1.0 opacity, farthest=0.2
  const dOp = (k) => {
    if (!proj[k]) return 0.5
    const t = (proj[k].d - minD) / dRange
    return 0.2 + 0.8 * (1 - t)
  }

  // Front/rear views: hide nodes in the far 35% of depth range
  const dCut = minD + dRange * 0.65
  const vis = (k) => !proj[k] || view === 'side' || proj[k].d < dCut

  // Auto-fit viewBox from visible projected nodes
  let bx1 = Infinity, bx2 = -Infinity, by1 = Infinity, by2 = -Infinity
  for (const k in proj) {
    if (!vis(k)) continue
    bx1 = Math.min(bx1, proj[k].x); bx2 = Math.max(bx2, proj[k].x)
    by1 = Math.min(by1, proj[k].y); by2 = Math.max(by2, proj[k].y)
  }
  by2 = Math.max(by2, 3) // space below ground line
  const bw = (bx2 - bx1) || 60, bh = (by2 - by1) || 50
  const padX = bw * 0.12, padY = bh * 0.12
  const vbStr = `${(bx1 - padX).toFixed(1)} ${(by1 - padY).toFixed(1)} ${(bw + 2 * padX).toFixed(1)} ${(bh + 2 * padY).toFixed(1)}`

  // ── Tire circles (replace flat tire-beam outlines with round tires) ──
  const TIRE_R = 9
  const tireKeys = view === 'front' ? ['fl.hub', 'fr.hub'] :
                   view === 'rear'  ? ['rl.hub', 'rr.hub'] :
                                      ['fl.hub', 'fr.hub', 'rl.hub', 'rr.hub']
  // Paint far tires first (painter's order)
  const sortedTires = [...tireKeys].sort((a, b) => (proj[b]?.d || 0) - (proj[a]?.d || 0))

  // ── Body silhouette (side view: profile polygon with flat floor) ──
  const spineKeys = ['ch.nose', 'ch.fbL', 'ch.cpL', 'ch.rbL', 'ch.tail']
  let bodySilhouette = null
  if (view === 'side') {
    const topPts = spineKeys.map(k => proj[k]).filter(Boolean)
    if (topPts.length === spineKeys.length) {
      const floorY = -6 // Z=6 floor, ride-height gap visible to ground at y=0
      const pts = [
        ...topPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
        `${topPts[topPts.length - 1].x.toFixed(1)},${floorY}`,
        `${topPts[0].x.toFixed(1)},${floorY}`,
      ].join(' ')
      bodySilhouette = <polygon points={pts} fill="#0d0d0d" stroke="#333" strokeWidth={0.5} opacity={0.7} />
    }
  }

  // ── Monocoque cross-section (front/rear views) ──
  let monoSection = null
  if (view === 'front' || view === 'rear') {
    const lKey = view === 'front' ? 'ch.fbL' : 'ch.rbR'
    const rKey = view === 'front' ? 'ch.fbR' : 'ch.rbL'
    let L = proj[lKey], R = proj[rKey]
    if (L && R) {
      if (L.x > R.x) { const tmp = L; L = R; R = tmp }
      const floorSy = -10
      monoSection = (
        <rect x={L.x} y={L.y} width={R.x - L.x} height={floorSy - L.y}
          fill="#0d0d0d" stroke="#333" strokeWidth={0.4} opacity={0.7} rx={1} />
      )
    }
  }

  // ── Wing emphasis bars ──
  let wingElements = null
  if (view === 'front' && proj['fw.lt'] && proj['fw.rt']) {
    const op = (dOp('fw.lt') + dOp('fw.rt')) / 2
    wingElements = (
      <g>
        <line x1={proj['fw.lt'].x} y1={proj['fw.lt'].y}
              x2={proj['fw.rt'].x} y2={proj['fw.rt'].y}
          stroke="#777" strokeWidth={2} opacity={op * 0.8} strokeLinecap="round" />
        {proj['fw.csL'] && proj['fw.csR'] && (
          <line x1={proj['fw.csL'].x} y1={proj['fw.csL'].y}
                x2={proj['fw.csR'].x} y2={proj['fw.csR'].y}
            stroke="#666" strokeWidth={1.2} opacity={op * 0.6} strokeLinecap="round" />
        )}
      </g>
    )
  } else if (view === 'rear' && proj['rw.lt'] && proj['rw.rt']) {
    const op = (dOp('rw.lt') + dOp('rw.rt')) / 2
    wingElements = (
      <line x1={proj['rw.lt'].x} y1={proj['rw.lt'].y}
            x2={proj['rw.rt'].x} y2={proj['rw.rt'].y}
        stroke="#777" strokeWidth={2.5} opacity={op * 0.8} strokeLinecap="round" />
    )
  }

  return (
    <svg viewBox={vbStr} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Ground reference line */}
      <line x1={bx1 - padX} x2={bx2 + padX} y1={0} y2={0}
        stroke="#2a2a2a" strokeWidth={0.4} strokeDasharray="2,1.5" />

      {/* Body fills */}
      {bodySilhouette}
      {monoSection}

      {/* Wing bars */}
      {wingElements}

      {/* Tire circles (far-first for painter's order) */}
      {sortedTires.map(k => {
        const p = proj[k]
        if (!p) return null
        const op = dOp(k)
        return (
          <g key={`tire-${k}`}>
            <circle cx={p.x} cy={p.y} r={TIRE_R}
              fill="#111" stroke="#555" strokeWidth={0.6} opacity={op * 0.85} />
            <circle cx={p.x} cy={p.y} r={5}
              fill="none" stroke="#444" strokeWidth={0.4} opacity={op * 0.5} />
            <circle cx={p.x} cy={p.y} r={1}
              fill="#888" opacity={op * 0.7} />
          </g>
        )
      })}

      {/* Structural beams — skip 'tire' type (replaced by circles above) */}
      {BEAM_DEFS.map(([a, b, type], i) => {
        if (type === 'tire') return null
        if (!proj[a] || !proj[b]) return null
        if (!vis(a) && !vis(b)) return null
        const s = BEAM_STYLE[type] || BEAM_STYLE.chassis
        const avgOp = (dOp(a) + dOp(b)) / 2
        return (
          <line key={i} x1={proj[a].x} y1={proj[a].y} x2={proj[b].x} y2={proj[b].y}
            stroke={s.color} strokeWidth={s.w}
            opacity={s.op * avgOp} strokeLinecap="round" />
        )
      })}

      {/* Node dots (visible, depth-cued) */}
      {Object.keys(proj).filter(k => vis(k) && proj[k]).map(k => (
        <circle key={k} cx={proj[k].x} cy={proj[k].y} r={0.5}
          fill="#888" opacity={0.35 * dOp(k)} />
      ))}

      {/* View label — top-left corner with padding */}
      <text x={bx1 - padX + 3} y={by1 - padY + 5}
        fill="#444" fontSize={4} fontWeight={600}
        fontFamily="'Courier New', monospace">
        {view.toUpperCase()}
      </text>
    </svg>
  )
}

const VIEWS = ['top', 'front', 'side', 'rear']

function CarModelViews({ frame, vehicle, mode }) {
  const [activeView, setActiveView] = useState('top')
  const animRide = useRef({ FL: 0.5, FR: 0.5, RL: 0.5, RR: 0.5 })

  // Compute ride heights for alt views (same logic as CarModel)
  const susp = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const ride = animRide.current
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    const target = Math.max(0, Math.min(1, (susp[id] + MAX_SUSP_MM) / (2 * MAX_SUSP_MM)))
    ride[id] += (target - ride[id]) * LERP_K
  }

  const latG = frame?.lateral_g || 0
  const steerDeg = Math.max(-STEER_MAX, Math.min(STEER_MAX, -latG * STEER_GAIN))

  // Solve 3D positions for alt views
  const pos3d = solve3D(ride, steerDeg)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* View tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 4, flexShrink: 0 }}>
        {VIEWS.map(v => (
          <button key={v}
            onClick={() => setActiveView(v)}
            style={{
              background: activeView === v ? '#00a8a8' : '#161616',
              color: activeView === v ? '#0a0a0a' : '#666',
              border: `1px solid ${activeView === v ? '#00a8a8' : '#1e1e1e'}`,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.55rem',
              fontFamily: "'Courier New', monospace",
              fontWeight: activeView === v ? 700 : 400,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
            {v}
          </button>
        ))}
      </div>

      {/* Active view */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeView === 'top' ? (
          <CarModel frame={frame} vehicle={vehicle} mode={mode} />
        ) : (
          <AltViewSvg pos3d={pos3d} view={activeView} />
        )}
      </div>
    </div>
  )
}

export default memo(CarModelViews)
