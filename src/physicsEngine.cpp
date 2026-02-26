#include "physicsEngine.h"

// Function to calculate centripetal force (F = m * v^2 * k) where k is curvature.
double calculateForceFromCurvature(double mass, double velocity, double curvature) {
    // This formula correctly handles straight sections of a track where curvature is 0,
    // resulting in zero lateral force.
    return mass * (velocity * velocity) * curvature;
}