#include "types.hpp"
#include "physics.hpp"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>

// ============================================================
//  Track loading  (was track.cpp)
// ============================================================

bool Track::loadFromCSV(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "[Track] ERROR: cannot open '" << path << "'\n";
        return false;
    }

    nodes.clear();
    std::string line;
    std::getline(file, line);   // skip header

    double cumulative_dist = 0.0;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string val;
        TrackNode node;
        try {
            std::getline(ss, val, ','); node.x         = std::stod(val);
            std::getline(ss, val, ','); node.y         = std::stod(val);
            std::getline(ss, val, ','); node.curvature = std::stod(val);
        } catch (...) {
            std::cerr << "[Track] WARNING: skipping malformed line: " << line << "\n";
            continue;
        }
        if (!nodes.empty()) {
            double dx = node.x - nodes.back().x;
            double dy = node.y - nodes.back().y;
            cumulative_dist += std::sqrt(dx * dx + dy * dy);
        }
        node.distance = cumulative_dist;
        nodes.push_back(node);
    }

    if (nodes.empty()) {
        std::cerr << "[Track] ERROR: no valid nodes in '" << path << "'\n";
        return false;
    }
    return true;
}

double Track::totalDistance() const {
    return nodes.empty() ? 0.0 : nodes.back().distance;
}

// ============================================================
//  Vehicle defaults  (was vehicle.cpp)
// ============================================================

VehicleState makeInitialState(const VehicleConfig& config) {
    VehicleState s{};
    s.fuel = config.fuel_capacity;
    return s;
}

VehicleConfig defaultVehicleConfig() {
    VehicleConfig cfg;
    cfg.mass           = 798.0;
    cfg.max_lateral_g  = 4.5;
    cfg.max_speed      = 91.0;
    cfg.max_accel      = 15.0;
    cfg.max_brake      = 45.0;
    cfg.drag_coeff     = 0.7;
    cfg.frontal_area   = 1.5;
    cfg.fuel_capacity  = 110.0;
    cfg.base_fuel_rate = 75.0;
    cfg.cog_height     = 0.30;
    cfg.track_width    = 1.52;
    return cfg;
}

// ============================================================
//  Simulation loop
// ============================================================

// Lateral load transfer factors [FL, FR, RL, RR].
// transfer = |lateral_g| * cog_height / track_width, clamped to [0, 0.30].
// outer = 0.5 + transfer, inner = 0.5 - transfer.
// Positive curvature = left turn (right tyres outer); negative = right turn.
static void computeTireFactors(double lateral_g, double curvature,
                                double cog_height, double track_width,
                                double out[4]) {
    double transfer = (track_width > 0.0)
        ? std::clamp(std::abs(lateral_g) * cog_height / track_width, 0.0, 0.30)
        : 0.0;
    double outer = 0.5 + transfer;
    double inner = 0.5 - transfer;

    if (curvature > 0.0) {          // left turn
        out[0] = inner; out[1] = outer; out[2] = inner; out[3] = outer;
    } else if (curvature < 0.0) {   // right turn
        out[0] = outer; out[1] = inner; out[2] = outer; out[3] = inner;
    } else {
        out[0] = out[1] = out[2] = out[3] = 0.5;
    }
}

TelemetrySession runSimulation(const Track& track, const VehicleConfig& config) {
    TelemetrySession session;
    session.track_name     = track.name;
    session.vehicle_config = config;

    if (track.nodes.empty()) {
        std::cerr << "[Simulation] ERROR: track has no nodes.\n";
        return session;
    }

    VehicleState state = makeInitialState(config);
    state.x = track.nodes[0].x;
    state.y = track.nodes[0].y;

    for (int i = 0; i < static_cast<int>(track.nodes.size()); ++i) {
        const TrackNode& node = track.nodes[i];

        // Segment length to next node
        double seg_len = 1.0;
        if (i + 1 < static_cast<int>(track.nodes.size())) {
            double dx = track.nodes[i + 1].x - node.x;
            double dy = track.nodes[i + 1].y - node.y;
            seg_len = std::max(std::sqrt(dx * dx + dy * dy), 0.1);
        }

        // Aerodynamic drag
        double drag_force = calculateDragForce(state.velocity,
                                               config.drag_coeff, config.frontal_area);
        double drag_decel = drag_force / config.mass;
        double eff_accel  = std::max(config.max_accel - drag_decel, 0.0);

        // Velocity planning
        double target_v = calculateOptimalVelocity(node.curvature,
                                                   config.max_lateral_g, config.max_speed);
        double long_g = 0.0;
        state.velocity = adjustVelocity(state.velocity, target_v, seg_len,
                                        eff_accel, config.max_brake, long_g);

        // Forces
        state.lateral_g      = calculateLateralG(state.velocity, node.curvature);
        state.longitudinal_g = long_g;
        double lat_force_N   = calculateForceFromCurvature(config.mass,
                                                           state.velocity, node.curvature);

        // Tire wear
        double factors[4];
        computeTireFactors(state.lateral_g, node.curvature,
                           config.cog_height, config.track_width, factors);
        for (int t = 0; t < 4; ++t) {
            double rate = calculateTireWearRate(state.lateral_g, factors[t],
                                               state.velocity, config.max_speed);
            state.tire_wear[t] = std::min(state.tire_wear[t] + rate * seg_len, 1.0);
        }

        // Fuel consumption
        double drag_ratio      = (config.max_accel > 0.0) ? drag_decel / config.max_accel : 0.0;
        double throttle_factor = std::max(1.0 + std::max(long_g, 0.0) * 0.3
                                              - std::max(-long_g, 0.0) * 0.5
                                              + drag_ratio * 0.4,
                                          0.1);
        state.fuel = std::max(state.fuel - calculateFuelConsumptionDelta(
                                  seg_len, config.base_fuel_rate, throttle_factor), 0.0);

        // Position and time
        state.x = node.x;
        state.y = node.y;
        state.node_index = i;
        state.timestamp += seg_len / std::max(state.velocity, 0.1);

        // Record frame
        TelemetryFrame f;
        f.node_index      = i;
        f.timestamp       = state.timestamp;
        f.x               = state.x;
        f.y               = state.y;
        f.velocity_ms     = state.velocity;
        f.lateral_g       = state.lateral_g;
        f.longitudinal_g  = state.longitudinal_g;
        f.lateral_force_N = lat_force_N;
        f.drag_force_N    = drag_force;
        f.fuel_L          = state.fuel;
        for (int t = 0; t < 4; ++t) f.tire_wear[t] = state.tire_wear[t];
        session.frames.push_back(f);
    }

    std::cout << "[Simulation] Completed " << session.frames.size()
              << " nodes. Total distance: " << track.totalDistance() << " m\n";
    return session;
}
