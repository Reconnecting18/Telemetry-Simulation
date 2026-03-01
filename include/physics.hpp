#pragma once

#include "types.hpp"

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
// VELOCITY PLANNING
// ------------------------------------------------------------------

double calculateOptimalVelocity(double curvature, double max_lateral_g, double max_speed);

double adjustVelocity(double current_v, double target_v,
                      double segment_len,
                      double max_accel, double max_brake,
                      double& longitudinal_g_out);

// Look-ahead: pre-computes a velocity profile with forward+backward passes.
// Uses power-limited acceleration and drag-assisted braking.
std::vector<double> computeVelocityProfile(
    const std::vector<TrackNode>& nodes,
    const VehicleConfig& config);

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
