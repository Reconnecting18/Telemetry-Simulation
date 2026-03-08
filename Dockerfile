# Reference Dockerfile for local builds (same steps as CI workflow).
# Usage:
#   docker build -t telemetry-builder .
#   docker run --rm -v $(pwd)/deployment:/output telemetry-builder \
#     cp /build/telemetry_sim /output/
FROM amazonlinux:2

RUN yum update -y && yum install -y \
    gcc gcc-c++ cmake3 make

WORKDIR /build
COPY CMakeLists.txt .
COPY src/ src/
COPY include/ include/
COPY data/ data/

RUN cmake3 -DCMAKE_BUILD_TYPE=Release . && make -j4
RUN strip telemetry_sim
