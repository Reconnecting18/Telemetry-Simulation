#include "strategy.hpp"
#include "nlohmann/json.hpp"

#include <fstream>
#include <iostream>

using json = nlohmann::json;

// ============================================================
//  Compound parameter mapping
// ============================================================

CompoundParams getCompoundParams(const std::string& compound) {
    if (compound == "soft")         return { 1.45, 0.045,  88.0, 105.0 };
    if (compound == "hard")         return { 1.25, 0.016, 100.0, 118.0 };
    if (compound == "intermediate") return { 1.15, 0.020,  70.0,  90.0 };
    if (compound == "wet")          return { 1.05, 0.015,  60.0,  80.0 };
    return                                 { 1.35, 0.028,  95.0, 112.0 }; // medium (default)
}

double getWeatherGripMultiplier(const std::string& weather, const std::string& compound) {
    // Compound-weather cross-effect grip matrix
    // Dry slicks on wet = catastrophic; wet tires on dry = overheating/low grip
    if (compound == "intermediate") {
        if (weather == "damp") return 1.15;  // optimal condition
        if (weather == "wet")  return 0.40;  // too little tread for standing water
        return 0.70;                          // dry: overheating, graining
    }
    if (compound == "wet") {
        if (weather == "wet")  return 1.05;  // optimal condition
        if (weather == "damp") return 0.80;  // decent but sub-optimal
        return 0.50;                          // dry: massive overheating, shredding
    }
    // Dry compounds (soft, medium, hard)
    if (weather == "damp") return 0.65;  // reduced: water film, no tread pattern
    if (weather == "wet")  return 0.40;  // severe: aquaplaning, no grip
    return 1.0; // dry: nominal
}

// ============================================================
//  JSON parsing
// ============================================================

bool parseStrategyConfig(const std::string& path, StrategyConfig& out) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "[Strategy] ERROR: cannot open '" << path << "'\n";
        return false;
    }

    json j;
    try {
        j = json::parse(file);
    } catch (const json::parse_error& e) {
        std::cerr << "[Strategy] ERROR: JSON parse error: " << e.what() << "\n";
        return false;
    }

    // --- stints array ---
    if (j.contains("stints") && j["stints"].is_array()) {
        for (const auto& s : j["stints"]) {
            StintConfig stint;
            if (s.contains("compound")  && s["compound"].is_string())
                stint.compound  = s["compound"].get<std::string>();
            if (s.contains("tire_age")  && s["tire_age"].is_number_integer())
                stint.tire_age  = s["tire_age"].get<int>();
            if (s.contains("fuel_load") && s["fuel_load"].is_number())
                stint.fuel_load = s["fuel_load"].get<double>();
            if (s.contains("lap_count") && s["lap_count"].is_number_integer())
                stint.lap_count = s["lap_count"].get<int>();
            out.stints.push_back(stint);
        }
    }

    // --- modifiers object ---
    if (j.contains("modifiers") && j["modifiers"].is_object()) {
        const auto& m = j["modifiers"];
        if (m.contains("wear_multiplier")  && m["wear_multiplier"].is_number())
            out.modifiers.wear_multiplier  = m["wear_multiplier"].get<double>();
        if (m.contains("fuel_multiplier")  && m["fuel_multiplier"].is_number())
            out.modifiers.fuel_multiplier  = m["fuel_multiplier"].get<double>();
        if (m.contains("weather")          && m["weather"].is_string())
            out.modifiers.weather          = m["weather"].get<std::string>();
        if (m.contains("track_temp")       && m["track_temp"].is_number())
            out.modifiers.track_temp       = m["track_temp"].get<double>();
        if (m.contains("ambient_temp")     && m["ambient_temp"].is_number())
            out.modifiers.ambient_temp     = m["ambient_temp"].get<double>();
    }

    if (out.stints.empty()) {
        std::cerr << "[Strategy] WARNING: no stints defined, using 1 default stint\n";
        out.stints.push_back(StintConfig{});
    }

    std::cout << "[Strategy] Loaded " << out.stints.size() << " stint(s)\n";
    for (size_t i = 0; i < out.stints.size(); ++i) {
        const auto& st = out.stints[i];
        std::cout << "  Stint " << (i + 1) << ": " << st.compound
                  << " | age=" << st.tire_age
                  << " | fuel=" << st.fuel_load << "kg"
                  << " | laps=" << st.lap_count << "\n";
    }
    return true;
}
