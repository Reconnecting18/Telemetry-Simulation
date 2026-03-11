#pragma once

#include <string>
#include <vector>

// ============================================================
//  types.hpp — All project data structures and API declarations
//  (Physics functions are in physics.hpp)
// ============================================================

// ------------------------------------------------------------------
// WEATHER
// ------------------------------------------------------------------

enum class WeatherCondition { Dry = 0, Damp = 1, Wet = 2 };

struct WeatherState {
    WeatherCondition condition = WeatherCondition::Dry;
    double track_temp_C  = 35.0;  // track surface temperature
    double ambient_temp_C = 25.0; // air temperature

    // Derived multipliers (computed from above)
    double grip_multiplier() const {
        switch (condition) {
            case WeatherCondition::Damp: return 0.75;
            case WeatherCondition::Wet:  return 0.50;
            default:                     return 1.00;
        }
    }
    // Tire heat generation rate multiplier:
    // wet = water film between tire and track absorbs heat → tires struggle to warm
    double heat_rate_multiplier() const {
        switch (condition) {
            case WeatherCondition::Damp: return 0.70;
            case WeatherCondition::Wet:  return 0.45;
            default:                     return 1.00;
        }
    }
    // Cooling rate multiplier: wet = spray cooling amplifies heat loss
    double cooling_multiplier() const {
        switch (condition) {
            case WeatherCondition::Damp: return 1.30;
            case WeatherCondition::Wet:  return 1.70;
            default:                     return 1.00;
        }
    }
    // Track temp affects warm-up: ratio relative to baseline 35°C
    // 20°C → 0.57x heat gen (slow warm-up), 50°C → 1.43x (fast warm-up, faster degradation)
    double track_temp_factor() const {
        return track_temp_C / 35.0;
    }
    // Ambient temp affects engine cooling efficiency:
    // hot air = less cooling = slightly reduced engine power at sustained load
    double engine_cooling_factor() const {
        if (ambient_temp_C <= 25.0) return 1.0;
        // Lose ~1% power per 5°C above 25°C
        return std::max(0.90, 1.0 - (ambient_temp_C - 25.0) * 0.002);
    }

    const char* conditionName() const {
        switch (condition) {
            case WeatherCondition::Damp: return "damp";
            case WeatherCondition::Wet:  return "wet";
            default:                     return "dry";
        }
    }
};

WeatherState defaultWeather();

// ------------------------------------------------------------------
// TRACK
// ------------------------------------------------------------------

struct TrackNode {
    double x;          // m — track-local X coordinate
    double y;          // m — track-local Y coordinate
    double z;          // m — elevation above datum
    double curvature;  // 1/m — signed: positive = left turn, negative = right turn
    double distance;   // m — cumulative arc-length from start
    int    kerb;       // 0=none  1=left kerb  2=right kerb  3=both
    double surface_grip; // 0.0–1.0 — base surface grip level (before rubber buildup)
    double dirty_zone;   // 0.0–1.0 — debris/marbles intensity (corner exits)
};

struct Track {
    std::string name;
    std::vector<TrackNode> nodes;

    // Loads nodes from a CSV file.
    // Supports 3-column (x,y,curvature) and 5-column (x,y,z,curvature,kerb) formats.
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

    // Gearbox
    int    num_gears;       // e.g. 6
    double gear_ratios[8];  // 1-indexed; [0] unused
    double final_drive;     // final drive ratio
    double max_rpm;         // redline RPM
    double idle_rpm;        // minimum RPM
    double shift_rpm;       // RPM at upshift point
    double tire_radius;     // m — driven wheel radius

    // Tire thermal
    double tire_ambient_temp;   // C — ambient/starting temperature
    double tire_optimal_temp;   // C — peak grip window
    double tire_overheat_temp;  // C — degradation threshold
    double tire_cold_pressure;  // psi — cold inflation pressure

    // Suspension & alignment
    double suspension_stiffness; // N/m — spring rate (per corner)
    double suspension_travel;    // m — max compression/rebound
    double wheelbase;            // m — front-to-rear axle distance
    double camber_deg[4];        // static camber FL/FR/RL/RR (negative = top inward)
    double toe_deg[4];           // static toe FL/FR/RL/RR (positive = toe-in)
};

struct VehicleState {
    double x, y;                    // m — current position (on racing line)
    double velocity;                // m/s
    double fuel;                    // L remaining
    double tire_wear[4];            // FL/FR/RL/RR: 0.0 = new, 1.0 = worn
    double lateral_g;               // G
    double longitudinal_g;          // G (positive = accelerating)
    double timestamp;               // s from lap start
    int    node_index;

    int    gear;                    // current gear 1-N
    double rpm;                     // engine RPM
    double throttle;                // 0.0 – 1.0
    double brake;                   // 0.0 – 1.0
    double tire_temp[4];            // C per tire
    double tire_pressure[4];        // psi per tire
    double suspension_deflection[4];// m per corner (positive = compressed)
    double dynamic_camber[4];       // deg per tire (adjusted by deflection)
};

VehicleState    makeInitialState(const VehicleConfig& config);
VehicleConfig   defaultVehicleConfig();

// ------------------------------------------------------------------
// TELEMETRY
// ------------------------------------------------------------------

struct TelemetryFrame {
    int    node_index;
    int    lap;                     // 1-indexed lap number
    double timestamp;               // s — cumulative session time
    double x, y;                    // m — racing line position
    double elevation_m;             // m — track elevation at this node
    bool   on_kerb;                 // car is at a kerb node
    double velocity_ms;             // m/s
    double lateral_g;               // G
    double longitudinal_g;          // G
    double lateral_force_N;         // N
    double drag_force_N;            // N
    double fuel_L;                  // L
    double tire_wear[4];            // FL FR RL RR

    int    gear;
    double rpm;
    double throttle;                // 0–1
    double brake;                   // 0–1
    double tire_temp[4];            // C
    double tire_pressure[4];        // psi
    double suspension_mm[4];        // mm (deflection * 1000)
    double camber_deg[4];           // dynamic camber
    double surface_grip;            // 0–1 effective grip (base + rubber buildup)
    std::string compound;           // "soft", "medium", "hard"
};

struct RacingLinePoint {
    double x, y;  // m — racing line position
};

struct PitStop {
    int         after_lap;       // last lap before pit stop (1-indexed)
    std::string from_compound;   // compound being replaced
    std::string to_compound;     // compound being fitted
    double      fuel_added_L;    // liters of fuel added during stop
};

struct TelemetrySession {
    std::string               track_name;
    VehicleConfig             vehicle_config;
    WeatherState              weather;       // weather conditions for the session
    std::vector<TelemetryFrame> frames;
    std::vector<TrackNode>    track_nodes;  // raw track geometry for frontend
    std::vector<RacingLinePoint> racing_line; // computed racing line positions
    std::vector<PitStop>      pit_stops;    // pit stop events (strategy mode only)
    double                    total_distance_m;
    int                       total_laps;   // laps completed before session end
    std::string               end_reason;   // "fuel" | "tire_wear" | "tire_damage" | "max_laps"

    // Writes JSON to path, creating parent directories as needed.
    bool writeJSON(const std::string& path) const;
};

// ------------------------------------------------------------------
// SIMULATION
// ------------------------------------------------------------------

TelemetrySession runSimulation(const Track& track, const VehicleConfig& config);
