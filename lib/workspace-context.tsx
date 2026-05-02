'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import { createClient } from '@/lib/supabase/client'

export type Workspace = {
  id: string
  name: string
  slug: string
  logo_url?: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

type WorkspaceContextType = {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean
  switchWorkspace: (workspaceId: string) => Promise<void>
  createWorkspace: (name: string) => Promise<Workspace | null>
  refreshWorkspaces: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  loading: true,
  switchWorkspace: async () => {},
  createWorkspace: async () => null,
  refreshWorkspaces: async () => {},
})

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

/**
 * Workspace provider — Clerk-driven.
 *
 * The user identity comes from Clerk (`useUser`); Supabase is purely a
 * data store now (RLS dropped, ownership enforced at the application
 * layer matching AdSplit's pattern). All `user_id` columns store the
 * Clerk userId string (e.g. "user_2abc..."), not a Supabase UUID.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { user, isLoaded: clerkLoaded } = useUser()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const userId = user.id

    console.log('[workspace] Loading workspaces for user:', userId)

    // Step 1: Get user's workspace memberships
    const { data: memberships, error: memErr } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)

    if (memErr) {
      console.error('[workspace] workspace_members error:', memErr.message, memErr.code)
      setLoading(false)
      return
    }

    if (!memberships || memberships.length === 0) {
      // First-time sign-in: bootstrap a default workspace so the user
      // isn't dumped into an empty app on first load.
      console.log('[workspace] No memberships — bootstrapping default workspace')
      const created = await createDefaultWorkspace(userId)
      if (created) {
        setWorkspaces([created])
        setActiveWorkspace(created)
      }
      setLoading(false)
      return
    }

    // Step 2: Get the actual workspace details
    const wsIds = memberships.map(m => m.workspace_id)
    const { data: workspaceRows, error: wsErr } = await supabase
      .from('workspaces')
      .select('id, name, slug, logo_url, created_at')
      .in('id', wsIds)

    if (wsErr) {
      console.error('[workspace] workspaces error:', wsErr.message, wsErr.code)
      setLoading(false)
      return
    }

    const ws: Workspace[] = (workspaceRows || []).map((w: any) => ({
      ...w,
      role: memberships.find(m => m.workspace_id === w.id)?.role || 'member',
    }))
    setWorkspaces(ws)

    if (ws.length > 0) {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('last_workspace_id')
        .eq('user_id', userId)
        .maybeSingle()

      const lastId = prefs?.last_workspace_id
      const found = ws.find((w: Workspace) => w.id === lastId)
      setActiveWorkspace(found || ws[0])
    }

    setLoading(false)
  }, [user])

  // Bootstrap: when a user signs in for the first time and has no workspace,
  // create one named after their first name (or "My Brand" as fallback).
  async function createDefaultWorkspace(userId: string): Promise<Workspace | null> {
    const seedName = user?.firstName ? `${user.firstName}'s Brand` : 'My Brand'
    const slug = seedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6)

    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: seedName, slug, created_by: userId })
      .select()
      .single()
    if (wsError || !workspace) {
      console.error('[workspace] Bootstrap workspace insert error:', wsError?.message)
      return null
    }
    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })
    if (memErr) console.error('[workspace] Bootstrap member error:', memErr.message)

    await supabase.from('brand_profile').insert({ name: seedName, workspace_id: workspace.id })

    return { ...workspace, role: 'owner' as const }
  }

  useEffect(() => {
    if (!clerkLoaded) return
    loadWorkspaces()
  }, [clerkLoaded, loadWorkspaces])

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws || !user) return
    setActiveWorkspace(ws)
    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, last_workspace_id: workspaceId, updated_at: new Date().toISOString() })
  }, [workspaces, user])

  const createWorkspace = useCallback(async (name: string): Promise<Workspace | null> => {
    if (!user) { console.error('[workspace] No user for create'); return null }
    const userId = user.id

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6)

    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), slug, created_by: userId })
      .select()
      .single()
    if (wsError || !workspace) { console.error('[workspace] Create workspace error:', wsError?.message); return null }

    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })
    if (memErr) console.error('[workspace] Add member error:', memErr.message)

    await supabase.from('brand_profile').insert({ name: name.trim(), workspace_id: workspace.id })
    await supabase.from('user_preferences').upsert({ user_id: userId, last_workspace_id: workspace.id, updated_at: new Date().toISOString() })

    const newWs: Workspace = { ...workspace, role: 'owner' as const }
    setWorkspaces(prev => [...prev, newWs])
    setActiveWorkspace(newWs)
    return newWs
  }, [user])

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading: loading || !clerkLoaded,
      switchWorkspace,
      createWorkspace,
      refreshWorkspaces: loadWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
