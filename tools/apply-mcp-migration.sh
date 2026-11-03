#!/usr/bin/env bash
# Apply supabase/migrations/20261102000000_today_mcp.sql one statement at a time.
#
# `supabase db push` is unusable on the suite project and `db query --linked -f`
# only runs ONE statement per file, so this splits the migration on its
# `-- stmt` markers and runs each piece. Every statement is idempotent
# (`if not exists` / enabling RLS twice is a no-op), so a re-run is safe.
#
# Run from the repo root after `supabase link --project-ref xsmnfcmtbpeaccnyinkr -p ''`.
set -euo pipefail

SRC="supabase/migrations/20261102000000_today_mcp.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

awk -v dir="$TMP" '
  /^-- stmt/ { n++; next }
  n > 0 { print > (dir "/" sprintf("%02d", n) ".sql") }
' "$SRC"

for f in "$TMP"/*.sql; do
  echo "== $(basename "$f"): $(grep -m1 -E '^(create|alter)' "$f")"
  supabase db query --linked -f "$f"
done

echo
echo "Check: the three tables should be listed below."
CHECK="$TMP/check.sql"
echo "select tablename, rowsecurity from pg_tables where tablename like 'today_mcp_%' order by 1;" > "$CHECK"
supabase db query --linked -f "$CHECK"
