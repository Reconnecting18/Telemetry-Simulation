#include "types.hpp"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <filesystem>

// ---------------------------------------------------------------------------
// Minimal JSON helpers (no external dependencies)
// ---------------------------------------------------------------------------

static std::string jStr(const std::string& s) {
    return "\"" + s + "\"";
}

static std::string jVal(double v, int precision = 4) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(precision) << v;
    return oss.str();
}

// ---------------------------------------------------------------------------

bool TelemetrySession::writeJSON(const std::string& path) const {
    std::filesystem::path p(path);
    if (p.has_parent_path()) {
        std::filesystem::create_directories(p.parent_path());
    }

    std::ofstream out(path);
    if (!out.is_open()) {
        std::cerr << "[Telemetry] ERROR: cannot write to '" << path << "'\n";
        return false;
    }

    out << std::fixed;
    const VehicleConfig& vc = vehicle_config;

    out << "{\n";

    // --- session block ---
    out << "  \"session\": {\n";
    out << "    \"track\": "        << jStr(track_name)  << ",\n";
    out << "    \"total_frames\": " << frames.size()     << ",\n";
    out << "    \"total_laps\": "   << total_laps        << ",\n";
    out << "    \"end_reason\": "   << jStr(end_reason)  << "\n";
    out << "  },\n";

    // --- weather block ---
    out << "  \"weather\": {\n";
    out << "    \"condition\": "    << jStr(weather.conditionName()) << ",\n";
    out << "    \"track_temp_C\": " << jVal(weather.track_temp_C, 1) << ",\n";
    out << "    \"ambient_temp_C\": " << jVal(weather.ambient_temp_C, 1) << ",\n";
    out << "    \"grip_multiplier\": " << jVal(weather.grip_multiplier(), 2) << ",\n";
    out << "    \"heat_rate_multiplier\": " << jVal(weather.heat_rate_multiplier(), 2) << ",\n";
    out << "    \"cooling_multiplier\": " << jVal(weather.cooling_multiplier(), 2) << "\n";
    out << "  },\n";

    // --- track geometry block ---
    out << "  \"track\": {\n";
    out << "    \"name\": "             << jStr(track_name)           << ",\n";
    out << "    \"total_distance_m\": " << jVal(total_distance_m, 2) << ",\n";
    out << "    \"nodes\": [\n";
    for (std::size_t i = 0; i < track_nodes.size(); ++i) {
        const TrackNode& n = track_nodes[i];
        out << "      {"
            << "\"x\": "         << jVal(n.x, 2)
            << ", \"y\": "       << jVal(n.y, 2)
            << ", \"z\": "       << jVal(n.z, 2)
            << ", \"curvature\": " << jVal(n.curvature, 6)
            << ", \"kerb\": "    << n.kerb
            << ", \"surface_grip\": " << jVal(n.surface_grip, 3)
            << "}";
        if (i + 1 < track_nodes.size()) out << ",";
        out << "\n";
    }
    out << "    ]\n";
    out << "  },\n";

    // --- vehicle block ---
    out << "  \"vehicle\": {\n";
    out << "    \"mass_kg\": "              << jVal(vc.mass, 1)           << ",\n";
    out << "    \"max_lateral_g\": "        << jVal(vc.max_lateral_g)     << ",\n";
    out << "    \"max_speed_ms\": "         << jVal(vc.max_speed, 1)      << ",\n";
    out << "    \"fuel_capacity_L\": "      << jVal(vc.fuel_capacity, 1)  << ",\n";
    out << "    \"num_gears\": "            << vc.num_gears               << ",\n";
    out << "    \"max_rpm\": "              << jVal(vc.max_rpm, 0)        << ",\n";
    out << "    \"shift_rpm\": "            << jVal(vc.shift_rpm, 0)      << ",\n";
    out << "    \"tire_optimal_temp_C\": "  << jVal(vc.tire_optimal_temp, 1)  << ",\n";
    out << "    \"tire_overheat_temp_C\": " << jVal(vc.tire_overheat_temp, 1) << ",\n";
    out << "    \"cold_pressure_psi\": "    << jVal(vc.tire_cold_pressure, 1) << ",\n";
    out << "    \"suspension_travel_mm\": " << jVal(vc.suspension_travel * 1000.0, 1) << ",\n";
    out << "    \"camber_deg\": {\"FL\": "  << jVal(vc.camber_deg[0], 1)
        << ", \"FR\": " << jVal(vc.camber_deg[1], 1)
        << ", \"RL\": " << jVal(vc.camber_deg[2], 1)
        << ", \"RR\": " << jVal(vc.camber_deg[3], 1) << "},\n";
    out << "    \"toe_deg\": {\"FL\": "     << jVal(vc.toe_deg[0], 2)
        << ", \"FR\": " << jVal(vc.toe_deg[1], 2)
        << ", \"RL\": " << jVal(vc.toe_deg[2], 2)
        << ", \"RR\": " << jVal(vc.toe_deg[3], 2) << "}\n";
    out << "  },\n";

    // --- frames array ---
    out << "  \"frames\": [\n";
    for (std::size_t i = 0; i < frames.size(); ++i) {
        const TelemetryFrame& f = frames[i];
        out << "    {\n";
        out << "      \"node\": "            << f.node_index                      << ",\n";
        out << "      \"lap\": "             << f.lap                             << ",\n";
        out << "      \"time_s\": "          << jVal(f.timestamp)                 << ",\n";
        out << "      \"x\": "               << jVal(f.x, 2)                      << ",\n";
        out << "      \"y\": "               << jVal(f.y, 2)                      << ",\n";
        out << "      \"elevation_m\": "     << jVal(f.elevation_m, 2)            << ",\n";
        out << "      \"on_kerb\": "         << (f.on_kerb ? "true" : "false")    << ",\n";
        out << "      \"velocity_ms\": "     << jVal(f.velocity_ms)               << ",\n";
        out << "      \"lateral_g\": "       << jVal(f.lateral_g)                 << ",\n";
        out << "      \"longitudinal_g\": "  << jVal(f.longitudinal_g)            << ",\n";
        out << "      \"lateral_force_N\": " << jVal(f.lateral_force_N, 1)        << ",\n";
        out << "      \"drag_force_N\": "    << jVal(f.drag_force_N, 1)           << ",\n";
        out << "      \"fuel_L\": "          << jVal(f.fuel_L)                    << ",\n";
        out << "      \"gear\": "            << f.gear                            << ",\n";
        out << "      \"rpm\": "             << jVal(f.rpm, 0)                    << ",\n";
        out << "      \"throttle\": "        << jVal(f.throttle, 3)               << ",\n";
        out << "      \"brake\": "           << jVal(f.brake, 3)                  << ",\n";
        // Tire wear
        out << "      \"tire_wear\": {";
        out << "\"FL\": " << jVal(f.tire_wear[0], 6) << ", ";
        out << "\"FR\": " << jVal(f.tire_wear[1], 6) << ", ";
        out << "\"RL\": " << jVal(f.tire_wear[2], 6) << ", ";
        out << "\"RR\": " << jVal(f.tire_wear[3], 6) << "},\n";
        // Tire temp
        out << "      \"tire_temp_C\": {";
        out << "\"FL\": " << jVal(f.tire_temp[0], 1) << ", ";
        out << "\"FR\": " << jVal(f.tire_temp[1], 1) << ", ";
        out << "\"RL\": " << jVal(f.tire_temp[2], 1) << ", ";
        out << "\"RR\": " << jVal(f.tire_temp[3], 1) << "},\n";
        // Tire pressure
        out << "      \"tire_pressure_psi\": {";
        out << "\"FL\": " << jVal(f.tire_pressure[0], 2) << ", ";
        out << "\"FR\": " << jVal(f.tire_pressure[1], 2) << ", ";
        out << "\"RL\": " << jVal(f.tire_pressure[2], 2) << ", ";
        out << "\"RR\": " << jVal(f.tire_pressure[3], 2) << "},\n";
        // Suspension
        out << "      \"suspension_mm\": {";
        out << "\"FL\": " << jVal(f.suspension_mm[0], 2) << ", ";
        out << "\"FR\": " << jVal(f.suspension_mm[1], 2) << ", ";
        out << "\"RL\": " << jVal(f.suspension_mm[2], 2) << ", ";
        out << "\"RR\": " << jVal(f.suspension_mm[3], 2) << "},\n";
        // Camber
        out << "      \"camber_deg\": {";
        out << "\"FL\": " << jVal(f.camber_deg[0], 2) << ", ";
        out << "\"FR\": " << jVal(f.camber_deg[1], 2) << ", ";
        out << "\"RL\": " << jVal(f.camber_deg[2], 2) << ", ";
        out << "\"RR\": " << jVal(f.camber_deg[3], 2) << "},\n";
        // Surface grip
        out << "      \"surface_grip\": " << jVal(f.surface_grip, 3) << "\n";
        out << "    }";
        if (i + 1 < frames.size()) out << ",";
        out << "\n";
    }
    out << "  ]\n";
    out << "}\n";

    std::cout << "[Telemetry] Written: " << path << "\n";
    return true;
}
