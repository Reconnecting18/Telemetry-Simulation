import { memo, useState, useRef, useEffect } from 'react'
import CarModel from './CarModel'
import { tempToColorSmooth } from '../utils/colors'

// ═══════════════════════════════════════════════════════════════════
// Multi-view car model panel — hand-crafted inline SVG blueprints.
// TOP = existing CarModel (animated wireframe).
// SIDE/FRONT/REAR = fixed 2D SVG coordinates with dynamic color
// updates via useEffect + refs. No 3D math anywhere.
//
// Color rules:
//   Tires:      #555555 default, tempToColor only when tire_temp > 0
//   Suspension: #444444 default, strainColor only when |mm| > 5
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_TIRE_COLOR = '#555555'
const DEFAULT_SUSP_COLOR = '#444444'
const SUSP_THRESHOLD = 5 // mm — below this, suspension stays grey

// ── Suspension strain color with threshold ──
// Returns #444444 for values <= 5mm, then gradient for 5-30mm:
//   blue(relaxed) → orange(loaded) → red(overloaded)
function suspColor(mm) {
  const abs = Math.abs(mm || 0)
  if (abs <= SUSP_THRESHOLD) return DEFAULT_SUSP_COLOR
  const t = Math.min(1, (abs - SUSP_THRESHOLD) / 25)
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

// ── Blueprint grid: dual-layer SVG pattern ──
function BlueprintDefs() {
  return (
    <defs>
      <pattern id="bp-sm" width={20} height={20} patternUnits="userSpaceOnUse">
        <line x1={20} y1={0} x2={20} y2={20} stroke="#0c1e2e" strokeWidth={0.5} />
        <line x1={0} y1={20} x2={20} y2={20} stroke="#0c1e2e" strokeWidth={0.5} />
      </pattern>
      <pattern id="bp-lg" width={100} height={100} patternUnits="userSpaceOnUse">
        <line x1={100} y1={0} x2={100} y2={100} stroke="#0f2535" strokeWidth={0.8} />
        <line x1={0} y1={100} x2={100} y2={100} stroke="#0f2535" strokeWidth={0.8} />
      </pattern>
    </defs>
  )
}

function GridBg({ w, h }) {
  return (
    <>
      <rect width={w} height={h} fill="url(#bp-sm)" opacity={0.5} />
      <rect width={w} height={h} fill="url(#bp-lg)" opacity={0.7} />
    </>
  )
}

// ── Dimension annotation line ──
function DimLine({ x1, x2, y, label }) {
  const mid = (x1 + x2) / 2
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#1a3a4a" strokeWidth={0.5} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#1a3a4a" strokeWidth={0.5} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#1a3a4a" strokeWidth={0.5} />
      <text x={mid} y={y + 12} textAnchor="middle"
        fill="#1e4060" fontFamily="monospace" fontSize={9}>{label}</text>
    </g>
  )
}

// ── Tire tread radial lines (6 evenly spaced) ──
function TreadLines({ cx, cy, innerR, outerR }) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3
    const c = Math.cos(a), s = Math.sin(a)
    return (
      <line key={i}
        x1={cx + (innerR + 2) * c} y1={cy + (innerR + 2) * s}
        x2={cx + (outerR - 2) * c} y2={cy + (outerR - 2) * s}
        stroke="#1a1a1a" strokeWidth={1} />
    )
  })
}

// ════════════════════════════════════════════
//  SIDE VIEW — 800x360, nose faces right
// ════════════════════════════════════════════
function SideViewSvg({ frame, vehicle, hasSimData }) {
  const svgRef = useRef(null)
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Side view tires always #555555 — no temp visualization
    const ftEl = svg.getElementById('s-tire-f')
    const rtEl = svg.getElementById('s-tire-r')
    if (ftEl) ftEl.setAttribute('stroke', DEFAULT_TIRE_COLOR)
    if (rtEl) rtEl.setAttribute('stroke', DEFAULT_TIRE_COLOR)

    const fAvg = (suspMM.FL + suspMM.FR) / 2
    const rAvg = (suspMM.RL + suspMM.RR) / 2
    const fCol = hasSimData && Math.abs(fAvg) > 3 ? suspColor(fAvg) : DEFAULT_SUSP_COLOR
    const rCol = hasSimData && Math.abs(rAvg) > 3 ? suspColor(rAvg) : DEFAULT_SUSP_COLOR
    for (const id of ['s-susp-fu', 's-susp-fl']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', fCol)
    }
    for (const id of ['s-susp-ru', 's-susp-rl']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rCol)
    }

    const chassis = svg.getElementById('s-chassis')
    if (chassis) {
      const rideH = (fAvg - 15) * 0.3
      chassis.setAttribute('transform', `translate(0,${rideH.toFixed(1)})`)
    }
  }, [suspMM, hasSimData])

  return (
    <svg ref={svgRef} viewBox="0 0 800 360" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={800} h={360} />

      {/* Ground line */}
      <line x1={0} y1={328} x2={800} y2={328}
        stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Front tire */}
      <circle id="s-tire-f" cx={160} cy={270} r={48}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={160} cy={270} r={28} fill="none" stroke="#444444" strokeWidth={1.5} />
      <circle cx={160} cy={270} r={3} fill="#333333" />

      {/* Rear tire */}
      <circle id="s-tire-r" cx={620} cy={270} r={55}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={620} cy={270} r={32} fill="none" stroke="#444444" strokeWidth={1.5} />
      <circle cx={620} cy={270} r={3} fill="#333333" />

      {/* Chassis group (translates with ride height) */}
      <g id="s-chassis">
        {/* Sidepod filled shape — behind monocoque profile */}
        <path d="M 280,235 L 530,240 L 530,272 L 280,270 Z"
          fill="#161616" stroke="#444444" strokeWidth={1.5} />

        {/* Radiator inlet opening */}
        <rect x={282} y={240} width={22} height={28} rx={3}
          fill="#0a0a0a" stroke="#555555" strokeWidth={1} />

        {/* Sidepod outlet louvers */}
        <line x1={512} y1={243} x2={522} y2={248} stroke="#333333" strokeWidth={1} />
        <line x1={512} y1={252} x2={522} y2={257} stroke="#333333" strokeWidth={1} />
        <line x1={512} y1={261} x2={522} y2={266} stroke="#333333" strokeWidth={1} />

        {/* Underfloor line */}
        <line x1={100} y1={275} x2={640} y2={275}
          stroke="#333333" strokeWidth={1} />

        {/* Nose + monocoque top profile */}
        <polyline points="80,275 160,230 320,210 420,215 520,225"
          fill="none" stroke="#888888" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Monocoque bottom line */}
        <line x1={160} y1={275} x2={520} y2={275}
          stroke="#888888" strokeWidth={2.5} strokeLinecap="round" />

        {/* Nose underside */}
        <line x1={80} y1={275} x2={160} y2={275}
          stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />

        {/* Cockpit opening — smooth curved cutout in profile */}
        <path d="M 280,210 Q 340,178 400,215"
          fill="none" stroke="#555555" strokeWidth={1.5} />

        {/* Engine cover */}
        <polyline points="420,215 560,228 560,265"
          fill="none" stroke="#888888" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        <line x1={520} y1={275} x2={560} y2={265}
          stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />

        {/* Roll hoop — narrow blade, 10px wide with rounded top */}
        <path d="M 355,215 L 355,162 Q 355,155 360,155 Q 365,155 365,162 L 365,215"
          fill="none" stroke="#888888" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Front suspension */}
        <line id="s-susp-fu" x1={160} y1={235} x2={260} y2={228}
          stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
        <line id="s-susp-fl" x1={160} y1={265} x2={260} y2={268}
          stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />

        {/* Rear suspension */}
        <line id="s-susp-ru" x1={620} y1={235} x2={530} y2={228}
          stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
        <line id="s-susp-rl" x1={620} y1={265} x2={530} y2={268}
          stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      </g>

      {/* Rear wing */}
      <line x1={540} y1={110} x2={700} y2={110}
        stroke="#777777" strokeWidth={4} strokeLinecap="round" />
      <line x1={600} y1={110} x2={600} y2={228}
        stroke="#555555" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={540} y1={110} x2={540} y2={145}
        stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={700} y1={110} x2={700} y2={145}
        stroke="#777777" strokeWidth={2} strokeLinecap="round" />

      {/* Front wing */}
      <line x1={60} y1={290} x2={220} y2={290}
        stroke="#777777" strokeWidth={3} strokeLinecap="round" />
      <line x1={60} y1={280} x2={60} y2={295}
        stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={220} y1={280} x2={220} y2={295}
        stroke="#777777" strokeWidth={2} strokeLinecap="round" />
      <line x1={140} y1={290} x2={100} y2={278}
        stroke="#555555" strokeWidth={1} strokeLinecap="round" opacity={0.6} />

      {/* Dimension: wheelbase */}
      <DimLine x1={160} x2={620} y={345} label="2850mm" />
    </svg>
  )
}

// ════════════════════════════════════════════
//  FRONT VIEW — 600x400
// ════════════════════════════════════════════
function FrontViewSvg({ frame, vehicle, hasSimData }) {
  const svgRef = useRef(null)
  const tireTemps = frame?.tire_temp_C || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const latG = frame?.lateral_g || 0
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const flEl = svg.getElementById('f-tire-l')
    const frEl = svg.getElementById('f-tire-r')
    if (flEl) flEl.setAttribute('stroke', hasSimData && tireTemps.FL > 0 ? tempToColorSmooth(tireTemps.FL, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR)
    if (frEl) frEl.setAttribute('stroke', hasSimData && tireTemps.FR > 0 ? tempToColorSmooth(tireTemps.FR, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR)

    const flCol = hasSimData && Math.abs(suspMM.FL) > 3 ? suspColor(suspMM.FL) : DEFAULT_SUSP_COLOR
    const frCol = hasSimData && Math.abs(suspMM.FR) > 3 ? suspColor(suspMM.FR) : DEFAULT_SUSP_COLOR
    for (const id of ['f-uwb-l', 'f-lwb-l', 'f-push-l']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', flCol)
    }
    for (const id of ['f-uwb-r', 'f-lwb-r', 'f-push-r']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', frCol)
    }

    const mono = svg.getElementById('f-mono')
    if (mono) {
      const rollDeg = latG * 1.2
      mono.setAttribute('transform', `rotate(${rollDeg.toFixed(2)},300,265)`)
    }
  }, [tireTemps, suspMM, latG, optTemp, ovhTemp, hasSimData])

  return (
    <svg ref={svgRef} viewBox="0 0 600 400" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={600} h={400} />

      {/* Ground line */}
      <line x1={0} y1={355} x2={600} y2={355}
        stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Front wing main plane — 90% width, dominant lowest element */}
      <line x1={30} y1={310} x2={570} y2={310}
        stroke="#888888" strokeWidth={5} strokeLinecap="round" />
      {/* Front wing endplates */}
      <line x1={30} y1={295} x2={30} y2={318}
        stroke="#666666" strokeWidth={2} strokeLinecap="round" />
      <line x1={570} y1={295} x2={570} y2={318}
        stroke="#666666" strokeWidth={2} strokeLinecap="round" />
      {/* Front wing secondary element */}
      <line x1={55} y1={300} x2={545} y2={300}
        stroke="#666666" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
      {/* Front wing flap — slightly higher in center to show camber */}
      <path d="M 45,306 Q 300,302 555,306"
        fill="none" stroke="#555555" strokeWidth={1.5} />

      {/* Left tire */}
      <circle id="f-tire-l" cx={145} cy={268} r={58}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={145} cy={268} r={32} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={145} cy={268} r={4} fill="#333333" />
      <TreadLines cx={145} cy={268} innerR={32} outerR={58} />

      {/* Right tire */}
      <circle id="f-tire-r" cx={455} cy={268} r={58}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={455} cy={268} r={32} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={455} cy={268} r={4} fill="#333333" />
      <TreadLines cx={455} cy={268} innerR={32} outerR={58} />

      {/* Brake duct openings */}
      <circle cx={145} cy={262} r={14} fill="#0a0a0a" stroke="#444444" strokeWidth={1} />
      <circle cx={455} cy={262} r={14} fill="#0a0a0a" stroke="#444444" strokeWidth={1} />

      {/* Brake calipers */}
      <rect x={172} y={252} width={16} height={24} rx={2}
        fill="#222222" stroke="#555555" strokeWidth={1} />
      <rect x={412} y={252} width={16} height={24} rx={2}
        fill="#222222" stroke="#555555" strokeWidth={1} />

      {/* Suspension wishbones */}
      <line id="f-uwb-l" x1={145} y1={242} x2={258} y2={200}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-uwb-r" x1={455} y1={242} x2={342} y2={200}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-lwb-l" x1={145} y1={275} x2={258} y2={258}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="f-lwb-r" x1={455} y1={275} x2={342} y2={258}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />

      {/* Push rods */}
      <line id="f-push-l" x1={168} y1={258} x2={258} y2={228}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1} strokeLinecap="round" />
      <line id="f-push-r" x1={432} y1={258} x2={342} y2={228}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1} strokeLinecap="round" />

      {/* Monocoque — tapered teardrop cross-section (rotates with roll) */}
      <g id="f-mono">
        <path d="M 268,265 L 255,200 Q 252,140 270,110 Q 290,88 300,85 Q 310,88 330,110 Q 348,140 345,200 L 332,265 Z"
          fill="#1a1a1a" stroke="#777777" strokeWidth={2} />

        {/* Cockpit rim */}
        <ellipse cx={300} cy={145} rx={38} ry={14}
          fill="#0d0d0d" stroke="#555555" strokeWidth={1.5} />

        {/* Roll hoop */}
        <path d="M 278,145 L 278,88 Q 278,78 300,75 Q 322,78 322,88 L 322,145"
          fill="none" stroke="#777777" strokeWidth={2.5} />
      </g>

      {/* Nose cone tip — extends down from survival cell */}
      <path d="M 285,265 L 300,285 L 315,265"
        fill="#151515" stroke="#555555" strokeWidth={1} />

      {/* Dimension: wingspan */}
      <DimLine x1={30} x2={570} y={375} label="1600mm" />
    </svg>
  )
}

// ════════════════════════════════════════════
//  REAR VIEW — 600x400
// ════════════════════════════════════════════
function RearViewSvg({ frame, vehicle, hasSimData }) {
  const svgRef = useRef(null)
  const tireTemps = frame?.tire_temp_C || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const suspMM = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const latG = frame?.lateral_g || 0
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const rlEl = svg.getElementById('r-tire-l')
    const rrEl = svg.getElementById('r-tire-r')
    if (rlEl) rlEl.setAttribute('stroke', hasSimData && tireTemps.RL > 0 ? tempToColorSmooth(tireTemps.RL, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR)
    if (rrEl) rrEl.setAttribute('stroke', hasSimData && tireTemps.RR > 0 ? tempToColorSmooth(tireTemps.RR, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR)

    const rlCol = hasSimData && Math.abs(suspMM.RL) > 3 ? suspColor(suspMM.RL) : DEFAULT_SUSP_COLOR
    const rrCol = hasSimData && Math.abs(suspMM.RR) > 3 ? suspColor(suspMM.RR) : DEFAULT_SUSP_COLOR
    for (const id of ['r-uwb-l', 'r-lwb-l']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rlCol)
    }
    for (const id of ['r-uwb-r', 'r-lwb-r']) {
      const el = svg.getElementById(id)
      if (el) el.setAttribute('stroke', rrCol)
    }

    const gbox = svg.getElementById('r-gbox')
    if (gbox) {
      const rollDeg = latG * 1.2
      gbox.setAttribute('transform', `rotate(${rollDeg.toFixed(2)},300,254)`)
    }
  }, [tireTemps, suspMM, latG, optTemp, ovhTemp, hasSimData])

  return (
    <svg ref={svgRef} viewBox="0 0 600 400" style={{ width: '100%', height: '100%', display: 'block' }}>
      <BlueprintDefs />
      <GridBg w={600} h={400} />

      {/* Ground line */}
      <line x1={0} y1={355} x2={600} y2={355}
        stroke="#2a2a2a" strokeWidth={1} strokeDasharray="6,3" />

      {/* Rear wing — massive, wider than tires */}
      <line x1={55} y1={88} x2={545} y2={88}
        stroke="#888888" strokeWidth={6} strokeLinecap="round" />
      {/* Secondary element */}
      <line x1={75} y1={108} x2={525} y2={108}
        stroke="#666666" strokeWidth={2.5} strokeLinecap="round" />

      {/* Endplate L — curved trailing edge */}
      <path d="M 55,85 L 55,158 Q 58,165 68,165 L 78,158 L 78,85 Z"
        fill="#181818" stroke="#666666" strokeWidth={1.5} />
      {/* Endplate R — curved trailing edge */}
      <path d="M 545,85 L 545,158 Q 542,165 532,165 L 522,158 L 522,85 Z"
        fill="#181818" stroke="#666666" strokeWidth={1.5} />

      {/* Wing pillars */}
      <line x1={175} y1={155} x2={175} y2={228}
        stroke="#555555" strokeWidth={2} strokeLinecap="round" />
      <line x1={425} y1={155} x2={425} y2={228}
        stroke="#555555" strokeWidth={2} strokeLinecap="round" />

      {/* Left rear tire — wider and larger than front */}
      <circle id="r-tire-l" cx={118} cy={285} r={68}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={118} cy={285} r={38} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={118} cy={285} r={4} fill="#333333" />
      <TreadLines cx={118} cy={285} innerR={38} outerR={68} />

      {/* Right rear tire */}
      <circle id="r-tire-r" cx={482} cy={285} r={68}
        fill="#111111" stroke={DEFAULT_TIRE_COLOR} strokeWidth={3} />
      <circle cx={482} cy={285} r={38} fill="none" stroke="#444444" strokeWidth={2} />
      <circle cx={482} cy={285} r={4} fill="#333333" />
      <TreadLines cx={482} cy={285} innerR={38} outerR={68} />

      {/* Rear brake ducts */}
      <circle cx={118} cy={278} r={16} fill="#0a0a0a" stroke="#444444" strokeWidth={1} />
      <circle cx={482} cy={278} r={16} fill="#0a0a0a" stroke="#444444" strokeWidth={1} />

      {/* Brake calipers */}
      <rect x={155} y={268} width={18} height={28} rx={2}
        fill="#222222" stroke="#555555" strokeWidth={1} />
      <rect x={427} y={268} width={18} height={28} rx={2}
        fill="#222222" stroke="#555555" strokeWidth={1} />

      {/* Suspension wishbones */}
      <line id="r-uwb-l" x1={118} y1={248} x2={238} y2={232}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-uwb-r" x1={482} y1={248} x2={362} y2={232}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-lwb-l" x1={118} y1={302} x2={238} y2={278}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />
      <line id="r-lwb-r" x1={482} y1={302} x2={362} y2={278}
        stroke={DEFAULT_SUSP_COLOR} strokeWidth={1.5} strokeLinecap="round" />

      {/* Gearbox with detail (rotates with body roll) */}
      <g id="r-gbox">
        <rect x={238} y={218} width={124} height={72} rx={6}
          fill="#161616" stroke="#555555" strokeWidth={1.5} />
        {/* Center line detail */}
        <line x1={242} y1={254} x2={358} y2={254}
          stroke="#333333" strokeWidth={1} />
        {/* Mounting point dots */}
        <circle cx={248} cy={228} r={2} fill="#444444" />
        <circle cx={352} cy={228} r={2} fill="#444444" />
        <circle cx={248} cy={280} r={2} fill="#444444" />
        <circle cx={352} cy={280} r={2} fill="#444444" />
      </g>

      {/* Exhaust pipes */}
      <circle cx={272} cy={295} r={7} fill="#0d0d0d" stroke="#444444" strokeWidth={1} />
      <circle cx={328} cy={295} r={7} fill="#0d0d0d" stroke="#444444" strokeWidth={1} />

      {/* Diffuser */}
      <polygon points="155,338 445,338 425,308 175,308"
        fill="#141414" stroke="#555555" strokeWidth={1.5} />
      {/* Diffuser fins */}
      <line x1={225} y1={310} x2={225} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={275} y1={310} x2={275} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={325} y1={310} x2={325} y2={336} stroke="#333333" strokeWidth={1} />
      <line x1={375} y1={310} x2={375} y2={336} stroke="#333333" strokeWidth={1} />

      {/* Dimension: rear track width */}
      <DimLine x1={50} x2={550} y={375} label="1400mm" />
    </svg>
  )
}

// ════════════════════════════════════════════
//  TOP VIEW — existing node-beam system
// ════════════════════════════════════════════

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

function TopViewSvg({ frame, vehicle, hasSimData }) {
  const susp = frame?.suspension_mm || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const tireTemps = frame?.tire_temp_C || { FL: 0, FR: 0, RL: 0, RR: 0 }
  const optTemp = vehicle?.tire_optimal_temp_C || 90
  const ovhTemp = vehicle?.tire_overheat_temp_C || 120

  const proj = {}
  for (const k in NODES) proj[k] = projectTop(NODES[k])

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
        const tColor = hasSimData && temp > 0 ? tempToColorSmooth(temp, optTemp, ovhTemp) : DEFAULT_TIRE_COLOR
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

function CarModelViews({ frame, vehicle, mode, hasSimData }) {
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
        {activeView === 'front' && <FrontViewSvg frame={frame} vehicle={vehicle} hasSimData={hasSimData} />}
        {activeView === 'side' && <SideViewSvg frame={frame} vehicle={vehicle} hasSimData={hasSimData} />}
        {activeView === 'rear' && <RearViewSvg frame={frame} vehicle={vehicle} hasSimData={hasSimData} />}
      </div>
    </div>
  )
}

export default memo(CarModelViews)
