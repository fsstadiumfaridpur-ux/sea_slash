create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Allow anon app state reads"
  on public.app_state
  for select
  to anon
  using (true);

create policy "Allow anon app state writes"
  on public.app_state
  for insert
  to anon
  with check (true);

create policy "Allow anon app state updates"
  on public.app_state
  for update
  to anon
  using (true)
  with check (true);
