import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/product/extract
 * Body: { url: string }
 *
 * Pulls product-specific fields from a product page URL. Two-pass:
 *   1. Look for JSON-LD `Product` schema (most major e-commerce platforms
 *      ship this — Shopify, BigCommerce, WooCommerce, etc.). It's already
 *      the structured truth the site wants Google to see.
 *   2. If no JSON-LD or fields are sparse, ask Claude to extract from
 *      the cleaned page text.
 *
 * Returns:
 *   { product: { name, description, benefits, price, url, claims,
 *                ingredients, primary_image_url } }
 *
 * This is the PRODUCT autofill — distinct from `/api/brand/crawl` which
 * pulls BRAND-level fields. The previous bug was wiring the product
 * autofill button to the brand endpoint, which is why users saw their
 * brand name and brand description instead of product specifics.
 */

type Product = {
  name: string
  description: string
  benefits: string
  price: string
  url: string
  claims: string
  ingredients: string
  primary_image_url: string
}

const EMPTY: Product = {
  name: '', description: '', benefits: '', price: '', url: '',
  claims: '', ingredients: '', primary_image_url: '',
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'Missing URL' }, { status: 400 })

    // 1. Fetch the page
    let html = ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      html = await res.text()
    } catch {
      return NextResponse.json({ error: 'Could not fetch the product page. Check the URL and try again.' }, { status: 400 })
    }

    // 2. JSON-LD Product schema first
    const fromLd = extractFromJsonLd(html)
    let product: Product = { ...EMPTY, url, ...fromLd }

    // 3. Open Graph fallbacks for what JSON-LD didn't cover
    if (!product.name) product.name = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || product.name
    if (!product.description) product.description = extractMeta(html, 'og:description') || extractMeta(html, 'description') || product.description
    if (!product.primary_image_url) product.primary_image_url = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || ''

    // 4. If we still don't have name + description + benefits, ask Claude
    const needsClaude = !product.name || !product.description || !product.benefits || !product.price
    if (needsClaude) {
      const text = stripHtml(html).substring(0, 8000)
      const claudeProduct = await askClaude(text, url)
      // Merge: keep JSON-LD/OG values where present, fill gaps from Claude
      product = {
        name: product.name || claudeProduct.name,
        description: product.description || claudeProduct.description,
        benefits: product.benefits || claudeProduct.benefits,
        price: product.price || claudeProduct.price,
        url,
        claims: product.claims || claudeProduct.claims,
        ingredients: product.ingredients || claudeProduct.ingredients,
        primary_image_url: product.primary_image_url || claudeProduct.primary_image_url,
      }
    }

    return NextResponse.json({ product })
  } catch (e: any) {
    console.error('[product/extract] error', e)
    return NextResponse.json({ error: e.message || 'Extraction failed' }, { status: 500 })
  }
}

// ── JSON-LD ──────────────────────────────────────────────────────────────

/** Find any JSON-LD blocks of @type "Product" and pull product fields. */
function extractFromJsonLd(html: string): Partial<Product> {
  const out: Partial<Product> = {}
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []

  for (const block of matches) {
    const jsonText = block.replace(/<[^>]+>/g, '').trim()
    let data: any
    try { data = JSON.parse(jsonText) } catch { continue }

    // JSON-LD can be an array or have a @graph wrapper — flatten it
    const items: any[] = Array.isArray(data)
      ? data
      : data['@graph']
        ? data['@graph']
        : [data]

    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const type = item['@type']
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
      if (!isProduct) continue

      if (item.name) out.name = String(item.name).trim()
      if (item.description) out.description = String(item.description).trim()

      // Image — can be string, array, or object with url
      const img = item.image
      if (img) {
        const imgUrl = typeof img === 'string' ? img : Array.isArray(img) ? img[0] : (img?.url || img?.contentUrl)
        if (imgUrl) out.primary_image_url = String(imgUrl)
      }

      // Offers — price + currency
      const offers = item.offers
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers
        const price = offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price
        const currency = offer?.priceCurrency || offer?.priceSpecification?.priceCurrency
        if (price != null) {
          out.price = currency ? `${currency} ${price}` : String(price)
        }
      }

      // Some sites stuff bullet points into additionalProperty or hasFeature
      const features: string[] = []
      if (Array.isArray(item.additionalProperty)) {
        for (const p of item.additionalProperty) {
          if (p?.name && p?.value) features.push(`${p.name}: ${p.value}`)
        }
      }
      if (features.length) out.benefits = features.join('\n')

      return out // first Product wins
    }
  }
  return out
}

// ── Open Graph / meta ────────────────────────────────────────────────────

function extractMeta(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRe(name)}["'][^>]*content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRe(name)}["']`, 'i'))
  return m ? m[1].trim() : ''
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── HTML → text ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')   // strip global nav
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Claude fallback ─────────────────────────────────────────────────────

async function askClaude(text: string, url: string): Promise<Product> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are extracting fields from a SINGLE PRODUCT PAGE on an e-commerce site. Focus on the PRODUCT being sold on this URL — not the brand or the company behind it.

Return ONLY valid JSON, no markdown, with these fields. Use empty string when unsure rather than inventing.

{
  "name": "exact product name as it appears on the page (e.g. '24hr Rosehip Face Serum')",
  "description": "2-3 sentence product description from the product page (NOT the brand description). Write in the brand's first-person voice ('Our serum...', 'This formula...').",
  "benefits": "the key benefits or selling points listed on the product page, as a bullet list separated by line breaks",
  "price": "the price as shown (e.g. '49.99' or 'EUR 49.99')",
  "claims": "specific claims or results stated on the page (e.g. 'reduces fine lines in 28 days')",
  "ingredients": "key ingredients listed on the page",
  "primary_image_url": "URL of the main product image if you see one in og:image meta or a clear hero image"
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
      name: parsed.name || '',
      description: parsed.description || '',
      benefits: parsed.benefits || '',
      price: parsed.price || '',
      url,
      claims: parsed.claims || '',
      ingredients: parsed.ingredients || '',
      primary_image_url: parsed.primary_image_url || '',
    }
  } catch {
    return { ...EMPTY, url }
  }
}
