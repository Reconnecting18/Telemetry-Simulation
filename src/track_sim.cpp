#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <sstream>
#include "physicsEngine.h" // Include our new physics engine header

struct TrackNode {
    double x, y, curvature;
};

int main() {
    std::vector<TrackNode> track;
    std::ifstream file("track_data.csv");

    // File Check
    if (!file.is_open()) {
        std::cerr << "ERROR: Could not open track_data.csv!" << std::endl;
        std::cerr << "Make sure the file is in the same folder as your program." << std::endl;
        return 1; 
    }

    std::string line;
    std::getline(file, line); 

    while (std::getline(file, line)) {
        if(line.empty()) continue;

        std::stringstream ss(line);
        std::string val;
        TrackNode node;
        
        try {
            std::getline(ss, val, ','); node.x = std::stod(val);
            std::getline(ss, val, ','); node.y = std::stod(val);
            std::getline(ss, val, ','); node.curvature = std::stod(val);
            track.push_back(node);
        } catch (...) {
            std::cerr << "Error parsing line: " << line << std::endl;
        }
    }

    std::cout << "--- Lap Simulation Started ---" << std::endl;
    std::cout << "Successfully loaded " << track.size() << " track nodes." << std::endl;

    double velocity = 40.0; 
    double mass = 800.0;    

    for (int i = 0; i < track.size(); i++) {
        double force = calculateForceFromCurvature(mass, velocity, track[i].curvature);
        std::cout << "Node " << i << ": Pos(" << track[i].x << "," << track[i].y 
                  << ") | Curvature: " << track[i].curvature << " | Lat Force: " << force << " N" << std::endl;
    }

    return 0;
}