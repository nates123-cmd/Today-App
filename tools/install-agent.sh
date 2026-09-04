#!/bin/bash
# Install the 5:30am reminders push as a launchd agent.
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

mkdir -p "$DEST"
cp "$REPO/tools/push-reminders.sh" "$DEST/push-reminders.sh"
chmod +x "$DEST/push-reminders.sh"

# Only the key the script needs, not the whole app env.
grep '^VITE_SUPABASE_ANON_KEY=' "$REPO/.env" > "$DEST/.env"
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
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>5</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
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
