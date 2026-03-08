cmake_minimum_required(VERSION 3.15)
project(TelemetrySimulation VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Generates build/compile_commands.json — used by clangd / VS Code IntelliSense
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(telemetry_sim
    src/main.cpp
    src/physics.cpp
    src/simulation.cpp
    src/strategy.cpp
    src/telemetry.cpp
)

target_include_directories(telemetry_sim PRIVATE include)

# Copy all track data next to the binary so default paths work when running
# from the build directory.
add_custom_command(TARGET telemetry_sim POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_SOURCE_DIR}/data
        $<TARGET_FILE_DIR:telemetry_sim>/data
    COMMENT "Copying track data to build directory"
)
