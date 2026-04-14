'use client'
import { useState } from 'react'
import { Zap, RefreshCw, Check, Save, Loader2, AlertTriangle, Film, Sparkles } from 'lucide-react'
import type { Item } from './types'
import { C, STAGES, STAGE_COLORS, AD_LENGTHS } from './constants'
import { callClaude } from './utils'
import { Btn, Label, Card, STitle, Input } from './ui-primitives'
import { ScriptTable } from './ScriptTable'
import { StitchedPreview } from './StitchedPreview'
import { MusicPicker } from './MusicPicker'
import { createClient } from '@/lib/supabase/client'

export function AutoMashMode({libraryItems,brand,products,onSaveForgedAd,onGoToForged,onBack}:any){
  const [step,setStep]=useState<"config"|"preview">("config")
  const [generating,setGenerating]=useState(false)
  const [sections,setSections]=useState<any[]>([])
  const [adTitle,setAdTitle]=useState("")
  const [musicUrl,setMusicUrl]=useState<string|null>(null)
  const [musicName,setMusicName]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const [form,setForm]=useState({awarenessStage:"problem_aware",adLength:"30 seconds",productId:"",style:"mashup"})
  function setF(k:string,v:string){setForm(x=>({...x,[k]:v}))}

  const usableClips=libraryItems.filter((i:Item)=>
    i.mux_playback_id&&
    i.mux_status==="ready"&&
    (i.transcript||(i.analysis?.scene_tags?.length>0))
  )

  async function generateMash(){
    if(usableClips.length<3){setError("Need at least 3 ready clips with transcripts. Upload more content first.");return}
    setGenerating(true)
    try{
      const clipSummary=usableClips.map((item:Item)=>{
        const a=item.analysis||{}
        return `ID:${item.id}
  type:${item.type}|role:${a.clip_role||item.clip_role||a.label||""}
  transcript:"${(item.transcript||"").substring(0,150)}"
  summary:${(a.summary||"").substring(0,100)}
  tags:${(a.scene_tags||[]).join(", ")}
  key_quotes:${(a.key_quotes||[]).slice(0,2).join(" | ")}
  duration:${item.duration_seconds||5}s
  creator:${item.creator||"unknown"}`
      }).join("\n\n")

      const stage=STAGES.find(s=>s.value===form.awarenessStage)||STAGES[0]
      const prod=products.find((x:any)=>String(x.id)===String(form.productId))||null

      const prompt=`You are an expert direct response video editor. Assemble a complete ${form.adLength} mashup ad from these existing creator clips.

BRAND: ${brand.name||"Unknown"}
PRODUCT: ${prod?.name||"General"}
AWARENESS STAGE: ${stage.label} — ${stage.desc}
STYLE: ${form.style}

AVAILABLE CLIPS:
${clipSummary}

RULES:
1. Select 6-12 clips that together tell a complete direct response story
2. Structure: HOOK → PROBLEM → AGITATE → SOLUTION → SOCIAL PROOF → CTA
3. Each selected clip must use its ORIGINAL AUDIO — no voiceover will be added
4. Choose clips whose spoken words FLOW LOGICALLY when cut together
5. The transcript of consecutive clips should make narrative sense
6. Prefer clips with complete sentences — avoid clips that end mid-thought
7. Each clip should be 2-6 seconds of the original video
8. Mix creators for variety where it makes sense
9. The total should be approximately ${form.adLength}

Return ONLY valid JSON:
{
  "sections": [
    {
      "type": "HOOK|PROBLEM|AGITATE|SOLUTION|SOCIAL PROOF|CTA",
      "selectedClipId": "clip_uuid",
      "clipSegments": [{"id":"seg-0-0","clipId":"clip_uuid","trimStart":null,"trimEnd":null}],
      "spokenWords": "exact transcript words from this clip",
      "visualDirection": "what is shown on screen",
      "muted": false,
      "reasoning": "why this clip works here"
    }
  ],
  "suggested_title": "short descriptive title",
  "narrative_flow": "brief description of the story being told"
}`

      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      const validIds=new Set(libraryItems.map((i:Item)=>i.id))
      const validSections=(data.sections||[]).filter((s:any)=>s.selectedClipId&&validIds.has(s.selectedClipId))
      setSections(validSections.map((s:any,i:number)=>({
        ...s,
        id:Date.now()+i,
        matchedClipIds:[s.selectedClipId],
        autoSelected:true,
        clipSegments:s.clipSegments||[{id:"seg-"+i+"-0",clipId:s.selectedClipId,trimStart:null,trimEnd:null}],
      })))
      if(data.suggested_title)setAdTitle(data.suggested_title)
      setStep("preview")
    }catch(e){console.error(e);setError("Failed to generate mash -- try again")}
    setGenerating(false)
  }

  async function saveMash(){
    setSaving(true)
    const supabaseCheck=createClient()
    const baseTitle=adTitle.trim()||"AutoMash_"+new Date().toLocaleDateString()
    const{data:existing}=await supabaseCheck.from("forged_ads").select("title").ilike("title",baseTitle+"%")
    let version=1
    if(existing&&existing.length>0){const versions=existing.map((a:any)=>{const m=a.title.match(/_v(\d+)$/);return m?parseInt(m[1]):1});version=Math.max(...versions)+1}
    const title=baseTitle.includes("_v")?"":baseTitle+"_v"+version
    const savedAd=await onSaveForgedAd({
      title:title||baseTitle,
      status:"complete",
      mode:"script",
      sections,
      voiceover_url:null,
      voiceover_voice:null,
      music_url:musicUrl,
      music_name:musicName,
      metadata:{awarenessStage:form.awarenessStage,contentType:"Mashup",adLength:form.adLength,autoMash:true}
    })
    if(savedAd?.id){
      fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:savedAd.id})}).catch(console.error)
    }
    setSaving(false)
    onGoToForged()
  }

  if(step==="config")return<div className="max-w-[700px] mx-auto p-10">
    <button onClick={onBack} className="bg-transparent border-none text-text-muted cursor-pointer mb-6 text-sm hover:text-text transition-colors duration-150 flex items-center gap-1">
      <span>&larr;</span> Back
    </button>
    <div className="flex items-center gap-2 font-bold text-2xl mb-1.5"><Zap className="w-6 h-6" /> Auto-Mash from Library</div>
    <p className="text-text-muted text-sm mb-8 leading-relaxed">AI analyses your clip library and assembles a complete direct response ad using your creators' real voices -- no scripting needed.</p>

    {usableClips.length<3&&<div className="bg-warning-soft border-[1.5px] border-warning/30 rounded-lg px-4 py-3 text-sm text-warning mb-5 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" /> You need at least 3 clips with transcripts. Upload more content first, or wait for AI analysis to complete.
    </div>}

    <Card className="mb-4 p-5">
      <STitle size={14} mb={14}>Ad Parameters</STitle>
      <div className="grid grid-cols-2 gap-3.5 mb-3.5">
        <div>
          <Label>Ad Length</Label>
          <select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} className="bg-surface border border-border rounded-md px-3 py-2 text-text text-sm outline-none w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150">
            {AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <Label>Product</Label>
          <select value={form.productId} onChange={e=>setF("productId",e.target.value)} className="bg-surface border border-border rounded-md px-3 py-2 text-text text-sm outline-none w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150">
            <option value="">General</option>
            {products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      <Label>Awareness Stage</Label>
      <div className="grid grid-cols-2 gap-2 mb-3.5">
        {STAGES.map(s=>{const active=form.awarenessStage===s.value,sc=STAGE_COLORS[s.value]||C.accent;return<div key={s.value} onClick={()=>setF("awarenessStage",s.value)} className={`rounded-md px-3 py-2.5 cursor-pointer border-2 transition-all duration-150 ${active?"":"border-border hover:border-border-strong"}`} style={active?{background:sc+"22",borderColor:sc}:{}}>
          <div className={`font-bold text-sm mb-0.5 ${active?"":"text-text"}`} style={active?{color:sc}:{}}>{s.label}</div>
          <div className="text-xs text-text-muted">{s.desc}</div>
        </div>})}
      </div>
      <Label>Style</Label>
      <div className="flex gap-2">
        {["mashup","ugc-only","testimonial-wall"].map(s=><button key={s} onClick={()=>setF("style",s)} className={`flex-1 rounded-md px-2 py-2 cursor-pointer text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center justify-center gap-1 ${form.style===s?"bg-accent text-white border-[1.5px] border-accent":"bg-surface text-text-muted border-[1.5px] border-border hover:border-border-strong"}`}>
          {s==="mashup"?<><Film className="w-3 h-3" /> Mashup</>:s==="ugc-only"?"UGC Only":"Testimonials"}
        </button>)}
      </div>
    </Card>

    <div className="bg-accent-soft border-[1.5px] border-accent rounded-lg px-4 py-3 text-sm text-accent mb-5 flex items-center gap-2">
      <Sparkles className="w-4 h-4" /> {usableClips.length} clips ready in your library -- AI will pick the best combination
    </div>

    <Btn onClick={generateMash} disabled={generating||usableClips.length<3} className={`w-full py-3.5 text-[15px] rounded-lg font-bold flex items-center justify-center gap-2 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${generating?"bg-border text-text-muted cursor-not-allowed":"bg-accent text-white hover:bg-accent-hover active:scale-[0.99]"}`}>
      {generating?<><Loader2 className="w-4 h-4 animate-spin" /> AI is assembling your ad...</>:<><Zap className="w-4 h-4" /> Generate Auto-Mash</>}
    </Btn>
  </div>

  return<div className="max-w-[900px] mx-auto p-7">
    <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
      <div>
        <button onClick={()=>setStep("config")} className="bg-transparent border-none text-text-muted cursor-pointer mb-2 text-sm block hover:text-text transition-colors duration-150">&larr; Regenerate</button>
        <div className="flex items-center gap-2 font-bold text-xl mb-1"><Zap className="w-5 h-5" /> Your Auto-Mash</div>
        <div className="text-sm text-text-muted">{sections.length} clips assembled · original audio</div>
      </div>
      <div className="flex gap-2.5">
        <Btn onClick={generateMash} disabled={generating} className="bg-accent-soft text-accent border border-accent/30 flex items-center gap-1.5 hover:bg-accent hover:text-white transition-all duration-150">
          {generating?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>:<><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>}
        </Btn>
        <Btn onClick={saveMash} disabled={saving} className="bg-success text-white font-bold flex items-center gap-1.5 hover:bg-success/90 transition-all duration-150">
          {saving?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>:<><Check className="w-3.5 h-3.5" /> Save & Render</>}
        </Btn>
      </div>
    </div>

    <div className="mb-4">
      <Label>Ad Title</Label>
      <input value={adTitle} onChange={e=>setAdTitle(e.target.value)} placeholder="Auto-Mash title..." className="bg-surface border-[1.5px] border-border rounded-md px-3 py-2 text-text text-sm outline-none w-full focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
    </div>

    <div className="mb-5">
      <MusicPicker suggestedMood="Uplifting" onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
    </div>

    <Card className="p-0 overflow-hidden mb-5">
      <ScriptTable sections={sections} onChange={setSections} libraryItems={libraryItems} readOnly={false} brandName={brand.name} productName={""} voiceoverUrl={null}/>
    </Card>

    <StitchedPreview sections={sections} libraryItems={libraryItems} voiceoverUrl={null} musicUrl={musicUrl}/>
  </div>
}
