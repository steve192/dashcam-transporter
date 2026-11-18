#!/usr/bin/env bash
# Builds dist/dashcam-transporter_<version>_<arch>.deb inside a Debian container.
#
# The package runs on the nodejs that the target system installs from its own apt
# repositories (postinst rebuilds the native modules against it), so the build uses
# Debian's nodejs and npm as well, never a nodejs.org binary. Building on the oldest
# supported release (Debian 12 "bookworm", which Raspberry Pi OS Bookworm is based on)
# makes a dependency that no longer runs on that Node.js fail here instead of on a Pi.
#
# Usage: packaging/build-deb-in-docker.sh <amd64|i386|arm64|armhf>
# Env:   DEBIAN_RELEASE  Debian release to build on (default: bookworm)
#        VERSION         package version (default: version in backend/package.json)
# Architectures other than the host's need QEMU binfmt handlers
# (docker/setup-qemu-action in CI, Docker Desktop has them built in).
set -euo pipefail

ARCH="${1:?usage: $0 <amd64|i386|arm64|armhf>}"
DEBIAN_RELEASE="${DEBIAN_RELEASE:-bookworm}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

case "$ARCH" in
  amd64) platform=linux/amd64 ;;
  i386) platform=linux/386 ;;
  arm64) platform=linux/arm64 ;;
  armhf) platform=linux/arm/v7 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

mkdir -p "$ROOT_DIR/dist"

# --pull always: a local image tag holds a single platform, so without it Docker
# reuses whichever architecture was pulled last and silently builds for that one.
# engine-strict makes `npm ci` fail on any dependency, transitive ones included, whose
# `engines` excludes this Node.js or npm, instead of printing a warning.
docker run --rm --pull always --platform "$platform" \
  -e EXPECTED_ARCH="$ARCH" \
  -e VERSION="${VERSION:-}" \
  -e npm_config_engine_strict=true \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -v "$ROOT_DIR":/src:ro \
  -v "$ROOT_DIR/dist":/out \
  "debian:${DEBIAN_RELEASE}-slim" bash -c '
    set -euo pipefail
    if [ "$(dpkg --print-architecture)" != "$EXPECTED_ARCH" ]; then
      echo "Container runs $(dpkg --print-architecture), expected $EXPECTED_ARCH" >&2
      exit 1
    fi
    export DEBIAN_FRONTEND=noninteractive
    apt-get -o Acquire::Retries=3 update
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
      nodejs npm dpkg-dev fakeroot build-essential python3 ca-certificates
    echo "Building with Node.js $(node -v) and npm $(npm -v) from $(. /etc/os-release && echo "$PRETTY_NAME")"

    # Build from a copy, so the host checkout and its node_modules stay untouched.
    mkdir /build
    tar -C /src \
      --exclude=./.git --exclude=./dist \
      --exclude=./backend/node_modules --exclude=./backend/dist \
      -cf - . | tar -C /build -xf -
    /build/packaging/build-deb.sh
    install -o "$HOST_UID" -g "$HOST_GID" -m 644 /build/dist/*.deb /out/
  '
