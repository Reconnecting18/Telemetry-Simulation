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

    // Pass 1: compute lateral offset positions.
    // Right turn (k < 0) → positive offset along right-perp = (dy/len, -dx/len).
    // Left  turn (k > 0) → negative offset (same formula, raw goes negative).
    for (int i = 0; i < N; ++i) {
        const TrackNode& prev = nodes[std::max(0, i - 1)];
        const TrackNode& next = nodes[std::min(N - 1, i + 1)];

        double dx  = next.x - prev.x;
        double dy  = next.y - prev.y;
        double len = std::sqrt(dx * dx + dy * dy);
        if (len < 1e-6) len = 1e-6;

        double raw    = -nodes[i].curvature * 100.0;
        double offset = std::max(-max_offset, std::min(max_offset, raw));

        // Right-perpendicular of (dx, dy): (dy/len, -dx/len)
        rl[i].x = nodes[i].x + (dy / len) * offset;
        rl[i].y = nodes[i].y - (dx / len) * offset;
    }

    // Pass 2: signed effective curvature via Menger formula on RL positions.
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
    const std::vector<double>& grade)
{
    int N = static_cast<int>(nodes.size());
    std::vector<double> v(N);

    bool use_rl    = (static_cast<int>(rl_curvatures.size()) == N);
    bool use_grade = (static_cast<int>(grade.size()) == N);

    // Engine power at top speed (equilibrium with drag)
    double drag_at_vmax = 0.5 * AIR_DENSITY * config.drag_coeff
                        * config.frontal_area * config.max_speed * config.max_speed;
    double engine_power = drag_at_vmax * config.max_speed;

    // Pass 1: cornering speed limit.
    // RL curvatures have larger effective radii → higher limits through corners.
    for (int i = 0; i < N; ++i) {
        double k = use_rl ? rl_curvatures[i] : nodes[i].curvature;
        v[i] = calculateOptimalVelocity(k, config.max_lateral_g, config.max_speed);
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
