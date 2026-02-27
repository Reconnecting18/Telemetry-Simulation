#pragma once

#include <string>
#include <vector>

// ============================================================
//  types.hpp — All project data structures and API declarations
//  (Physics functions are in physics.hpp)
// ============================================================

// ------------------------------------------------------------------
// TRACK
// ------------------------------------------------------------------

struct TrackNode {
    double x;          // m — track-local X coordinate
    double y;          // m — track-local Y coordinate
    double curvature;  // 1/m — signed: positive = left turn, negative = right turn
    double distance;   // m — cumulative arc-length from start
};

struct Track {
    std::string name;
    std::vector<TrackNode> nodes;

    // Loads nodes from a CSV file (header: x,y,curvature).
    // Computes cumulative Euclidean distance between consecutive nodes.
    bool loadFromCSV(const std::string& path);

    // Total arc-length of the loaded track (m).
    double totalDistance() const;
};

// ------------------------------------------------------------------
// VEHICLE
// ------------------------------------------------------------------

struct VehicleConfig {
    double mass;            // kg
    double max_lateral_g;   // G — grip limit before sliding
    double max_speed;       // m/s — drag-limited top speed
    double max_accel;       // m/s^2 — peak engine acceleration
    double max_brake;       // m/s^2 — peak braking deceleration
    double drag_coeff;      // Cd
    double frontal_area;    // m^2
    double fuel_capacity;   // L
    double base_fuel_rate;  // L/100 km — cruise consumption
    double cog_height;      // m — centre of gravity height
    double track_width;     // m — lateral tyre contact spacing
};

struct VehicleState {
    double x, y;            // m — current position
    double velocity;        // m/s
    double fuel;            // L remaining
    double tire_wear[4];    // FL/FR/RL/RR: 0.0 = new, 1.0 = worn
    double lateral_g;       // G
    double longitudinal_g;  // G (positive = accelerating)
    double timestamp;       // s from lap start
    int    node_index;
};

VehicleState    makeInitialState(const VehicleConfig& config);
VehicleConfig   defaultVehicleConfig();

// ------------------------------------------------------------------
// TELEMETRY
// ------------------------------------------------------------------

struct TelemetryFrame {
    int    node_index;
    double timestamp;       // s
    double x, y;            // m
    double velocity_ms;     // m/s
    double lateral_g;       // G
    double longitudinal_g;  // G
    double lateral_force_N; // N
    double drag_force_N;    // N
    double fuel_L;          // L
    double tire_wear[4];    // FL FR RL RR
};

struct TelemetrySession {
    std::string               track_name;
    VehicleConfig             vehicle_config;
    std::vector<TelemetryFrame> frames;

    // Writes JSON to path, creating parent directories as needed.
    bool writeJSON(const std::string& path) const;
};

// ------------------------------------------------------------------
// SIMULATION
// ------------------------------------------------------------------

TelemetrySession runSimulation(const Track& track, const VehicleConfig& config);
