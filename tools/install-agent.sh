#!/bin/bash
# Install the Reminders <-> Today sync (push-reminders.sh + remkit) as a launchd
# agent that runs every 5 minutes. Builds remkit first if it is missing.
#
# WHY THIS COPIES THE SCRIPT instead of pointing launchd at the repo:
# the repo lives under ~/Desktop, which is TCC-protected. A launchd agent gets
# "Operation not permitted" trying to even READ a script there — it fails before
# it can run a single line, and the log shows only:
#     /bin/bash: .../tools/push-reminders.sh: Operation not permitted
# So the runnable copy lives in ~/Library/Application Support/today-reminders/,
# which is not protected. The same applies to .env, which the script sources.
#
# RE-RUN THIS after editing push-reminders.sh — the agent runs the copy, not the
# repo, so an un-reinstalled edit silently does nothing.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/today-reminders"
LABEL="com.nate.today-reminders"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -f "$REPO/.env" ] || { echo "no .env in $REPO" >&2; exit 1; }

[ -x "$REPO/tools/remkit/remkit" ] || "$REPO/tools/remkit/build.sh"

mkdir -p "$DEST"
cp "$REPO/tools/push-reminders.sh" "$DEST/push-reminders.sh"
chmod +x "$DEST/push-reminders.sh"
# Replace the binary only when it changed. A new binary has a new code hash and
# macOS may ask for Reminders access again, which a launchd run cannot answer.
# After a real change, run "$DEST/remkit" lists once from Terminal.
if ! cmp -s "$REPO/tools/remkit/remkit" "$DEST/remkit"; then
  cp "$REPO/tools/remkit/remkit" "$DEST/remkit"
  echo "remkit binary updated. If the log shows NO_ACCESS, allow it under"
  echo "System Settings > Privacy & Security > Reminders."
fi

# Only the key the script needs, not the whole app env.
grep '^VITE_SUPABASE_ANON_KEY=' "$REPO/.env" > "$DEST/.env"
# Prefix routing posts to the Course+ capture router, which is guarded by the
# same shared secret the Capture-list poller uses. Without it, prefixed
# reminders are left open (the log says so) and everything else still syncs.
CAPTURE_ENV="$HOME/.config/capture-reminders.env"
if [ -f "$CAPTURE_ENV" ] && grep -q '^CAPTURE_KEY=' "$CAPTURE_ENV"; then
  grep '^CAPTURE_KEY=' "$CAPTURE_ENV" >> "$DEST/.env"
else
  echo "no CAPTURE_KEY in $CAPTURE_ENV: prefix routing stays off"
fi
chmod 600 "$DEST/.env"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEST/push-reminders.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TODAY_ENV</key>
    <string>$DEST/.env</string>
  </dict>
  <!-- Every 5 minutes. It used to be 3 fixed runs a day because the osascript
       read took minutes; remkit reads the store in well under a second, and
       each run is also what applies ticks made in Today, so it has to be
       frequent. launchd folds runs missed during sleep into one on wake. -->
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/today-reminders.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/today-reminders.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "installed. runnable copy: $DEST/push-reminders.sh"
echo "test it:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "log:      tail -f $HOME/Library/Logs/today-reminders.log"
