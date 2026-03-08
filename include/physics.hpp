#pragma once

#include "types.hpp"
#include <vector>

// ============================================================
//  Physics Engine — Racing Telemetry Simulation
//  All calculations use SI units unless noted otherwise.
// ============================================================

// ------------------------------------------------------------------
// LATERAL FORCES
// ------------------------------------------------------------------

double calculateForceFromCurvature(double mass, double velocity, double curvature);
double calculateLateralG(double velocity, double curvature);

// ------------------------------------------------------------------
// RACING LINE
// ------------------------------------------------------------------

// A single node along the ideal racing line.
struct RacingLineNode {
    double x, y;                   // real-space position (m)
    double effective_curvature;    // signed curvature along the RL path (1/m)
};

// Compute the ideal racing line as a lateral offset from the track centerline.
// Negative curvature (right turn) → car moves right at apex; positive → left.
// max_offset: maximum lateral deviation in meters (default 5 m).
std::vector<RacingLineNode> computeRacingLine(
    const std::vector<TrackNode>& nodes,
    double max_offset = 5.0);

// ------------------------------------------------------------------
// VELOCITY PLANNING
// ------------------------------------------------------------------

double calculateOptimalVelocity(double curvature, double max_lateral_g, double max_speed);

double adjustVelocity(double current_v, double target_v,
                      double segment_len,
                      double max_accel, double max_brake,
                      double& longitudinal_g_out);

// Look-ahead velocity profile (3-pass: corner limits → backward brake → forward accel).
// rl_curvatures: per-node effective curvatures along the racing line (replaces node curvatures
//                in Pass 1 if provided; must be same size as nodes, else nodes curvatures used).
// grade:         per-node sin(slope) values, positive = uphill (affects accel/brake passes).
std::vector<double> computeVelocityProfile(
    const std::vector<TrackNode>& nodes,
    const VehicleConfig& config,
    const std::vector<double>& rl_curvatures = {},
    const std::vector<double>& grade = {});

// ------------------------------------------------------------------
// GEARBOX
// ------------------------------------------------------------------

// RPM from wheel speed: RPM = (v * gear_ratio * final_drive * 60) / (2*PI*r)
double calculateRPM(double velocity, int gear, const double gear_ratios[],
                    double final_drive, double tire_radius);

// Select highest gear where RPM >= idle_rpm.
int selectGear(double velocity, int num_gears, const double gear_ratios[],
               double final_drive, double tire_radius,
               double idle_rpm, double max_rpm);

// ------------------------------------------------------------------
// TIRE WEAR
// ------------------------------------------------------------------

double calculateTireWearRate(double lateral_g, double lateral_g_factor,
                             double velocity, double max_speed);

// ------------------------------------------------------------------
// FUEL CONSUMPTION
// ------------------------------------------------------------------

double calculateFuelConsumptionDelta(double segment_dist,
                                     double base_fuel_rate,
                                     double throttle_factor);

// ------------------------------------------------------------------
// AERODYNAMICS
// ------------------------------------------------------------------

double calculateDragForce(double velocity, double drag_coeff, double frontal_area);

// ------------------------------------------------------------------
// SURFACE GRIP
// ------------------------------------------------------------------

// Compute base surface grip per node based on track characteristics.
// Corner-exit nodes get reduced grip from marbles/debris; high-curvature
// zones outside the ideal line have lower grip.
void computeSurfaceGrip(std::vector<TrackNode>& nodes,
                        const std::vector<double>& rl_curvatures);

// Rubber buildup: returns per-node effective grip including accumulated rubber.
// rubber_accum[i] is updated in-place each lap based on velocity/forces at node i.
std::vector<double> applyRubberBuildup(
    const std::vector<TrackNode>& nodes,
    std::vector<double>& rubber_accum,
    int lap);
