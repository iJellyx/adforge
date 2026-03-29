'use client'
import { WorkspaceProvider } from '@/lib/workspace-context'
import AdForgeApp from '@/components/AdForgeApp'

export default function DashboardPage() {
  return (
    <WorkspaceProvider>
      <AdForgeApp />
    </WorkspaceProvider>
  )
}
