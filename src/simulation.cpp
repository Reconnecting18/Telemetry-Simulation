#include "types.hpp"
#include "physics.hpp"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>

// ============================================================
//  Track loading
// ============================================================

bool Track::loadFromCSV(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "[Track] ERROR: cannot open '" << path << "'\n";
        return false;
    }

    nodes.clear();
    std::string header;
    std::getline(file, header);  // read and inspect header

    // Count columns to detect format:
    //  3-col: x,y,curvature       (legacy)
    //  5-col: x,y,z,curvature,kerb (current)
    int col_count = 1;
    for (char c : header) {
        if (c == ',') ++col_count;
    }
    bool has_elevation = (col_count >= 4);
    bool has_kerb      = (col_count >= 5);

    double cumulative_dist = 0.0;
    std::string line;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string val;
        TrackNode node{};
        try {
            std::getline(ss, val, ','); node.x = std::stod(val);
            std::getline(ss, val, ','); node.y = std::stod(val);
            if (has_elevation) {
                std::getline(ss, val, ','); node.z = std::stod(val);
            } else {
                node.z = 0.0;
            }
            std::getline(ss, val, ','); node.curvature = std::stod(val);
            if (has_kerb && std::getline(ss, val, ',')) {
                node.kerb = std::stoi(val);
            } else {
                node.kerb = 0;
            }
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
//  Vehicle defaults
// ============================================================

VehicleState makeInitialState(const VehicleConfig& config) {
    VehicleState s{};
    s.fuel = config.fuel_capacity;
    s.gear = 1;
    for (int i = 0; i < 4; ++i) {
        s.tire_temp[i]      = config.tire_ambient_temp;
        s.tire_pressure[i]  = config.tire_cold_pressure;
        s.dynamic_camber[i] = config.camber_deg[i];
    }
    return s;
}

VehicleConfig defaultVehicleConfig() {
    VehicleConfig cfg{};

    // GT3-class vehicle (Porsche 911 GT3 R inspired)
    cfg.mass           = 1300.0;
    cfg.max_lateral_g  = 2.0;
    cfg.max_speed      = 74.0;
    cfg.max_accel      = 9.5;
    cfg.max_brake      = 16.0;
    cfg.drag_coeff     = 0.75;
    cfg.frontal_area   = 2.0;
    cfg.fuel_capacity  = 120.0;
    cfg.base_fuel_rate = 35.0;
    cfg.cog_height     = 0.45;
    cfg.track_width    = 1.65;

    cfg.num_gears = 6;
    cfg.gear_ratios[0] = 0.0;
    cfg.gear_ratios[1] = 3.09;
    cfg.gear_ratios[2] = 2.19;
    cfg.gear_ratios[3] = 1.69;
    cfg.gear_ratios[4] = 1.35;
    cfg.gear_ratios[5] = 1.12;
    cfg.gear_ratios[6] = 0.93;
    cfg.gear_ratios[7] = 0.0;
    cfg.final_drive  = 3.44;
    cfg.max_rpm      = 9000.0;
    cfg.idle_rpm     = 3500.0;
    cfg.shift_rpm    = 8500.0;
    cfg.tire_radius  = 0.33;

    cfg.tire_ambient_temp  = 25.0;
    cfg.tire_optimal_temp  = 85.0;
    cfg.tire_overheat_temp = 110.0;
    cfg.tire_cold_pressure = 25.0;

    cfg.suspension_stiffness = 120000.0;
    cfg.suspension_travel    = 0.040;
    cfg.wheelbase            = 2.50;
    cfg.camber_deg[0] = -3.0;  cfg.camber_deg[1] = -3.0;
    cfg.camber_deg[2] = -1.8;  cfg.camber_deg[3] = -1.8;
    cfg.toe_deg[0] = 0.05;  cfg.toe_deg[1] = 0.05;
    cfg.toe_deg[2] = 0.00;  cfg.toe_deg[3] = 0.00;

    return cfg;
}

// ============================================================
//  Simulation helpers
// ============================================================

// Lateral load transfer factors [FL, FR, RL, RR].
static void computeTireFactors(double lateral_g, double curvature,
                                double cog_height, double track_width,
                                double out[4]) {
    double transfer = (track_width > 0.0)
        ? std::clamp(std::abs(lateral_g) * cog_height / track_width, 0.0, 0.30)
        : 0.0;
    double outer = 0.5 + transfer;
    double inner = 0.5 - transfer;

    if (curvature > 0.0) {          // left turn: right side outer
        out[0] = inner; out[1] = outer; out[2] = inner; out[3] = outer;
    } else if (curvature < 0.0) {   // right turn: left side outer
        out[0] = outer; out[1] = inner; out[2] = outer; out[3] = inner;
    } else {
        out[0] = out[1] = out[2] = out[3] = 0.5;
    }
}

static void updateTireTemps(double tire_temp[4], const double factors[4],
                             double lateral_g, double velocity, double max_speed,
                             double longitudinal_g, double ambient, double dt) {
    static constexpr double K_LAT   = 0.50;
    static constexpr double K_SPEED = 0.15;
    static constexpr double K_BRAKE = 0.30;
    static constexpr double K_COOL  = 0.08;

    double speed_ratio = (max_speed > 0.0) ? velocity / max_speed : 0.0;
    double brake_g     = std::max(-longitudinal_g, 0.0);
    double heat_base   = K_LAT   * lateral_g  * lateral_g
                       + K_SPEED * speed_ratio * speed_ratio
                       + K_BRAKE * brake_g     * brake_g;

    for (int i = 0; i < 4; ++i) {
        double heat    = heat_base * (0.5 + factors[i]);
        double cooling = K_COOL * (tire_temp[i] - ambient);
        tire_temp[i]  += (heat - cooling) * dt;
        tire_temp[i]   = std::max(tire_temp[i], ambient);
    }
}

static void updateTirePressures(double pressure[4], const double temp[4],
                                 double cold_pressure, double ambient_temp) {
    double T_ref = ambient_temp + 273.15;
    for (int i = 0; i < 4; ++i) {
        pressure[i] = cold_pressure * (temp[i] + 273.15) / T_ref;
    }
}

static void computeSuspension(double defl[4], double dynamic_camber[4],
                               const double static_camber[4],
                               double lateral_g, double longitudinal_g,
                               double curvature,
                               double mass, double cog_height, double wheelbase,
                               double stiffness, double max_travel) {
    static constexpr double G = 9.81;
    static constexpr double K_CAMBER_GAIN = 50.0;

    double lat_force_half = mass * std::abs(lateral_g) * G / 2.0;
    double lat_defl = (stiffness > 0.0) ? lat_force_half / stiffness : 0.0;
    lat_defl = std::min(lat_defl, max_travel);

    double long_force = mass * std::abs(longitudinal_g) * G * cog_height / wheelbase;
    double long_defl  = (stiffness > 0.0) ? long_force / stiffness : 0.0;
    long_defl = std::min(long_defl, max_travel);

    double lat_sign_LR  = 0.0;
    if      (curvature > 0.0) lat_sign_LR =  1.0;
    else if (curvature < 0.0) lat_sign_LR = -1.0;

    double long_sign_FB = (longitudinal_g < 0.0) ? 1.0 : -1.0;

    defl[0] = -lat_sign_LR * lat_defl + long_sign_FB * long_defl;
    defl[1] =  lat_sign_LR * lat_defl + long_sign_FB * long_defl;
    defl[2] = -lat_sign_LR * lat_defl - long_sign_FB * long_defl;
    defl[3] =  lat_sign_LR * lat_defl - long_sign_FB * long_defl;

    for (int i = 0; i < 4; ++i) {
        defl[i] = std::clamp(defl[i], -max_travel, max_travel);
        dynamic_camber[i] = static_camber[i] + K_CAMBER_GAIN * defl[i];
    }
}

// ============================================================
//  Simulation loop
// ============================================================

TelemetrySession runSimulation(const Track& track, const VehicleConfig& config) {
    TelemetrySession session;
    session.track_name       = track.name;
    session.vehicle_config   = config;
    session.track_nodes      = track.nodes;
    session.total_distance_m = track.totalDistance();

    if (track.nodes.empty()) {
        std::cerr << "[Simulation] ERROR: track has no nodes.\n";
        return session;
    }

    const int N = static_cast<int>(track.nodes.size());

    // ── Racing line ──────────────────────────────────────────────────────────
    // Computes lateral offsets toward corner insides and the effective curvature
    // of the resulting path (wider arcs → lower curvature → higher speed limit).
    std::vector<RacingLineNode> rl = computeRacingLine(track.nodes, 5.0);

    std::vector<double> rl_curv(N);
    for (int i = 0; i < N; ++i) {
        rl_curv[i] = rl[i].effective_curvature;
    }

    // ── Grade: sin(slope) per node ───────────────────────────────────────────
    // Positive = uphill (reduces acceleration, aids braking).
    std::vector<double> grade(N, 0.0);
    for (int i = 1; i < N; ++i) {
        double dx  = track.nodes[i].x - track.nodes[i - 1].x;
        double dy  = track.nodes[i].y - track.nodes[i - 1].y;
        double dz  = track.nodes[i].z - track.nodes[i - 1].z;
        double seg = std::sqrt(dx * dx + dy * dy);
        if (seg > 1e-6) grade[i] = dz / seg;
    }

    // ── Look-ahead velocity profile ──────────────────────────────────────────
    std::vector<double> v_profile = computeVelocityProfile(
        track.nodes, config, rl_curv, grade);

    static constexpr double AIR_DENSITY = 1.225;
    double drag_at_vmax = 0.5 * AIR_DENSITY * config.drag_coeff
                        * config.frontal_area * config.max_speed * config.max_speed;
    double engine_power = drag_at_vmax * config.max_speed;

    VehicleState state = makeInitialState(config);
    state.x = rl[0].x;
    state.y = rl[0].y;

    for (int i = 0; i < N; ++i) {
        const TrackNode& node = track.nodes[i];

        // Segment length from previous node (matches velocity profile phase)
        double seg_len = 0.1;
        if (i > 0) {
            double dx = node.x - track.nodes[i - 1].x;
            double dy = node.y - track.nodes[i - 1].y;
            seg_len = std::max(std::sqrt(dx * dx + dy * dy), 0.1);
        }

        // Grade at this node
        double grade_decel = 9.81 * grade[i];  // positive = uphill

        // Aerodynamic drag
        double drag_force = calculateDragForce(state.velocity,
                                               config.drag_coeff, config.frontal_area);
        double drag_decel = drag_force / config.mass;

        // Power-limited engine acceleration
        double max_engine_accel = (state.velocity > 1.0)
            ? std::min(config.max_accel, engine_power / (config.mass * state.velocity))
            : config.max_accel;

        // Grade-corrected effective accel and brake
        double eff_accel = std::max(max_engine_accel - drag_decel - grade_decel, 0.0);
        double eff_brake = config.max_brake + drag_decel + grade_decel;
        eff_brake        = std::max(eff_brake, config.max_brake * 0.1);

        double target_v = v_profile[i];
        double long_g   = 0.0;
        state.velocity = adjustVelocity(state.velocity, target_v, seg_len,
                                        eff_accel, eff_brake, long_g);

        // Use RL effective curvature — the car is physically on the racing line
        double curv_rl = rl_curv[i];

        state.lateral_g      = calculateLateralG(state.velocity, curv_rl);
        state.longitudinal_g = long_g;
        double lat_force_N   = calculateForceFromCurvature(config.mass, state.velocity, curv_rl);

        // Gearbox
        state.gear = selectGear(state.velocity, config.num_gears, config.gear_ratios,
                                config.final_drive, config.tire_radius,
                                config.idle_rpm, config.max_rpm);
        state.rpm  = calculateRPM(state.velocity, state.gear, config.gear_ratios,
                                  config.final_drive, config.tire_radius);

        // Throttle / brake from force balance (grade affects engine effort)
        double net_accel     = long_g * 9.81;
        double engine_effort = net_accel + drag_decel + grade_decel;
        if (engine_effort >= 0.0) {
            state.throttle = std::clamp(engine_effort / std::max(max_engine_accel, 0.01), 0.0, 1.0);
            state.brake    = 0.0;
        } else {
            state.throttle = 0.0;
            double mech_brake = std::max(-net_accel - drag_decel, 0.0);
            state.brake    = std::clamp(mech_brake / config.max_brake, 0.0, 1.0);
        }

        // Tire wear — curvature sign from node (same turn direction as RL)
        double factors[4];
        computeTireFactors(state.lateral_g, node.curvature,
                           config.cog_height, config.track_width, factors);
        for (int t = 0; t < 4; ++t) {
            double rate = calculateTireWearRate(state.lateral_g, factors[t],
                                               state.velocity, config.max_speed);
            state.tire_wear[t] = std::min(state.tire_wear[t] + rate * seg_len, 1.0);
        }

        double dt = seg_len / std::max(state.velocity, 0.1);

        // Tire temperature
        updateTireTemps(state.tire_temp, factors,
                        state.lateral_g, state.velocity, config.max_speed,
                        state.longitudinal_g, config.tire_ambient_temp, dt);

        // Kerb effect: thermal spike on kerb-side tires (kerb friction + vibration)
        if (node.kerb > 0) {
            for (int t = 0; t < 4; ++t) {
                bool left_tire  = (t == 0 || t == 2);
                bool right_tire = (t == 1 || t == 3);
                bool kerb_side  = ((node.kerb & 1) && left_tire) ||
                                  ((node.kerb & 2) && right_tire);
                if (kerb_side) {
                    state.tire_temp[t] += 2.5;
                }
            }
        }

        // Tire pressure
        updateTirePressures(state.tire_pressure, state.tire_temp,
                            config.tire_cold_pressure, config.tire_ambient_temp);

        // Suspension & dynamic camber
        computeSuspension(state.suspension_deflection, state.dynamic_camber,
                          config.camber_deg,
                          state.lateral_g, state.longitudinal_g, node.curvature,
                          config.mass, config.cog_height, config.wheelbase,
                          config.suspension_stiffness, config.suspension_travel);

        // Fuel — proportional to throttle
        double throttle_factor = 0.3 + state.throttle * 1.2;
        state.fuel = std::max(state.fuel - calculateFuelConsumptionDelta(
                                  seg_len, config.base_fuel_rate, throttle_factor), 0.0);

        // Position on racing line
        state.x          = rl[i].x;
        state.y          = rl[i].y;
        state.node_index = i;
        state.timestamp += dt;

        // Record telemetry frame
        TelemetryFrame f{};
        f.node_index      = i;
        f.timestamp       = state.timestamp;
        f.x               = state.x;
        f.y               = state.y;
        f.elevation_m     = node.z;
        f.on_kerb         = (node.kerb > 0);
        f.velocity_ms     = state.velocity;
        f.lateral_g       = state.lateral_g;
        f.longitudinal_g  = state.longitudinal_g;
        f.lateral_force_N = lat_force_N;
        f.drag_force_N    = drag_force;
        f.fuel_L          = state.fuel;
        f.gear            = state.gear;
        f.rpm             = state.rpm;
        f.throttle        = state.throttle;
        f.brake           = state.brake;
        for (int t = 0; t < 4; ++t) {
            f.tire_wear[t]     = state.tire_wear[t];
            f.tire_temp[t]     = state.tire_temp[t];
            f.tire_pressure[t] = state.tire_pressure[t];
            f.suspension_mm[t] = state.suspension_deflection[t] * 1000.0;
            f.camber_deg[t]    = state.dynamic_camber[t];
        }
        session.frames.push_back(f);
    }

    std::cout << "[Simulation] Completed " << session.frames.size()
              << " nodes. Total distance: " << track.totalDistance() << " m\n";
    return session;
}
