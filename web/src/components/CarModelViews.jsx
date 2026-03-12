import { memo, useState } from 'react'
import CarModel from './CarModel'
import { tempToColorSmooth } from '../utils/colors'

// ═══════════════════════════════════════════════════════════════════
// Multi-view car model panel with TOP, FRONT, SIDE, REAR tabs.
// TOP = existing CarModel (top-down animated wireframe).
// FRONT/SIDE/REAR = orthographic projections of a clean open-wheel
// formula car node set with accurate F3/Formula Ford proportions.
// ═══════════════════════════════════════════════════════════════════

// ── 3D Node definitions ──
// Coordinate system: X = lateral (+ right), Y = height (+ up), Z = longitudinal (+ forward)
// All units are abstract but proportionally accurate.

const NODES = {
  // Chassis spine (centerline)
  'ch.nose':    { x: 0, y: 0, z: 120 },
  'ch.fbulk':   { x: 0, y: 0, z: 80 },
  'ch.ckF':     { x: 0, y: 8, z: 30 },
  'ch.ckR':     { x: 0, y: 12, z: -10 },
  'ch.engF':    { x: 0, y: 10, z: -20 },
  'ch.engR':    { x: 0, y: 8, z: -70 },
  'ch.gbox':    { x: 0, y: 6, z: -90 },
  'ch.crash':   { x: 0, y: 4, z: -110 },

  // Front axle (Z=75)
  'fa.wheelL':  { x: -70, y: 10, z: 75 },
  'fa.wheelR':  { x: 70, y: 10, z: 75 },
  'fa.tireOL':  { x: -85, y: 10, z: 75 },
  'fa.tireOR':  { x: 85, y: 10, z: 75 },
  'fa.uwiL':    { x: -25, y: 18, z: 75 },
  'fa.uwiR':    { x: 25, y: 18, z: 75 },
  'fa.uwoL':    { x: -65, y: 18, z: 75 },
  'fa.uwoR':    { x: 65, y: 18, z: 75 },
  'fa.lwiL':    { x: -22, y: 4, z: 75 },
  'fa.lwiR':    { x: 22, y: 4, z: 75 },
  'fa.lwoL':    { x: -65, y: 4, z: 75 },
  'fa.lwoR':    { x: 65, y: 4, z: 75 },
  'fa.pushL':   { x: -45, y: 8, z: 75 },
  'fa.pushR':   { x: 45, y: 8, z: 75 },

  // Rear axle (Z=-90)
  'ra.wheelL':  { x: -75, y: 12, z: -90 },
  'ra.wheelR':  { x: 75, y: 12, z: -90 },
  'ra.tireOL':  { x: -95, y: 12, z: -90 },
  'ra.tireOR':  { x: 95, y: 12, z: -90 },
  'ra.uwiL':    { x: -20, y: 20, z: -90 },
  'ra.uwiR':    { x: 20, y: 20, z: -90 },
  'ra.uwoL':    { x: -70, y: 20, z: -90 },
  'ra.uwoR':    { x: 70, y: 20, z: -90 },
  'ra.lwiL':    { x: -18, y: 4, z: -90 },
  'ra.lwiR':    { x: 18, y: 4, z: -90 },
  'ra.lwoL':    { x: -70, y: 4, z: -90 },
  'ra.lwoR':    { x: 70, y: 4, z: -90 },

  // Front wing (Z=115)
  'fw.mpL':     { x: -110, y: 4, z: 115 },
  'fw.mpR':     { x: 110, y: 4, z: 115 },
  'fw.mcL':     { x: -40, y: 4, z: 118 },
  'fw.mcR':     { x: 40, y: 4, z: 118 },
  'fw.epLT':    { x: -110, y: 12, z: 115 },
  'fw.epLB':    { x: -110, y: 2, z: 115 },
  'fw.epRT':    { x: 110, y: 12, z: 115 },
  'fw.epRB':    { x: 110, y: 2, z: 115 },

  // Rear wing (Z=-95)
  'rw.mpL':     { x: -70, y: 55, z: -95 },
  'rw.mpR':     { x: 70, y: 55, z: -95 },
  'rw.pilLT':   { x: -40, y: 55, z: -90 },
  'rw.pilLB':   { x: -40, y: 20, z: -90 },
  'rw.pilRT':   { x: 40, y: 55, z: -90 },
  'rw.pilRB':   { x: 40, y: 20, z: -90 },
  'rw.epLT':    { x: -70, y: 55, z: -95 },
  'rw.epLB':    { x: -70, y: 30, z: -95 },
  'rw.epRT':    { x: 70, y: 55, z: -95 },
  'rw.epRB':    { x: 70, y: 30, z: -95 },

  // Roll hoop (Z=10)
  'rh.top':     { x: 0, y: 55, z: 10 },
  'rh.L':       { x: -18, y: 40, z: 10 },
  'rh.R':       { x: 18, y: 40, z: 10 },

  // Sidepods
  'sp.fL':      { x: -28, y: 8, z: -10 },
  'sp.rL':      { x: -28, y: 8, z: -65 },
  'sp.tL':      { x: -28, y: 20, z: -35 },
  'sp.fR':      { x: 28, y: 8, z: -10 },
  'sp.rR':      { x: 28, y: 8, z: -65 },
  'sp.tR':      { x: 28, y: 20, z: -35 },

  // Diffuser (rear floor, at ground level)
  'df.L':       { x: -60, y: 2, z: -105 },
  'df.R':       { x: 60, y: 2, z: -105 },
  'df.cL':      { x: -20, y: 2, z: -105 },
  'df.cR':      { x: 20, y: 2, z: -105 },
}

// ── Beam definitions: [nodeA, nodeB, type] ──
const BEAMS = [
  // Chassis spine
  ['ch.nose', 'ch.fbulk', 'mono'],
  ['ch.fbulk', 'ch.ckF', 'mono'],
  ['ch.ckF', 'ch.ckR', 'mono'],
  ['ch.ckR', 'ch.engF', 'mono'],
  ['ch.engF', 'ch.engR', 'mono'],
  ['ch.engR', 'ch.gbox', 'mono'],
  ['ch.gbox', 'ch.crash', 'mono'],

  // Chassis width at bulkhead
  ['ch.fbulk', 'fa.uwiL', 'mono'], ['ch.fbulk', 'fa.uwiR', 'mono'],
  ['ch.fbulk', 'fa.lwiL', 'mono'], ['ch.fbulk', 'fa.lwiR', 'mono'],

  // Front suspension upper wishbones
  ['fa.uwiL', 'fa.uwoL', 'susp'], ['fa.uwiR', 'fa.uwoR', 'susp'],
  // Front suspension lower wishbones
  ['fa.lwiL', 'fa.lwoL', 'susp'], ['fa.lwiR', 'fa.lwoR', 'susp'],
  // Front uprights (outer wishbone to wheel center)
  ['fa.uwoL', 'fa.wheelL', 'susp'], ['fa.uwoR', 'fa.wheelR', 'susp'],
  ['fa.lwoL', 'fa.wheelL', 'susp'], ['fa.lwoR', 'fa.wheelR', 'susp'],
  // Front pushrods
  ['fa.pushL', 'fa.lwoL', 'susp'], ['fa.pushR', 'fa.lwoR', 'susp'],
  ['fa.pushL', 'fa.uwiL', 'susp'], ['fa.pushR', 'fa.uwiR', 'susp'],

  // Rear suspension
  ['ra.uwiL', 'ra.uwoL', 'susp'], ['ra.uwiR', 'ra.uwoR', 'susp'],
  ['ra.lwiL', 'ra.lwoL', 'susp'], ['ra.lwiR', 'ra.lwoR', 'susp'],
  ['ra.uwoL', 'ra.wheelL', 'susp'], ['ra.uwoR', 'ra.wheelR', 'susp'],
  ['ra.lwoL', 'ra.wheelL', 'susp'], ['ra.lwoR', 'ra.wheelR', 'susp'],
  // Rear inboard to gearbox
  ['ch.gbox', 'ra.uwiL', 'mono'], ['ch.gbox', 'ra.uwiR', 'mono'],
  ['ch.gbox', 'ra.lwiL', 'mono'], ['ch.gbox', 'ra.lwiR', 'mono'],

  // Front wing
  ['fw.mpL', 'fw.mcL', 'wing'], ['fw.mcL', 'fw.mcR', 'wing'], ['fw.mcR', 'fw.mpR', 'wing'],
  ['fw.epLT', 'fw.epLB', 'wing'], ['fw.epRT', 'fw.epRB', 'wing'],
  // Front wing nose pillars
  ['fw.mcL', 'ch.nose', 'wing'], ['fw.mcR', 'ch.nose', 'wing'],

  // Rear wing
  ['rw.mpL', 'rw.mpR', 'wing'],
  ['rw.epLT', 'rw.epLB', 'wing'], ['rw.epRT', 'rw.epRB', 'wing'],
  // Rear wing pillars
  ['rw.pilLT', 'rw.pilLB', 'wing'], ['rw.pilRT', 'rw.pilRB', 'wing'],
  ['rw.pilLB', 'ch.engR', 'wing'], ['rw.pilRB', 'ch.engR', 'wing'],

  // Roll hoop
  ['rh.top', 'rh.L', 'mono'], ['rh.top', 'rh.R', 'mono'],
  ['rh.L', 'ch.ckR', 'mono'], ['rh.R', 'ch.ckR', 'mono'],

  // Sidepods
  ['sp.fL', 'sp.rL', 'sidepod'], ['sp.fL', 'sp.tL', 'sidepod'], ['sp.tL', 'sp.rL', 'sidepod'],
  ['sp.fR', 'sp.rR', 'sidepod'], ['sp.fR', 'sp.tR', 'sidepod'], ['sp.tR', 'sp.rR', 'sidepod'],
  ['sp.fL', 'ch.ckR', 'sidepod'], ['sp.fR', 'ch.ckR', 'sidepod'],
  ['sp.rL', 'ch.engR', 'sidepod'], ['sp.rR', 'ch.engR', 'sidepod'],

  // Diffuser
  ['df.L', 'df.cL', 'diffuser'], ['df.cL', 'df.cR', 'diffuser'], ['df.cR', 'df.R', 'diffuser'],
  ['df.L', 'ra.lwoL', 'diffuser'], ['df.R', 'ra.lwoR', 'diffuser'],
]

// Line style per beam type
const STYLE = {
  mono:     { w: 2.5, color: '#cccccc', op: 0.9 },
  susp:     { w: 1.5, color: '#666666', op: 0.8 },
  wing:     { w: 2.0, color: '#aaaaaa', op: 0.8 },
  sidepod:  { w: 1.2, color: '#777777', op: 0.5 },
  diffuser: { w: 1.5, color: '#888888', op: 0.6 },
}

// Tire definitions: [wheelCenter, tireOuter, radius, cornerID]
const TIRES = [
  { wheel: 'fa.wheelL', outer: 'fa.tireOL', r: 13, corner: 'FL', rear: false },
  { wheel: 'fa.wheelR', outer: 'fa.tireOR', r: 13, corner: 'FR', rear: false },
  { wheel: 'ra.wheelL', outer: 'ra.tireOL', r: 15, corner: 'RL', rear: true },
  { wheel: 'ra.wheelR', outer: 'ra.tireOR', r: 15, corner: 'RR', rear: true },
]

// ── Suspension strain color ──
// Maps suspension_mm deflection to color: blue=relaxed, orange=loaded, red=overloaded
function suspColor(mm) {
  const abs = Math.abs(mm || 0)
  const MAX = 30
  const t = Math.min(1, abs / MAX)
  if (t < 0.4) {
    // blue to white transition
    const s = t / 0.4
    const r = Math.round(80 + 100 * s)
    const g = Math.round(130 + 80 * s)
    const b = Math.round(220 - 20 * s)
    return `rgb(${r},${g},${b})`
  }
  if (t < 0.7) {
    // white to orange
    const s = (t - 0.4) / 0.3
    const r = Math.round(210 + 35 * s)
    const g = Math.round(210 - 80 * s)
    const b = Math.round(200 - 180 * s)
    return `rgb(${r},${g},${b})`
  }
  // orange to red
  const s = (t - 0.7) / 0.3
  const r = Math.round(245)
  const g = Math.round(130 - 100 * s)
  const b = Math.round(20)
  return `rgb(${r},${g},${b})`
}

// ── Get suspension mm for a beam's nearest corner ──
function beamSuspMM(a, b, susp) {
  // Determine which corner(s) this beam relates to
  const getCorner = (key) => {
    if (key.startsWith('fa.') && key.includes('L')) return 'FL'
    if (key.startsWith('fa.') && key.includes('R')) return 'FR'
    if (key.startsWith('ra.') && key.includes('L')) return 'RL'
    if (key.startsWith('ra.') && key.includes('R')) return 'RR'
    return null
  }
  const ca = getCorner(a), cb = getCorner(b)
  if (ca && susp[ca] !== undefined) return susp[ca]
  if (cb && susp[cb] !== undefined) return susp[cb]
  return 0
}

// ── Projection functions ──
// Each returns { sx, sy } screen coords from 3D node
function projectTop(n)   { return { sx: n.x, sy: -n.z } }
function projectFront(n) { return { sx: n.x, sy: -n.y } }
function projectSide(n)  { return { sx: -n.z, sy: -n.y } }  // negate Z so nose faces right
function projectRear(n)  { return { sx: -n.x, sy: -n.y } }  // mirror X for rear

const PROJECT = { top: projectTop, front: projectFront, side: projectSide, rear: projectRear }

// ── View-specific visibility ──
// front: only show front half (Z > 0 roughly)
// rear: only show rear half (Z < 0 roughly)
// side/top: show everything
function isVisible(view, nodeKey) {
  const n = NODES[nodeKey]
  if (!n) return false
  if (view === 'front') return n.z > -30   // hide deep rear
  if (view === 'rear') return n.z < 30     // hide deep front
  return true
}

// ── Which tires to show per view ──
function visibleTires(view) {
  if (view === 'front') return TIRES.filter(t => !t.rear)
  if (view === 'rear') return TIRES.filter(t => t.rear)
  return TIRES
}

// Roll hoop beam keys to skip in front/rear (drawn as fixed inverted-U instead)
const ROLL_HOOP_BEAMS = new Set([
  'rh.top-rh.L', 'rh.top-rh.R', 'rh.L-ch.ckR', 'rh.R-ch.ckR',
])
function beamKey(a, b) { return `${a}-${b}` }

// ── Render a single alternate view ──
function AltViewSvg({ view, frame, vehicle }) {
  const projFn = PROJECT[view]
  if (!projFn) return null

  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120

  // Project all nodes
  const proj = {}
  for (const k in NODES) {
    proj[k] = projFn(NODES[k])
  }

  // ── ViewBox computation ──
  // Side view: fixed Y range so rear wing is always visible
  // Front/rear: auto-fit X from visible nodes, fixed Y range for correct proportions
  let vbX1, vbX2, vbY1, vbY2

  if (view === 'side') {
    // Fixed Y: ground at sy=0, rear wing at sy=-55 → Y range -65 to 5
    let zMin = Infinity, zMax = -Infinity
    for (const k in proj) {
      if (!isVisible(view, k)) continue
      if (proj[k].sx < zMin) zMin = proj[k].sx
      if (proj[k].sx > zMax) zMax = proj[k].sx
    }
    const tireExtra = 20
    vbX1 = zMin - tireExtra
    vbX2 = zMax + tireExtra
    vbY1 = -65  // above rear wing (Y=55 → sy=-55, plus margin)
    vbY2 = 8    // below ground line
  } else {
    // Front/rear: auto X, fixed Y range from ground to above roll hoop
    let xMin = Infinity, xMax = -Infinity
    for (const k in proj) {
      if (!isVisible(view, k)) continue
      if (proj[k].sx < xMin) xMin = proj[k].sx
      if (proj[k].sx > xMax) xMax = proj[k].sx
    }
    const tireExtra = 20
    vbX1 = xMin - tireExtra
    vbX2 = xMax + tireExtra
    vbY1 = -62  // above roll hoop top (Y=55 → sy=-55)
    vbY2 = 8    // below ground
  }

  const w = vbX2 - vbX1, h = vbY2 - vbY1
  const pad = Math.max(w, h) * 0.06
  const vb = `${(vbX1 - pad).toFixed(1)} ${(vbY1 - pad).toFixed(1)} ${(w + 2 * pad).toFixed(1)} ${(h + 2 * pad).toFixed(1)}`

  // Ground line Y position (Y=0 in 3D → projected)
  const groundY = projFn({ x: 0, y: 0, z: 0 }).sy

  // Tire rendering — painter's order (far first for front/rear)
  const tires = visibleTires(view)
  const sortedTires = view === 'side'
    ? tires
    : [...tires].sort((a, b) => {
        const da = NODES[a.wheel]?.z || 0
        const db = NODES[b.wheel]?.z || 0
        return da - db
      })

  // Tire radii: larger for front/rear views to fill proportionally
  const tireR = (t) => {
    if (view === 'side') return t.rear ? 17 : 14
    // Front/rear views: ~18% of canvas height
    return t.rear ? 16 : 14
  }

  // Skip roll hoop beams in front/rear (we draw a fixed inverted-U)
  const skipRollHoop = view === 'front' || view === 'rear'

  return (
    <svg viewBox={vb} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Ground reference line */}
      <line x1={vbX1 - pad} x2={vbX2 + pad} y1={groundY} y2={groundY}
        stroke="#2a2a2a" strokeWidth={0.5} strokeDasharray="4,3" />

      {/* Tires */}
      {sortedTires.map(t => {
        const p = proj[t.wheel]
        if (!p) return null
        const r = tireR(t)
        const temp = tireTemps[t.corner] || 25
        const tireColor = tempToColorSmooth(temp, optTemp, ovhTemp)
        const rimR = r * 0.55
        return (
          <g key={t.corner}>
            <circle cx={p.sx} cy={p.sy} r={r}
              fill="#222222" stroke={tireColor} strokeWidth={3} opacity={0.9} />
            <circle cx={p.sx} cy={p.sy} r={rimR}
              fill="none" stroke="#888888" strokeWidth={1.2} opacity={0.7} />
            <circle cx={p.sx} cy={p.sy} r={2}
              fill="#aaaaaa" opacity={0.8} />
          </g>
        )
      })}

      {/* Structural beams — all grey in alt views */}
      {BEAMS.map(([a, b, type], i) => {
        if (!proj[a] || !proj[b]) return null
        if (!isVisible(view, a) && !isVisible(view, b)) return null
        // Skip roll hoop beams in front/rear (replaced by fixed inverted-U)
        if (skipRollHoop && ROLL_HOOP_BEAMS.has(beamKey(a, b))) return null
        const s = STYLE[type] || STYLE.mono
        return (
          <line key={i}
            x1={proj[a].sx} y1={proj[a].sy}
            x2={proj[b].sx} y2={proj[b].sy}
            stroke={s.color} strokeWidth={s.w}
            opacity={s.op} strokeLinecap="round" />
        )
      })}

      {/* ── Roll hoop as inverted-U in front/rear views ── */}
      {skipRollHoop && (() => {
        // Fixed geometry relative to monocoque center (sx=0)
        // Cockpit sides at ±18, rising to top at Y=55
        const cx = 0  // centered
        const halfW = 18
        const baseY = -40   // Y=40 → sy=-40 (cockpit sides)
        const topY = -55    // Y=55 → sy=-55 (roll hoop apex)
        return (
          <g>
            {/* Left pillar */}
            <line x1={cx - halfW} y1={baseY} x2={cx - halfW} y2={topY}
              stroke="#cccccc" strokeWidth={2.5} opacity={0.9} strokeLinecap="round" />
            {/* Right pillar */}
            <line x1={cx + halfW} y1={baseY} x2={cx + halfW} y2={topY}
              stroke="#cccccc" strokeWidth={2.5} opacity={0.9} strokeLinecap="round" />
            {/* Top bar */}
            <line x1={cx - halfW} y1={topY} x2={cx + halfW} y2={topY}
              stroke="#cccccc" strokeWidth={2.5} opacity={0.9} strokeLinecap="round" />
            {/* Connecting to cockpit (ch.ckR projected) */}
            {proj['ch.ckR'] && (
              <>
                <line x1={cx - halfW} y1={baseY} x2={proj['ch.ckR'].sx - 10} y2={proj['ch.ckR'].sy}
                  stroke="#cccccc" strokeWidth={1.5} opacity={0.6} strokeLinecap="round" />
                <line x1={cx + halfW} y1={baseY} x2={proj['ch.ckR'].sx + 10} y2={proj['ch.ckR'].sy}
                  stroke="#cccccc" strokeWidth={1.5} opacity={0.6} strokeLinecap="round" />
              </>
            )}
          </g>
        )
      })()}

      {/* ── Front view: wide front wing near ground ── */}
      {view === 'front' && proj['fw.mpL'] && proj['fw.mpR'] && (
        <g>
          {/* Main plane — thick bar spanning full width */}
          <line x1={proj['fw.mpL'].sx} y1={proj['fw.mpL'].sy}
                x2={proj['fw.mpR'].sx} y2={proj['fw.mpR'].sy}
            stroke="#aaaaaa" strokeWidth={4} opacity={0.7} strokeLinecap="round" />
          {/* End plates */}
          {proj['fw.epLT'] && proj['fw.epLB'] && (
            <line x1={proj['fw.epLT'].sx} y1={proj['fw.epLT'].sy}
                  x2={proj['fw.epLB'].sx} y2={proj['fw.epLB'].sy}
              stroke="#aaaaaa" strokeWidth={2} opacity={0.6} strokeLinecap="round" />
          )}
          {proj['fw.epRT'] && proj['fw.epRB'] && (
            <line x1={proj['fw.epRT'].sx} y1={proj['fw.epRT'].sy}
                  x2={proj['fw.epRB'].sx} y2={proj['fw.epRB'].sy}
              stroke="#aaaaaa" strokeWidth={2} opacity={0.6} strokeLinecap="round" />
          )}
        </g>
      )}

      {/* ── Front view: narrow monocoque center ── */}
      {view === 'front' && proj['ch.fbulk'] && (
        <rect x={proj['ch.fbulk'].sx - 12} y={-25}
          width={24} height={26}
          fill="#1a1a1a" stroke="#cccccc" strokeWidth={1.5} rx={3} opacity={0.8} />
      )}

      {/* ── Rear view: wide rear wing at top ── */}
      {view === 'rear' && proj['rw.mpL'] && proj['rw.mpR'] && (
        <g>
          {/* Main plane */}
          <line x1={proj['rw.mpL'].sx} y1={proj['rw.mpL'].sy}
                x2={proj['rw.mpR'].sx} y2={proj['rw.mpR'].sy}
            stroke="#aaaaaa" strokeWidth={4.5} opacity={0.8} strokeLinecap="round" />
          {/* End plates */}
          {proj['rw.epLT'] && proj['rw.epLB'] && (
            <line x1={proj['rw.epLT'].sx} y1={proj['rw.epLT'].sy}
                  x2={proj['rw.epLB'].sx} y2={proj['rw.epLB'].sy}
              stroke="#aaaaaa" strokeWidth={2.5} opacity={0.7} strokeLinecap="round" />
          )}
          {proj['rw.epRT'] && proj['rw.epRB'] && (
            <line x1={proj['rw.epRT'].sx} y1={proj['rw.epRT'].sy}
                  x2={proj['rw.epRB'].sx} y2={proj['rw.epRB'].sy}
              stroke="#aaaaaa" strokeWidth={2.5} opacity={0.7} strokeLinecap="round" />
          )}
        </g>
      )}

      {/* ── Rear view: gearbox/engine cover center ── */}
      {view === 'rear' && proj['ch.gbox'] && (
        <rect x={proj['ch.gbox'].sx - 14} y={-22}
          width={28} height={24}
          fill="#1a1a1a" stroke="#cccccc" strokeWidth={1.5} rx={3} opacity={0.7} />
      )}

      {/* ── Rear view: diffuser at ground level ── */}
      {view === 'rear' && proj['df.L'] && proj['df.R'] && (
        <line x1={proj['df.L'].sx} y1={proj['df.L'].sy}
              x2={proj['df.R'].sx} y2={proj['df.R'].sy}
          stroke="#888888" strokeWidth={2.5} opacity={0.5} strokeLinecap="round" />
      )}

      {/* ── Side view: rear wing pillars + main plane emphasis ── */}
      {view === 'side' && proj['rw.mpL'] && proj['rw.mpR'] && (
        <line x1={proj['rw.mpL'].sx} y1={proj['rw.mpL'].sy}
              x2={proj['rw.mpR'].sx} y2={proj['rw.mpR'].sy}
          stroke="#aaaaaa" strokeWidth={3.5} opacity={0.7} strokeLinecap="round" />
      )}
    </svg>
  )
}

// ── Top view with proper filled polygons ──
function TopViewSvg({ frame, vehicle }) {
  const susp = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120

  const proj = {}
  for (const k in NODES) {
    proj[k] = projectTop(NODES[k])
  }

  // Bounding box
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity
  for (const k in proj) {
    const { sx, sy } = proj[k]
    if (sx < x1) x1 = sx
    if (sx > x2) x2 = sx
    if (sy < y1) y1 = sy
    if (sy > y2) y2 = sy
  }
  const maxR = 18
  x1 -= maxR; x2 += maxR; y1 -= maxR; y2 += maxR
  const w = x2 - x1, h = y2 - y1
  const pad = Math.max(w, h) * 0.06
  const vb = `${(x1 - pad).toFixed(1)} ${(y1 - pad).toFixed(1)} ${(w + 2 * pad).toFixed(1)} ${(h + 2 * pad).toFixed(1)}`

  // Monocoque teardrop polygon
  const monoKeys = ['ch.nose', 'ch.fbulk', 'ch.ckF', 'ch.ckR', 'ch.engF', 'ch.engR', 'ch.gbox', 'ch.crash']
  const monoWidth = [4, 14, 16, 16, 14, 12, 8, 6]  // half-width at each spine node
  const monoL = monoKeys.map((k, i) => `${(proj[k].sx - monoWidth[i]).toFixed(1)},${proj[k].sy.toFixed(1)}`)
  const monoR = monoKeys.map((k, i) => `${(proj[k].sx + monoWidth[i]).toFixed(1)},${proj[k].sy.toFixed(1)}`).reverse()
  const monoPts = [...monoL, ...monoR].join(' ')

  // Front wing polygon
  const fwPts = [proj['fw.mpL'], proj['fw.mcL'], proj['fw.mcR'], proj['fw.mpR']]
    .filter(Boolean)
    .map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')

  // Rear wing bar
  const rwPts = proj['rw.mpL'] && proj['rw.mpR']
    ? `${proj['rw.mpL'].sx.toFixed(1)},${(proj['rw.mpL'].sy - 4).toFixed(1)} ${proj['rw.mpR'].sx.toFixed(1)},${(proj['rw.mpR'].sy - 4).toFixed(1)} ${proj['rw.mpR'].sx.toFixed(1)},${(proj['rw.mpR'].sy + 4).toFixed(1)} ${proj['rw.mpL'].sx.toFixed(1)},${(proj['rw.mpL'].sy + 4).toFixed(1)}`
    : null

  // Sidepod shapes
  const spL = [proj['sp.fL'], proj['sp.tL'], proj['sp.rL']].filter(Boolean)
  const spR = [proj['sp.fR'], proj['sp.tR'], proj['sp.rR']].filter(Boolean)

  // Tire rectangles (rounded)
  const tireDefs = [
    { cx: proj['fa.wheelL']?.sx, cy: proj['fa.wheelL']?.sy, w: 16, h: 24, corner: 'FL' },
    { cx: proj['fa.wheelR']?.sx, cy: proj['fa.wheelR']?.sy, w: 16, h: 24, corner: 'FR' },
    { cx: proj['ra.wheelL']?.sx, cy: proj['ra.wheelL']?.sy, w: 22, h: 28, corner: 'RL' },
    { cx: proj['ra.wheelR']?.sx, cy: proj['ra.wheelR']?.sy, w: 22, h: 28, corner: 'RR' },
  ]

  return (
    <svg viewBox={vb} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Tires as rounded rects */}
      {tireDefs.map(t => {
        if (t.cx == null) return null
        const temp = tireTemps[t.corner] || 25
        const tireColor = tempToColorSmooth(temp, optTemp, ovhTemp)
        return (
          <g key={t.corner}>
            <rect x={t.cx - t.w / 2} y={t.cy - t.h / 2} width={t.w} height={t.h}
              rx={4} fill="#222222" stroke={tireColor} strokeWidth={2.5} opacity={0.9} />
            <circle cx={t.cx} cy={t.cy} r={4}
              fill="none" stroke="#888888" strokeWidth={0.8} opacity={0.6} />
          </g>
        )
      })}

      {/* Monocoque */}
      <polygon points={monoPts} fill="#1a1a1a" stroke="#cccccc" strokeWidth={1.5}
        strokeLinejoin="round" opacity={0.85} />

      {/* Sidepods */}
      {spL.length === 3 && (
        <polygon points={spL.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')}
          fill="#141414" stroke="#777777" strokeWidth={1} opacity={0.6} />
      )}
      {spR.length === 3 && (
        <polygon points={spR.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')}
          fill="#141414" stroke="#777777" strokeWidth={1} opacity={0.6} />
      )}

      {/* Front wing */}
      {fwPts && (
        <polygon points={fwPts} fill="#1a1a1a" stroke="#aaaaaa" strokeWidth={1.5} opacity={0.8} />
      )}

      {/* Rear wing */}
      {rwPts && (
        <polygon points={rwPts} fill="#1a1a1a" stroke="#aaaaaa" strokeWidth={1.5} opacity={0.8} />
      )}

      {/* Suspension beams */}
      {BEAMS.filter(([,, type]) => type === 'susp').map(([a, b], i) => {
        if (!proj[a] || !proj[b]) return null
        const mm = beamSuspMM(a, b, susp)
        return (
          <line key={`s${i}`}
            x1={proj[a].sx} y1={proj[a].sy}
            x2={proj[b].sx} y2={proj[b].sy}
            stroke={suspColor(mm)} strokeWidth={1.5}
            opacity={0.8} strokeLinecap="round" />
        )
      })}
    </svg>
  )
}

const VIEWS = ['top', 'front', 'side', 'rear']

function CarModelViews({ frame, vehicle, mode }) {
  const [activeView, setActiveView] = useState('top')

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
          <AltViewSvg view={activeView} frame={frame} vehicle={vehicle} />
        )}
      </div>
    </div>
  )
}

export default memo(CarModelViews)
