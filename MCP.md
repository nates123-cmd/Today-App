# Today MCP connector

Remote MCP server so Claude (claude.ai, Desktop, Code) can read a day in Today and plan it.

- Function: `supabase/functions/today-mcp/index.ts` (helpers in `lib.ts`, tests in `lib.test.ts`)
- Server URL: `https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/today-mcp`
- Login page: `public/mcp-login.html`, served from Pages at `https://nates123-cmd.github.io/Today-App/mcp-login.html`
- Auth: own OAuth 2.1 + PKCE, email-code sign-in, locked to one email. Tables `today_mcp_session/codes/tokens` (RLS on, no policies), separate from Ink and Course+.

## Tools

| Tool | Does |
|---|---|
| `get_day` | Blocks in time order with checklist items, free windows, reminders due |
| `list_tasks` | Open Course+ tasks by pillar and lane (default Now + Next) |
| `place_block` | New block; refuses overlaps unless `allow_overlap`; `proposed: true` = suggestion to accept in the app |
| `update_block` | Move / resize / rename / re-date, or `accept: true` a proposal |
| `remove_block` | Delete a block and its items |
| `add_block_item` | Checklist item in a block; `cp_task_id` links a Course+ task |
| `update_block_item` | Rename, move, or tick done (done syncs to Course+) |
| `remove_block_item` | Delete one item |
| `add_reminder` | Queue an Apple Reminder through the Mac agent |

Rules: calendar meetings (`source='ical'`) are read-only (the phone Shortcut re-creates them). Meetings hidden in the app are per-device and still show here. Days are New York time.

## Setup (one time)

1. Apply the migration (from repo root):
   ```
   supabase link --project-ref xsmnfcmtbpeaccnyinkr -p ''
   bash tools/apply-mcp-migration.sh
   ```
   It ends by listing the three `today_mcp_*` tables with `rowsecurity = true`.
2. Deploy the function, then confirm a version appears:
   ```
   supabase functions deploy today-mcp --no-verify-jwt
   supabase functions list | grep today-mcp
   ```
3. Merge the PR to main (Pages deploy puts the login page live). Check `https://nates123-cmd.github.io/Today-App/mcp-login.html` shows "Connect Today".
4. claude.ai → Settings → Connectors → Add custom connector → paste the server URL → sign in with the emailed code.

Optional secrets (code has these defaults): `TODAY_MCP_ALLOWED_EMAIL`, `TODAY_MCP_LOGIN_URL`. `TODAY_MCP_READONLY=1` hides write tools.

## Undo an agent's plan

Agent-placed blocks are ordinary `today_user` / `today_proposed` rows; delete them in the app, or with `remove_block`.
