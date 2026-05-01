-- 03-folders.sql
-- Adds nested folders (per-workspace, like Drive/AIR) for organising
-- library items (originals + clips) AND finished/draft ads.
--
-- Idempotent — safe to re-run. Each block uses IF NOT EXISTS / ALTER
-- so a partially-applied previous run is repaired rather than rejected.
--
-- Run this in the Supabase SQL editor.

-- ── Folders table ────────────────────────────────────────────────────────────
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references folders(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- `kind` is added separately so a previous half-applied run that created
-- the table without it is repaired here. "library" → items tree,
-- "ads" → forged_ads tree. Keeps the two trees separate so item folders
-- don't pollute the ad library and vice versa.
alter table folders
  add column if not exists kind text not null default 'library';

-- Add the constraint only if it isn't already present (no IF NOT EXISTS
-- on ADD CONSTRAINT, so guard with a DO block).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'folders_kind_check' and conrelid = 'folders'::regclass
  ) then
    alter table folders
      add constraint folders_kind_check check (kind in ('library', 'ads'));
  end if;
end $$;

create index if not exists folders_workspace_kind_idx on folders(workspace_id, kind);
create index if not exists folders_parent_idx on folders(parent_id);

-- ── Membership columns on items + forged_ads ────────────────────────────────
alter table items
  add column if not exists folder_id uuid references folders(id) on delete set null;

alter table forged_ads
  add column if not exists folder_id uuid references folders(id) on delete set null;

create index if not exists items_folder_idx on items(folder_id);
create index if not exists forged_ads_folder_idx on forged_ads(folder_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table folders enable row level security;

drop policy if exists "folders_select_member" on folders;
create policy "folders_select_member" on folders for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "folders_write_member" on folders;
create policy "folders_write_member" on folders for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- ── Cycle prevention trigger ─────────────────────────────────────────────────
-- Prevent setting parent_id to a descendant (would create a cycle).
create or replace function folders_prevent_cycles()
returns trigger as $$
declare
  cur uuid := new.parent_id;
begin
  while cur is not null loop
    if cur = new.id then
      raise exception 'Cannot move folder into its own descendant';
    end if;
    select parent_id into cur from folders where id = cur;
  end loop;
  return new;
end;
$$ language plpgsql;

drop trigger if exists folders_no_cycle on folders;
create trigger folders_no_cycle before insert or update on folders
  for each row execute function folders_prevent_cycles();
