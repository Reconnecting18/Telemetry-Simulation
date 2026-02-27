#include <iostream>
#include <string>
#include <cstdio>
#include "types.hpp"

int main(int argc, char* argv[]) {
    // Paths — override via command-line args if provided
    std::string track_path  = (argc > 1) ? argv[1] : "data/circuit_alpha.csv";
    std::string output_path = (argc > 2) ? argv[2] : "output/telemetry.json";

    std::cout << "=== Racing Telemetry Simulation ===\n";
    std::cout << "Track  : " << track_path  << "\n";
    std::cout << "Output : " << output_path << "\n\n";

    // Load track
    Track track;
    track.name = track_path;
    if (!track.loadFromCSV(track_path)) {
        return 1;
    }
    std::cout << "[Track] Loaded " << track.nodes.size()
              << " nodes, total distance: " << track.totalDistance() << " m\n\n";

    // Configure vehicle
    VehicleConfig config = defaultVehicleConfig();

    // Run simulation
    TelemetrySession session = runSimulation(track, config);

    // Print summary to console
    std::cout << "\n--- Telemetry Summary ---\n";
    std::cout << "Node | X      | Y      | Vel(m/s) | Lat-G  | Long-G | Fuel(L) | TireFL\n";
    std::cout << "-----|--------|--------|----------|--------|--------|---------|-------\n";
    for (const auto& f : session.frames) {
        printf("  %2d | %6.1f | %6.1f | %8.2f | %6.3f | %6.3f | %7.3f | %.5f\n",
               f.node_index, f.x, f.y, f.velocity_ms,
               f.lateral_g, f.longitudinal_g, f.fuel_L, f.tire_wear[0]);
    }

    // Write JSON telemetry
    std::cout << "\n";
    if (!session.writeJSON(output_path)) {
        return 1;
    }

    std::cout << "Done.\n";
    return 0;
}
