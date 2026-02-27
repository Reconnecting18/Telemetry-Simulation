#pragma once

// ============================================================
//  Physics Engine — Racing Telemetry Simulation
//  All calculations use SI units unless noted otherwise.
// ============================================================

// ------------------------------------------------------------------
// LATERAL FORCES
// ------------------------------------------------------------------

// Centripetal force (N) from curvature (1/m), mass (kg), velocity (m/s).
// Returns 0 on straights (curvature == 0).
double calculateForceFromCurvature(double mass, double velocity, double curvature);

// Lateral acceleration in G (1 G = 9.81 m/s^2).
double calculateLateralG(double velocity, double curvature);

// ------------------------------------------------------------------
// VELOCITY PLANNING
// ------------------------------------------------------------------

// Maximum speed (m/s) at which the car can hold the corner
// without exceeding max_lateral_g, given the node's curvature.
// Returns max_speed when curvature is 0 (straight).
double calculateOptimalVelocity(double curvature, double max_lateral_g, double max_speed);

// Adjust current velocity toward a target over a segment of length
// segment_len (m) using kinematic clamping against max_accel / max_brake.
// Returns the new velocity (m/s) and sets longitudinal_g_out.
double adjustVelocity(double current_v, double target_v,
                      double segment_len,
                      double max_accel, double max_brake,
                      double& longitudinal_g_out);

// ------------------------------------------------------------------
// TIRE WEAR
// ------------------------------------------------------------------

// Wear increment per unit distance (dimensionless / m) for one tyre.
// lateral_g_factor: 0.0 (outer tyre in straight) to 1.0 (outer tyre in tight corner).
// velocity (m/s), max_speed (m/s) used to scale high-speed baseline.
double calculateTireWearRate(double lateral_g, double lateral_g_factor,
                             double velocity, double max_speed);

// ------------------------------------------------------------------
// FUEL CONSUMPTION
// ------------------------------------------------------------------

// Fuel consumed (liters) over a segment of segment_dist metres.
// base_fuel_rate is in L/100 km.
// throttle_factor (0–1) scales consumption above baseline (1.0 = cruise).
double calculateFuelConsumptionDelta(double segment_dist,
                                     double base_fuel_rate,
                                     double throttle_factor);

// ------------------------------------------------------------------
// AERODYNAMICS
// ------------------------------------------------------------------

// Aerodynamic drag force (N). Assumes air density = 1.225 kg/m³.
double calculateDragForce(double velocity, double drag_coeff, double frontal_area);
