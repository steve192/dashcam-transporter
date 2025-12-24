#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="dashcam-transporter"
OUTPUT_DIR="${ROOT_DIR}/dist"

VERSION="${VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('${ROOT_DIR}/backend/package.json').version")"
fi

ARCH="${ARCH:-$(dpkg --print-architecture)}"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb is required to build the package" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

pushd "$ROOT_DIR/backend" >/dev/null
npm ci
npm run build
popd >/dev/null

STAGE_DIR="$(mktemp -d)"
PKG_ROOT="${STAGE_DIR}/${APP_NAME}_${VERSION}_${ARCH}"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

mkdir -p "$PKG_ROOT/DEBIAN"
mkdir -p "$PKG_ROOT/opt/${APP_NAME}"
mkdir -p "$PKG_ROOT/etc/${APP_NAME}"
mkdir -p "$PKG_ROOT/lib/systemd/system"
mkdir -p "$PKG_ROOT/usr/bin"
mkdir -p "$PKG_ROOT/etc/logrotate.d"

sed -e "s/@VERSION@/${VERSION}/g" -e "s/@ARCH@/${ARCH}/g" \
  "$ROOT_DIR/packaging/deb/control" > "$PKG_ROOT/DEBIAN/control"
install -m 755 "$ROOT_DIR/packaging/deb/postinst" "$PKG_ROOT/DEBIAN/postinst"
install -m 755 "$ROOT_DIR/packaging/deb/prerm" "$PKG_ROOT/DEBIAN/prerm"
install -m 755 "$ROOT_DIR/packaging/deb/postrm" "$PKG_ROOT/DEBIAN/postrm"
install -m 644 "$ROOT_DIR/packaging/deb/conffiles" "$PKG_ROOT/DEBIAN/conffiles"

cp -a "$ROOT_DIR/backend/dist/." "$PKG_ROOT/opt/${APP_NAME}/"
cp -a "$ROOT_DIR/backend/node_modules" "$PKG_ROOT/opt/${APP_NAME}/"
cp -a "$ROOT_DIR/backend/package.json" "$PKG_ROOT/opt/${APP_NAME}/"

if command -v npm >/dev/null 2>&1; then
  npm prune --omit=dev --prefix "$PKG_ROOT/opt/${APP_NAME}" >/dev/null 2>&1 || true
fi

install -m 640 "$ROOT_DIR/backend/settings.template.ini" "$PKG_ROOT/etc/${APP_NAME}/settings.ini"
install -m 644 "$ROOT_DIR/packaging/deb/dashcam-transporter.service" \
  "$PKG_ROOT/lib/systemd/system/dashcam-transporter.service"
install -m 755 "$ROOT_DIR/packaging/deb/dashcam-transporter" "$PKG_ROOT/usr/bin/dashcam-transporter"
install -m 644 "$ROOT_DIR/packaging/deb/dashcam-transporter.logrotate" \
  "$PKG_ROOT/etc/logrotate.d/dashcam-transporter"

OUTPUT_FILE="${OUTPUT_DIR}/${APP_NAME}_${VERSION}_${ARCH}.deb"
if command -v fakeroot >/dev/null 2>&1; then
  fakeroot sh -c "chown -R root:root '$PKG_ROOT' && dpkg-deb --build '$PKG_ROOT' '$OUTPUT_FILE'" >/dev/null
else
  echo "fakeroot not found; package ownership will reflect the current user" >&2
  dpkg-deb --build "$PKG_ROOT" "$OUTPUT_FILE" >/dev/null
fi

echo "Built $OUTPUT_FILE"
