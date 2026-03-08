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

# GCC 7/8 (Amazon Linux 2) requires explicit stdc++fs for <filesystem>.
# GCC 9+ links it automatically; MSVC doesn't need it at all.
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS "9.0")
    target_link_libraries(telemetry_sim stdc++fs)
endif()

# Copy all track data next to the binary so default paths work when running
# from the build directory.
add_custom_command(TARGET telemetry_sim POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_SOURCE_DIR}/data
        $<TARGET_FILE_DIR:telemetry_sim>/data
    COMMENT "Copying track data to build directory"
)
