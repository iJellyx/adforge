'use client'
import { useState } from 'react'
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

  // Only use clips that have transcripts and are ready
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
    }catch(e){console.error(e);setError("Failed to generate mash — try again")}
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

  if(step==="config")return<div style={{maxWidth:700,margin:"0 auto",padding:40}}>
    <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:24,fontSize:14}}>← Back</button>
    <STitle size={24} mb={6}>⚡ Auto-Mash from Stash</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:32,lineHeight:1.6}}>AI analyses your Stash and assembles a complete direct response ad using your creators' real voices — no scripting needed.</div>

    {usableClips.length<3&&<div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:12,padding:"12px 16px",fontSize:13,color:C.yellow,marginBottom:20}}>⚠️ You need at least 3 clips with transcripts. Upload more content first, or wait for AI analysis to complete.</div>}

    <Card style={{marginBottom:16}}>
      <STitle size={14} mb={14}>Ad Parameters</STitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div>
          <Label>Ad Length</Label>
          <select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}>
            {AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <Label>Product</Label>
          <select value={form.productId} onChange={e=>setF("productId",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}>
            <option value="">General</option>
            {products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>
      <Label>Awareness Stage</Label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {STAGES.map(s=>{const active=form.awarenessStage===s.value,sc=STAGE_COLORS[s.value]||C.accent;return<div key={s.value} onClick={()=>setF("awarenessStage",s.value)} style={{background:active?sc+"22":C.surface,border:"2px solid "+(active?sc:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:13,color:active?sc:C.text,marginBottom:2}}>{s.label}</div><div style={{fontSize:11,color:C.muted}}>{s.desc}</div></div>})}
      </div>
      <Label>Style</Label>
      <div style={{display:"flex",gap:8}}>
        {["mashup","ugc-only","testimonial-wall"].map(s=><button key={s} onClick={()=>setF("style",s)} style={{flex:1,background:form.style===s?C.accent:C.surface,color:form.style===s?"#fff":C.muted,border:"1.5px solid "+(form.style===s?C.accent:C.border),borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>{s==="mashup"?"🎬 Mashup":s==="ugc-only"?"📱 UGC Only":"⭐ Testimonials"}</button>)}
      </div>
    </Card>

    <div style={{background:"#EDE8FF",border:"1.5px solid "+C.accent,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.accent,marginBottom:20}}>
      ✦ {usableClips.length} clips ready in your Stash — AI will pick the best combination
    </div>

    <Btn onClick={generateMash} disabled={generating||usableClips.length<3} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12}}>
      {generating?"⏳ AI is assembling your ad…":"⚡ Generate Auto-Mash"}
    </Btn>
  </div>

  return<div style={{maxWidth:900,margin:"0 auto",padding:28}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <div>
        <button onClick={()=>setStep("config")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:8,fontSize:14,display:"block"}}>← Regenerate</button>
        <STitle size={20} mb={4}>⚡ Your Auto-Mash</STitle>
        <div style={{fontSize:13,color:C.muted}}>{sections.length} clips assembled · original audio</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={generateMash} disabled={generating} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44"}}>{generating?"⏳ Regenerating…":"🔄 Regenerate"}</Btn>
        <Btn onClick={saveMash} disabled={saving} style={{background:C.green,color:"#fff",fontWeight:700}}>{saving?"💾 Saving…":"✓ Save & Render"}</Btn>
      </div>
    </div>

    <div style={{marginBottom:16}}>
      <Label>Ad Title</Label>
      <input value={adTitle} onChange={e=>setAdTitle(e.target.value)} placeholder="Auto-Mash title…" style={{background:C.surface,border:"1.5px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const}}/>
    </div>

    <div style={{marginBottom:20}}>
      <MusicPicker suggestedMood="Uplifting" onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
    </div>

    <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
      <ScriptTable sections={sections} onChange={setSections} libraryItems={libraryItems} readOnly={false} brandName={brand.name} productName={""} voiceoverUrl={null}/>
    </Card>

    <StitchedPreview sections={sections} libraryItems={libraryItems} voiceoverUrl={null} musicUrl={musicUrl}/>
  </div>
}
