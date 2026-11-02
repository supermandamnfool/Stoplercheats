#!/bin/bash
# Local CI packaging diagnostic. Ad-hoc signing is NOT Developer ID signing or notarization.
set -euo pipefail
APP="${1:-dist/mac-arm64/Stopler.app}"
if [[ ! -d "$APP" ]]; then
  echo "Missing application bundle: $APP" >&2
  exit 1
fi
echo "Re-signing packaged app with local ad-hoc identity (CI only)"
codesign --force --deep --sign - "$APP"
echo "Verifying strict bundle signature"
codesign --verify --deep --strict --verbose=4 "$APP"
echo "Signature identity:"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E 'Signature=|Identifier=|TeamIdentifier=' || true
echo "Checking Gatekeeper status (informational; unsigned distribution is expected to be rejected)"
if spctl --assess --type execute --verbose=4 "$APP"; then
  echo "Gatekeeper accepted on this runner"
else
  echo "Gatekeeper rejected on this runner; do not distribute or bypass macOS security."
fi
