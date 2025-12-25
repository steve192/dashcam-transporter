#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dashcam-transporter"
REPO_DEFAULT="steve192/dashcam-transporter"
REPO="${DASHCAM_TRANSPORTER_REPO:-$REPO_DEFAULT}"
ARCH="$(dpkg --print-architecture)"

fetch_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n -E 's/.*"tag_name": "([^"]+)".*/\1/p' \
    | head -n 1
}

case "$ARCH" in
  armhf|arm64|amd64|i386) ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
 esac

tmp="$(mktemp -t ${APP_NAME}.XXXXXX.deb)"
apt_updated=0
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update
  apt_updated=1
  sudo apt-get install -y curl
fi

version="${DASHCAM_TRANSPORTER_VERSION:-}"
if [ -z "$version" ]; then
  tag="$(fetch_latest_version)"
  if [ -z "$tag" ]; then
    echo "Failed to determine latest release tag for ${REPO}" >&2
    exit 1
  fi
  version="${tag#v}"
else
  tag="${version}"
  version="${version#v}"
fi

asset="${APP_NAME}_${version}_${ARCH}.deb"
url="https://github.com/${REPO}/releases/download/${tag}/${asset}"

echo "Downloading $url"
curl -fsSL "$url" -o "$tmp"
chmod 644 "$tmp"

echo "Installing $asset"
if [ "$apt_updated" -eq 0 ]; then
  sudo apt-get update
fi
sudo apt-get install -y "$tmp"

echo "Edit config: sudo nano /etc/dashcam-transporter/settings.ini"
echo "Check status: sudo dashcam-transporter status"
