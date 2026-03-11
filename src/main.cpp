#include <iostream>
#include <string>
#include <cstdio>
#include "types.hpp"
#include "strategy.hpp"

int main(int argc, char* argv[]) {
    std::string track_path    = (argc > 1) ? argv[1] : "data/monza.csv";
    std::string output_path   = (argc > 2) ? argv[2] : "output/telemetry.json";
    std::string strategy_path = (argc > 3) ? argv[3] : "";

    std::cout << "=== Racing Telemetry Simulation ===\n";
    std::cout << "Track    : " << track_path  << "\n";
    std::cout << "Output   : " << output_path << "\n";
    if (!strategy_path.empty())
        std::cout << "Strategy : " << strategy_path << "\n";
    std::cout << "\n";

    // Load track
    Track track;
    // Extract clean track name from filename
    std::string tname = track_path;
    auto slash = tname.find_last_of("/\\");
    if (slash != std::string::npos) tname = tname.substr(slash + 1);
    auto dot = tname.find_last_of('.');
    if (dot != std::string::npos) tname = tname.substr(0, dot);
    track.name = tname;
    if (!track.loadFromCSV(track_path)) {
        return 1;
    }
    std::cout << "[Track] Loaded " << track.nodes.size()
              << " nodes, total distance: " << track.totalDistance() << " m\n\n";

    // Configure vehicle
    VehicleConfig config = defaultVehicleConfig();

    // Run simulation (strategy mode — uses file if provided, else default 3-stint race)
    TelemetrySession session;
    if (!strategy_path.empty()) {
        StrategyConfig strategy;
        if (!parseStrategyConfig(strategy_path, strategy)) {
            return 1;
        }
        session = runStrategySimulation(track, config, strategy);
    } else {
        // Default 3-stint strategy: Soft → Hard → Medium (typical Monza GP)
        StrategyConfig strategy;
        strategy.stints = {
            { "soft",   0, 50.0, 18 },   // Stint 1: Soft, fresh, 50kg, 18 laps
            { "hard",   0, 50.0, 22 },   // Stint 2: Hard, fresh, 50kg, 22 laps
            { "medium", 0, 35.0, 15 },   // Stint 3: Medium, fresh, 35kg, 15 laps
        };
        session = runStrategySimulation(track, config, strategy);
    }

    // Print summary to console
    std::cout << "\n--- Telemetry Summary ---\n";
    std::cout << "Node | X      | Y      | Vel(m/s) | Lat-G  | Long-G | Gear | RPM   | Thr  | Brk  | Fuel(L)\n";
    std::cout << "-----|--------|--------|----------|--------|--------|------|-------|------|------|--------\n";
    for (const auto& f : session.frames) {
        printf("  %2d | %6.1f | %6.1f | %8.2f | %6.3f | %6.3f | %4d | %5.0f | %4.2f | %4.2f | %7.3f\n",
               f.node_index, f.x, f.y, f.velocity_ms,
               f.lateral_g, f.longitudinal_g,
               f.gear, f.rpm, f.throttle, f.brake, f.fuel_L);
    }

    // Write JSON telemetry
    std::cout << "\n";
    if (!session.writeJSON(output_path)) {
        return 1;
    }

    std::cout << "Done.\n";
    return 0;
}
