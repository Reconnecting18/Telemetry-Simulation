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
    // Ensure parent directory exists
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

    out << "{\n";

    // --- session block ---
    out << "  \"session\": {\n";
    out << "    \"track\": "        << jStr(track_name)                          << ",\n";
    out << "    \"total_nodes\": "  << frames.size()                              << "\n";
    out << "  },\n";

    // --- vehicle block ---
    out << "  \"vehicle\": {\n";
    out << "    \"mass_kg\": "        << jVal(vehicle_config.mass, 1)        << ",\n";
    out << "    \"max_lateral_g\": "  << jVal(vehicle_config.max_lateral_g)  << ",\n";
    out << "    \"max_speed_ms\": "   << jVal(vehicle_config.max_speed, 1)   << ",\n";
    out << "    \"fuel_capacity_L\": "<< jVal(vehicle_config.fuel_capacity, 1)<< "\n";
    out << "  },\n";

    // --- frames array ---
    out << "  \"frames\": [\n";
    for (std::size_t i = 0; i < frames.size(); ++i) {
        const TelemetryFrame& f = frames[i];
        out << "    {\n";
        out << "      \"node\": "           << f.node_index                       << ",\n";
        out << "      \"time_s\": "         << jVal(f.timestamp)                  << ",\n";
        out << "      \"x\": "              << jVal(f.x, 2)                       << ",\n";
        out << "      \"y\": "              << jVal(f.y, 2)                       << ",\n";
        out << "      \"velocity_ms\": "    << jVal(f.velocity_ms)                << ",\n";
        out << "      \"lateral_g\": "      << jVal(f.lateral_g)                  << ",\n";
        out << "      \"longitudinal_g\": " << jVal(f.longitudinal_g)             << ",\n";
        out << "      \"lateral_force_N\": "<< jVal(f.lateral_force_N, 1)         << ",\n";
        out << "      \"drag_force_N\": "  << jVal(f.drag_force_N, 1)            << ",\n";
        out << "      \"fuel_L\": "        << jVal(f.fuel_L)                     << ",\n";
        out << "      \"tire_wear\": {\n";
        out << "        \"FL\": " << jVal(f.tire_wear[0], 6) << ",\n";
        out << "        \"FR\": " << jVal(f.tire_wear[1], 6) << ",\n";
        out << "        \"RL\": " << jVal(f.tire_wear[2], 6) << ",\n";
        out << "        \"RR\": " << jVal(f.tire_wear[3], 6) << "\n";
        out << "      }\n";
        out << "    }";
        if (i + 1 < frames.size()) out << ",";
        out << "\n";
    }
    out << "  ]\n";
    out << "}\n";

    std::cout << "[Telemetry] Written: " << path << "\n";
    return true;
}
