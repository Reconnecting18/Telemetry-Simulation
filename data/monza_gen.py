import math
import csv

# Monza Circuit CSV Generator - FINAL
# Curvature: positive = left turn, negative = right turn

# Curvature values tuned to produce realistic GT3 cornering speeds.
# GT3 lateral accel ~1.35G = 13.2 m/s^2
# v_corner = sqrt(a_lat * R), so R = v^2 / a_lat
#
# Target GT3 speeds (from ACC data):
# Rettifilo: 60-70 km/h -> R=21-28m
# Curva Grande: flat out ~250 km/h -> R=366m+
# Roggia: 90-100 km/h -> R=47-58m
# Lesmo 1: 130-140 km/h -> R=99-114m
# Lesmo 2: 125-135 km/h -> R=91-106m
# Ascari: 140-150 km/h -> R=114-131m
# Parabolica entry: 150-160 km/h -> R=131-149m
# Parabolica mid: 170-180 km/h -> R=168-189m
# Parabolica exit: 200-220 km/h -> R=233-282m

C_STR = 0.000
C_T1  = -0.040    # R=25m right  -> ~65 km/h (1st gear)
C_T2  = +0.040    # R=25m left   -> ~65 km/h (1st gear)
C_CG  = -0.0025   # R=400m right -> ~261 km/h (flat out)
C_T4  = +0.020    # R=50m left   -> ~92 km/h (2nd gear)
C_T5  = -0.020    # R=50m right  -> ~92 km/h (2nd gear)
C_L1  = -0.0095   # R=105m right -> ~134 km/h (3rd gear)
C_L2  = -0.0105   # R=95m right  -> ~128 km/h (3rd gear)
C_SR  = +0.002    # R=500m left  -> ~292 km/h (flat out)
C_T8  = +0.0085   # R=118m left  -> ~142 km/h (3rd gear)
C_T9  = -0.0085   # R=118m right -> ~142 km/h (3rd gear)
C_T10 = +0.0080   # R=125m left  -> ~146 km/h (4th gear)
C_PE  = -0.0072   # R=139m right -> ~154 km/h (4th gear)
C_PM  = -0.0055   # R=182m right -> ~177 km/h (5th gear)
C_PX  = -0.0040   # R=250m right -> ~207 km/h (5th gear)

# Heading budget: -90+80-90+70-82-85-65+8+48-65+38-42-44-41 = -360

pts = []
x, y = 0.0, 0.0
h = math.radians(68)

def emit(curv):
    pts.append((round(x, 1), round(y, 1), curv))

def straight(length, n, curv=0.0):
    global x, y
    dx = math.cos(h) * length / n
    dy = math.sin(h) * length / n
    for _ in range(n):
        x += dx; y += dy
        emit(curv)

def arc(radius, angle_deg, n, curv):
    global x, y, h
    sign = 1 if radius > 0 else -1
    R = abs(radius)
    angle = math.radians(angle_deg)
    cx = x + R * math.cos(h + sign * math.pi / 2)
    cy = y + R * math.sin(h + sign * math.pi / 2)
    sa = math.atan2(y - cy, x - cx)
    for i in range(1, n + 1):
        f = i / n
        a = sa - sign * angle * f
        x = cx + R * math.cos(a)
        y = cy + R * math.sin(a)
        emit(curv)
    h += sign * angle

def arc_disp(heading, radius, angle_deg):
    sign = 1 if radius > 0 else -1
    R = abs(radius)
    angle = math.radians(angle_deg)
    cx = R * math.cos(heading + sign * math.pi / 2)
    cy = R * math.sin(heading + sign * math.pi / 2)
    sa = math.atan2(-cy, -cx)
    ea = sa - sign * angle
    dx = cx + R * math.cos(ea)
    dy = cy + R * math.sin(ea)
    return dx, dy, heading + sign * angle

def log(name):
    hd = math.degrees(h) % 360
    print(f"  {name:28s}: ({x:7.0f},{y:7.0f}) h={hd:5.0f}")

# Build track
emit(C_STR)

# S/F Straight ~1220m
straight(1220, 16)
log("End S/F straight")

# Rettifilo T1-T2
arc(-28, 90, 3, C_T1)
straight(16, 1)
arc(32, 80, 3, C_T2)
log("After Rettifilo")

# To Curva Grande
straight(300, 4)

# Curva Grande right 90deg R=300m
arc(-300, 90, 8, C_CG)
log("After Curva Grande")

# To Roggia
straight(710, 10)

# Roggia T4-T5
arc(38, 70, 3, C_T4)
straight(14, 1)
arc(-38, 82, 3, C_T5)
log("After Roggia")

# To Lesmo 1
straight(270, 4)

# Lesmo 1 right 85deg R=75m
arc(-75, 85, 4, C_L1)
log("After Lesmo 1")

# Between Lesmos
straight(130, 2)

# Lesmo 2 right 65deg R=50m
arc(-50, 65, 3, C_L2)
log("After Lesmo 2")

# To Serraglio
straight(240, 3)

# Serraglio left 8deg R=500m
arc(500, 8, 2, C_SR)
log("After Serraglio")

# To Ascari
straight(260, 4)

# Ascari T8-T9-T10
arc(55, 48, 3, C_T8)
arc(-50, 65, 3, C_T9)
arc(65, 38, 2, C_T10)
log("After Ascari")

# Save state before back straight
bx, by, bh = x, y, h

# 2D search: find back_len and parabolica_exit_radius that minimize gap
# while keeping heading constraint: entry_42 + mid_44 + exit_41 = 127 (fixed)
# We vary back straight length and the exit arc radius.

parab_entry = (-80, 42)
parab_mid = (-140, 44)
# parab_exit angle = 127 - 42 - 44 = 41 degrees
parab_exit_angle = 41

best_gap = float('inf')
best_params = (900, 280)

for back_len in range(600, 1600, 5):
    for exit_r in range(150, 500, 5):
        tx = bx + back_len * math.cos(bh)
        ty = by + back_len * math.sin(bh)
        th = bh
        ddx, ddy, th = arc_disp(th, parab_entry[0], parab_entry[1])
        tx += ddx; ty += ddy
        ddx, ddy, th = arc_disp(th, parab_mid[0], parab_mid[1])
        tx += ddx; ty += ddy
        ddx, ddy, th = arc_disp(th, -exit_r, parab_exit_angle)
        tx += ddx; ty += ddy
        gap = math.sqrt(tx**2 + ty**2)
        if gap < best_gap:
            best_gap = gap
            best_params = (back_len, exit_r)

back_len, exit_r = best_params
print(f"\n  Optimal: back={back_len}m, parab_exit_R={exit_r}m, gap={best_gap:.1f}m")

# Fine search
for bl in range(back_len - 10, back_len + 10):
    for er in range(exit_r - 10, exit_r + 10):
        tx = bx + bl * math.cos(bh)
        ty = by + bl * math.sin(bh)
        th = bh
        ddx, ddy, th = arc_disp(th, parab_entry[0], parab_entry[1])
        tx += ddx; ty += ddy
        ddx, ddy, th = arc_disp(th, parab_mid[0], parab_mid[1])
        tx += ddx; ty += ddy
        ddx, ddy, th = arc_disp(th, -er, parab_exit_angle)
        tx += ddx; ty += ddy
        gap = math.sqrt(tx**2 + ty**2)
        if gap < best_gap:
            best_gap = gap
            best_params = (bl, er)

back_len, exit_r = best_params
print(f"  Refined: back={back_len}m, parab_exit_R={exit_r}m, gap={best_gap:.1f}m")

# Update exit curvature
# Use desired physics curvature, not geometric radius
C_PX_ACTUAL = C_PX  # -0.004 (R=250m effective for physics)

# Build back straight
n_bk = max(1, round(back_len / 72))
straight(back_len, n_bk)
log("Before Parabolica")

# Parabolica
arc(-80, 42, 3, C_PE)
log("Parabolica entry")
arc(-140, 44, 4, C_PM)
log("Parabolica mid")
arc(-exit_r, 41, 4, C_PX_ACTUAL)
log("Parabolica exit")

# Final gap handling
gap = math.sqrt(x**2 + y**2)
print(f"\n  Final gap: {gap:.1f}m at ({x:.0f}, {y:.0f})")

# Stats
total = 0
for i in range(len(pts) - 1):
    dx = pts[i+1][0] - pts[i][0]
    dy = pts[i+1][1] - pts[i][1]
    total += math.sqrt(dx*dx + dy*dy)
total_with_gap = total + gap
print(f"  Path: {total:.0f}m + gap {gap:.0f}m = {total_with_gap:.0f}m (target 5793)")
print(f"  Nodes: {len(pts)}")

segs = []
for i in range(len(pts) - 1):
    dx = pts[i+1][0] - pts[i][0]
    dy = pts[i+1][1] - pts[i][1]
    segs.append(math.sqrt(dx*dx + dy*dy))
print(f"  Segments: min={min(segs):.0f} max={max(segs):.0f} avg={sum(segs)/len(segs):.0f}")

xs = [p[0] for p in pts]
ys = [p[1] for p in pts]
print(f"  BBox: x=[{min(xs):.0f},{max(xs):.0f}] y=[{min(ys):.0f},{max(ys):.0f}]")
print(f"  Size: {max(xs)-min(xs):.0f} x {max(ys)-min(ys):.0f}m")

# Write CSV
with open("data/monza.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["x", "y", "curvature"])
    for px, py, c in pts:
        w.writerow([f"{px:.1f}", f"{py:.1f}", f"{c:.4f}"])
print(f"  Wrote {len(pts)} nodes to data/monza.csv")
