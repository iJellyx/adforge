import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/brand/products
 * Body: { url: string, preferredCurrency?: string }
 *
 * Returns the top 3 product candidates from a brand's website. Three-pass
 * detection, in priority order:
 *
 *   1. Shopify /products.json — most modern DTC sites are on Shopify; this
 *      endpoint is public and returns structured product data with handle,
 *      title, description, price, images. Fastest + most accurate.
 *   2. Sitemap fallback — /sitemap.xml or /sitemap_products_1.xml expose
 *      product URLs without requiring HTML parsing.
 *   3. HTML scrape — last resort: parse homepage <a href="/products/..."> links.
 *
 * For each candidate URL, we run our /api/product/extract logic
 * (JSON-LD → OG → Claude fallback) to fill product fields with the
 * brand's preferred currency.
 *
 * The previous implementation asked Claude to identify products from
 * stripped homepage text, which lost all URLs and produced unreliable
 * results — this rewrite addresses that.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, preferredCurrency } = body as { url: string; preferredCurrency?: string }
    if (!url) return NextResponse.json({ error: 'Missing website URL' }, { status: 400 })

    const origin = (() => {
      try { return new URL(url).origin } catch { return null }
    })()
    if (!origin) return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 })

    // ── Pass 1: Shopify /products.json ────────────────────────────────────
    let candidates: Candidate[] = await tryShopifyProductsJson(origin)

    // ── Pass 2: Sitemap ───────────────────────────────────────────────────
    if (candidates.length === 0) {
      candidates = await trySitemap(origin)
    }

    // ── Pass 3: Homepage <a href> scrape ──────────────────────────────────
    if (candidates.length === 0) {
      candidates = await tryHomepageLinks(url)
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        error: 'No product pages found. Try adding products manually using a product URL.',
        products: [],
      })
    }

    // ── Enrich top candidates by extracting from each product page ────────
    const top = candidates.slice(0, 3)
    const products = await Promise.all(top.map(c => enrichCandidate(c, preferredCurrency)))
    const enriched = products.filter(p => p.name && p.url)

    return NextResponse.json({ products: enriched })
  } catch (e: any) {
    console.error('[products] Error:', e?.message)
    return NextResponse.json({ error: e?.message || 'Failed to find products' }, { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────

type Candidate = {
  url: string
  name?: string
  description?: string
  imageUrl?: string
  price?: string
  currency?: string
}

type Product = {
  name: string
  description: string
  benefits: string
  price: string
  currency: string
  url: string
  claims: string
  ingredients: string
  primary_image_url: string
}

async function tryShopifyProductsJson(origin: string): Promise<Candidate[]> {
  try {
    const res = await fetch(`${origin}/products.json?limit=20`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json().catch(() => null)
    const list: any[] = Array.isArray(data?.products) ? data.products : []
    if (list.length === 0) return []

    return list
      .filter(p => p.published_at && p.handle && p.title)
      .map(p => {
        const variant = Array.isArray(p.variants) ? p.variants[0] : null
        const img = Array.isArray(p.images) && p.images[0]?.src
          ? p.images[0].src
          : (p.featured_image || '')
        return {
          url: `${origin}/products/${p.handle}`,
          name: String(p.title).trim(),
          description: stripHtml(String(p.body_html || '')).slice(0, 400),
          imageUrl: img,
          price: variant?.price ? String(variant.price) : '',
          currency: '',  // /products.json doesn't include currency — extractor fills it later
        }
      })
  } catch {
    return []
  }
}

async function trySitemap(origin: string): Promise<Candidate[]> {
  // Try a few common sitemap locations
  const sitemapUrls = [
    `${origin}/sitemap_products_1.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ]
  for (const sm of sitemapUrls) {
    try {
      const res = await fetch(sm, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
        .map(m => m.replace(/<\/?loc>/g, '').trim())
        .filter(u => /\/products\//i.test(u))
      if (urls.length > 0) {
        return urls.slice(0, 6).map(u => ({ url: u }))
      }
    } catch { /* try next */ }
  }
  return []
}

async function tryHomepageLinks(url: string): Promise<Candidate[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const origin = new URL(url).origin

    // Find all anchor hrefs containing /products/ — grab unique product URLs
    const hrefs = (html.match(/href=["']([^"']*\/products\/[^"'#?]*)["']/gi) || [])
      .map(m => m.replace(/^href=["']/i, '').replace(/["']$/, ''))
      .map(h => {
        try { return new URL(h, origin).href } catch { return null }
      })
      .filter(Boolean) as string[]

    const unique = [...new Set(hrefs)]
      .filter(u => u.includes('/products/') && !u.includes('/products/all'))
      .slice(0, 6)

    return unique.map(u => ({ url: u }))
  } catch {
    return []
  }
}

/** Extract product fields from a single product page using the same logic
 *  /api/product/extract uses (JSON-LD → OG → Claude fallback). Inlined here
 *  to avoid HTTP self-calls inside a serverless function. */
async function enrichCandidate(cand: Candidate, preferredCurrency?: string): Promise<Product> {
  const empty: Product = {
    name: cand.name || '',
    description: cand.description || '',
    benefits: '',
    price: cand.price || '',
    currency: cand.currency || '',
    url: cand.url,
    claims: '',
    ingredients: '',
    primary_image_url: cand.imageUrl || '',
  }

  let html = ''
  try {
    const res = await fetch(cand.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) html = await res.text()
  } catch { /* leave html empty */ }

  let product: Product = { ...empty }
  if (html) {
    const ld = extractFromJsonLd(html, (preferredCurrency || '').toUpperCase())
    product = {
      name: product.name || ld.name || '',
      description: product.description || ld.description || '',
      benefits: ld.benefits || '',
      price: product.price || ld.price || '',
      currency: product.currency || ld.currency || '',
      url: cand.url,
      claims: '',
      ingredients: '',
      primary_image_url: product.primary_image_url || ld.primary_image_url || extractMeta(html, 'og:image') || '',
    }
    if (!product.name) product.name = extractMeta(html, 'og:title') || ''
    if (!product.description) product.description = extractMeta(html, 'og:description') || ''
  }

  // If JSON-LD/OG didn't give us description + benefits, run a single Claude
  // call per product. Skipped when we already have the basics from
  // /products.json which is fast.
  if (product.name && !product.benefits && html) {
    try {
      const claude = await askClaudeForProduct(stripHtml(html).slice(0, 6000), cand.url, preferredCurrency || '')
      product = {
        ...product,
        description: product.description || claude.description,
        benefits: claude.benefits,
        claims: claude.claims,
        ingredients: claude.ingredients,
        currency: product.currency || claude.currency,
        primary_image_url: product.primary_image_url || claude.primary_image_url,
      }
    } catch { /* keep what we have */ }
  }

  // Fall back to brand default currency if none was found anywhere
  if (product.price && !product.currency && preferredCurrency) {
    product.currency = preferredCurrency.toUpperCase()
  }

  return product
}

// ── Helpers (subset of /api/product/extract internals) ─────────────────

function extractFromJsonLd(html: string, preferredCurrency: string): Partial<Product> {
  const out: Partial<Product> = {}
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []

  for (const block of matches) {
    const jsonText = block.replace(/<[^>]+>/g, '').trim()
    let data: any
    try { data = JSON.parse(jsonText) } catch { continue }
    const items: any[] = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data])

    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const type = item['@type']
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
      if (!isProduct) continue

      if (item.name) out.name = String(item.name).trim()
      if (item.description) out.description = String(item.description).trim()
      const img = item.image
      if (img) {
        const imgUrl = typeof img === 'string' ? img : Array.isArray(img) ? img[0] : (img?.url || img?.contentUrl)
        if (imgUrl) out.primary_image_url = String(imgUrl)
      }
      const offers = item.offers
      if (offers) {
        const offerList: any[] = Array.isArray(offers) ? offers : [offers]
        let offer: any = preferredCurrency
          ? offerList.find(o => String(o?.priceCurrency || o?.priceSpecification?.priceCurrency || '').toUpperCase() === preferredCurrency)
          : null
        if (!offer) offer = offerList[0]
        const price = offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price
        const currency = offer?.priceCurrency || offer?.priceSpecification?.priceCurrency
        if (price != null) out.price = String(price)
        if (currency) out.currency = String(currency).toUpperCase()
      }
      return out
    }
  }
  return out
}

function extractMeta(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRe(name)}["'][^>]*content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRe(name)}["']`, 'i'))
  return m ? m[1].trim() : ''
}
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function askClaudeForProduct(text: string, url: string, preferredCurrency: string): Promise<{
  description: string; benefits: string; claims: string; ingredients: string; currency: string; primary_image_url: string;
}> {
  const currencyHint = preferredCurrency
    ? `\nThe brand's primary market trades in ${preferredCurrency}. If multiple prices are visible, prefer ${preferredCurrency}.`
    : ''
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: `Single product page extraction. Return ONLY valid JSON.${currencyHint}

{
  "description": "2-3 sentences from the product page in first-person brand voice",
  "benefits": "key benefits as line-separated bullets",
  "claims": "specific claims or results",
  "ingredients": "key ingredients or materials",
  "currency": "ISO 4217 code (USD, EUR, GBP, ...) matching the visible price",
  "primary_image_url": "main product image URL if you can spot it"
}

Product URL: ${url}

Page content:
${text}`
    }]
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      description: parsed.description || '',
      benefits: parsed.benefits || '',
      claims: parsed.claims || '',
      ingredients: parsed.ingredients || '',
      currency: (parsed.currency || '').toUpperCase(),
      primary_image_url: parsed.primary_image_url || '',
    }
  } catch {
    return { description: '', benefits: '', claims: '', ingredients: '', currency: '', primary_image_url: '' }
  }
}
