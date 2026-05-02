// Pure types + product metadata. NO server imports — safe to import from
// both client and server. The actual data-fetching helpers live in
// `lib/access.ts` (server-only).

export type ProductAccess = {
  hasForge: boolean
  hasSplit: boolean
  hasStash: boolean
  hasSuite: boolean
  tier: string
}

export const DEFAULT_ACCESS: ProductAccess = {
  hasForge: false,
  hasSplit: false,
  hasStash: false,
  hasSuite: false,
  tier: 'free',
}

export type ProductSlug = 'forge' | 'split' | 'stash'

export const PRODUCT_META: Record<ProductSlug, {
  name: string
  tagline: string
  longCopy: string
  externalUrl?: string
  bundles?: ProductSlug[]
}> = {
  forge: {
    name: 'Forge',
    tagline: 'AI-generated video ads from your own clips',
    longCopy:
      'Upload UGC clips, write a brief, and Forge writes a script, voices it, picks music, and stitches a finished vertical video ad. Includes Stash for storing and organising every clip.',
    externalUrl: 'https://forge.adsplit.io',
    bundles: ['stash'],
  },
  split: {
    name: 'Split',
    tagline: 'AI-generated static ads from a website crawl',
    longCopy:
      'Paste a URL, Split crawls the brand, builds a brand card, generates concepts, and produces a polished static ad funnel. Best for Meta / IG feed ads.',
    externalUrl: 'https://adsplit.io',
  },
  stash: {
    name: 'Stash',
    tagline: 'Your unified brand asset library',
    longCopy:
      'Drive-style folder tree for every clip, image, and reference your brand has ever created. Tag, search, version, and reuse across both Forge and Split.',
  },
}
