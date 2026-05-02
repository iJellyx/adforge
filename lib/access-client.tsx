'use client'
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { type ProductAccess, DEFAULT_ACCESS as DEFAULT } from './access-types'

type AccessContextType = {
  access: ProductAccess
  loading: boolean
  refresh: () => Promise<void>
}

const AccessContext = createContext<AccessContextType>({
  access: DEFAULT,
  loading: true,
  refresh: async () => {},
})

export function useAccess() { return useContext(AccessContext) }

/**
 * Client provider wrapping per-product access flags.
 *
 * Mounts under <ClerkProvider> in the dashboard tree and fetches
 * `/api/me/access` once the Clerk user is loaded. Re-fetches on window
 * focus so a successful Stripe checkout in another tab is reflected
 * promptly without requiring a hard reload.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const [access, setAccess] = useState<ProductAccess>(DEFAULT)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me/access', { cache: 'no-store' })
      if (!res.ok) throw new Error('access fetch failed')
      const data = (await res.json()) as ProductAccess
      setAccess(data)
    } catch (e) {
      console.error('[access] fetch failed', e)
      setAccess(DEFAULT)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    if (!user) {
      setAccess(DEFAULT)
      setLoading(false)
      return
    }
    refresh()
  }, [isLoaded, user, refresh])

  // Refresh on focus — picks up plan changes from Stripe checkout in another tab.
  useEffect(() => {
    function onFocus() { if (user) refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, refresh])

  return (
    <AccessContext.Provider value={{ access, loading, refresh }}>
      {children}
    </AccessContext.Provider>
  )
}
