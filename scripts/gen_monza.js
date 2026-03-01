// Generate a Monza-inspired track CSV with elevation (z) and kerb markers.
// Arc/line construction with analytical closure via Parabolica.
// Output: x,y,z,curvature,kerb  (5 columns)

const fs = require('fs');
const DEG = Math.PI / 180;

// Non-chicane right turns: CG(80) + L1(60) + L2(60) = 200°
// Parabolica: 360 - 200 = 160° right
// After Lesmos: heading = 90 - 80 - 60 - 60 = -110° (SSW, has westward component)
const PARAB_DEG = 160;

// Kerb codes: 0=none  1=left  2=right  3=both
// For right-hand turns (dir:'R'): inside = right kerb (code 2)
// For left-hand  turns (dir:'L'): inside = left  kerb (code 1)
const segments = [
  { name: 'Pit straight',     type: 'S', len: 850 },
  { name: 'Rettifilo R',      type: 'A', R: 20,  deg: 55, dir: 'R', kerb: 2 },
  { name: 'Rettifilo L',      type: 'A', R: 20,  deg: 55, dir: 'L', kerb: 1 },
  { name: 'To Curva Grande',  type: 'S', len: 350 },
  { name: 'Curva Grande',     type: 'A', R: 280, deg: 80, dir: 'R', kerb: 2 },
  { name: 'Back straight',    type: 'S', len: 450 },
  { name: 'Roggia L',         type: 'A', R: 26,  deg: 40, dir: 'L', kerb: 1 },
  { name: 'Roggia R',         type: 'A', R: 26,  deg: 40, dir: 'R', kerb: 2 },
  { name: 'To Lesmo 1',       type: 'S', len: 200 },
  { name: 'Lesmo 1',          type: 'A', R: 70,  deg: 60, dir: 'R', kerb: 2 },
  { name: 'Between Lesmos',   type: 'S', len: 200 },
  { name: 'Lesmo 2',          type: 'A', R: 55,  deg: 60, dir: 'R', kerb: 2 },
  { name: 'To Ascari',        type: 'S', len: 450 },
  { name: 'Ascari L',         type: 'A', R: 35,  deg: 35, dir: 'L', kerb: 1 },
  { name: 'Ascari R',         type: 'A', R: 35,  deg: 35, dir: 'R', kerb: 2 },
];

// --- State ---
let x = 0, y = 0, heading = Math.PI / 2;
const STEP = 50;
let points = [];

// Each point will gain z and kerb in post-processing.

function sampleStraight(len) {
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  let done = 0;
  while (done < len - STEP / 4) {
    const step = Math.min(STEP, len - done);
    x += step * dx;
    y += step * dy;
    points.push({ x, y, curvature: 0, kerb: 0 });
    done += step;
  }
}

function sampleArc(R, degTurn, dir, kerbCode = 0) {
  const totalAngle = degTurn * DEG;
  const arcLen     = R * totalAngle;
  const kappa      = dir === 'R' ? -1.0 / R : 1.0 / R;
  const nSteps     = Math.max(Math.round(arcLen / STEP), 3);
  const dAngle     = totalAngle / nSteps;

  for (let i = 0; i < nSteps; i++) {
    const halfDA = dAngle / 2;
    if (dir === 'R') {
      heading -= halfDA;
      x += R * dAngle * Math.cos(heading);
      y += R * dAngle * Math.sin(heading);
      heading -= halfDA;
    } else {
      heading += halfDA;
      x += R * dAngle * Math.cos(heading);
      y += R * dAngle * Math.sin(heading);
      heading += halfDA;
    }
    // Mark the apex (middle node of arc) with the kerb code
    const isApex = (i === Math.floor(nSteps / 2));
    points.push({ x, y, curvature: kappa, kerb: isApex ? kerbCode : 0 });
  }
}

// Walk without sampling (used for closure solving)
function walkStraight(len) {
  x += len * Math.cos(heading);
  y += len * Math.sin(heading);
}
function walkArc(R, degTurn, dir) {
  const alpha = degTurn * DEG;
  if (dir === 'R') {
    const cx = x + R * Math.sin(heading);
    const cy = y - R * Math.cos(heading);
    heading -= alpha;
    x = cx - R * Math.sin(heading);
    y = cy + R * Math.cos(heading);
  } else {
    const cx = x - R * Math.sin(heading);
    const cy = y + R * Math.cos(heading);
    heading += alpha;
    x = cx + R * Math.sin(heading);
    y = cy - R * Math.cos(heading);
  }
}

// --- Phase 1: Walk to find position after defined segments ---
for (const seg of segments) {
  if (seg.type === 'S') walkStraight(seg.len);
  else walkArc(seg.R, seg.deg, seg.dir);
}

const x0 = x, y0 = y, theta_s = heading;
console.log(`After defined: (${x0.toFixed(1)}, ${y0.toFixed(1)}), heading: ${((heading/DEG%360+360)%360).toFixed(1)}°`);

// --- Phase 2: Solve closure ---
const alpha_parab = PARAB_DEG * DEG;
const theta_exit  = theta_s - alpha_parab;

const sinS = Math.sin(theta_s), cosS = Math.cos(theta_s);
const sinX = Math.sin(theta_exit), cosX = Math.cos(theta_exit);
const tanS = sinS / cosS;

const MARGIN      = -30;
const denom       = (sinS - sinX) * tanS + cosS - cosX;
const R_parab     = (y0 - x0 * tanS - MARGIN) / denom;
const L_to_parab  = (-x0 - R_parab * (sinS - sinX)) / cosS;

console.log(`To-Parabolica: ${L_to_parab.toFixed(1)}m`);
console.log(`Parabolica R: ${R_parab.toFixed(1)}m, arc: ${(R_parab*alpha_parab).toFixed(1)}m`);

if (R_parab < 30 || L_to_parab < 50) {
  console.error('ERROR: Unrealistic layout.');
  process.exit(1);
}

// --- Phase 3: Sample everything ---
x = 0; y = 0; heading = Math.PI / 2;
points = [{ x: 0, y: 0, curvature: 0, kerb: 0 }];

for (const seg of segments) {
  if (seg.type === 'S') sampleStraight(seg.len);
  else sampleArc(seg.R, seg.deg, seg.dir, seg.kerb || 0);
}

sampleStraight(L_to_parab);
sampleArc(R_parab, PARAB_DEG, 'R', 2);  // Parabolica: right kerb at apex

const closingLen = Math.sqrt(x * x + y * y);
console.log(`After Parabolica: (${x.toFixed(2)}, ${y.toFixed(2)}), heading: ${((heading/DEG%360+360)%360).toFixed(1)}°`);
console.log(`Closing: ${closingLen.toFixed(1)}m`);
if (closingLen > 1) sampleStraight(closingLen);
points.push({ x: 0, y: 0, curvature: 0, kerb: 0 });

// --- Post-processing: compute cumulative distance and interpolate elevation ---

// Monza approximate elevation profile (distance-based waypoints).
// Real Monza has ~8m total variation; we use a smooth approximation.
// All values in meters above datum (reference: pit straight = 145m).
const Z_WAYPOINTS = [
  [   0,  145.0],  // Start/finish
  [ 900,  145.2],  // After Rettifilo, slight rise
  [1300,  145.0],  // Curva Grande start
  [1700,  144.0],  // Bottom of CG sector, slight valley
  [2100,  143.5],  // Roggia chicane area
  [2400,  144.5],  // Base of Lesmo climb
  [2600,  146.5],  // Lesmo 1 — climbing
  [2760,  148.0],  // Lesmo 2 peak (highest point)
  [3200,  146.0],  // Post-Lesmo descent
  [3500,  145.0],  // Approaching Ascari
  [3800,  144.0],  // Ascari chicane
  [4200,  143.5],  // Approaching Parabolica
  [4650,  143.0],  // Parabolica apex (lowest)
  [5000,  144.5],  // Parabolica exit
  [5200,  145.0],  // Back to start
];

function interpolateZ(dist) {
  const last = Z_WAYPOINTS[Z_WAYPOINTS.length - 1];
  if (dist <= Z_WAYPOINTS[0][0]) return Z_WAYPOINTS[0][1];
  if (dist >= last[0]) return last[1];
  for (let i = 1; i < Z_WAYPOINTS.length; i++) {
    if (dist <= Z_WAYPOINTS[i][0]) {
      const t = (dist - Z_WAYPOINTS[i-1][0]) / (Z_WAYPOINTS[i][0] - Z_WAYPOINTS[i-1][0]);
      return Z_WAYPOINTS[i-1][1] + t * (Z_WAYPOINTS[i][1] - Z_WAYPOINTS[i-1][1]);
    }
  }
  return last[1];
}

let cumDist = 0;
for (let i = 0; i < points.length; i++) {
  if (i > 0) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    cumDist += Math.sqrt(dx*dx + dy*dy);
  }
  points[i].z = interpolateZ(cumDist);
}

// --- Stats ---
let totalDist = 0;
for (let i = 1; i < points.length; i++) {
  const dx = points[i].x - points[i-1].x;
  const dy = points[i].y - points[i-1].y;
  totalDist += Math.sqrt(dx*dx + dy*dy);
}
console.log(`\nTotal distance: ${totalDist.toFixed(0)}m  |  Points: ${points.length}`);

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;
for (const p of points) {
  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
}
console.log(`Bounds: X [${minX.toFixed(0)}, ${maxX.toFixed(0)}], Y [${minY.toFixed(0)}, ${maxY.toFixed(0)}]`);
console.log(`Elevation: ${minZ.toFixed(1)}m – ${maxZ.toFixed(1)}m (range: ${(maxZ-minZ).toFixed(1)}m)`);

const kerbNodes = points.filter(p => p.kerb > 0).length;
console.log(`Kerb nodes: ${kerbNodes}`);

const g_lat = 2.0;
console.log('\nCorner speeds (GT3 @ 2.0G):');
for (const seg of segments.filter(s => s.type === 'A')) {
  const v = Math.sqrt(9.81 * g_lat * seg.R);
  console.log(`  ${seg.name.padEnd(18)} R=${String(seg.R).padStart(3)}m  ${(v*3.6).toFixed(0)} km/h`);
}
const v_p = Math.sqrt(9.81 * g_lat * R_parab);
console.log(`  ${'Parabolica'.padEnd(18)} R=${R_parab.toFixed(0).padStart(3)}m  ${(v_p*3.6).toFixed(0)} km/h`);

// --- Write CSV (5 columns) ---
let csv = 'x,y,z,curvature,kerb\n';
for (const p of points) {
  csv += `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${p.curvature.toFixed(4)},${p.kerb}\n`;
}
fs.writeFileSync('data/monza.csv', csv);
console.log('\nWritten to data/monza.csv');
