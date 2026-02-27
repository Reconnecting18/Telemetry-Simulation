#include "physics.hpp"

#include <cmath>
#include <algorithm>

static constexpr double G_TO_MS2 = 9.81;   // 1 G in m/s^2

// ------------------------------------------------------------------
// LATERAL FORCES
// ------------------------------------------------------------------

double calculateForceFromCurvature(double mass, double velocity, double curvature) {
    // F = m * v^2 * |k|   (centripetal force; k = 1/r, signed for turn direction)
    return mass * velocity * velocity * std::abs(curvature);
}

double calculateLateralG(double velocity, double curvature) {
    // a_c = v^2 * |k|  →  convert to G
    return (velocity * velocity * std::abs(curvature)) / G_TO_MS2;
}

// ------------------------------------------------------------------
// VELOCITY PLANNING
// ------------------------------------------------------------------

double calculateOptimalVelocity(double curvature, double max_lateral_g, double max_speed) {
    double abs_k = std::abs(curvature);
    if (abs_k == 0.0) {
        return max_speed;
    }
    // v_max = sqrt(a_max / |k|)  where a_max = max_lateral_g * g
    double v = std::sqrt((max_lateral_g * G_TO_MS2) / abs_k);
    return std::min(v, max_speed);
}

double adjustVelocity(double current_v, double target_v,
                      double segment_len,
                      double max_accel, double max_brake,
                      double& longitudinal_g_out) {
    double dv = target_v - current_v;

    // Maximum speed change achievable over this segment via kinematics:
    //   v^2 = u^2 + 2*a*s  =>  dv_max = sqrt(2 * a * s) - current_v  (approx)
    double max_dv_accel = std::sqrt(std::max(0.0, current_v * current_v + 2.0 * max_accel * segment_len)) - current_v;
    double max_dv_brake = current_v - std::sqrt(std::max(0.0, current_v * current_v - 2.0 * max_brake * segment_len));

    double actual_dv;
    if (dv >= 0.0) {
        actual_dv = std::min(dv, max_dv_accel);
    } else {
        actual_dv = -std::min(-dv, max_dv_brake);
    }

    // Longitudinal acceleration in G (positive = accelerating forward)
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
// TIRE WEAR
// ------------------------------------------------------------------

double calculateTireWearRate(double lateral_g, double lateral_g_factor,
                             double velocity, double max_speed) {
    // Baseline wear at any speed (m^-1)
    static constexpr double K_BASE    = 2e-6;
    // Lateral load contribution (scales with the square of lateral G)
    static constexpr double K_LATERAL = 8e-6;
    // Speed contribution (sliding friction increases at high speed)
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
    // base_fuel_rate is L/100 km:
    //   (L/100km) / 100 = L/km;  * (segment_dist / 1000) = L consumed
    double dist_km = segment_dist / 1000.0;
    return (base_fuel_rate / 100.0) * dist_km * throttle_factor;
}

// ------------------------------------------------------------------
// AERODYNAMICS
// ------------------------------------------------------------------

double calculateDragForce(double velocity, double drag_coeff, double frontal_area) {
    static constexpr double AIR_DENSITY = 1.225;   // kg/m^3 at sea level, 15°C
    return 0.5 * AIR_DENSITY * drag_coeff * frontal_area * velocity * velocity;
}
