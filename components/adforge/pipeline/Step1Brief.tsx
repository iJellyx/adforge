'use client'
import { useState, useEffect } from 'react'
import { ChevronRight, Sparkles, Loader2, FileText } from 'lucide-react'
import { C, STAGES, STAGE_COLORS, FORM_CTYPES, AD_LENGTHS } from '../constants'
import { callClaude, secColor } from '../utils'
import { Btn, Card, Label, STitle, Input, Chip } from '../ui-primitives'
import type { Item, BrandProfile, Product, ForgedAd } from '../types'
import {
  type Brief, type ScriptSection, type PipelineState,
  wordBudgetFor, countWords,
} from './pipeline-types'

const TARGET_LENGTHS = [15, 30, 45, 60, 90]

export function Step1Brief({
  brand,
  products,
  forgedAds,
  items,
  onSubmit,
  state,
  setState,
}: {
  brand: BrandProfile
  products: Product[]
  forgedAds: ForgedAd[]
  items: Item[]
  onSubmit: (brief: Brief, sections: ScriptSection[]) => void
  state: PipelineState
  setState: (updater: (s: PipelineState) => PipelineState) => void
}) {
  // Preseed from existing brief if returning from Step 2
  const existing = state.brief
  const savedAvatars = brand?.customer_avatars || []

  const [productId, setProductId] = useState(existing?.productId || (products.length === 1 ? String((products[0] as any).id) : ''))
  const [awarenessStage, setAwarenessStage] = useState(existing?.awarenessStage || 'problem_aware')
  const [contentType, setContentType] = useState(existing?.contentType || 'UGC')
  const [targetLengthSec, setTargetLengthSec] = useState(existing?.targetLengthSec || 30)
  const [customerAvatar, setCustomerAvatar] = useState(existing?.customerAvatar || '')
  const [request, setRequest] = useState(existing?.request || '')
  const [generating, setGenerating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  const intel = brand.brand_intelligence

  async function handleSubmit() {
    if (!productId) { setError('Please select a product.'); return }
    setGenerating(true); setError(''); setStatusMsg('Writing your script...')

    try {
      const prod = products.find((x: Product) => String((x as any).id) === String(productId)) || null
      const stage = STAGES.find(s => s.value === awarenessStage) || STAGES[0]
      const wordBudget = wordBudgetFor(targetLengthSec)

      // Avatar info
      const avatar = savedAvatars.find(a => a.name === customerAvatar)
      const painPoints = avatar?.pains || ''
      const desires = avatar?.desires || ''
      const objections = avatar?.objections || ''

      // Build context -- copied from ScriptsTab.handleGen
      let ctx = `BRAND:\nName: ${brand.name || 'Unknown'}\nDescription: ${brand.description || ''}\nVoice & Tone: ${brand.voice || ''}\nTarget Customer: ${brand.target_customer || ''}\nSocial Proof / Reviews: ${brand.reviews || ''}\nAdditional Info: ${brand.additional_info || ''}\n\n`
      if (prod) ctx += `PRODUCT:\nName: ${prod.name}\nDescription: ${prod.description || ''}\nKey Benefits: ${prod.benefits || ''}\nClaims & Results: ${prod.claims || ''}\nDifferentiators (what makes it unique): ${prod.differentiators || ''}\nKey Ingredients: ${prod.ingredients || ''}\nCustomer Reviews: ${prod.reviews || ''}\nPrice: ${prod.price || ''}\nScript Notes: ${prod.notes || ''}\n\n`

      // Brand intelligence
      let intelBlock = ''
      if (intel && (intel.best_hook_types?.length || intel.best_hook_patterns?.length || intel.best_structures?.length)) {
        intelBlock = `\nBRAND PERFORMANCE LEARNINGS (apply these -- based on real ad data from ${intel.total_ads_analysed || 0} ads):\n`
        if (intel.best_hook_types?.length) intelBlock += `- Best hook types for this brand: ${intel.best_hook_types.join(', ')}\n`
        if (intel.worst_hook_types?.length) intelBlock += `- Avoid these hook types: ${intel.worst_hook_types.join(', ')}\n`
        if (intel.best_hook_patterns?.length) intelBlock += `- Winning hook patterns: ${intel.best_hook_patterns.join('; ')}\n`
        if (intel.best_content_type) intelBlock += `- Best performing content type: ${intel.best_content_type}\n`
        if (intel.avg_winning_hook_length) intelBlock += `- Winning hooks average ${intel.avg_winning_hook_length} words\n`
        if (intel.best_ad_length) intelBlock += `- Best performing ad length: ${intel.best_ad_length}\n`
        if (intel.best_awareness_stage) intelBlock += `- Best performing awareness stage: ${intel.best_awareness_stage}\n`
        if (intel.avg_section_count) intelBlock += `- Winning ads average ${intel.avg_section_count} sections\n`
        if (intel.best_structures?.length) intelBlock += `- Top performing section structures:\n${intel.best_structures.map((s: string) => `  - ${s}`).join('\n')}\n`
        intelBlock += '\n'
      }

      // Available footage summary
      let footageBlock = ''
      if (items.length > 0) {
        const clips = items.filter((i: Item) => i.mux_playback_id)
        const brollClips = clips.filter((i: Item) => { const a = i.analysis || {}; return a.is_broll === true || a.content_type === 'Product Demo' || (a.scene_tags || []).some((t: string) => /product|demo|close|ingredient|lifestyle/i.test(t)) })
        const talkingHeads = clips.filter((i: Item) => { const a = i.analysis || {}; return a.is_talking_head === true || a.content_type === 'Talking Head' || a.content_type === 'UGC' })
        const tagCounts: Record<string, number> = {}
        clips.forEach((i: Item) => { (i.analysis?.creative_tags || []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1 }); (i.analysis?.scene_tags || []).slice(0, 3).forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1 }) })
        const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t]) => t)
        footageBlock = `\nAVAILABLE FOOTAGE (${clips.length} clips):\n- B-roll/product shots: ${brollClips.length} clips\n- Talking head/UGC: ${talkingHeads.length} clips\n`
        if (topTags.length) footageBlock += `- Visual content available: ${topTags.join(', ')}\n`
        footageBlock += `IMPORTANT: Write visual directions that reference footage types you KNOW exist above.\n\n`
      }

      // Target range is ±8% — slightly tighter than the ±10% display gate so
      // we converge cleanly before hitting the user.
      const minWords = Math.round(wordBudget * 0.92)
      const maxWords = Math.round(wordBudget * 1.08)

      const basePrompt = ctx + intelBlock + footageBlock + `SCRIPT REQ:\nContent type: ${contentType}\nTarget duration: ${targetLengthSec} seconds\nSTRICT WORD COUNT: ${wordBudget} words total (must be between ${minWords} and ${maxWords})\nStage: ${stage.label} -- ${stage.desc}\nCustomer: ${customerAvatar || brand.target_customer || ''}\nPains: ${painPoints}\nDesires: ${desires}\nObjections: ${objections}\nRequest: ${request || ''}\n\nWrite a direct response video ad script. The TOTAL SPOKEN WORDS across all sections combined MUST land between ${minWords} and ${maxWords} words (target: ${wordBudget}). Aim for the upper end of that range — shorter is worse than longer. Use specific brand/product details: real names, claims, numbers, differentiators. Do NOT return fewer than ${minWords} words. Return ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is on screen","hookType":"Question"}],"suggested_music_mood":"Uplifting"}\nSection types: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA.`

      // Generation + convergence loop. Up to 3 attempts; each tells Claude
      // exactly what went wrong with the previous draft.
      let sections: ScriptSection[] = []
      let attempts = 0
      let lastWords = 0
      const maxAttempts = 3
      while (attempts < maxAttempts) {
        attempts++
        setStatusMsg(attempts === 1 ? 'Writing your script...' : `Adjusting length (attempt ${attempts})...`)

        let prompt = basePrompt
        if (attempts > 1 && sections.length > 0) {
          const diff = lastWords - wordBudget
          const direction = diff < 0 ? `TOO SHORT by ${Math.abs(diff)} words` : `TOO LONG by ${diff} words`
          prompt = basePrompt + `\n\nIMPORTANT: Your previous draft was ${lastWords} words (${direction}). Rewrite to hit exactly ${wordBudget} words, within the range ${minWords}-${maxWords}.${diff < 0 ? ' EXPAND each section with more detail, social proof, or specific claims. Do not add new sections — make existing sections longer.' : ' TIGHTEN each section — remove filler words, combine short sentences, keep only the most punchy lines.'}`
        }

        const raw = await callClaude([{ role: 'user', content: prompt }], 2000)
        const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
        sections = (data.sections || []).map((s: any, i: number) => ({
          ...s,
          id: String(Date.now() + i),
          matchedClipIds: [],
          selectedClipId: null,
        }))

        lastWords = sections.reduce((sum, s) => sum + (s.spokenWords || '').trim().split(/\s+/).filter(Boolean).length, 0)

        if (lastWords >= minWords && lastWords <= maxWords) break  // converged
        console.log(`[Step1Brief] Attempt ${attempts}: ${lastWords} words (target ${wordBudget}, range ${minWords}-${maxWords}). ${attempts < maxAttempts ? 'Retrying.' : 'Giving up — user can edit.'}`)
      }

      setStatusMsg('Done!')
      const brief: Brief = {
        productId,
        productName: prod?.name || 'General',
        awarenessStage,
        contentType,
        targetLengthSec,
        customerAvatar,
        painPoints,
        desires,
        objections,
        request,
      }

      onSubmit(brief, sections)
    } catch (e: any) {
      setError('Error generating script: ' + (e?.message || 'Unknown error. Try again.'))
    }
    setGenerating(false)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      {/* Brand intelligence hint */}
      {intel && (intel.best_hook_types?.length || intel.best_structures?.length) && (
        <div style={{ background: 'var(--af-accent-soft)', border: '1px solid rgba(139,127,255,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={16} color="var(--af-accent)" />
          <div style={{ fontSize: 12, color: 'var(--af-accent)' }}>
            Brand Intelligence active -- AI will use learnings from {intel.total_ads_analysed || 0} analysed ads to guide your script.
          </div>
        </div>
      )}

      <STitle size={24}>Create your ad</STitle>
      <div style={{ fontSize: 14, color: 'var(--af-text-secondary)', marginBottom: 32 }}>
        Fill in the brief and AI will write a time-budgeted script.
      </div>

      {/* Product */}
      <div style={{ marginBottom: 20 }}>
        <Label>Product</Label>
        <select
          value={productId}
          onChange={e => setProductId(e.target.value)}
          style={{ width: '100%', background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 10, padding: '10px 13px', color: 'var(--af-text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
        >
          <option value="">Select a product...</option>
          {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Awareness Stage */}
      <div style={{ marginBottom: 20 }}>
        <Label>Awareness Stage</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {STAGES.map(s => {
            const active = awarenessStage === s.value
            const col = STAGE_COLORS[s.value] || 'var(--af-accent)'
            return (
              <button key={s.value} onClick={() => setAwarenessStage(s.value)} style={{
                padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                background: active ? col + '18' : 'var(--af-card)',
                border: '2px solid ' + (active ? col : 'var(--af-border)'),
                textAlign: 'center', transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? col : 'var(--af-text)', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 9, color: 'var(--af-muted)', lineHeight: 1.3 }}>{s.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content Type */}
      <div style={{ marginBottom: 20 }}>
        <Label>Content Type</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FORM_CTYPES.map(ct => {
            const active = contentType === ct
            return (
              <button key={ct} onClick={() => setContentType(ct)} style={{
                padding: '8px 14px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 700 : 500,
                background: active ? 'var(--af-accent)' : 'var(--af-card)',
                color: active ? '#fff' : 'var(--af-text-secondary)',
                border: '1px solid ' + (active ? 'var(--af-accent)' : 'var(--af-border)'),
                transition: 'all 0.15s',
              }}>{ct}</button>
            )
          })}
        </div>
      </div>

      {/* Target Length -- hero control */}
      <div style={{ marginBottom: 24 }}>
        <Label>Target Length</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {TARGET_LENGTHS.map(sec => {
            const active = targetLengthSec === sec
            return (
              <button key={sec} onClick={() => setTargetLengthSec(sec)} style={{
                padding: '18px 8px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                background: active ? 'var(--af-accent)' : 'var(--af-card)',
                border: '2px solid ' + (active ? 'var(--af-accent)' : 'var(--af-border)'),
                textAlign: 'center', transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: active ? '#fff' : 'var(--af-text)' }}>{sec}s</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.7)' : 'var(--af-muted)', marginTop: 2 }}>{Math.round(sec * 2.5)} words</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer Avatar */}
      {savedAvatars.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Label>Customer Avatar</Label>
          <select
            value={customerAvatar}
            onChange={e => setCustomerAvatar(e.target.value)}
            style={{ width: '100%', background: 'var(--af-surface)', border: '1px solid var(--af-border)', borderRadius: 10, padding: '10px 13px', color: 'var(--af-text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          >
            <option value="">Select avatar (optional)...</option>
            {savedAvatars.map((a: any) => <option key={a.id || a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
      )}

      {/* Custom request */}
      <div style={{ marginBottom: 24 }}>
        <Label>Custom Request (optional)</Label>
        <Input textarea rows={3} value={request} onChange={(e: any) => setRequest(e.target.value)} placeholder="e.g. Focus on the new formula, mention the 30-day guarantee..." />
      </div>

      {error && (
        <div style={{ background: '#ef444422', border: '1px solid #ef444433', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{error}</div>
      )}

      {/* Submit */}
      {generating ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Loader2 size={28} color="var(--af-accent)" style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 14, color: 'var(--af-text-secondary)', marginTop: 12 }}>{statusMsg}</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <Btn onClick={handleSubmit} disabled={!productId} style={{ background: 'var(--af-accent)', color: '#fff', width: '100%', padding: '14px 24px', fontSize: 15, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <FileText size={16} /> Generate Script <ChevronRight size={16} />
        </Btn>
      )}
    </div>
  )
}
