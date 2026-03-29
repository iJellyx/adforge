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
    // Fetch workspaces the user is a member of
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug, logo_url, created_at)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })

    const ws: Workspace[] = (memberships || []).map((m: any) => ({
      ...m.workspaces,
      role: m.role,
    }))
    setWorkspaces(ws)

    if (ws.length > 0) {
      // Check user's last workspace preference
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('last_workspace_id')
        .eq('user_id', user.id)
        .single()

      const lastId = prefs?.last_workspace_id
      const found = ws.find((w: Workspace) => w.id === lastId)
      setActiveWorkspace(found || ws[0])
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
    if (!user) return null

    // Generate a URL-safe slug
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6)

    // Create the workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), slug, created_by: user.id })
      .select()
      .single()

    if (wsError || !workspace) return null

    // Add creator as owner
    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

    // Create a default brand profile for the workspace
    await supabase
      .from('brand_profile')
      .insert({ name: name.trim(), workspace_id: workspace.id })

    // Save as last workspace
    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, last_workspace_id: workspace.id, updated_at: new Date().toISOString() })

    const newWs: Workspace = { ...workspace, role: 'owner' as const }
    setWorkspaces(prev => [...prev, newWs])
    setActiveWorkspace(newWs)
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
