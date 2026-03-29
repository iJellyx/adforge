-- ============================================================
-- AdForge Multi-Workspace Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create workspaces table
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  logo_url    text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- 2. Create workspace_members table (who belongs to which workspace)
create table if not exists workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz default now(),
  unique(workspace_id, user_id)
);

-- 3. Add workspace_id to all existing content tables
alter table items          add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table scripts        add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table brand_profile  add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table products       add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table forged_ads     add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

-- 4. Create a default workspace and migrate existing data
-- This creates a workspace called "My Brand" and assigns all existing data to it
do $$
declare
  ws_id uuid;
  first_user_id uuid;
begin
  -- Get the first user (the existing account)
  select id into first_user_id from auth.users limit 1;

  -- Create the default workspace
  insert into workspaces (name, slug, created_by)
  values ('My Brand', 'my-brand', first_user_id)
  returning id into ws_id;

  -- Make the existing user the owner
  if first_user_id is not null then
    insert into workspace_members (workspace_id, user_id, role)
    values (ws_id, first_user_id, 'owner');
  end if;

  -- Migrate all existing data to this workspace
  update items         set workspace_id = ws_id where workspace_id is null;
  update scripts       set workspace_id = ws_id where workspace_id is null;
  update brand_profile set workspace_id = ws_id where workspace_id is null;
  update products      set workspace_id = ws_id where workspace_id is null;
  update forged_ads    set workspace_id = ws_id where workspace_id is null;
end $$;

-- 5. Add indexes for performance
create index if not exists idx_items_workspace on items(workspace_id);
create index if not exists idx_scripts_workspace on scripts(workspace_id);
create index if not exists idx_brand_profile_workspace on brand_profile(workspace_id);
create index if not exists idx_products_workspace on products(workspace_id);
create index if not exists idx_forged_ads_workspace on forged_ads(workspace_id);
create index if not exists idx_workspace_members_user on workspace_members(user_id);
create index if not exists idx_workspace_members_workspace on workspace_members(workspace_id);

-- 6. Add a "last_workspace_id" column to track which workspace user was last in
-- We store this as user metadata via a simple table
create table if not exists user_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  last_workspace_id uuid references workspaces(id) on delete set null,
  updated_at        timestamptz default now()
);

-- 7. Row Level Security (RLS) policies
-- Enable RLS on new tables
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table user_preferences enable row level security;

-- Workspaces: users can see workspaces they're a member of
create policy "Users can view their workspaces"
  on workspaces for select
  using (id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Workspaces: any authenticated user can create a workspace
create policy "Authenticated users can create workspaces"
  on workspaces for insert
  with check (auth.uid() is not null);

-- Workspaces: only owners can update
create policy "Owners can update workspaces"
  on workspaces for update
  using (id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'owner'));

-- Workspace members: users can see members of their workspaces
create policy "Users can view workspace members"
  on workspace_members for select
  using (workspace_id in (select workspace_id from workspace_members wm where wm.user_id = auth.uid()));

-- Workspace members: owners/admins can add members
create policy "Admins can add members"
  on workspace_members for insert
  with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
    -- Also allow the creator of a new workspace to add themselves
    or auth.uid() = user_id
  );

-- Workspace members: owners can remove members
create policy "Owners can remove members"
  on workspace_members for delete
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'owner'));

-- User preferences: users can manage their own
create policy "Users can manage own preferences"
  on user_preferences for all
  using (user_id = auth.uid());

-- Update existing table RLS to scope by workspace membership
-- Items
drop policy if exists "Users can view items" on items;
create policy "Users can view workspace items"
  on items for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can insert items" on items;
create policy "Users can insert workspace items"
  on items for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can update items" on items;
create policy "Users can update workspace items"
  on items for update
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can delete items" on items;
create policy "Users can delete workspace items"
  on items for delete
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Scripts
drop policy if exists "Users can view scripts" on scripts;
create policy "Users can view workspace scripts"
  on scripts for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can insert scripts" on scripts;
create policy "Users can insert workspace scripts"
  on scripts for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Brand profile
drop policy if exists "Users can view brand_profile" on brand_profile;
create policy "Users can view workspace brand"
  on brand_profile for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can update brand_profile" on brand_profile;
create policy "Users can update workspace brand"
  on brand_profile for update
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can insert brand_profile" on brand_profile;
create policy "Users can insert workspace brand"
  on brand_profile for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Products
drop policy if exists "Users can view products" on products;
create policy "Users can view workspace products"
  on products for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can insert products" on products;
create policy "Users can insert workspace products"
  on products for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can update products" on products;
create policy "Users can update workspace products"
  on products for update
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can delete products" on products;
create policy "Users can delete workspace products"
  on products for delete
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Forged ads
drop policy if exists "Users can view forged_ads" on forged_ads;
create policy "Users can view workspace forged_ads"
  on forged_ads for select
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can insert forged_ads" on forged_ads;
create policy "Users can insert workspace forged_ads"
  on forged_ads for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

drop policy if exists "Users can update forged_ads" on forged_ads;
create policy "Users can update workspace forged_ads"
  on forged_ads for update
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));
