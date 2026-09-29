#!/bin/bash
# Compile remkit. Output: tools/remkit/remkit (gitignored).
#
# The Info.plist is linked INTO the binary (__TEXT,__info_plist) because a bare
# command-line tool has no bundle, and macOS needs a usage string to show the
# Reminders permission prompt at all.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
swiftc -O "$HERE/remkit.swift" -o "$HERE/remkit" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$HERE/Info.plist"
echo "built $HERE/remkit"
