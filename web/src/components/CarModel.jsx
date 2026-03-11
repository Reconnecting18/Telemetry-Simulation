import { memo, useRef } from 'react'
import { buildTireData, tireTempColor, tireWearColor } from '../utils/tireModel'

// ═══════════════════════════════════════════════════════════════════
// BeamNG-Inspired Node-Beam F1 Structural Diagram
// ═══════════════════════════════════════════════════════════════════
// Data-first architecture. Nodes and beams are defined as clean JS
// objects before any rendering code. Every node carries rest_position,
// current_position, and a parent reference. Every beam carries its
// rest_length, current_length, type, and color.
//
// Movement: lerped suspension (ride_height), steering via upright
// rotation, CSS roll/pitch from G-forces, permanent damage with
// adjacency falloff.
// ═══════════════════════════════════════════════════════════════════

// ── CONSTANTS ───────────────────────────────────────────────────
const MAX_SUSP_MM = 30
const HUB_DY      = 1.4   // max forward displacement at full compression
const HUB_DX      = 1.4   // max inward displacement (camber gain)
const LERP_K      = 0.15  // suspension smoothing per frame
const STEER_GAIN  = 12.5  // deg per 1g lateral
const STEER_MAX   = 25    // deg
const ROLL_MAX    = 3     // deg
const PITCH_MAX   = 4     // deg
const TIRE_W_F    = 4.5   // front tire half-width (narrower)
const TIRE_W_R    = 5.5   // rear tire half-width (wider)
const TIRE_H      = 9     // tire half-height
const RIM_W       = 2.5   // rim half-width
const RIM_H       = 5     // rim half-height
const DMG_THRESH  = 2.5   // g delta to trigger damage

// ═══════════════════════════════════════════════════════════════════
// 1. NODE DATA
// ═══════════════════════════════════════════════════════════════════
// Each node: { name, rest: {x,y}, pos: {x,y}, parent: string|null }

const NODES = {}

function defNode(name, x, y, parent = null) {
  NODES[name] = { name, rest: { x, y }, pos: { x, y }, parent }
}

// ── 1a. Chassis spine (8 nodes, rigid) ──────────────────────────
defNode('ch.nose',  0,  -48)
defNode('ch.fbL',  -6,  -32)
defNode('ch.fbR',   6,  -32)
defNode('ch.cpL',  -8,   -5)
defNode('ch.cpR',   8,   -5)
defNode('ch.rbL',  -6,   25)
defNode('ch.rbR',   6,   25)
defNode('ch.tail',  0,   33)

// ── 1b. Suspension corners (8 nodes each × 4) ──────────────────
function defCorner(p, hx, hy, fwd) {
  const ins = hx < 0 ? 1 : -1   // toward centreline
  const cx = hx + ins * 13      // chassis pickup X
  defNode(`${p}.uwi`, cx,            hy - 3 * fwd)           // upper wishbone inner
  defNode(`${p}.lwi`, cx,            hy + 3 * fwd)           // lower wishbone inner
  defNode(`${p}.uwo`, hx + ins * 4,  hy - 3 * fwd)           // upper wishbone outer
  defNode(`${p}.lwo`, hx + ins * 4,  hy + 3 * fwd)           // lower wishbone outer
  defNode(`${p}.upr`, hx + ins * 2,  hy)                     // upright (kingpin)
  defNode(`${p}.hub`, hx,            hy)                     // hub centre
  defNode(`${p}.pri`, cx,            hy + 1 * fwd)           // pushrod inner
  defNode(`${p}.pro`, hx + ins * 3,  hy + 2 * fwd)           // pushrod outer
}

const FL_HUB = [-20, -28], FR_HUB = [20, -28]
const RL_HUB = [-20,  35], RR_HUB = [20,  35]

defCorner('fl', ...FL_HUB,  1)
defCorner('fr', ...FR_HUB,  1)
defCorner('rl', ...RL_HUB, -1)
defCorner('rr', ...RR_HUB, -1)

// ── 1c. Wheel nodes (7 per corner, children of hub) ────────────
function defWheel(p, hx, hy, side, tw) {
  const out = side === 'L' ? -1 : 1
  const hub = `${p}.hub`
  defNode(`${p}.rim.t`,   hx,              hy - RIM_H,  hub)
  defNode(`${p}.rim.b`,   hx,              hy + RIM_H,  hub)
  defNode(`${p}.tire.ot`, hx + out * tw,   hy - TIRE_H, hub)
  defNode(`${p}.tire.ob`, hx + out * tw,   hy + TIRE_H, hub)
  defNode(`${p}.tire.it`, hx - out * tw,   hy - TIRE_H, hub)
  defNode(`${p}.tire.ib`, hx - out * tw,   hy + TIRE_H, hub)
}

defWheel('fl', ...FL_HUB, 'L', TIRE_W_F)
defWheel('fr', ...FR_HUB, 'R', TIRE_W_F)
defWheel('rl', ...RL_HUB, 'L', TIRE_W_R)
defWheel('rr', ...RR_HUB, 'R', TIRE_W_R)

// ── 1d. Front wing (12 nodes) — main plane + cascade + endplates ──
defNode('fw.lt',    -22, -53)          // left tip (main plane edge)
defNode('fw.rt',     22, -53)          // right tip
defNode('fw.cL',     -4, -53)          // centre left
defNode('fw.cR',      4, -53)          // centre right
defNode('fw.csL',   -19, -50)          // cascade left
defNode('fw.csR',    19, -50)          // cascade right
defNode('fw.lepT',  -25, -58)          // left endplate forward
defNode('fw.lepB',  -25, -40)          // left endplate rear
defNode('fw.repT',   25, -58)          // right endplate forward
defNode('fw.repB',   25, -40)          // right endplate rear
defNode('fw.aL',     -2, -49)          // attach left
defNode('fw.aR',      2, -49)          // attach right

// ── 1e. Rear wing (12 nodes) — main plane + tall endplates + pillars ──
defNode('rw.lt',    -17,  43)          // left tip (main plane)
defNode('rw.rt',     17,  43)          // right tip
defNode('rw.cL',     -4,  43)          // centre left
defNode('rw.cR',      4,  43)          // centre right
defNode('rw.lepT',  -21,  32)          // left endplate forward
defNode('rw.lepB',  -21,  53)          // left endplate rear
defNode('rw.repT',   21,  32)          // right endplate forward
defNode('rw.repB',   21,  53)          // right endplate rear
defNode('rw.piL',    -4,  43)          // pillar left (wing)
defNode('rw.piR',     4,  43)          // pillar right (wing)
defNode('rw.baL',    -4,  34)          // pillar base left (chassis)
defNode('rw.baR',     4,  34)          // pillar base right (chassis)

// ── 1f. Sidepods (4 nodes each × 2) ────────────────────────────
defNode('lsp.ft',   -8,  -3)
defNode('lsp.fb',  -14,  -1)
defNode('lsp.rt',   -8,  20)
defNode('lsp.rb',  -14,  18)
defNode('rsp.ft',    8,  -3)
defNode('rsp.fb',   14,  -1)
defNode('rsp.rt',    8,  20)
defNode('rsp.rb',   14,  18)

// ═══════════════════════════════════════════════════════════════════
// 2. BEAM DATA
// ═══════════════════════════════════════════════════════════════════
// Each beam: { a, b, restLen, len, type, color, corner? }

const BEAMS = []

function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

function defBeam(a, b, type, color = '#888', corner = null) {
  const na = NODES[a], nb = NODES[b]
  const restLen = dist(na.rest.x, na.rest.y, nb.rest.x, nb.rest.y)
  BEAMS.push({ a, b, restLen, len: restLen, type, color, corner })
}

// ── 2a. Chassis beams — fixed dark grey ─────────────────────────
const MONO_SEQ = ['ch.nose','ch.fbL','ch.cpL','ch.rbL','ch.tail','ch.rbR','ch.cpR','ch.fbR','ch.nose']
for (let i = 0; i < MONO_SEQ.length - 1; i++) defBeam(MONO_SEQ[i], MONO_SEQ[i+1], 'chassis', '#555')
// Cross-bracing across cockpit
defBeam('ch.cpL', 'ch.cpR', 'chassis', '#222')
defBeam('ch.cpL', 'ch.rbR', 'chassis', '#222')
defBeam('ch.cpR', 'ch.rbL', 'chassis', '#222')

// ── 2b. Suspension beams — strain-colored (set dynamically) ────
for (const p of ['fl','fr','rl','rr']) {
  const c = p.toUpperCase()
  defBeam(`${p}.uwi`, `${p}.uwo`, 'susp', '#888', c)   // upper wishbone
  defBeam(`${p}.lwi`, `${p}.lwo`, 'susp', '#888', c)   // lower wishbone
  defBeam(`${p}.pri`, `${p}.pro`, 'susp', '#888', c)   // pushrod
}

// ── 2c. Upright beams — light grey ─────────────────────────────
for (const p of ['fl','fr','rl','rr']) {
  defBeam(`${p}.uwo`, `${p}.upr`, 'upright', '#ccc', p.toUpperCase())
  defBeam(`${p}.lwo`, `${p}.upr`, 'upright', '#ccc', p.toUpperCase())
}

// ── 2d. Hub links — light grey ─────────────────────────────────
for (const p of ['fl','fr','rl','rr']) {
  defBeam(`${p}.upr`, `${p}.hub`, 'hub_link', '#888', p.toUpperCase())
}

// ── 2e. Wheel beams (per corner) ───────────────────────────────
for (const p of ['fl','fr','rl','rr']) {
  const c = p.toUpperCase()
  // Tire outline (4 beams, color set dynamically by temp zone)
  defBeam(`${p}.tire.ot`, `${p}.tire.ob`, 'tire_outer', '#888', c)
  defBeam(`${p}.tire.it`, `${p}.tire.ib`, 'tire_inner', '#888', c)
  defBeam(`${p}.tire.ot`, `${p}.tire.it`, 'tire_top',   '#888', c)
  defBeam(`${p}.tire.ob`, `${p}.tire.ib`, 'tire_bot',   '#888', c)
  // Rim outline (4 beams)
  defBeam(`${p}.rim.t`, `${p}.rim.b`, 'rim', '#666', c)  // placeholder: rendered as rect
  // Spoke beams (hub to rim top/bottom)
  defBeam(`${p}.hub`,  `${p}.rim.t`, 'spoke', '#444', c)
  defBeam(`${p}.hub`,  `${p}.rim.b`, 'spoke', '#444', c)
}

// ── 2f. Front wing beams — light grey, damage-reactive ─────────
;[
  // Endplates (front-to-back span)
  ['fw.lepT','fw.lepB'], ['fw.repT','fw.repB'],
  // Main plane span + endplate connections
  ['fw.lepT','fw.lt'], ['fw.lt','fw.cL'], ['fw.cL','fw.cR'], ['fw.cR','fw.rt'], ['fw.rt','fw.repT'],
  // Cascade span + connections to main plane & endplates
  ['fw.csL','fw.csR'], ['fw.lt','fw.csL'], ['fw.rt','fw.csR'],
  ['fw.csL','fw.lepB'], ['fw.csR','fw.repB'],
  // Nose attachment
  ['fw.cL','fw.aL'], ['fw.cR','fw.aR'],
  ['fw.aL','ch.nose'], ['fw.aR','ch.nose'],
].forEach(([a,b]) => defBeam(a, b, 'wing', '#888'))

// ── 2g. Rear wing beams — light grey, damage-reactive ──────────
;[
  ['rw.lt','rw.lepT'], ['rw.lt','rw.lepB'], ['rw.lepT','rw.lepB'],
  ['rw.lt','rw.cL'], ['rw.cL','rw.cR'], ['rw.cR','rw.rt'],
  ['rw.rt','rw.repT'], ['rw.rt','rw.repB'], ['rw.repT','rw.repB'],
  ['rw.piL','rw.baL'], ['rw.piR','rw.baR'],
  ['rw.cL','rw.piL'], ['rw.cR','rw.piR'],
  ['rw.baL','ch.tail'], ['rw.baR','ch.tail'],
].forEach(([a,b]) => defBeam(a, b, 'wing', '#888'))

// ── 2h. Sidepod beams — light grey ─────────────────────────────
;[
  ['lsp.ft','lsp.fb'], ['lsp.fb','lsp.rb'], ['lsp.rb','lsp.rt'], ['lsp.rt','lsp.ft'],
  ['lsp.ft','ch.cpL'], ['lsp.rt','ch.rbL'],
  ['rsp.ft','rsp.fb'], ['rsp.fb','rsp.rb'], ['rsp.rb','rsp.rt'], ['rsp.rt','rsp.ft'],
  ['rsp.ft','ch.cpR'], ['rsp.rt','ch.rbR'],
].forEach(([a,b]) => defBeam(a, b, 'sidepod', '#888'))

// ═══════════════════════════════════════════════════════════════════
// 3. BEAM STYLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const BEAM_RENDER = {
  chassis:    { w: 1.0,  op: 0.9  },
  susp:       { w: 0.8,  op: 0.75 },
  upright:    { w: 0.9,  op: 0.6  },
  hub_link:   { w: 0.5,  op: 0.5  },
  tire_outer: { w: 0.4,  op: 0.15 },
  tire_inner: { w: 0.4,  op: 0.15 },
  tire_top:   { w: 0.3,  op: 0.1  },
  tire_bot:   { w: 0.3,  op: 0.1  },
  rim:        { w: 0.5,  op: 0.5  },
  spoke:      { w: 0.3,  op: 0.35 },
  wing:       { w: 0.9,  op: 0.7  },
  sidepod:    { w: 0.6,  op: 0.4  },
}

// ═══════════════════════════════════════════════════════════════════
// 4. NODE DOT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════
const DOT = {
  chassis: { r: 1.0, fill: '#888', op: 0.5 },
  susp_in: { r: 0.7, fill: '#666', op: 0.4 },
  susp_out:{ r: 0.6, fill: '#999', op: 0.4 },
  upright: { r: 1.0, fill: '#fff', op: 0.5 },
  hub:     { r: 1.2, fill: '#aaa', op: 0.5 },
  aero:    { r: 0.5, fill: '#888', op: 0.35 },
  sp:      { r: 0.4, fill: '#888', op: 0.3 },
}

const NODE_VIS = {}
;['ch.nose','ch.fbL','ch.fbR','ch.cpL','ch.cpR','ch.rbL','ch.rbR','ch.tail']
  .forEach(k => NODE_VIS[k] = 'chassis')
;['fl','fr','rl','rr'].forEach(p => {
  NODE_VIS[`${p}.uwi`] = 'susp_in';  NODE_VIS[`${p}.lwi`] = 'susp_in'
  NODE_VIS[`${p}.pri`] = 'susp_in'
  NODE_VIS[`${p}.uwo`] = 'susp_out'; NODE_VIS[`${p}.lwo`] = 'susp_out'
  NODE_VIS[`${p}.pro`] = 'susp_out'
  NODE_VIS[`${p}.upr`] = 'upright';  NODE_VIS[`${p}.hub`] = 'hub'
})
;['fw.lt','fw.lepT','fw.lepB','fw.cL','fw.cR','fw.repT','fw.repB','fw.rt','fw.csL','fw.csR','fw.aL','fw.aR']
  .forEach(k => NODE_VIS[k] = 'aero')
;['rw.lt','rw.lepT','rw.lepB','rw.cL','rw.cR','rw.repT','rw.repB','rw.rt',
  'rw.piL','rw.piR','rw.baL','rw.baR'].forEach(k => NODE_VIS[k] = 'aero')
;['lsp.ft','lsp.fb','lsp.rt','lsp.rb','rsp.ft','rsp.fb','rsp.rt','rsp.rb']
  .forEach(k => NODE_VIS[k] = 'sp')

// ═══════════════════════════════════════════════════════════════════
// 5. STRAIN COLOR GRADIENT
// ═══════════════════════════════════════════════════════════════════
function lerpC(a, b, t) { return Math.round(a + (b - a) * t) }
function rgb(r, g, b) { return `rgb(${r},${g},${b})` }

const STRAIN = [
  { at: 0.0, r: 74,  g: 158, b: 255 },  // full extension  #4a9eff
  { at: 0.5, r: 136, g: 136, b: 136 },  // ride height     #888888
  { at: 0.8, r: 255, g: 107, b: 53  },  // compression     #ff6b35
  { at: 1.0, r: 255, g: 0,   b: 0   },  // max compression #ff0000
]

function strainColor(rideHeight) {
  const t = Math.max(0, Math.min(1, rideHeight))
  for (let i = 1; i < STRAIN.length; i++) {
    if (t <= STRAIN[i].at) {
      const lo = STRAIN[i - 1], hi = STRAIN[i]
      const s = (t - lo.at) / (hi.at - lo.at)
      return rgb(lerpC(lo.r, hi.r, s), lerpC(lo.g, hi.g, s), lerpC(lo.b, hi.b, s))
    }
  }
  return rgb(255, 0, 0)
}

// ═══════════════════════════════════════════════════════════════════
// 6. DAMAGE SYSTEM
// ═══════════════════════════════════════════════════════════════════
const DAMAGE_ZONES = {
  nose: {
    primary:  ['ch.nose', 'fw.aL', 'fw.aR'],
    adjacent: ['ch.fbL', 'ch.fbR', 'fw.cL', 'fw.cR'],
    far:      ['ch.cpL', 'ch.cpR', 'fw.lt', 'fw.rt'],
    vector:   [0, 3],
  },
  front_left: {
    primary:  ['fl.upr', 'fw.lt'],
    adjacent: ['fl.hub', 'fw.lepT', 'fw.lepB', 'fl.uwo', 'fl.lwo'],
    far:      ['fw.cL', 'fl.uwi', 'fl.lwi'],
    vector:   [2, 1.5],
  },
  front_right: {
    primary:  ['fr.upr', 'fw.rt'],
    adjacent: ['fr.hub', 'fw.repT', 'fw.repB', 'fr.uwo', 'fr.lwo'],
    far:      ['fw.cR', 'fr.uwi', 'fr.lwi'],
    vector:   [-2, 1.5],
  },
  sidepod_left: {
    primary:  ['lsp.ft'],
    adjacent: ['lsp.fb', 'lsp.rt', 'lsp.rb'],
    far:      [],
    vector:   [3, 0],
  },
  sidepod_right: {
    primary:  ['rsp.ft'],
    adjacent: ['rsp.fb', 'rsp.rt', 'rsp.rb'],
    far:      [],
    vector:   [-3, 0],
  },
  rear: {
    primary:  ['rw.lt', 'rw.rt', 'ch.tail'],
    adjacent: ['rw.lepT', 'rw.lepB', 'rw.repT', 'rw.repB', 'ch.rbL', 'ch.rbR'],
    far:      ['rw.cL', 'rw.cR', 'rw.piL', 'rw.piR'],
    vector:   [0, -3],
  },
}

function inflictDamage(dmgMap, zone, magnitude) {
  const z = DAMAGE_ZONES[zone]
  if (!z) return
  const [vx, vy] = z.vector
  const apply = (nodes, frac) => {
    for (const k of nodes) {
      if (!dmgMap[k]) dmgMap[k] = [0, 0]
      dmgMap[k][0] += vx * magnitude * frac
      dmgMap[k][1] += vy * magnitude * frac
    }
  }
  apply(z.primary, 1.0)
  apply(z.adjacent, 0.4)
  apply(z.far, 0.15)
}

function detectDamageZone(dLat, dLon) {
  if (Math.abs(dLon) > DMG_THRESH) return dLon > 0 ? 'nose' : 'rear'
  if (Math.abs(dLat) > DMG_THRESH) return dLat > 0 ? 'sidepod_right' : 'sidepod_left'
  return null
}

// ═══════════════════════════════════════════════════════════════════
// 7. CORNER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════
const CORNERS = [
  { id: 'FL', p: 'fl', side: 'L', steers: true,  tw: TIRE_W_F },
  { id: 'FR', p: 'fr', side: 'R', steers: true,  tw: TIRE_W_F },
  { id: 'RL', p: 'rl', side: 'L', steers: false, tw: TIRE_W_R },
  { id: 'RR', p: 'rr', side: 'R', steers: false, tw: TIRE_W_R },
]

// ═══════════════════════════════════════════════════════════════════
// 8. POSITION SOLVER — computes current_position for every node
// ═══════════════════════════════════════════════════════════════════
function solvePositions(rideHeights, steerDeg, dmgMap) {
  // Start from rest positions
  const pos = {}
  for (const k in NODES) {
    pos[k] = { x: NODES[k].rest.x, y: NODES[k].rest.y }
  }

  // Per-corner: suspension displacement + steering
  for (const { id, p, side, steers } of CORNERS) {
    const rh = rideHeights[id]
    const inward = side === 'L' ? 1 : -1
    const dx = rh * HUB_DX * inward
    const dy = rh * -HUB_DY

    // Hub + upright: full displacement
    for (const sfx of ['.hub', '.upr']) {
      pos[`${p}${sfx}`].x += dx
      pos[`${p}${sfx}`].y += dy
    }
    // Wishbone outers + pushrod outer: 70% arc
    for (const sfx of ['.uwo', '.lwo', '.pro']) {
      pos[`${p}${sfx}`].x += dx * 0.7
      pos[`${p}${sfx}`].y += dy * 0.7
    }

    // Steering: rotate outer assembly around upright pivot
    if (steers) {
      const angle = steerDeg * (Math.PI / 180)
      if (Math.abs(angle) > 0.001) {
        const cx = pos[`${p}.upr`].x, cy = pos[`${p}.upr`].y
        const cos = Math.cos(angle), sin = Math.sin(angle)
        for (const sfx of ['.uwo', '.lwo', '.hub', '.pro']) {
          const k = `${p}${sfx}`
          const rx = pos[k].x - cx, ry = pos[k].y - cy
          pos[k].x = cx + rx * cos - ry * sin
          pos[k].y = cy + rx * sin + ry * cos
        }
      }
    }

    // Propagate to child wheel nodes: offset from rest hub, applied to current hub
    const hubRest = NODES[`${p}.hub`].rest
    const hubCur  = pos[`${p}.hub`]
    for (const sfx of ['.rim.t','.rim.b','.tire.ot','.tire.ob','.tire.it','.tire.ib']) {
      const k = `${p}${sfx}`
      let offX = NODES[k].rest.x - hubRest.x
      let offY = NODES[k].rest.y - hubRest.y
      // If front corner is steered, rotate child offsets too
      if (steers) {
        const angle = steerDeg * (Math.PI / 180)
        if (Math.abs(angle) > 0.001) {
          const cos = Math.cos(angle), sin = Math.sin(angle)
          const rx = offX, ry = offY
          offX = rx * cos - ry * sin
          offY = rx * sin + ry * cos
        }
      }
      pos[k].x = hubCur.x + offX
      pos[k].y = hubCur.y + offY
    }
  }

  // Apply permanent damage
  for (const k in dmgMap) {
    if (pos[k]) {
      pos[k].x += dmgMap[k][0]
      pos[k].y += dmgMap[k][1]
    }
  }

  return pos
}

// Update beam current_length from solved positions
function updateBeamLengths(pos) {
  for (const b of BEAMS) {
    const pa = pos[b.a], pb = pos[b.b]
    b.len = dist(pa.x, pa.y, pb.x, pb.y)
  }
}

// Three-zone tire temps from single value + camber
function zoneTemps(temp, camberDeg) {
  const c = Math.abs(camberDeg || 0) * 2.5
  return { inner: temp + c, center: temp, outer: temp - c * 0.4 }
}

// ═══════════════════════════════════════════════════════════════════
// 8b. MECHANICAL HEALTH OVERLAY
// ═══════════════════════════════════════════════════════════════════
// Computes health fractions from frame data. Components appear at 30%+.

function healthColor(fraction) {
  // 0.3→white, 0.6→yellow, 0.9+→red
  const t = Math.max(0, Math.min(1, (fraction - 0.3) / 0.7))
  if (t <= 0.5) {
    // white → yellow
    const s = t / 0.5
    const r = 255
    const g = Math.round(255 - (255 - 204) * s) // 255→204
    const b = Math.round(255 * (1 - s))          // 255→0
    return `rgb(${r},${g},${b})`
  }
  // yellow → red
  const s = (t - 0.5) / 0.5
  const r = 255
  const g = Math.round(204 * (1 - s))  // 204→0
  const b = 0
  return `rgb(${r},${g},${b})`
}

function computeHealth(frame, vehicle) {
  if (!frame) return null
  const rpm = frame.rpm || 0
  const maxRpm = vehicle?.max_rpm || 9000
  const throttle = frame.throttle || 0
  const brake = frame.brake || 0
  const tw = frame.tire_wear || {}
  const avgWear = ((tw.FL || 0) + (tw.FR || 0) + (tw.RL || 0) + (tw.RR || 0)) / 4
  const latG = Math.abs(frame.lateral_g || 0)

  return {
    engine:   Math.min(1, (rpm / maxRpm) * 0.65 + throttle * 0.35),
    gearbox:  Math.min(1, avgWear * 0.4 + (rpm / maxRpm) * 0.15),
    brakes:   { FL: brake, FR: brake, RL: brake * 0.7, RR: brake * 0.7 },
    steering: Math.min(1, latG * 0.25 + (Math.abs(frame.lateral_g || 0) > 1.5 ? 0.15 : 0)),
    radiator: Math.min(1, (rpm / maxRpm) * 0.5 + throttle * 0.3),
  }
}

// Health overlay zone definitions
// { name, cx, cy, w, h, r (for circle), getValue(health) }
const HEALTH_ZONES = [
  { name: 'Engine',   cx: 0, cy: 15,  w: 12, h: 16, labelX: -30, labelY: 10,  getValue: h => h.engine },
  { name: 'Gearbox',  cx: 0, cy: 30,  w: 8,  h: 10, labelX: -30, labelY: 30,  getValue: h => h.gearbox },
  { name: 'Steering', cx: 0, cy: -22, w: 14, h: 8,  labelX: -30, labelY: -25, getValue: h => h.steering },
]

const BRAKE_ZONES = [
  { id: 'FL', cx: -20, cy: -28, labelX: -32, labelY: -35 },
  { id: 'FR', cx:  20, cy: -28, labelX:  32, labelY: -35 },
  { id: 'RL', cx: -20, cy:  35, labelX: -32, labelY:  42 },
  { id: 'RR', cx:  20, cy:  35, labelX:  32, labelY:  42 },
]

const RADIATOR_ZONES = [
  { side: 'L', cx: -12, cy: -1, w: 5, h: 10, labelX: -30, labelY: -5 },
  { side: 'R', cx:  12, cy: -1, w: 5, h: 10, labelX:  30, labelY: -5 },
]

function HealthOverlay({ health, pos }) {
  if (!health) return null

  const elements = []

  // Rectangular zones: engine, gearbox, steering
  for (const zone of HEALTH_ZONES) {
    const frac = zone.getValue(health)
    if (frac < 0.3) continue
    const color = healthColor(frac)
    const opacity = Math.min(0.6, (frac - 0.3) / 0.7 * 0.6)
    elements.push(
      <rect key={zone.name}
        x={zone.cx - zone.w / 2} y={zone.cy - zone.h / 2}
        width={zone.w} height={zone.h}
        rx={2} ry={2}
        fill={color} opacity={opacity}
        style={{ transition: 'opacity 0.3s ease, fill 0.3s ease' }}
      />
    )
    if (frac >= 0.5) {
      elements.push(
        <line key={`${zone.name}-line`}
          x1={zone.cx} y1={zone.cy}
          x2={zone.labelX} y2={zone.labelY}
          stroke={color} strokeWidth={0.4} opacity={0.7}
        />,
        <text key={`${zone.name}-label`}
          x={zone.labelX} y={zone.labelY - 1.5}
          fill={color} fontSize={3} fontFamily="'Courier New', monospace"
          textAnchor={zone.labelX < 0 ? 'end' : 'start'} opacity={0.85}>
          {zone.name} {(frac * 100).toFixed(0)}%
        </text>
      )
    }
  }

  // Brake circles at hub positions
  for (const bz of BRAKE_ZONES) {
    const frac = health.brakes[bz.id]
    if (frac < 0.3) continue
    const hub = pos[`${bz.id.toLowerCase()}.hub`]
    const cx = hub ? hub.x : bz.cx
    const cy = hub ? hub.y : bz.cy
    const color = healthColor(frac)
    const opacity = Math.min(0.55, (frac - 0.3) / 0.7 * 0.55)
    elements.push(
      <circle key={`brake-${bz.id}`}
        cx={cx} cy={cy} r={4}
        fill={color} opacity={opacity}
        style={{ transition: 'opacity 0.3s ease, fill 0.3s ease' }}
      />
    )
    if (frac >= 0.5) {
      elements.push(
        <line key={`brake-${bz.id}-line`}
          x1={cx} y1={cy}
          x2={bz.labelX} y2={bz.labelY}
          stroke={color} strokeWidth={0.4} opacity={0.7}
        />,
        <text key={`brake-${bz.id}-label`}
          x={bz.labelX} y={bz.labelY - 1.5}
          fill={color} fontSize={2.8} fontFamily="'Courier New', monospace"
          textAnchor={bz.labelX < 0 ? 'end' : 'start'} opacity={0.85}>
          Brake {bz.id} {(frac * 100).toFixed(0)}%
        </text>
      )
    }
  }

  // Radiator rectangles at sidepod fronts
  for (const rz of RADIATOR_ZONES) {
    const frac = health.radiator
    if (frac < 0.3) continue
    const color = healthColor(frac)
    const opacity = Math.min(0.5, (frac - 0.3) / 0.7 * 0.5)
    elements.push(
      <rect key={`rad-${rz.side}`}
        x={rz.cx - rz.w / 2} y={rz.cy - rz.h / 2}
        width={rz.w} height={rz.h}
        rx={1} ry={1}
        fill={color} opacity={opacity}
        style={{ transition: 'opacity 0.3s ease, fill 0.3s ease' }}
      />
    )
    if (frac >= 0.5) {
      elements.push(
        <line key={`rad-${rz.side}-line`}
          x1={rz.cx} y1={rz.cy}
          x2={rz.labelX} y2={rz.labelY}
          stroke={color} strokeWidth={0.4} opacity={0.7}
        />,
        <text key={`rad-${rz.side}-label`}
          x={rz.labelX} y={rz.labelY - 1.5}
          fill={color} fontSize={2.8} fontFamily="'Courier New', monospace"
          textAnchor={rz.labelX < 0 ? 'end' : 'start'} opacity={0.85}>
          Radiator {(frac * 100).toFixed(0)}%
        </text>
      )
    }
  }

  return <g className="health-overlay">{elements}</g>
}

// ═══════════════════════════════════════════════════════════════════
// 9. REACT COMPONENT — RENDERING
// ═══════════════════════════════════════════════════════════════════
function CarModel({ frame, vehicle, mode }) {
  // Persistent state across frames
  const animRide = useRef({ FL: 0.5, FR: 0.5, RL: 0.5, RR: 0.5 })
  const dmgRef   = useRef({})
  const prevG    = useRef({ lat: 0, lon: 0 })

  if (!frame) return null

  // ── Suspension: target ride_height [0=extended, 1=compressed] ──
  const susp = frame.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const ride = animRide.current
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    const target = Math.max(0, Math.min(1, (susp[id] + MAX_SUSP_MM) / (2 * MAX_SUSP_MM)))
    ride[id] += (target - ride[id]) * LERP_K
  }

  // ── Steering ──
  // lateral_g sign: positive = left turn (CCW/Menger), negative = right turn
  // SVG rotation: positive angle = clockwise = visual right
  // Therefore negate: left turn → negative steerDeg → CCW → wheels point left
  const latG = frame.lateral_g || 0
  const steerDeg = Math.max(-STEER_MAX, Math.min(STEER_MAX, -latG * STEER_GAIN))

  // Debug: log steering at chicane entries (high |lat_g| with sign change)
  const prevLatG = prevG.current?.lat || 0
  if (Math.abs(latG) > 0.5 && Math.sign(latG) !== Math.sign(prevLatG) && Math.abs(prevLatG) > 0.1) {
    console.log(`[Steering] chicane entry: lat_g=${latG.toFixed(3)} steer=${steerDeg.toFixed(1)}° (${latG > 0 ? 'LEFT' : 'RIGHT'})`)
  }

  // ── Roll & Pitch (CSS) ──
  const lonG = frame.longitudinal_g || 0
  const rollDeg  = Math.max(-ROLL_MAX,  Math.min(ROLL_MAX,  latG * (ROLL_MAX / 2)))
  const pitchDeg = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, lonG * (PITCH_MAX / 1.5)))

  // ── Damage detection ──
  const dLat = latG - prevG.current.lat
  const dLon = lonG - prevG.current.lon
  const dmgZone = detectDamageZone(dLat, dLon)
  if (dmgZone) {
    inflictDamage(dmgRef.current, dmgZone, (Math.max(Math.abs(dLat), Math.abs(dLon)) - DMG_THRESH) * 0.5)
  }
  prevG.current = { lat: latG, lon: lonG }

  // ── Solve all node positions ──
  const pos = solvePositions(ride, steerDeg, dmgRef.current)
  updateBeamLengths(pos)

  // ── Mechanical health overlay (default mode only) ──
  const health = mode === 'default' ? computeHealth(frame, vehicle) : null

  // ── Per-corner strain colors ──
  const sColor = {}
  for (const id of ['FL', 'FR', 'RL', 'RR']) sColor[id] = strainColor(ride[id])

  // ── Build tire data from tireModel (single source of truth) ──
  const tireData = buildTireData(frame) || {}

  const tireColors = {}
  for (const { id } of CORNERS) {
    const td = tireData[id]
    if (!td) {
      tireColors[id] = { outer: '#888', center: '#888', inner: '#888' }
      continue
    }
    if (mode === 'temp') {
      tireColors[id] = {
        outer:  tireTempColor(td.outer_temp),
        center: tireTempColor(td.center_temp),
        inner:  tireTempColor(td.inner_temp),
      }
    } else if (mode === 'wear') {
      tireColors[id] = {
        outer:  tireWearColor(td.outer_wear, td.compound),
        center: tireWearColor(td.center_wear, td.compound),
        inner:  tireWearColor(td.inner_wear, td.compound),
      }
    } else {
      // Default mode: white fill
      tireColors[id] = { outer: '#ddd', center: '#ddd', inner: '#ddd' }
    }
  }

  // Monocoque polygon
  const monoPoints = MONO_SEQ.slice(0, -1).map(k => `${pos[k].x},${pos[k].y}`).join(' ')

  // CSS transform
  const transform = `perspective(400px) rotateX(${pitchDeg.toFixed(2)}deg) rotateY(${rollDeg.toFixed(2)}deg)`

  return (
    <svg viewBox="-35 -62 70 115" className="car-svg"
      style={{ transform, transformOrigin: '50% 50%' }}>

      {/* Monocoque fill */}
      <polygon points={monoPoints} fill="#0d0d0d" stroke="none" />

      {/* Front wing filled shapes */}
      <g opacity={0.9}>
        <polygon points={`${pos['fw.lepT'].x-3},${pos['fw.lepT'].y} ${pos['fw.lepT'].x+3},${pos['fw.lepT'].y} ${pos['fw.lepB'].x+3},${pos['fw.lepB'].y} ${pos['fw.lepB'].x-3},${pos['fw.lepB'].y}`}
          fill="#1a1a1a" />
        <polygon points={`${pos['fw.repT'].x-3},${pos['fw.repT'].y} ${pos['fw.repT'].x+3},${pos['fw.repT'].y} ${pos['fw.repB'].x+3},${pos['fw.repB'].y} ${pos['fw.repB'].x-3},${pos['fw.repB'].y}`}
          fill="#1a1a1a" />
        <polygon points={`${pos['fw.lt'].x},${pos['fw.lt'].y-4} ${pos['fw.rt'].x},${pos['fw.rt'].y-4} ${pos['fw.rt'].x},${pos['fw.rt'].y+4} ${pos['fw.lt'].x},${pos['fw.lt'].y+4}`}
          fill="#1a1a1a" />
        <polygon points={`${pos['fw.csL'].x},${pos['fw.csL'].y-2.5} ${pos['fw.csR'].x},${pos['fw.csR'].y-2.5} ${pos['fw.csR'].x},${pos['fw.csR'].y+2.5} ${pos['fw.csL'].x},${pos['fw.csL'].y+2.5}`}
          fill="#1a1a1a" />
      </g>

      {/* Rear wing filled shapes */}
      <g opacity={0.9}>
        <polygon points={`${pos['rw.lepT'].x-4},${pos['rw.lepT'].y} ${pos['rw.lepT'].x+4},${pos['rw.lepT'].y} ${pos['rw.lepB'].x+4},${pos['rw.lepB'].y} ${pos['rw.lepB'].x-4},${pos['rw.lepB'].y}`}
          fill="#1a1a1a" />
        <polygon points={`${pos['rw.repT'].x-4},${pos['rw.repT'].y} ${pos['rw.repT'].x+4},${pos['rw.repT'].y} ${pos['rw.repB'].x+4},${pos['rw.repB'].y} ${pos['rw.repB'].x-4},${pos['rw.repB'].y}`}
          fill="#1a1a1a" />
        <polygon points={`${pos['rw.lt'].x},${pos['rw.lt'].y-5} ${pos['rw.rt'].x},${pos['rw.rt'].y-5} ${pos['rw.rt'].x},${pos['rw.rt'].y+5} ${pos['rw.lt'].x},${pos['rw.lt'].y+5}`}
          fill="#1a1a1a" />
        <line x1={pos['rw.piL'].x} y1={pos['rw.piL'].y} x2={pos['rw.baL'].x} y2={pos['rw.baL'].y}
          stroke="#1a1a1a" strokeWidth={2} />
        <line x1={pos['rw.piR'].x} y1={pos['rw.piR'].y} x2={pos['rw.baR'].x} y2={pos['rw.baR'].y}
          stroke="#1a1a1a" strokeWidth={2} />
      </g>

      {/* All beams */}
      {BEAMS.map((beam, i) => {
        const pa = pos[beam.a], pb = pos[beam.b]
        if (!pa || !pb) return null
        const r = BEAM_RENDER[beam.type]
        if (!r) return null

        // Resolve dynamic color
        let color = beam.color
        if (beam.type === 'susp') {
          color = sColor[beam.corner]
        } else if (beam.type === 'tire_outer') {
          color = tireColors[beam.corner].outer
        } else if (beam.type === 'tire_inner') {
          color = tireColors[beam.corner].inner
        } else if (beam.type === 'tire_top' || beam.type === 'tire_bot') {
          color = tireColors[beam.corner].center
        } else if (beam.type === 'wing') {
          // Damage-reactive: shift to red if nodes displaced
          const da = dmgRef.current[beam.a], db = dmgRef.current[beam.b]
          if ((da && (Math.abs(da[0]) + Math.abs(da[1]) > 0.1)) ||
              (db && (Math.abs(db[0]) + Math.abs(db[1]) > 0.1))) {
            color = '#ff4444'
          }
        }

        return (
          <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={color} strokeWidth={r.w} opacity={r.op} strokeLinecap="round" />
        )
      })}

      {/* Tire rounded rects with 3-zone gradient fill */}
      <defs>
        {CORNERS.map(({ id, p, side }) => {
          const tc = tireColors[id]
          // Gradient goes from outer edge to inner edge
          // L-side: outer is left (x1=0), inner is right (x2=1)
          // R-side: outer is right (x1=1), inner is left (x2=0)
          const x1 = side === 'L' ? '0' : '1'
          const x2 = side === 'L' ? '1' : '0'
          return (
            <linearGradient key={`tg-${id}`} id={`tg-${id}`}
              x1={x1} y1="0" x2={x2} y2="0">
              <stop offset="0%"   stopColor={tc.outer} />
              <stop offset="33%"  stopColor={tc.outer} />
              <stop offset="40%"  stopColor={tc.center} />
              <stop offset="60%"  stopColor={tc.center} />
              <stop offset="67%"  stopColor={tc.inner} />
              <stop offset="100%" stopColor={tc.inner} />
            </linearGradient>
          )
        })}
      </defs>
      {CORNERS.map(({ id, p, tw, steers }) => {
        const hub = pos[`${p}.hub`]
        if (!hub) return null
        const tc = tireColors[id]
        const isDefault = mode === 'default'
        const w = tw * 2, h = TIRE_H * 2
        // Compute rotation from hub orientation (steering + suspension)
        const ot = pos[`${p}.tire.ot`], it = pos[`${p}.tire.it`]
        let angle = 0
        if (ot && it) {
          const midTopX = (ot.x + it.x) / 2, midTopY = (ot.y + it.y) / 2
          angle = Math.atan2(midTopX - hub.x, -(midTopY - hub.y)) * (180 / Math.PI)
        }
        return (
          <g key={`tire-${id}`}
            transform={`translate(${hub.x},${hub.y}) rotate(${angle.toFixed(2)})`}>
            <rect x={-tw} y={-TIRE_H} width={w} height={h}
              rx={2.5} ry={2.5}
              fill={isDefault ? '#111' : `url(#tg-${id})`}
              stroke={isDefault ? '#fff' : tc.center}
              strokeWidth={isDefault ? 1.2 : 0.8}
              opacity={isDefault ? 0.9 : 0.85} />
          </g>
        )
      })}

      {/* Mechanical health overlay (default mode only) */}
      {mode === 'default' && <HealthOverlay health={health} pos={pos} />}

      {/* Node dots */}
      {Object.entries(NODE_VIS).map(([k, cls]) => {
        const p = pos[k]
        if (!p) return null
        const d = DOT[cls]
        if (!d) return null
        return (
          <circle key={k} cx={p.x} cy={p.y} r={d.r}
            fill={d.fill} opacity={d.op} />
        )
      })}
    </svg>
  )
}

export default memo(CarModel)
