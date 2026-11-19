#!/usr/bin/env bash
# Installs a built .deb into a clean Debian container the way a user does: apt
# resolves nodejs and npm from that release's own repositories and postinst rebuilds
# the native modules against them. Then loads the installed application on that
# Node.js (packaging/smoke-test.js).
#
# Usage: packaging/test-install-in-docker.sh <amd64|i386|arm64|armhf> [debian-release]
#        debian-release defaults to bookworm. Expects exactly one
#        dist/dashcam-transporter_*_<arch>.deb.
set -euo pipefail

ARCH="${1:?usage: $0 <amd64|i386|arm64|armhf> [debian-release]}"
DEBIAN_RELEASE="${2:-bookworm}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Docker 29.4.2 (GitHub's ubuntu-26.04 runners) makes the socketcall syscall fail in its
# default seccomp profile, and 32-bit x86 glibc opens every socket through socketcall,
# so DNS and all other networking fail in i386 containers. Docker 29.4.3 allows it
# again. These containers only build and test this package, so i386 runs unfiltered.
docker_opts=()
case "$ARCH" in
  amd64) platform=linux/amd64 ;;
  i386)
    platform=linux/386
    docker_opts=(--security-opt seccomp=unconfined)
    ;;
  arm64) platform=linux/arm64 ;;
  armhf) platform=linux/arm/v7 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

shopt -s nullglob
debs=("$ROOT_DIR"/dist/dashcam-transporter_*_"$ARCH".deb)
if [ "${#debs[@]}" -ne 1 ]; then
  echo "Expected exactly one dist/dashcam-transporter_*_${ARCH}.deb, found ${#debs[@]}" >&2
  exit 1
fi
deb="$(basename "${debs[0]}")"

# --pull always: a local image tag holds a single platform, so without it Docker
# reuses whichever architecture was pulled last.
docker run --rm --pull always --platform "$platform" "${docker_opts[@]}" \
  -e EXPECTED_ARCH="$ARCH" \
  -e DEB="$deb" \
  -v "$ROOT_DIR/dist":/artifacts:ro \
  -v "$ROOT_DIR/packaging/smoke-test.js":/smoke-test.js:ro \
  "debian:${DEBIAN_RELEASE}-slim" bash -c '
    set -euo pipefail
    if [ "$(dpkg --print-architecture)" != "$EXPECTED_ARCH" ]; then
      echo "Container runs $(dpkg --print-architecture), expected $EXPECTED_ARCH" >&2
      exit 1
    fi
    export DEBIAN_FRONTEND=noninteractive
    # There is no init system in the container: keep maintainer scripts from
    # starting services, and leave the network configuration alone.
    printf "#!/bin/sh\nexit 101\n" > /usr/sbin/policy-rc.d
    chmod +x /usr/sbin/policy-rc.d
    mkdir -p /etc/dashcam-transporter
    touch /etc/dashcam-transporter/skip-networkmanager-setup

    apt-get -o Acquire::Retries=3 update
    apt-get -o Acquire::Retries=3 install -y "/artifacts/${DEB}"

    echo "Installed on $(. /etc/os-release && echo "$PRETTY_NAME") with Node.js $(node -v) and npm $(npm -v)"
    test -f /etc/dashcam-transporter/settings.ini
    test -f /lib/systemd/system/dashcam-transporter.service
    test -x /usr/bin/dashcam-transporter
    dpkg -s dashcam-transporter >/dev/null
    node /smoke-test.js /opt/dashcam-transporter
  '
