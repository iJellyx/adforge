'use client'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { AccessProvider } from '@/lib/access-client'
import AdForgeApp from '@/components/AdForgeApp'

export default function DashboardPage() {
  return (
    <AccessProvider>
      <WorkspaceProvider>
        <AdForgeApp />
      </WorkspaceProvider>
    </AccessProvider>
  )
}
