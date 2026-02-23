#include <iostream>
#include <iomanip>

// Function to calculate centripetal force (F = mv^2 / r)
double calculateCentripetalForce(double mass, double velocity, double radius) {
    return (mass * (velocity * velocity)) / radius;
}

int main() {
    // Inputs for Turn 1 (Placeholder)
    double carMass = 800.0;    // kg
    double velocity = 45.0;   // m/s (~100 mph)
    double turnRadius = 50.0; // meters

    double force = calculateCentripetalForce(carMass, velocity, turnRadius);
    double gripLimit = 12000.0; // Newtons (Force tires can handle)

    std::cout << "--- Race Telemetry Calculation ---" << std::endl;
    std::cout << "Lateral Force: " << std::fixed << std::setprecision(2) << force << " N" << std::endl;

    if (force > gripLimit) {
        std::cout << "STATUS: CRITICAL. Tires are losing grip. High wear detected." << std::endl;
    } else {
        std::cout << "STATUS: OPTIMAL. Grip is holding." << std::endl;
    }

    return 0;
}