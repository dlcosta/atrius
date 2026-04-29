create table if not exists olist_oauth_tokens (
  id integer primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  obtained_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table olist_oauth_tokens enable row level security;
-- Sem policies: apenas service_role (que bypassa RLS) tem acesso.
