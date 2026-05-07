'use client'
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace-context'
import { AccessProvider } from '@/lib/access-client'
import { MyAds } from '@/components/MyAds'

/**
 * /my-ads — standalone route used when AdSplit's sidebar deep-links here.
 * For in-dashboard navigation, AdForgeApp embeds the same `<MyAds>` as a
 * tab so SPA state isn't lost.
 */
export default function MyAdsPage() {
  return (
    <AccessProvider>
      <WorkspaceProvider>
        <Inner />
      </WorkspaceProvider>
    </AccessProvider>
  )
}

function Inner() {
  const { activeWorkspace, loading } = useWorkspace()
  if (loading || !activeWorkspace) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--af-bg)', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ color: 'var(--af-text-secondary)', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }
  return <MyAds workspaceId={activeWorkspace.id} />
}
