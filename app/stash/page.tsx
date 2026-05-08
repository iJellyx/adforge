'use client'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { AccessProvider } from '@/lib/access-client'
import StashApp from '@/components/StashApp'

/**
 * /stash — standalone Stash UI for stash.adsplit.io.
 *
 * Mounted under the main AdForge codebase to share auth, Supabase, lib code,
 * and Vercel deployment. The proxy rewrites stash.adsplit.io/* to /stash/*
 * so the user only sees the bare subdomain.
 *
 * Direct access via forge.adsplit.io/stash also works, which is useful for
 * deep-linking and for ops debugging when DNS is mid-flight.
 */
export default function StashPage() {
  return (
    <AccessProvider>
      <WorkspaceProvider>
        <StashApp />
      </WorkspaceProvider>
    </AccessProvider>
  )
}
