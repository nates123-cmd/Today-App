-- Today MCP: OAuth storage for the `today-mcp` connector.
--
-- Separate from cp_mcp_* / ink_mcp_* on purpose: connecting or revoking the
-- Today connector must not touch Course+ or Ink.
--
-- RLS on with NO policies = service role only. Nothing holding a token can read
-- the token table.
--
-- `db push` is unusable on this project and `db query --linked -f` takes ONE
-- statement per file, so apply with tools/apply-mcp-migration.sh, which splits
-- this file on the `-- stmt` markers.

-- stmt
create table if not exists public.today_mcp_session (
  email        text primary key,
  supa_refresh text not null,
  updated_at   timestamptz not null default now()
);

-- stmt
create table if not exists public.today_mcp_codes (
  code           text primary key,
  code_challenge text not null,
  redirect_uri   text not null,
  email          text not null,
  supa_refresh   text not null,
  expires_at     timestamptz not null
);

-- stmt
create table if not exists public.today_mcp_tokens (
  token      text primary key,
  kind       text not null check (kind in ('access','refresh')),
  email      text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- stmt
alter table public.today_mcp_session enable row level security;

-- stmt
alter table public.today_mcp_codes enable row level security;

-- stmt
alter table public.today_mcp_tokens enable row level security;
