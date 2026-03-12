import { memo, useState, useRef, useEffect } from 'react'
import CarModel from './CarModel'
import { tempToColorSmooth } from '../utils/colors'

// ═══════════════════════════════════════════════════════════════════
// Multi-view car model panel — hand-crafted inline SVG blueprints.
// TOP = existing CarModel (animated wireframe).
// SIDE/FRONT/REAR = fixed 2D SVG coordinates with dynamic color
// updates via useEffect + refs. No 3D math anywhere.
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_TIRE_COLOR = '#666666'

// Check if frame has real tire temp data (non-zero values from simulation)
function hasTireData(frame) {
  const t = frame?.tire_temp_C
  if (!t) return false
  return (t.FL > 0 || t.FR > 0 || t.RL > 0 || t.RR > 0)
}

// Get tire color: default grey when no data, thermal color when sim is running
function tireColor(temp, optTemp, ovhTemp, hasData) {
  if (!hasData) return DEFAULT_TIRE_COLOR
  return tempToColorSmooth(temp, optTemp, ovhTemp)
}

// ── Suspension strain color: blue=relaxed → orange=loaded → red=overloaded ──
function suspColor(mm) {
  const abs = Math.abs(mm || 0)
  const t = Math.min(1, abs / 30)
  if (t < 0.4) {
    const s = t / 0.4
    return `rgb(${Math.round(80 + 100 * s)},${Math.round(130 + 80 * s)},${Math.round(220 - 20 * s)})`
  }
  if (t < 0.7) {
    const s = (t - 0.4) / 0.3
    return `rgb(${Math.round(210 + 35 * s)},${Math.round(210 - 80 * s)},${Math.round(200 - 180 * s)})`
  }
  const s = (t - 0.7) / 0.3
  return `rgb(245,${Math.round(130 - 100 * s)},20)`
}

// ── Blueprint grid as SVG pattern (25px, #0a1f30, opacity 0.4) ──
function BlueprintDefs() {
  return (
    <defs>
      <pattern id="bp-grid" width={25} height={25} patternUnits="userSpaceOnUse">
        <line x1={25} y1={0} x2={25} y2={25} stroke="#0a1f30" strokeWidth={0.5} />
        <line x1={0} y1={25} x2={25} y2={25} stroke="#0a1f30" strokeWidth={0.5} />
      </pattern>
    </defs>
  )
}

function GridBg({ w, h }) {
  return <rect width={w} height={h} fill="url(#bp-grid)" opacity={0.4} />
}

// ════════════════════════════════════════════
//  SIDE VIEW — 800x350, nose faces right
// ════════════════════════════════════════════
function SideViewSvg({ frame, vehicle }) {
  const svgRef = useRef(null)
  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120
  const hasData = hasTireData(frame)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Tire colors (average L+R per axle for side view)
    const frontTemp = (tireTemps.FL + tireTemps.FR) / 2
    const rearTemp = (tireTemps.RL + tireTemps.RR) / 2
    const ftEl = svg.getElementById('s-tire-f')
    const rtEl = svg.getElementById('s-tire-r')
    if (ftEl) ftEl.setAttribute('stroke', tireColor(frontTemp, optTemp, ovhTemp, hasData))
    if (rtEl) rtEl.setAttribute('stroke', tireColor(rearTemp, optTemp, ovhTemp, hasData))

    // Suspension colors
    const fAvg = (suspMM.FL + suspMM.FR) / 2
    const rAvg = (suspMM.RL + suspMM.RR) / 2
    const fCol = suspColor(fAvg), rCol = suspColor(rAvg)
    for (const id of ['s-susp-fu', 's-susp-fl']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', fCol)
    }
    for (const id of ['s-susp-ru', 's-susp-rl']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rCol)
    }

    // Ride height: translate chassis group
    const chassis = svg.getElementById('s-chassis')
    if (chassis) {
      const rideH = (fAvg - 15) * 0.3
      chassis.setAttribute('transform', `translate(0,${rideH.toFixed(1)})`)
    }
  }, [tireTemps, suspMM, optTemp, ovhTemp, hasData])

  return (
    <svg ref={svgRef} viewBox="0 0 800 350" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={800} h={350} />

      {/* Ground line */}
      <line x1={0} y1={355} x2={800} y2={355} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Front tire */}
      <circle id="s-tire-f" cx={160} cy={270} r={48} fill="#222222" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={160} cy={270} r={28} fill="none" stroke="#888888" strokeWidth={1.2} opacity={0.7} />
      <circle cx={160} cy={270} r={3} fill="#aaaaaa" opacity={0.8} />

      {/* Rear tire */}
      <circle id="s-tire-r" cx={620} cy={270} r={55} fill="#222222" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={620} cy={270} r={32} fill="none" stroke="#888888" strokeWidth={1.2} opacity={0.7} />
      <circle cx={620} cy={270} r={3} fill="#aaaaaa" opacity={0.8} />

      {/* Chassis group (translates with ride height) */}
      <g id="s-chassis">
        {/* Nose + monocoque top line */}
        <polyline points="80,275 160,230 320,210 420,215 520,225"
          fill="none" stroke="#888888" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* Monocoque bottom line */}
        <line x1={160} y1={275} x2={520} y2={275}
          stroke="#888888" strokeWidth={2.5} strokeLinecap="round" />

        {/* Nose underside */}
        <line x1={80} y1={275} x2={160} y2={275}
          stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />

        {/* Cockpit opening */}
        <path d="M 280,210 Q 340,175 400,215" fill="none" stroke="#555555" strokeWidth={1.5} />

        {/* Engine cover */}
        <polyline points="420,215 560,228 560,265"
          fill="none" stroke="#888888" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Engine cover to gearbox bottom */}
        <line x1={520} y1={275} x2={560} y2={265}
          stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />

        {/* Roll hoop */}
        <polyline points="340,215 340,165 380,165 380,215"
          fill="none" stroke="#888888" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* Front suspension */}
        <line id="s-susp-fu" x1={160} y1={235} x2={260} y2={228}
          stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
        <line id="s-susp-fl" x1={160} y1={265} x2={260} y2={268}
          stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />

        {/* Rear suspension */}
        <line id="s-susp-ru" x1={620} y1={235} x2={530} y2={228}
          stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
        <line id="s-susp-rl" x1={620} y1={265} x2={530} y2={268}
          stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      </g>

      {/* Rear wing */}
      <line x1={540} y1={110} x2={700} y2={110} stroke="#777777" strokeWidth={4} strokeLinecap="round" />
      <line x1={600} y1={110} x2={600} y2={228} stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={540} y1={110} x2={540} y2={145} stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={700} y1={110} x2={700} y2={145} stroke="#777777" strokeWidth={2} strokeLinecap="round" />

      {/* Front wing */}
      <line x1={60} y1={290} x2={220} y2={290} stroke="#777777" strokeWidth={3} strokeLinecap="round" />
      <line x1={60} y1={280} x2={60} y2={295} stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={220} y1={280} x2={220} y2={295} stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={140} y1={290} x2={100} y2={278} stroke="#555555" strokeWidth={1} strokeLinecap="round" opacity={0.6} />
    </svg>
  )
}

// ════════════════════════════════════════════
//  FRONT VIEW — 600x400, complete redraw
// ════════════════════════════════════════════
function FrontViewSvg({ frame, vehicle }) {
  const svgRef = useRef(null)
  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const latG = frame?.lateral_g || 0
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120
  const hasData = hasTireData(frame)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Tire colors
    const flEl = svg.getElementById('f-tire-l')
    const frEl = svg.getElementById('f-tire-r')
    if (flEl) flEl.setAttribute('stroke', tireColor(tireTemps.FL, optTemp, ovhTemp, hasData))
    if (frEl) frEl.setAttribute('stroke', tireColor(tireTemps.FR, optTemp, ovhTemp, hasData))

    // Suspension colors
    const flCol = suspColor(suspMM.FL), frCol = suspColor(suspMM.FR)
    for (const id of ['f-uwb-l', 'f-lwb-l', 'f-push-l']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', flCol)
    }
    for (const id of ['f-uwb-r', 'f-lwb-r', 'f-push-r']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', frCol)
    }

    // Body roll: rotate monocoque
    const mono = svg.getElementById('f-mono')
    if (mono) {
      const rollDeg = latG * 1.2
      mono.setAttribute('transform', `rotate(${rollDeg.toFixed(2)},300,265)`)
    }
  }, [tireTemps, suspMM, latG, optTemp, ovhTemp, hasData])

  return (
    <svg ref={svgRef} viewBox="0 0 600 400" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={600} h={400} />

      {/* Ground line */}
      <line x1={0} y1={355} x2={600} y2={355} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Front wing main plane — dominant lowest element, 90% width */}
      <line x1={30} y1={310} x2={570} y2={310} stroke="#888888" strokeWidth={5} strokeLinecap="round" />
      {/* Front wing endplates */}
      <line x1={30} y1={295} x2={30} y2={318} stroke="#666666" strokeWidth={2} strokeLinecap="round" />
      <line x1={570} y1={295} x2={570} y2={318} stroke="#666666" strokeWidth={2} strokeLinecap="round" />
      {/* Front wing secondary element */}
      <line x1={55} y1={300} x2={545} y2={300} stroke="#666666" strokeWidth={2} strokeLinecap="round" opacity={0.5} />

      {/* Left tire — large, low, overlapping wing plane */}
      <circle id="f-tire-l" cx={145} cy={268} r={58} fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={145} cy={268} r={32} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={145} cy={268} r={4} fill="#333333" />

      {/* Right tire */}
      <circle id="f-tire-r" cx={455} cy={268} r={58} fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={455} cy={268} r={32} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={455} cy={268} r={4} fill="#333333" />

      {/* Front brake calipers */}
      <rect x={172} y={252} width={16} height={24} rx={2} fill="#222222" stroke="#555555" strokeWidth={1} />
      <rect x={412} y={252} width={16} height={24} rx={2} fill="#222222" stroke="#555555" strokeWidth={1} />

      {/* Suspension wishbones */}
      <line id="f-uwb-l" x1={145} y1={242} x2={258} y2={200}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-uwb-r" x1={455} y1={242} x2={342} y2={200}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-lwb-l" x1={145} y1={275} x2={258} y2={258}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-lwb-r" x1={455} y1={275} x2={342} y2={258}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />

      {/* Push rods */}
      <line id="f-push-l" x1={168} y1={258} x2={258} y2={228}
        stroke="#444444" strokeWidth={1} strokeLinecap="round" />
      <line id="f-push-r" x1={432} y1={258} x2={342} y2={228}
        stroke="#444444" strokeWidth={1} strokeLinecap="round" />

      {/* Monocoque body — narrow, between and above tires (rotates with roll) */}
      <g id="f-mono">
        <path d="M 255,80 L 255,255 Q 255,265 265,265 L 335,265 Q 345,265 345,255 L 345,80 Q 345,70 300,65 Q 255,70 255,80"
          fill="#1a1a1a" stroke="#777777" strokeWidth={2} />

        {/* Cockpit rim */}
        <ellipse cx={300} cy={145} rx={42} ry={15} fill="#0d0d0d" stroke="#555555" strokeWidth={1.5} />

        {/* Roll hoop */}
        <path d="M 278,145 L 278,88 Q 278,78 300,75 Q 322,78 322,88 L 322,145"
          fill="none" stroke="#777777" strokeWidth={2.5} />
      </g>
    </svg>
  )
}

// ════════════════════════════════════════════
//  REAR VIEW — 600x400, complete redraw
// ════════════════════════════════════════════
function RearViewSvg({ frame, vehicle }) {
  const svgRef = useRef(null)
  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const latG = frame?.lateral_g || 0
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120
  const hasData = hasTireData(frame)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Tire colors
    const rlEl = svg.getElementById('r-tire-l')
    const rrEl = svg.getElementById('r-tire-r')
    if (rlEl) rlEl.setAttribute('stroke', tireColor(tireTemps.RL, optTemp, ovhTemp, hasData))
    if (rrEl) rrEl.setAttribute('stroke', tireColor(tireTemps.RR, optTemp, ovhTemp, hasData))

    // Suspension colors
    const rlCol = suspColor(suspMM.RL), rrCol = suspColor(suspMM.RR)
    for (const id of ['r-uwb-l', 'r-lwb-l']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rlCol)
    }
    for (const id of ['r-uwb-r', 'r-lwb-r']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rrCol)
    }

    // Body roll
    const gbox = svg.getElementById('r-gbox')
    if (gbox) {
      const rollDeg = latG * 1.2
      gbox.setAttribute('transform', `rotate(${rollDeg.toFixed(2)},300,290)`)
    }
  }, [tireTemps, suspMM, latG, optTemp, ovhTemp, hasData])

  return (
    <svg ref={svgRef} viewBox="0 0 600 400" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={600} h={400} />

      {/* Ground line */}
      <line x1={0} y1={355} x2={600} y2={355} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Rear wing — massive, wider than tires */}
      <line x1={55} y1={88} x2={545} y2={88} stroke="#888888" strokeWidth={6} strokeLinecap="round" />
      {/* Secondary element */}
      <line x1={75} y1={108} x2={525} y2={108} stroke="#666666" strokeWidth={2.5} strokeLinecap="round" />
      {/* Endplate L */}
      <path d="M 55,88 L 55,155 L 75,155 L 75,88" fill="#1a1a1a" stroke="#666666" strokeWidth={1.5} />
      {/* Endplate R */}
      <path d="M 545,88 L 545,155 L 525,155 L 525,88" fill="#1a1a1a" stroke="#666666" strokeWidth={1.5} />
      {/* Wing pillars */}
      <line x1={175} y1={155} x2={175} y2={228} stroke="#555555" strokeWidth={2} strokeLinecap="round" />
      <line x1={425} y1={155} x2={425} y2={228} stroke="#555555" strokeWidth={2} strokeLinecap="round" />

      {/* Left rear tire — wider and larger than front */}
      <circle id="r-tire-l" cx={118} cy={285} r={68} fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={118} cy={285} r={38} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={118} cy={285} r={4} fill="#333333" />

      {/* Right rear tire */}
      <circle id="r-tire-r" cx={482} cy={285} r={68} fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={482} cy={285} r={38} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={482} cy={285} r={4} fill="#333333" />

      {/* Rear brake calipers */}
      <rect x={155} y={268} width={18} height={28} rx={2} fill="#222222" stroke="#555555" strokeWidth={1} />
      <rect x={427} y={268} width={18} height={28} rx={2} fill="#222222" stroke="#555555" strokeWidth={1} />

      {/* Suspension wishbones */}
      <line id="r-uwb-l" x1={118} y1={248} x2={238} y2={232}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-uwb-r" x1={482} y1={248} x2={362} y2={232}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-lwb-l" x1={118} y1={302} x2={238} y2={278}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-lwb-r" x1={482} y1={302} x2={362} y2={278}
        stroke="#666666" strokeWidth={1.5} strokeLinecap="round" />

      {/* Gearbox (rotates with body roll) */}
      <rect id="r-gbox" x={238} y={218} width={124} height={72} rx={6}
        fill="#161616" stroke="#555555" strokeWidth={1.5} />

      {/* Diffuser */}
      <polygon points="155,338 445,338 425,308 175,308"
        fill="#141414" stroke="#555555" strokeWidth={1.5} />
      {/* Diffuser fins */}
      <line x1={225} y1={310} x2={225} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={275} y1={310} x2={275} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={325} y1={310} x2={325} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={375} y1={310} x2={375} y2={336} stroke="#333333" strokeWidth={1} />
    </svg>
  )
}

// ════════════════════════════════════════════
//  TOP VIEW — keep existing node-beam system
// ════════════════════════════════════════════

// 3D nodes for top-view projection only
const NODES = {
  'ch.nose':    { x: 0, y: 0, z: 120 },
  'ch.fbulk':   { x: 0, y: 0, z: 80 },
  'ch.ckF':     { x: 0, y: 8, z: 30 },
  'ch.ckR':     { x: 0, y: 12, z: -10 },
  'ch.engF':    { x: 0, y: 10, z: -20 },
  'ch.engR':    { x: 0, y: 8, z: -70 },
  'ch.gbox':    { x: 0, y: 6, z: -90 },
  'ch.crash':   { x: 0, y: 4, z: -110 },
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
  'fw.mpL':     { x: -110, y: 4, z: 115 },
  'fw.mpR':     { x: 110, y: 4, z: 115 },
  'fw.mcL':     { x: -40, y: 4, z: 118 },
  'fw.mcR':     { x: 40, y: 4, z: 118 },
  'rw.mpL':     { x: -70, y: 55, z: -95 },
  'rw.mpR':     { x: 70, y: 55, z: -95 },
  'sp.fL':      { x: -28, y: 8, z: -10 },
  'sp.rL':      { x: -28, y: 8, z: -65 },
  'sp.tL':      { x: -28, y: 20, z: -35 },
  'sp.fR':      { x: 28, y: 8, z: -10 },
  'sp.rR':      { x: 28, y: 8, z: -65 },
  'sp.tR':      { x: 28, y: 20, z: -35 },
}

const BEAMS = [
  ['fa.uwiL', 'fa.uwoL', 'susp'], ['fa.uwiR', 'fa.uwoR', 'susp'],
  ['fa.lwiL', 'fa.lwoL', 'susp'], ['fa.lwiR', 'fa.lwoR', 'susp'],
  ['fa.uwoL', 'fa.wheelL', 'susp'], ['fa.uwoR', 'fa.wheelR', 'susp'],
  ['fa.lwoL', 'fa.wheelL', 'susp'], ['fa.lwoR', 'fa.wheelR', 'susp'],
  ['fa.pushL', 'fa.lwoL', 'susp'], ['fa.pushR', 'fa.lwoR', 'susp'],
  ['fa.pushL', 'fa.uwiL', 'susp'], ['fa.pushR', 'fa.uwiR', 'susp'],
  ['ra.uwiL', 'ra.uwoL', 'susp'], ['ra.uwiR', 'ra.uwoR', 'susp'],
  ['ra.lwiL', 'ra.lwoL', 'susp'], ['ra.lwiR', 'ra.lwoR', 'susp'],
  ['ra.uwoL', 'ra.wheelL', 'susp'], ['ra.uwoR', 'ra.wheelR', 'susp'],
  ['ra.lwoL', 'ra.wheelL', 'susp'], ['ra.lwoR', 'ra.wheelR', 'susp'],
]

function beamSuspMM(a, b, susp) {
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

function projectTop(n) { return { sx: n.x, sy: -n.z } }

function TopViewSvg({ frame, vehicle }) {
  const susp = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const tireTemps = frame?.tire_temp_C || { FL: 25, FR: 25, RL: 25, RR: 25 }
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120
  const hasData = hasTireData(frame)

  const proj = {}
  for (const k in NODES) proj[k] = projectTop(NODES[k])

  // Bounding box
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity
  for (const k in proj) {
    const { sx, sy } = proj[k]
    if (sx < x1) x1 = sx; if (sx > x2) x2 = sx
    if (sy < y1) y1 = sy; if (sy > y2) y2 = sy
  }
  const maxR = 18
  x1 -= maxR; x2 += maxR; y1 -= maxR; y2 += maxR
  const w = x2 - x1, h = y2 - y1
  const pad = Math.max(w, h) * 0.06
  const vb = `${(x1 - pad).toFixed(1)} ${(y1 - pad).toFixed(1)} ${(w + 2 * pad).toFixed(1)} ${(h + 2 * pad).toFixed(1)}`

  // Monocoque teardrop
  const monoKeys = ['ch.nose', 'ch.fbulk', 'ch.ckF', 'ch.ckR', 'ch.engF', 'ch.engR', 'ch.gbox', 'ch.crash']
  const monoWidth = [4, 14, 16, 16, 14, 12, 8, 6]
  const monoL = monoKeys.map((k, i) => `${(proj[k].sx - monoWidth[i]).toFixed(1)},${proj[k].sy.toFixed(1)}`)
  const monoR = monoKeys.map((k, i) => `${(proj[k].sx + monoWidth[i]).toFixed(1)},${proj[k].sy.toFixed(1)}`).reverse()
  const monoPts = [...monoL, ...monoR].join(' ')

  const fwPts = [proj['fw.mpL'], proj['fw.mcL'], proj['fw.mcR'], proj['fw.mpR']]
    .filter(Boolean).map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')

  const rwPts = proj['rw.mpL'] && proj['rw.mpR']
    ? `${proj['rw.mpL'].sx.toFixed(1)},${(proj['rw.mpL'].sy - 4).toFixed(1)} ${proj['rw.mpR'].sx.toFixed(1)},${(proj['rw.mpR'].sy - 4).toFixed(1)} ${proj['rw.mpR'].sx.toFixed(1)},${(proj['rw.mpR'].sy + 4).toFixed(1)} ${proj['rw.mpL'].sx.toFixed(1)},${(proj['rw.mpL'].sy + 4).toFixed(1)}`
    : null

  const spL = [proj['sp.fL'], proj['sp.tL'], proj['sp.rL']].filter(Boolean)
  const spR = [proj['sp.fR'], proj['sp.tR'], proj['sp.rR']].filter(Boolean)

  const tireDefs = [
    { cx: proj['fa.wheelL']?.sx, cy: proj['fa.wheelL']?.sy, w: 16, h: 24, corner: 'FL' },
    { cx: proj['fa.wheelR']?.sx, cy: proj['fa.wheelR']?.sy, w: 16, h: 24, corner: 'FR' },
    { cx: proj['ra.wheelL']?.sx, cy: proj['ra.wheelL']?.sy, w: 22, h: 28, corner: 'RL' },
    { cx: proj['ra.wheelR']?.sx, cy: proj['ra.wheelR']?.sy, w: 22, h: 28, corner: 'RR' },
  ]

  return (
    <svg viewBox={vb} style={{ width: '100%', height: '100%', display: 'block' }}>
      {tireDefs.map(t => {
        if (t.cx == null) return null
        const temp = tireTemps[t.corner] || 25
        const tColor = hasData ? tempToColorSmooth(temp, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR
        return (
          <g key={t.corner}>
            <rect x={t.cx - t.w / 2} y={t.cy - t.h / 2} width={t.w} height={t.h}
              rx={4} fill="#222222" stroke={tColor} strokeWidth={2.5} opacity={0.9} />
            <circle cx={t.cx} cy={t.cy} r={4}
              fill="none" stroke="#888888" strokeWidth={0.8} opacity={0.6} />
          </g>
        )
      })}

      <polygon points={monoPts} fill="#1a1a1a" stroke="#cccccc" strokeWidth={1.5}
        strokeLinejoin="round" opacity={0.85} />

      {spL.length === 3 && (
        <polygon points={spL.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')}
          fill="#141414" stroke="#777777" strokeWidth={1} opacity={0.6} />
      )}
      {spR.length === 3 && (
        <polygon points={spR.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')}
          fill="#141414" stroke="#777777" strokeWidth={1} opacity={0.6} />
      )}

      {fwPts && (
        <polygon points={fwPts} fill="#1a1a1a" stroke="#aaaaaa" strokeWidth={1.5} opacity={0.8} />
      )}

      {rwPts && (
        <polygon points={rwPts} fill="#1a1a1a" stroke="#aaaaaa" strokeWidth={1.5} opacity={0.8} />
      )}

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

// ════════════════════════════════════════════
//  Main component — view tabs + active view
// ════════════════════════════════════════════

const VIEWS = ['top', 'front', 'side', 'rear']

function CarModelViews({ frame, vehicle, mode }) {
  const [activeView, setActiveView] = useState('top')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      <div style={{ flex: 1, minHeight: 0 }}>
        {activeView === 'top' && <CarModel frame={frame} vehicle={vehicle} mode={mode} />}
        {activeView === 'front' && <FrontViewSvg frame={frame} vehicle={vehicle} />}
        {activeView === 'side' && <SideViewSvg frame={frame} vehicle={vehicle} />}
        {activeView === 'rear' && <RearViewSvg frame={frame} vehicle={vehicle} />}
      </div>
    </div>
  )
}

export default memo(CarModelViews)
