#pragma once

#include "types.hpp"
#include <string>
#include <vector>

// ============================================================
//  Strategy configuration — parsed from JSON input file
// ============================================================

struct StintConfig {
    std::string compound = "medium";  // "soft", "medium", "hard"
    int    tire_age   = 0;            // laps of prior use
    double fuel_load  = 100.0;        // kg
    int    lap_count  = 10;           // laps for this stint
};

struct StrategyModifiers {
    double      wear_multiplier  = 1.0;
    double      fuel_multiplier  = 1.0;
    std::string weather          = "dry";   // "dry", "damp", "wet"
    double      track_temp       = 35.0;    // degrees C
    double      ambient_temp     = 25.0;    // degrees C
};

struct StrategyConfig {
    std::vector<StintConfig> stints;
    StrategyModifiers        modifiers;
};

// Compound physical properties
struct CompoundParams {
    double grip;              // max_lateral_g scaling value (medium = 1.35 baseline)
    double wear_rate;         // per-lap wear rate (fraction, e.g. 0.045 = 4.5%)
    double optimal_temp_min;  // degrees C
    double optimal_temp_max;  // degrees C
};

CompoundParams getCompoundParams(const std::string& compound);
double         getWeatherGripMultiplier(const std::string& weather);

// Parse strategy config from a JSON file.
bool parseStrategyConfig(const std::string& path, StrategyConfig& out);

// Run multi-stint simulation using strategy config.
// base_config is the default vehicle config — compound/fuel/weather modify it per stint.
TelemetrySession runStrategySimulation(
    const Track& track,
    const VehicleConfig& base_config,
    const StrategyConfig& strategy);
