# Telemetry Simulation

A C++ racing telemetry simulation with a React dashboard, deployed on AWS Amplify. The simulation reads track geometry from CSV, models vehicle dynamics node-by-node, and outputs JSON telemetry that powers a real-time visualization frontend.

## Project Goals

1. **Simulate realistic vehicle dynamics** — model a high-performance race car traversing a circuit with physically-grounded calculations for velocity planning, cornering forces, aerodynamic drag, tire degradation, and fuel consumption.
2. **Generate structured telemetry data** — output per-node JSON telemetry (velocity, G-forces, tire wear, drag, fuel) suitable for analysis and visualization.
3. **Visualize telemetry in a web dashboard** — present simulation results through interactive charts (velocity trace, G-forces, tire wear split by corner, drag force, fuel level) hosted on AWS Amplify.
4. **Keep the stack minimal** — zero external C++ dependencies, lightweight React frontend, static deployment with no backend server required.

## Physics Models

| Model | Formula | Notes |
|---|---|---|
| Optimal cornering speed | `v = sqrt((max_lateral_g * 9.81) / abs(curvature))` | Capped at vehicle top speed |
| Velocity adjustment | Kinematic clamping: `v² = u² + 2as` | Bounded by max accel/brake |
| Aerodynamic drag | `F = 0.5 * 1.225 * Cd * A * v²` | Air density 1.225 kg/m³ |
| Tire wear rate | `K_BASE + K_LATERAL * lat_g² + K_SPEED * speed_ratio` | Per-tyre, with load transfer |
| Load transfer | `transfer = abs(lat_g) * cog_height / track_width` | Clamped to 0.30 max |
| Fuel consumption | `(base_rate_L_per_100km / 100) * dist_km * throttle` | Scales with throttle factor |

## Project Structure

```
include/
  types.hpp         All data structures (Track, Vehicle, Telemetry, Simulation)
  physics.hpp       Physics function declarations
src/
  main.cpp          Entry point (CLI args for track/output paths)
  physics.cpp       Force, velocity, tire wear, fuel, drag calculations
  simulation.cpp    Main loop, track loading, vehicle config
  telemetry.cpp     JSON serialization (no external deps)
data/
  circuit_alpha.csv 54-node circuit (~3.55 km, signed curvature)
output/
  telemetry.json    Generated simulation output
web/
  src/App.jsx       React dashboard (5 Recharts line charts)
  src/App.css       Dark theme styling
  public/           Static assets (committed telemetry.json)
amplify.yml         AWS Amplify build configuration
```

## Prerequisites

- **C++ build**: CMake 3.15+, a C++17 compiler (MSVC, GCC, or Clang), Ninja (optional)
- **Frontend**: Node.js 18+
- **Deployment**: AWS Amplify (connects to GitHub repo)

## Build and Run

### C++ Simulation

**Windows (batch scripts):**
```
build_cmake.bat      # Configure with CMake + Ninja
build_compile.bat    # Compile
build_run.bat        # Run simulation
```

**Manual:**
```bash
cmake -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
./build/telemetry_sim
```

The simulation reads `data/circuit_alpha.csv` and writes `output/telemetry.json`.

### Web Dashboard

```bash
cd web
npm install
npm run dev          # Dev server at http://localhost:5173
npm run build        # Production build to web/dist/
```

### Updating Telemetry Data

After running the simulation, copy the output to the web directory:
```bash
cp output/telemetry.json web/public/telemetry.json
```

Commit and push to trigger an Amplify redeploy.

## Deployment

The project deploys to AWS Amplify as a static site. Connect your GitHub repository in the Amplify Console — it auto-detects `amplify.yml` and builds the React app from `web/`.

## Dashboard

The frontend displays 5 telemetry charts across the lap:

- **Velocity** — speed trace across all track nodes
- **G-Forces** — lateral and longitudinal acceleration
- **Tire Wear** — per-corner degradation (FL, FR, RL, RR)
- **Drag Force** — aerodynamic resistance vs track position
- **Fuel Level** — consumption over the lap
