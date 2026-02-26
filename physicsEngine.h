#ifndef PHYSICS_ENGINE_H
#define PHYSICS_ENGINE_H

// Calculates centripetal force given mass, velocity, and curvature of the turn.
// Curvature is defined as 1/radius.
// This is the preferred function when curvature is known, as it correctly handles straight lines (curvature = 0).
double calculateForceFromCurvature(double mass, double velocity, double curvature);

#endif // PHYSICS_ENGINE_H