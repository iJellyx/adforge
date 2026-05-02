import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { type ProductAccess, DEFAULT_ACCESS } from './access-types'

// Re-export so existing server-side imports of these symbols still work.
export type { ProductAccess, ProductSlug } from './access-types'
export { PRODUCT_META, DEFAULT_ACCESS } from './access-types'

/**
 * Server-only access helpers.
 * Client components should use `useAccess()` from `lib/access-client`.
 */

export async function getServerUserAccess(): Promise<ProductAccess> {
  const { userId } = await auth()
  if (!userId) return DEFAULT_ACCESS
  return fetchAccessForUserId(userId)
}

export async function fetchAccessForUserId(userId: string): Promise<ProductAccess> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_accounts')
    .select('has_forge, has_split, has_stash, tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return DEFAULT_ACCESS

  const hasForge = !!data.has_forge
  const hasSplit = !!data.has_split
  const hasStash = !!data.has_stash || hasForge
  return {
    hasForge,
    hasSplit,
    hasStash,
    hasSuite: hasForge && hasSplit && hasStash,
    tier: data.tier || 'free',
  }
}
