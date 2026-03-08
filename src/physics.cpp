#include "physics.hpp"
#include "types.hpp"

#include <cmath>
#include <algorithm>
#include <vector>

static constexpr double G_TO_MS2    = 9.81;
static constexpr double PI          = 3.14159265358979323846;
static constexpr double AIR_DENSITY = 1.225;

// ------------------------------------------------------------------
// LATERAL FORCES
// ------------------------------------------------------------------

double calculateForceFromCurvature(double mass, double velocity, double curvature) {
    return mass * velocity * velocity * std::abs(curvature);
}

double calculateLateralG(double velocity, double curvature) {
    return (velocity * velocity * std::abs(curvature)) / G_TO_MS2;
}

// ------------------------------------------------------------------
// RACING LINE
// ------------------------------------------------------------------

std::vector<RacingLineNode> computeRacingLine(
    const std::vector<TrackNode>& nodes,
    double max_offset)
{
    int N = static_cast<int>(nodes.size());
    std::vector<RacingLineNode> rl(N);

    // ── Late-apex racing line algorithm ──────────────────────────────────
    // A real driver: brakes in a straight line, turns in late, apexes the
    // inside kerb past the geometric midpoint of the corner, then uses
    // full track width on exit.
    //
    // We achieve this with:
    //   1. Raw offsets from curvature (move toward inside of corner)
    //   2. Forward-shift by APEX_DELAY nodes (late apex)
    //   3. Gaussian smoothing (gradual entry, smooth transitions)
    //   4. Exit amplification (use more track width tracking out)

    static constexpr double OFFSET_GAIN  = 200.0; // curvature → offset gain (aggressive)
    static constexpr int    APEX_DELAY   = 2;      // nodes to shift apex later
    static constexpr int    SMOOTH_PASSES = 2;     // smoothing iterations
    static constexpr int    SMOOTH_RADIUS = 2;     // kernel half-width per pass
    static constexpr double EXIT_BOOST   = 1.5;    // track-out amplification

    // Step 1: Raw offsets from curvature.
    // Right turn (k < 0) → positive offset (toward inside = right).
    // Left turn  (k > 0) → negative offset (toward inside = left).
    std::vector<double> raw(N);
    for (int i = 0; i < N; ++i) {
        double r = -nodes[i].curvature * OFFSET_GAIN;
        raw[i] = std::clamp(r, -max_offset, max_offset);
    }

    // Step 2: Forward-shift (late apex).
    // Each offset value is read from APEX_DELAY nodes earlier in the track,
    // so the peak inside displacement occurs APEX_DELAY nodes *after*
    // the geometric apex — exactly the late-apex effect.
    std::vector<double> shifted(N);
    for (int i = 0; i < N; ++i) {
        int src = i - APEX_DELAY;
        shifted[i] = (src >= 0) ? raw[src] : raw[0];
    }

    // Step 3: Exit amplification.
    // After the apex (where offset magnitude is decreasing back toward 0),
    // boost the offset so the car tracks wider on exit, using more road.
    // Detect "exiting" = offset magnitude decreasing compared to previous node.
    std::vector<double> boosted(N);
    boosted[0] = shifted[0];
    for (int i = 1; i < N; ++i) {
        double prev_abs = std::abs(shifted[i - 1]);
        double curr_abs = std::abs(shifted[i]);
        if (curr_abs < prev_abs && prev_abs > 0.5) {
            // Exiting a corner: slow the offset decay by boosting
            double sign = (shifted[i] > 0.0) ? 1.0 : -1.0;
            double exited = curr_abs + (prev_abs - curr_abs) * (1.0 - 1.0 / EXIT_BOOST);
            boosted[i] = sign * std::min(exited, max_offset);
        } else {
            boosted[i] = shifted[i];
        }
    }

    // Step 4: Multi-pass box smoothing.
    // This rounds off harsh transitions, producing smooth braking→turn-in
    // and apex→exit trajectories. Multiple passes approximate a Gaussian.
    std::vector<double> smoothed = boosted;
    std::vector<double> temp(N);
    for (int pass = 0; pass < SMOOTH_PASSES; ++pass) {
        for (int i = 0; i < N; ++i) {
            double sum = 0.0;
            double weight = 0.0;
            for (int j = -SMOOTH_RADIUS; j <= SMOOTH_RADIUS; ++j) {
                int idx = std::clamp(i + j, 0, N - 1);
                double w = 1.0 / (1.0 + std::abs(j));  // triangular weight
                sum += smoothed[idx] * w;
                weight += w;
            }
            temp[i] = sum / weight;
        }
        smoothed = temp;
    }

    // Step 5: Clamp and compute positions from final offsets.
    for (int i = 0; i < N; ++i) {
        const TrackNode& prev = nodes[std::max(0, i - 1)];
        const TrackNode& next = nodes[std::min(N - 1, i + 1)];

        double dx  = next.x - prev.x;
        double dy  = next.y - prev.y;
        double len = std::sqrt(dx * dx + dy * dy);
        if (len < 1e-6) len = 1e-6;

        double offset = std::clamp(smoothed[i], -max_offset, max_offset);

        // Right-perpendicular of (dx, dy): (dy/len, -dx/len)
        rl[i].x = nodes[i].x + (dy / len) * offset;
        rl[i].y = nodes[i].y - (dx / len) * offset;
    }

    // Step 6: Signed effective curvature via Menger formula on RL positions.
    // k = 2 * cross(B-A, C-A) / (|AB| * |BC| * |AC|)
    // Positive k = CCW (left turn); negative = CW (right turn).
    rl[0].effective_curvature     = nodes[0].curvature;
    rl[N - 1].effective_curvature = nodes[N - 1].curvature;

    for (int i = 1; i < N - 1; ++i) {
        double ax = rl[i - 1].x, ay = rl[i - 1].y;
        double bx = rl[i].x,     by = rl[i].y;
        double cx = rl[i + 1].x, cy = rl[i + 1].y;

        double AB = std::sqrt((bx-ax)*(bx-ax) + (by-ay)*(by-ay));
        double BC = std::sqrt((cx-bx)*(cx-bx) + (cy-by)*(cy-by));
        double AC = std::sqrt((cx-ax)*(cx-ax) + (cy-ay)*(cy-ay));

        double denom = AB * BC * AC;
        if (denom < 1e-10) {
            rl[i].effective_curvature = nodes[i].curvature;
            continue;
        }
        double cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        rl[i].effective_curvature = 2.0 * cross / denom;
    }

    return rl;
}

// ------------------------------------------------------------------
// VELOCITY PLANNING
// ------------------------------------------------------------------

double calculateOptimalVelocity(double curvature, double max_lateral_g, double max_speed) {
    double abs_k = std::abs(curvature);
    if (abs_k < 1e-9) return max_speed;
    double v = std::sqrt((max_lateral_g * G_TO_MS2) / abs_k);
    return std::min(v, max_speed);
}

double adjustVelocity(double current_v, double target_v,
                      double segment_len,
                      double max_accel, double max_brake,
                      double& longitudinal_g_out) {
    double dv = target_v - current_v;

    double max_dv_accel = std::sqrt(std::max(0.0, current_v * current_v + 2.0 * max_accel * segment_len)) - current_v;
    double max_dv_brake = current_v - std::sqrt(std::max(0.0, current_v * current_v - 2.0 * max_brake * segment_len));

    double actual_dv;
    if (dv >= 0.0) {
        actual_dv = std::min(dv, max_dv_accel);
    } else {
        actual_dv = -std::min(-dv, max_dv_brake);
    }

    if (segment_len > 0.0) {
        double avg_v = std::max(current_v + actual_dv / 2.0, 0.1);
        double dt_approx = segment_len / avg_v;
        longitudinal_g_out = (actual_dv / dt_approx) / G_TO_MS2;
    } else {
        longitudinal_g_out = 0.0;
    }

    return std::max(current_v + actual_dv, 0.0);
}

// ------------------------------------------------------------------
// LOOK-AHEAD VELOCITY PROFILE
// ------------------------------------------------------------------

static double segmentLength(const std::vector<TrackNode>& nodes, int i) {
    if (i + 1 >= static_cast<int>(nodes.size())) return 1.0;
    double dx = nodes[i + 1].x - nodes[i].x;
    double dy = nodes[i + 1].y - nodes[i].y;
    return std::max(std::sqrt(dx * dx + dy * dy), 0.1);
}

std::vector<double> computeVelocityProfile(
    const std::vector<TrackNode>& nodes,
    const VehicleConfig& config,
    const std::vector<double>& rl_curvatures,
    const std::vector<double>& grade,
    const std::vector<double>& grip)
{
    int N = static_cast<int>(nodes.size());
    std::vector<double> v(N);

    bool use_rl    = (static_cast<int>(rl_curvatures.size()) == N);
    bool use_grade = (static_cast<int>(grade.size()) == N);
    bool use_grip  = (static_cast<int>(grip.size()) == N);

    // Engine power at top speed (equilibrium with drag)
    double drag_at_vmax = 0.5 * AIR_DENSITY * config.drag_coeff
                        * config.frontal_area * config.max_speed * config.max_speed;
    double engine_power = drag_at_vmax * config.max_speed;

    // Pass 1: cornering speed limit.
    // RL curvatures have larger effective radii → higher limits through corners.
    // Per-node grip scales max_lateral_g: kerb/dirty zones reduce cornering speed.
    for (int i = 0; i < N; ++i) {
        double k = use_rl ? rl_curvatures[i] : nodes[i].curvature;
        double effective_lat_g = config.max_lateral_g;
        if (use_grip) effective_lat_g *= grip[i];
        v[i] = calculateOptimalVelocity(k, effective_lat_g, config.max_speed);
    }

    // Pass 2 (backward): braking constraints.
    // Uphill (grade > 0) aids braking; downhill (grade < 0) reduces effective brake.
    for (int i = N - 2; i >= 0; --i) {
        double seg        = segmentLength(nodes, i);
        double v_next     = v[i + 1];
        double drag_decel = 0.5 * AIR_DENSITY * config.drag_coeff
                          * config.frontal_area * v_next * v_next / config.mass;
        double grade_decel = use_grade ? G_TO_MS2 * grade[i] : 0.0;
        double total_decel = config.max_brake + drag_decel + grade_decel;
        total_decel = std::max(total_decel, config.max_brake * 0.1);  // safety floor
        double v_reachable = std::sqrt(v_next * v_next + 2.0 * total_decel * seg);
        v[i] = std::min(v[i], v_reachable);
    }

    // Pass 3 (forward): power-limited acceleration constraints.
    // Uphill (grade > 0) reduces net accel; downhill adds a small gravity boost.
    for (int i = 1; i < N; ++i) {
        double seg    = segmentLength(nodes, i - 1);
        double v_prev = v[i - 1];

        double engine_accel = (v_prev > 1.0)
            ? std::min(config.max_accel, engine_power / (config.mass * v_prev))
            : config.max_accel;
        double drag_decel = 0.5 * AIR_DENSITY * config.drag_coeff
                          * config.frontal_area * v_prev * v_prev / config.mass;
        double grade_decel = use_grade ? G_TO_MS2 * grade[i] : 0.0;
        double net_accel   = std::max(engine_accel - drag_decel - grade_decel, 0.0);

        double v_reachable = std::sqrt(v_prev * v_prev + 2.0 * net_accel * seg);
        v[i] = std::min(v[i], v_reachable);
    }

    return v;
}

// ------------------------------------------------------------------
// GEARBOX
// ------------------------------------------------------------------

double calculateRPM(double velocity, int gear, const double gear_ratios[],
                    double final_drive, double tire_radius) {
    if (tire_radius <= 0.0 || gear < 1) return 0.0;
    return (velocity * gear_ratios[gear] * final_drive * 60.0) / (2.0 * PI * tire_radius);
}

int selectGear(double velocity, int num_gears, const double gear_ratios[],
               double final_drive, double tire_radius,
               double idle_rpm, double max_rpm) {
    for (int g = num_gears; g >= 1; --g) {
        double rpm = calculateRPM(velocity, g, gear_ratios, final_drive, tire_radius);
        if (rpm >= idle_rpm && rpm <= max_rpm) {
            return g;
        }
    }
    return 1;
}

// ------------------------------------------------------------------
// TIRE WEAR
// ------------------------------------------------------------------

double calculateTireWearRate(double lateral_g, double lateral_g_factor,
                             double velocity, double max_speed) {
    static constexpr double K_BASE    = 2e-6;
    static constexpr double K_LATERAL = 8e-6;
    static constexpr double K_SPEED   = 1e-6;

    double speed_ratio = (max_speed > 0.0) ? (velocity / max_speed) : 0.0;
    double effective_g = lateral_g * lateral_g_factor;

    return K_BASE
         + K_LATERAL * (effective_g * effective_g)
         + K_SPEED   * speed_ratio;
}

// ------------------------------------------------------------------
// FUEL CONSUMPTION
// ------------------------------------------------------------------

double calculateFuelConsumptionDelta(double segment_dist,
                                     double base_fuel_rate,
                                     double throttle_factor) {
    double dist_km = segment_dist / 1000.0;
    return (base_fuel_rate / 100.0) * dist_km * throttle_factor;
}

// ------------------------------------------------------------------
// AERODYNAMICS
// ------------------------------------------------------------------

double calculateDragForce(double velocity, double drag_coeff, double frontal_area) {
    return 0.5 * AIR_DENSITY * drag_coeff * frontal_area * velocity * velocity;
}

// ------------------------------------------------------------------
// SURFACE GRIP
// ------------------------------------------------------------------

void computeSurfaceGrip(std::vector<TrackNode>& nodes,
                        const std::vector<double>& rl_curvatures) {
    int N = static_cast<int>(nodes.size());
    if (N == 0) return;

    // Base grip: racing line surface starts at 0.92 (clean tarmac, some dust)
    // Braking zones (before high-curvature): boosted to ~0.97 (heavy rubber deposits)
    // Corner-exit zones (after high-curvature): reduced to ~0.72 (marbles, debris)
    // High-curvature nodes themselves: slightly reduced (tire sliding deposits marbles)

    static constexpr double GRIP_BASE        = 0.92;
    static constexpr double GRIP_BRAKE_BOOST = 0.05;  // bonus in braking zones
    static constexpr double GRIP_EXIT_PENALTY = 0.20; // penalty at corner exits
    static constexpr double GRIP_CORNER_PENALTY = 0.08; // penalty at high-curvature nodes
    static constexpr double K_THRESHOLD      = 0.008; // curvature threshold for "corner"
    static constexpr int    EXIT_WINDOW      = 4;     // nodes after corner exit
    static constexpr int    BRAKE_WINDOW     = 3;     // nodes before corner entry

    // Start with base grip and clean dirty_zone
    for (int i = 0; i < N; ++i) {
        nodes[i].surface_grip = GRIP_BASE;
        nodes[i].dirty_zone   = 0.0;
    }

    // Use RL curvatures if available, else node curvatures
    bool use_rl = (static_cast<int>(rl_curvatures.size()) == N);

    // Identify corner nodes and apply grip adjustments
    for (int i = 0; i < N; ++i) {
        double absK = std::abs(use_rl ? rl_curvatures[i] : nodes[i].curvature);

        if (absK >= K_THRESHOLD) {
            // Corner node itself: reduced grip from sliding
            double intensity = std::min(1.0, absK / 0.05);
            nodes[i].surface_grip -= GRIP_CORNER_PENALTY * intensity;

            // Corner exit: marbles and debris accumulate (nodes after this corner)
            for (int j = 1; j <= EXIT_WINDOW && (i + j) < N; ++j) {
                double falloff = 1.0 - static_cast<double>(j - 1) / EXIT_WINDOW;
                double penalty = GRIP_EXIT_PENALTY * intensity * falloff;
                nodes[i + j].surface_grip = std::min(nodes[i + j].surface_grip,
                                                      GRIP_BASE - penalty);
                // Flag dirty zone intensity for separate grip penalty in sim loop
                nodes[i + j].dirty_zone = std::max(nodes[i + j].dirty_zone,
                                                     intensity * falloff);
            }

            // Braking zone: heavy rubber deposits (nodes before this corner)
            for (int j = 1; j <= BRAKE_WINDOW && (i - j) >= 0; ++j) {
                double falloff = 1.0 - static_cast<double>(j - 1) / BRAKE_WINDOW;
                double bonus = GRIP_BRAKE_BOOST * intensity * falloff;
                nodes[i - j].surface_grip = std::min(1.0,
                    std::max(nodes[i - j].surface_grip, GRIP_BASE + bonus));
            }
        }
    }

    // Clamp all grip values
    for (int i = 0; i < N; ++i) {
        nodes[i].surface_grip = std::clamp(nodes[i].surface_grip, 0.5, 1.0);
    }
}

std::vector<double> applyRubberBuildup(
    const std::vector<TrackNode>& nodes,
    std::vector<double>& rubber_accum,
    int lap) {
    int N = static_cast<int>(nodes.size());
    std::vector<double> effective_grip(N);

    // Rubber buildup constants:
    // Each lap deposits rubber proportional to how much the car loads the surface.
    // Braking zones and corners get more rubber; straights get less.
    // After ~5 laps, grip improves by ~0.03-0.05 on the racing line.
    static constexpr double K_RUBBER_BASE    = 0.003;  // base rubber per lap per node
    static constexpr double K_RUBBER_CURV    = 0.008;  // extra rubber at high-curvature
    static constexpr double RUBBER_MAX       = 0.08;   // maximum grip bonus from rubber
    static constexpr double RUBBER_DECAY     = 0.98;   // slight decay each lap (old rubber wears)

    if (rubber_accum.empty()) {
        rubber_accum.resize(N, 0.0);
    }

    for (int i = 0; i < N; ++i) {
        // Decay existing rubber slightly
        rubber_accum[i] *= RUBBER_DECAY;

        // Add new rubber based on curvature (more sliding = more rubber deposited)
        double absK = std::abs(nodes[i].curvature);
        double deposit = K_RUBBER_BASE + K_RUBBER_CURV * std::min(1.0, absK / 0.03);
        rubber_accum[i] = std::min(rubber_accum[i] + deposit, RUBBER_MAX);

        // Effective grip = base + rubber bonus
        effective_grip[i] = std::clamp(nodes[i].surface_grip + rubber_accum[i], 0.0, 1.0);
    }

    return effective_grip;
}
