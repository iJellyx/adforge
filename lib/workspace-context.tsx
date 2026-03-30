'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      console.log('[workspace] Loading workspaces for user:', user.id)

      // Step 1: Get user's workspace memberships
      const { data: memberships, error: memErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)

      if (memErr) {
        console.error('[workspace] workspace_members error:', memErr.message, memErr.code)
        setLoading(false)
        return
      }

      console.log('[workspace] Memberships found:', memberships?.length || 0)

      if (!memberships || memberships.length === 0) {
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

      console.log('[workspace] Workspaces found:', workspaceRows?.length || 0)

      const ws: Workspace[] = (workspaceRows || []).map((w: any) => ({
        ...w,
        role: memberships.find(m => m.workspace_id === w.id)?.role || 'member',
      }))
      setWorkspaces(ws)

      if (ws.length > 0) {
        // Check user's last workspace preference (use maybeSingle to avoid 406)
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('last_workspace_id')
          .eq('user_id', user.id)
          .maybeSingle()

        const lastId = prefs?.last_workspace_id
        const found = ws.find((w: Workspace) => w.id === lastId)
        setActiveWorkspace(found || ws[0])
        console.log('[workspace] Active workspace:', (found || ws[0])?.name)
      }
    } catch (err: any) {
      console.error('[workspace] Unexpected error:', err.message)
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return

    setActiveWorkspace(ws)

    // Persist preference
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, last_workspace_id: workspaceId, updated_at: new Date().toISOString() })
    }
  }, [workspaces])

  const createWorkspace = useCallback(async (name: string): Promise<Workspace | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { console.error('[workspace] No user for create'); return null }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6)

    console.log('[workspace] Creating workspace:', name, slug)

    // Create the workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), slug, created_by: user.id })
      .select()
      .single()

    if (wsError) { console.error('[workspace] Create workspace error:', wsError.message, wsError.code); return null }
    if (!workspace) { console.error('[workspace] No workspace returned'); return null }

    console.log('[workspace] Workspace created:', workspace.id)

    // Add creator as owner
    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

    if (memErr) console.error('[workspace] Add member error:', memErr.message, memErr.code)
    else console.log('[workspace] Member added as owner')

    // Create a default brand profile for the workspace
    const { error: brandErr } = await supabase
      .from('brand_profile')
      .insert({ name: name.trim(), workspace_id: workspace.id })

    if (brandErr) console.error('[workspace] Brand profile error:', brandErr.message, brandErr.code)

    // Save as last workspace
    const { error: prefErr } = await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, last_workspace_id: workspace.id, updated_at: new Date().toISOString() })

    if (prefErr) console.error('[workspace] Preferences error:', prefErr.message, prefErr.code)

    const newWs: Workspace = { ...workspace, role: 'owner' as const }
    setWorkspaces(prev => [...prev, newWs])
    setActiveWorkspace(newWs)
    console.log('[workspace] New workspace ready:', newWs.name)
    return newWs
  }, [])

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      switchWorkspace,
      createWorkspace,
      refreshWorkspaces: loadWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
