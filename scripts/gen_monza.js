// Generate a Monza-inspired track CSV.
// Arc/line construction with analytical closure via Parabolica.

const fs = require('fs');
const DEG = Math.PI / 180;

// Non-chicane right turns: CG(80) + L1(60) + L2(60) = 200°
// Parabolica: 360 - 200 = 160° right
// After Lesmos: heading = 90 - 80 - 60 - 60 = -110° (SSW, has westward component)
const PARAB_DEG = 160;

const segments = [
  { name: 'Pit straight',     type: 'S', len: 850 },
  { name: 'Rettifilo R',      type: 'A', R: 20,  deg: 55, dir: 'R' },
  { name: 'Rettifilo L',      type: 'A', R: 20,  deg: 55, dir: 'L' },
  { name: 'To Curva Grande',  type: 'S', len: 350 },
  { name: 'Curva Grande',     type: 'A', R: 280, deg: 80, dir: 'R' },
  { name: 'Back straight',    type: 'S', len: 450 },
  { name: 'Roggia L',         type: 'A', R: 26,  deg: 40, dir: 'L' },
  { name: 'Roggia R',         type: 'A', R: 26,  deg: 40, dir: 'R' },
  { name: 'To Lesmo 1',       type: 'S', len: 200 },
  { name: 'Lesmo 1',          type: 'A', R: 70,  deg: 60, dir: 'R' },
  { name: 'Between Lesmos',   type: 'S', len: 200 },
  { name: 'Lesmo 2',          type: 'A', R: 55,  deg: 60, dir: 'R' },
  { name: 'To Ascari',        type: 'S', len: 450 },
  { name: 'Ascari L',         type: 'A', R: 35,  deg: 35, dir: 'L' },
  { name: 'Ascari R',         type: 'A', R: 35,  deg: 35, dir: 'R' },
];

// --- State ---
let x = 0, y = 0, heading = Math.PI / 2;
const STEP = 50;
let points = [];

function sampleStraight(len) {
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  let done = 0;
  while (done < len - STEP / 4) {
    const step = Math.min(STEP, len - done);
    x += step * dx;
    y += step * dy;
    points.push({ x, y, curvature: 0 });
    done += step;
  }
}

function sampleArc(R, degTurn, dir) {
  const totalAngle = degTurn * DEG;
  const arcLen = R * totalAngle;
  const kappa = dir === 'R' ? -1.0 / R : 1.0 / R;
  const nSteps = Math.max(Math.round(arcLen / STEP), 3);
  const dAngle = totalAngle / nSteps;
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
    points.push({ x, y, curvature: kappa });
  }
}

// Walk without sampling
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
const theta_exit = theta_s - alpha_parab;

const sinS = Math.sin(theta_s), cosS = Math.cos(theta_s);
const sinX = Math.sin(theta_exit), cosX = Math.cos(theta_exit);
const tanS = sinS / cosS;

const MARGIN = -30;
const denom = (sinS - sinX) * tanS + cosS - cosX;
const R_parab = (y0 - x0 * tanS - MARGIN) / denom;
const L_to_parab = (-x0 - R_parab * (sinS - sinX)) / cosS;

console.log(`To-Parabolica: ${L_to_parab.toFixed(1)}m`);
console.log(`Parabolica R: ${R_parab.toFixed(1)}m, arc: ${(R_parab*alpha_parab).toFixed(1)}m`);

if (R_parab < 30 || L_to_parab < 50) {
  console.error('ERROR: Unrealistic layout.');
  process.exit(1);
}

// --- Phase 3: Sample everything ---
x = 0; y = 0; heading = Math.PI / 2;
points = [{ x: 0, y: 0, curvature: 0 }];

for (const seg of segments) {
  if (seg.type === 'S') sampleStraight(seg.len);
  else sampleArc(seg.R, seg.deg, seg.dir);
}

sampleStraight(L_to_parab);
sampleArc(R_parab, PARAB_DEG, 'R');

const closingLen = Math.sqrt(x * x + y * y);
console.log(`After Parabolica: (${x.toFixed(2)}, ${y.toFixed(2)}), heading: ${((heading/DEG%360+360)%360).toFixed(1)}°`);
console.log(`Closing: ${closingLen.toFixed(1)}m`);
if (closingLen > 1) sampleStraight(closingLen);
points.push({ x: 0, y: 0, curvature: 0 });

// --- Stats ---
let totalDist = 0;
for (let i = 1; i < points.length; i++) {
  const dx = points[i].x - points[i - 1].x;
  const dy = points[i].y - points[i - 1].y;
  totalDist += Math.sqrt(dx * dx + dy * dy);
}
console.log(`\nTotal distance: ${totalDist.toFixed(0)}m  |  Points: ${points.length}`);

// Bounding box
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const p of points) {
  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
}
console.log(`Bounds: X [${minX.toFixed(0)}, ${maxX.toFixed(0)}], Y [${minY.toFixed(0)}, ${maxY.toFixed(0)}]`);
console.log(`Extent: ${(maxX-minX).toFixed(0)}m × ${(maxY-minY).toFixed(0)}m`);

const g_lat = 2.0;
console.log('\nCorner speeds (GT3 @ 2.0G):');
for (const seg of segments.filter(s => s.type === 'A')) {
  const v = Math.sqrt(9.81 * g_lat * seg.R);
  console.log(`  ${seg.name.padEnd(18)} R=${String(seg.R).padStart(3)}m  ${(v*3.6).toFixed(0)} km/h`);
}
const v_p = Math.sqrt(9.81 * g_lat * R_parab);
console.log(`  ${'Parabolica'.padEnd(18)} R=${R_parab.toFixed(0).padStart(3)}m  ${(v_p*3.6).toFixed(0)} km/h`);

// --- Write CSV ---
let csv = 'x,y,curvature\n';
for (const p of points) {
  csv += `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.curvature.toFixed(4)}\n`;
}
fs.writeFileSync('data/monza.csv', csv);
console.log('\nWritten to data/monza.csv');
