-- Fix RLS policies for workspace_members and workspaces
-- The self-referential policy was likely blocking queries
-- Run this in Supabase SQL Editor

-- Fix workspace_members: users can see their own memberships
drop policy if exists "Users can view workspace members" on workspace_members;
create policy "Users can view own memberships"
  on workspace_members for select
  using (user_id = auth.uid());

-- Fix workspaces: use a simpler approach
drop policy if exists "Users can view their workspaces" on workspaces;
create policy "Users can view their workspaces"
  on workspaces for select
  using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- Fix user_preferences: users can read/write their own
drop policy if exists "Users can manage own preferences" on user_preferences;
create policy "Users can read own preferences"
  on user_preferences for select
  using (user_id = auth.uid());

create policy "Users can insert own preferences"
  on user_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update own preferences"
  on user_preferences for update
  using (user_id = auth.uid());

-- Also allow workspace creator to add themselves as first member
drop policy if exists "Admins can add members" on workspace_members;
create policy "Users can add themselves or admins can add others"
  on workspace_members for insert
  with check (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
