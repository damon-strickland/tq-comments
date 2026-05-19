-- Run this in your Supabase SQL editor (Project → SQL Editor → New query).

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  x real,
  y real,
  selector text,
  author text not null check (length(author) between 1 and 60),
  author_color text,
  body text not null check (length(body) between 1 and 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_url_idx on public.comments (url);
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists comments_updated_idx on public.comments (updated_at);

-- Touch updated_at on UPDATE
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
before update on public.comments
for each row execute function public.touch_updated_at();

-- RLS: v1 lets anyone with the anon key read/write.
-- Same threat model as the Worker version (no auth) — fine for internal use.
-- To tighten later: gate writes behind a per-prototype token, or wire up Supabase auth.
alter table public.comments enable row level security;

drop policy if exists "anon read comments" on public.comments;
drop policy if exists "anon insert comments" on public.comments;
drop policy if exists "anon update comments" on public.comments;
drop policy if exists "anon delete comments" on public.comments;

create policy "anon read comments"   on public.comments for select to anon using (true);
create policy "anon insert comments" on public.comments for insert to anon with check (true);
create policy "anon update comments" on public.comments for update to anon using (true) with check (true);
create policy "anon delete comments" on public.comments for delete to anon using (true);

-- Realtime (optional — for the v2 swap from polling to WebSocket).
-- Safe to leave on; the widget ignores it in v1.
alter publication supabase_realtime add table public.comments;

-- Per-prototype settings (Figma link, etc.) — keyed by URL
create table if not exists public.prototype_settings (
  url text primary key,
  figma_link text,
  updated_at timestamptz not null default now()
);

alter table public.prototype_settings enable row level security;

drop policy if exists "anon read settings"   on public.prototype_settings;
drop policy if exists "anon insert settings" on public.prototype_settings;
drop policy if exists "anon update settings" on public.prototype_settings;
create policy "anon read settings"   on public.prototype_settings for select to anon using (true);
create policy "anon insert settings" on public.prototype_settings for insert to anon with check (true);
create policy "anon update settings" on public.prototype_settings for update to anon using (true) with check (true);

drop trigger if exists prototype_settings_touch_updated_at on public.prototype_settings;
create trigger prototype_settings_touch_updated_at
before update on public.prototype_settings
for each row execute function public.touch_updated_at();
