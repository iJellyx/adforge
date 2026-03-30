import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'Missing website URL' }, { status: 400 })

    // Fetch the main website
    let mainHtml = ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      mainHtml = await res.text()
    } catch {
      return NextResponse.json({ error: 'Could not fetch website. Check the URL and try again.' }, { status: 400 })
    }

    // Extract all links from the page to find product/collection/shop pages
    const linkMatches = mainHtml.match(/href=["']([^"']+)["']/gi) || []
    const links = linkMatches
      .map(m => m.replace(/href=["']/i, '').replace(/["']$/, ''))
      .filter(l => l.startsWith('/') || l.startsWith('http'))

    // Resolve relative URLs
    const baseUrl = new URL(url)
    const resolvedLinks = links.map(l => {
      try { return new URL(l, baseUrl.origin).href } catch { return null }
    }).filter(Boolean) as string[]

    // Find product-related pages (collections, shop, products, best-sellers)
    const productPagePatterns = /\/(products|collections|shop|best-?sell|catalog|store|all-products|featured)/i
    const productPages = [...new Set(resolvedLinks.filter(l => productPagePatterns.test(l)))]
      .slice(0, 3) // Max 3 sub-pages to crawl

    // Fetch product pages for additional context
    let allText = stripHtml(mainHtml).substring(0, 5000)

    for (const pageUrl of productPages) {
      try {
        const res = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdForge/1.0)' },
          signal: AbortSignal.timeout(6000),
        })
        const html = await res.text()
        allText += '\n\n--- PAGE: ' + pageUrl + ' ---\n' + stripHtml(html).substring(0, 3000)
      } catch {
        // Skip pages that fail
      }
    }

    // Cap total text sent to Claude
    allText = allText.substring(0, 12000)

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are an expert e-commerce analyst. From the website content below, identify the TOP 3 best-selling or most prominently featured products.

For each product, extract as much detail as possible:
- name: Product name
- description: What the product is and does (2-3 sentences)
- benefits: Key benefits for the customer
- target_customer: Who this product is best for
- claims: Specific claims or results (e.g. "clinically proven", "2x faster")
- ingredients: Key ingredients or materials (if applicable, otherwise empty string)
- differentiators: What makes this different from competitors
- reviews: Any review snippets or star ratings mentioned
- price: Price if visible (e.g. "$29.99"), empty string if not found
- url: Direct product URL if you can determine it, empty string otherwise

Prioritize best-sellers, featured products, or hero products. If the site doesn't clearly indicate best-sellers, pick the 3 most prominently displayed products.

Return ONLY a valid JSON array with up to 3 product objects. No markdown, no explanation. If you can't find any products, return an empty array [].

Website content:
${allText}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const products = JSON.parse(raw.replace(/```json|```/g, '').trim())

    return NextResponse.json({ products: Array.isArray(products) ? products.slice(0, 3) : [] })
  } catch (e: any) {
    console.error('[products] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
