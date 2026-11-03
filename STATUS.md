# Today: Status

_Last updated 2026-11-03 (Beelink session)_

## Where things stand

Last 10 commits (2026-09-30 → 2026-11-02), newest first:

- **Today MCP connector** (#5, 2026-11-02): `supabase/functions/today-mcp` is a remote MCP server using OAuth 2.1 + PKCE, with email-code login locked to one address. Tools: get_day, list_tasks, place/update/remove block, add/update/remove block item, add_reminder. Calendar meetings are read-only. Days resolve in America/New_York. Login page is `public/mcp-login.html`. The service worker lets it through (sw `today-v19`). See `MCP.md`.
- **iCal Shortcut as a signed file** (#3, 2026-10-05): `tools/ical-shortcut/gen.py` builds the "All Week Today App" Shortcut. It installs on any iPhone, so the calendar feed can move to the work phone. Follow-up fix: the range DELETE now starts at tomorrow, so runs after 5 AM keep that morning's meetings.
- **Reminders routing** (2026-09-30 → 10-03): the sync agent sends reminders that start with an app prefix (`stock:`, `course:`/`c:`, `ink:`, `break:`, `cue <kind>:`) to the Course+ capture router and completes them in Apple. A ledger stops a reminder from being posted twice. A bare `stock <item>` also routes, because Siri drops the colon.
- **Reminders inbox in Triage** (2026-09-30): a card for undated reminders with no app prefix, showing the suggested destination. Actions: move / change / today / keep / done. Migration `20260930000000_reminder_triage.sql` was applied. sw went to `today-v18`.

## What's next

- Confirm the today-mcp migration (`tools/apply-mcp-migration.sh`) and the edge-function deploy are live. Then connect it in claude.ai and smoke-test get_day / place_block.
- Move the iCal feed Shortcut onto the work phone and check one full day of runs.
- Watch the reminder-triage suggestion backlog drain over sync runs.
