import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/brand/crawl
 * Body: { url: string }
 *
 * Returns:
 *   {
 *     profile: { name, website, description, voice, target_customer,
 *                reviews, additional_info, default_currency }
 *   }
 *
 * `default_currency` is auto-detected from the website (TLD, JSON-LD,
 * Shopify globals, currency symbols, page text). The brand can still
 * override it in the brand profile UI.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'Missing URL' }, { status: 400 })

    let html = ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      html = await res.text()
    } catch {
      return NextResponse.json({ error: 'Could not fetch website. Try pasting your About page copy instead.' }, { status: 400 })
    }

    // ── Currency detection ──────────────────────────────────────────────
    // Hierarchy (most reliable first):
    //   1. JSON-LD priceCurrency on a Product schema
    //   2. Shopify global: Shopify.currency.active = '...'
    //   3. <meta property="product:price:currency"> / og:price:currency
    //   4. Page text: count occurrences of currency symbols / ISO codes
    //   5. Top-level domain mapping (.ie → EUR, .co.uk → GBP, etc.)
    //   6. Fallback: USD
    const detectedCurrency = detectCurrency(html, url)

    // Strip HTML for the Claude prompt
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 6000)

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are filling out a brand profile. Write ALL fields in FIRST PERSON as the brand themselves (e.g. "We are a...", "Our mission is...", "Our customers love..."). Never say "The brand" or "They" — always use "We", "Our", "Us".

Extract from the website content below. Return ONLY valid JSON, no markdown:
{"name":"","website":"${url}","description":"","voice":"","target_customer":"","reviews":"","additional_info":"","default_currency":"${detectedCurrency || ''}"}

For default_currency: This brand's primary market currency. Heuristics already detected: ${detectedCurrency || '(none)'}. Only override if the page text strongly contradicts it (e.g. "we're a US-based brand selling globally" or address blocks for a different country). Otherwise return the detected value. Use ISO 4217 3-letter codes: USD, EUR, GBP, AUD, CAD, NZD, JPY, CHF, SEK, NOK, DKK.

Website content:
${text}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const profile = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Final guard: if Claude blanked the currency or returned something invalid,
    // fall back to our heuristic detection or USD.
    if (!profile.default_currency || !/^[A-Z]{3}$/.test(profile.default_currency)) {
      profile.default_currency = detectedCurrency || 'USD'
    }

    return NextResponse.json({ profile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── Currency detection helpers ──────────────────────────────────────────

const TLD_CURRENCY: Record<string, string> = {
  'ie': 'EUR',           // Ireland
  'co.uk': 'GBP', 'uk': 'GBP',
  'com.au': 'AUD', 'au': 'AUD',
  'co.nz': 'NZD', 'nz': 'NZD',
  'ca': 'CAD',
  'de': 'EUR', 'fr': 'EUR', 'es': 'EUR', 'it': 'EUR', 'nl': 'EUR',
  'be': 'EUR', 'pt': 'EUR', 'at': 'EUR', 'fi': 'EUR', 'lu': 'EUR',
  'gr': 'EUR', 'ee': 'EUR', 'sk': 'EUR', 'si': 'EUR', 'mt': 'EUR',
  'cy': 'EUR', 'lv': 'EUR', 'lt': 'EUR',
  'ch': 'CHF',
  'se': 'SEK',
  'no': 'NOK',
  'dk': 'DKK',
  'jp': 'JPY', 'co.jp': 'JPY',
}

function detectCurrency(html: string, url: string): string {
  // 1. JSON-LD priceCurrency
  const ldMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const block of ldMatches) {
    const inner = block.replace(/<[^>]+>/g, '').trim()
    try {
      const data = JSON.parse(inner)
      const items: any[] = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data])
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const offers = item.offers
        if (offers) {
          const offer = Array.isArray(offers) ? offers[0] : offers
          const cur = offer?.priceCurrency || offer?.priceSpecification?.priceCurrency
          if (cur && /^[A-Z]{3}$/.test(String(cur).toUpperCase())) {
            return String(cur).toUpperCase()
          }
        }
      }
    } catch { /* keep trying */ }
  }

  // 2. Shopify global
  const shopifyMatch = html.match(/Shopify\.currency\s*=\s*\{[^}]*active:\s*["']([A-Z]{3})["']/)
  if (shopifyMatch) return shopifyMatch[1]
  const shopifyAlt = html.match(/["']?currency["']?\s*:\s*["']([A-Z]{3})["']/)
  if (shopifyAlt) return shopifyAlt[1]

  // 3. Open Graph / meta product:price:currency
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]*content=["']([A-Z]{3})["']/i)
  if (meta) return meta[1]

  // 4. Strip HTML and count symbols / ISO codes in visible text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
  const counts: Record<string, number> = {
    EUR: (text.match(/€/g) || []).length + (text.match(/\bEUR\b/gi) || []).length,
    GBP: (text.match(/£/g) || []).length + (text.match(/\bGBP\b/gi) || []).length,
    USD: (text.match(/\$/g) || []).length + (text.match(/\bUSD\b/gi) || []).length,
    JPY: (text.match(/¥/g) || []).length + (text.match(/\bJPY\b/gi) || []).length,
    AUD: (text.match(/\bAUD\b|\bAU\$/gi) || []).length,
    CAD: (text.match(/\bCAD\b|\bCA\$/gi) || []).length,
    NZD: (text.match(/\bNZD\b|\bNZ\$/gi) || []).length,
    CHF: (text.match(/\bCHF\b/gi) || []).length,
    SEK: (text.match(/\bSEK\b|\bkr\b/gi) || []).length,
    NOK: (text.match(/\bNOK\b/gi) || []).length,
    DKK: (text.match(/\bDKK\b/gi) || []).length,
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= 3) return top[0]   // require ≥3 hits to be confident

  // 5. TLD-based fallback
  try {
    const host = new URL(url).hostname.toLowerCase()
    const parts = host.split('.')
    // Try the most-specific suffix first (e.g. co.uk before uk)
    for (let i = 0; i < parts.length - 1; i++) {
      const suffix = parts.slice(i).join('.')
      if (TLD_CURRENCY[suffix]) return TLD_CURRENCY[suffix]
    }
  } catch { /* ignore */ }

  // 6. Last resort
  return 'USD'
}
