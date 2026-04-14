'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Item, Script, BrandProfile, Product, ForgedAd, CaptionSettings, CustomerAvatar } from '../types'
import { C, STAGES, STAGE_COLORS, AD_LENGTHS, FORM_CTYPES, SEC_TYPES, DEFAULT_CAPTIONS } from '../constants'
import { callClaude, secColor, muxThumb } from '../utils'
import { Btn, Label, Card, STitle, Input, Chip } from '../ui-primitives'
import { ScriptTable } from '../ScriptTable'
import { VoiceoverGenerator } from '../VoiceoverGenerator'
import { MusicPicker } from '../MusicPicker'
import { StitchedPreview } from '../StitchedPreview'
import { ExportVideo } from '../ExportVideo'
import { AdWorkspace } from '../AdWorkspace'
import { AutoMashMode } from '../AutoMashMode'
import { BRollMode } from '../BRollMode'
import { CreatorBriefModal } from '../CreatorBriefModal'

export function ScriptsTab({scripts,items,brand,products,onSaveScripts,onSaveForgedAd,onGoToForged,startAtChooseMode,editingAd,onEditingAdConsumed,v2SourceAd,onV2Consumed,forgedAds,workspaceId}:any){
  const [view,setView]=useState("list")
  useEffect(()=>{if(startAtChooseMode>0)setView("chooseMode")},[startAtChooseMode])

  // Edit mode — load forged ad back into review flow
  useEffect(()=>{
    if(!editingAd)return
    setSections(editingAd.sections||[])
    setVoiceoverUrl(editingAd.voiceover_url||null)
    setVoiceoverVoice(editingAd.voiceover_voice||null)
    setMusicUrl(editingAd.music_url||null)
    setMusicName(editingAd.music_name||null)
    setAdTitle(editingAd.title||"")
    setGenMeta({form:{contentType:editingAd.metadata?.contentType,adLength:editingAd.metadata?.adLength,awarenessStage:editingAd.metadata?.awarenessStage},productName:editingAd.metadata?.productName})
    setView("review");setStep("clips")
    onEditingAdConsumed?.()
  },[editingAd])

  // v2 mode — same structure, clear audio, go to script step
  useEffect(()=>{
    if(!v2SourceAd)return
    setSections((v2SourceAd.sections||[]).map((s:any)=>({...s,voiceover_url:null})))
    setVoiceoverUrl(null);setVoiceoverVoice(null);setMusicUrl(null);setMusicName(null)
    setAdTitle(v2SourceAd.title.replace(/_v\d+$/,"")+"_v2")
    setGenMeta({form:{contentType:v2SourceAd.metadata?.contentType,adLength:v2SourceAd.metadata?.adLength,awarenessStage:v2SourceAd.metadata?.awarenessStage},productName:v2SourceAd.metadata?.productName,isV2:true,sourceTitle:v2SourceAd.title})
    setHookVariations([]);setView("review");setStep("script")
    onV2Consumed?.()
  },[v2SourceAd])
  const [selected,setSelected]=useState<Script|null>(null)
  const [sections,setSections]=useState<any[]>([])
  const [genMeta,setGenMeta]=useState<any>(null)
  const [generating,setGenerating]=useState(false)
  const [error,setError]=useState("")
  const [matching,setMatching]=useState(false)
  const [step,setStep]=useState<"script"|"audio"|"clips"|"forge">("script")
  const [voiceoverUrl,setVoiceoverUrl]=useState<string|null>(null)
  const [voiceoverVoice,setVoiceoverVoice]=useState<string|null>(null)
  const [musicUrl,setMusicUrl]=useState<string|null>(null)
  const [musicName,setMusicName]=useState<string|null>(null)
  const [suggestedMood,setSuggestedMood]=useState("Uplifting")
  const [adTitle,setAdTitle]=useState("")
  const [aspectRatio,setAspectRatio]=useState("9:16")
  const [captionSettings,setCaptionSettings]=useState<CaptionSettings>({...DEFAULT_CAPTIONS})
  const [hookVariations,setHookVariations]=useState<any[][]>([])
  const [hookError,setHookError]=useState("")
  const [selectedHooks,setSelectedHooks]=useState<number[]>([0])
  const [activeHookIdx,setActiveHookIdx]=useState(0)
  const [hookSections,setHookSections]=useState<Record<number,any[]>>({})
  const [generatingHooks,setGeneratingHooks]=useState(false)
  const [form,setForm]=useState({productId:"",awarenessStage:"problem_aware",contentType:"UGC",adLength:"30 seconds",customerAvatar:"",useAvatarId:"",painPoints:"",desires:"",objections:"",request:""})
  function setF(k:string,v:string){setForm(x=>({...x,[k]:v}))}
  const savedAvatars=(brand?.customer_avatars||[])

  async function handleGen(){
    setGenerating(true);setError("")
    try{
      const prod=products.find((x:Product)=>String((x as any).id)===String(form.productId))||null
      const stage=STAGES.find(s=>s.value===form.awarenessStage)||STAGES[0]
      let ctx=`BRAND:\nName: ${brand.name||"Unknown"}\nDescription: ${brand.description||""}\nVoice & Tone: ${brand.voice||""}\nTarget Customer: ${brand.target_customer||""}\nSocial Proof / Reviews: ${brand.reviews||""}\nAdditional Info: ${brand.additional_info||""}\n\n`
      if(prod)ctx+=`PRODUCT:\nName: ${prod.name}\nDescription: ${prod.description||""}\nKey Benefits: ${prod.benefits||""}\nClaims & Results: ${prod.claims||""}\nDifferentiators (what makes it unique): ${prod.differentiators||""}\nKey Ingredients: ${prod.ingredients||""}\nCustomer Reviews: ${prod.reviews||""}\nPrice: ${prod.price||""}\nScript Notes: ${prod.notes||""}\n\n`

      // Inject brand intelligence learnings if available
      const intel=brand.brand_intelligence
      let intelBlock=""
      if(intel&&(intel.best_hook_types?.length||intel.best_hook_patterns?.length||intel.best_structures?.length)){
        intelBlock=`\nBRAND PERFORMANCE LEARNINGS (apply these — based on real ad data from ${intel.total_ads_analysed||0} ads):\n`
        if(intel.best_hook_types?.length)intelBlock+=`• Best hook types for this brand: ${intel.best_hook_types.join(", ")}\n`
        if(intel.worst_hook_types?.length)intelBlock+=`• Avoid these hook types: ${intel.worst_hook_types.join(", ")}\n`
        if(intel.best_hook_patterns?.length)intelBlock+=`• Winning hook patterns: ${intel.best_hook_patterns.join("; ")}\n`
        if(intel.best_content_type)intelBlock+=`• Best performing content type: ${intel.best_content_type}\n`
        if(intel.avg_winning_hook_length)intelBlock+=`• Winning hooks average ${intel.avg_winning_hook_length} words\n`
        if(intel.best_ad_length)intelBlock+=`• Best performing ad length: ${intel.best_ad_length}\n`
        if(intel.best_awareness_stage)intelBlock+=`• Best performing awareness stage: ${intel.best_awareness_stage}\n`
        if(intel.avg_section_count)intelBlock+=`• Winning ads average ${intel.avg_section_count} sections\n`
        if(intel.best_structures?.length)intelBlock+=`• Top performing section structures:\n${intel.best_structures.map((s:string)=>`  - ${s}`).join("\n")}\n`
        intelBlock+="\n"
      }

      // Performance feedback from logged forged ads
      const adsWithData=(forgedAds||[]).filter((a:ForgedAd)=>a.metadata?.hook_rate||a.metadata?.cpa||a.metadata?.roas||a.star_rating)
      let perfBlock=""
      if(adsWithData.length>=2){
        const avg=(arr:number[])=>arr.length?Math.round(arr.reduce((a:number,b:number)=>a+b,0)/arr.length*10)/10:0
        const hookPerf:Record<string,number[]>={}
        adsWithData.forEach((a:ForgedAd)=>{const hook=(a.sections||[]).find((s:any)=>s.type==="HOOK");const ht=hook?.hookType||"";const rate=parseFloat(a.metadata?.hook_rate||"0");if(ht&&rate>0){if(!hookPerf[ht])hookPerf[ht]=[];hookPerf[ht].push(rate)}})
        const hookEntries=Object.entries(hookPerf).sort((a,b)=>avg(b[1] as number[])-avg(a[1] as number[]))
        if(hookEntries.length){
          perfBlock=`\nPERFORMANCE DATA (from ${adsWithData.length} logged ads):\n`
          hookEntries.slice(0,3).forEach(([type,rates])=>{perfBlock+=`• ${type} hooks: avg ${avg(rates as number[])}% hook rate\n`})
          const topRated=adsWithData.filter((a:ForgedAd)=>(a.star_rating||0)>=4)
          if(topRated.length){const topCreator=[...new Set(topRated.flatMap((a:ForgedAd)=>(a.sections||[]).map((s:any)=>{const item=items.find((i:Item)=>i.id===s.selectedClipId);return item?.creator}).filter(Boolean)))][0];if(topCreator)perfBlock+=`• Top performing creator: ${topCreator}\n`}
          perfBlock+="\n"
        }
      }
      // Build a summary of available footage so Claude writes visual directions that match real clips
      let footageBlock=""
      if(items.length>0){
        const clips=items.filter((i:Item)=>i.mux_playback_id)
        const brollClips=clips.filter((i:Item)=>{const a=i.analysis||{};return a.is_broll===true||a.content_type==="Product Demo"||(a.scene_tags||[]).some((t:string)=>/product|demo|close|ingredient|lifestyle/i.test(t))})
        const talkingHeads=clips.filter((i:Item)=>{const a=i.analysis||{};return a.is_talking_head===true||a.content_type==="Talking Head"||a.content_type==="UGC"})
        const tagCounts:Record<string,number>={}
        clips.forEach((i:Item)=>{(i.analysis?.creative_tags||[]).forEach((t:string)=>{tagCounts[t]=(tagCounts[t]||0)+1});(i.analysis?.scene_tags||[]).slice(0,3).forEach((t:string)=>{tagCounts[t]=(tagCounts[t]||0)+1})})
        const topTags=Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([t])=>t)
        const roles=clips.map((i:Item)=>i.clip_role||i.analysis?.clip_role).filter(Boolean)
        const roleCounts:Record<string,number>={}
        roles.forEach((r:string)=>{roleCounts[r]=(roleCounts[r]||0)+1})

        footageBlock=`\nAVAILABLE FOOTAGE (${clips.length} clips in library — write visual directions that match what actually exists):\n`
        footageBlock+=`• B-roll/product shots: ${brollClips.length} clips\n`
        footageBlock+=`• Talking head/UGC: ${talkingHeads.length} clips\n`
        if(topTags.length)footageBlock+=`• Visual content available: ${topTags.join(", ")}\n`
        if(Object.keys(roleCounts).length)footageBlock+=`• Clip roles available: ${Object.entries(roleCounts).map(([r,c])=>`${r.replace(/_/g," ")} (${c})`).join(", ")}\n`
        footageBlock+=`IMPORTANT: Write visual directions that reference footage types you KNOW exist above. Don't ask for shots the library doesn't have.\n\n`
      }

      const prompt=ctx+intelBlock+perfBlock+footageBlock+`SCRIPT REQ:\nContent type: ${form.contentType}\nLength: ${form.adLength}\nStage: ${stage.label} — ${stage.desc}\nCustomer: ${form.customerAvatar||brand.target_customer||""}\nPains: ${form.painPoints||""}\nDesires: ${form.desires||""}\nObjections: ${form.objections||""}\nRequest: ${form.request||""}\n\nWrite a direct response video ad script. Use specific brand/product details — names, claims, real numbers, differentiators. Return ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is on screen","durationEstimate":"0-3s"}],"suggested_music_mood":"Uplifting"}\nSection types: HOOK, PROBLEM, AGITATE, SOLUTION, SOCIAL PROOF, CTA.`
      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
      let secs=(data.sections||[]).map((s:any,i:number)=>({...s,id:Date.now()+i,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
      if(items.length>0)secs=await matchClips(secs,items,!!voiceoverUrl)
      setSuggestedMood(data.suggested_music_mood||"Uplifting")
      setSections(secs);setGenMeta({form,productName:prod?.name||"General"});setView("review");setStep("script")
    }catch(e:any){setError("Error generating script: "+(e?.message||"Unknown error. Try again."));setGenerating(false);return}
    setGenerating(false)
  }

  async function matchClips(secs:any[],libItems:Item[],hasVoiceover?:boolean){
    const clips=libItems.filter(i=>i.mux_playback_id)
    const matchPool=clips.length>0?clips:libItems.filter(i=>i.mux_playback_id)
    const usedIds=new Set<string>()

    // Classify clips as b-roll vs talking head to help Claude
    const classifyClip=(item:Item)=>{
      const a=item.analysis||{}
      // Prefer explicit flags from AI analysis if available
      if(a.is_broll===true)return"BROLL"
      if(a.is_talking_head===true)return"TALKING_HEAD"
      // Fallback to heuristic classification
      const tags=(a.scene_tags||[]).join(" ").toLowerCase()
      const contentType=(a.content_type||"").toLowerCase()
      const isTalkingHead=tags.includes("talking head")||tags.includes("person speaking")||contentType==="talking head"
      const isBroll=tags.includes("product")||tags.includes("close-up")||tags.includes("demo")||tags.includes("lifestyle")||tags.includes("b-roll")||contentType.includes("product demo")||contentType.includes("demo")
      return isBroll?"BROLL":isTalkingHead?"TALKING_HEAD":"MIXED"
    }

    const libSummary=matchPool.map(item=>{
      const a=item.analysis||{}
      const quotes=(a.key_quotes||[]).slice(0,2).join(" | ")
      const clipClass=classifyClip(item)
      const creativeTags=(a.creative_tags||[]).join(",")
      const isTH=a.is_talking_head?"yes":"no"
      const isBR=a.is_broll?"yes":"no"
      const vs=a.visual_style||""
      return "ID:"+item.id+"|class:"+clipClass+"|creative_tags:"+creativeTags+"|is_talking_head:"+isTH+"|is_broll:"+isBR+"|visual_style:"+vs+"|role:"+(a.clip_role||item.clip_role||"")+"|content_type:"+(a.content_type||"")+"|use:"+(a.use_case||"")+"|tags:"+(a.scene_tags||[]).join(",")+"|summary:"+(a.summary||item.description||"").substring(0,120)+"|transcript:"+(item.transcript||"").substring(0,200)+(quotes?"|quotes:"+quotes:"")+"|ad_potential:"+(a.ad_potential||"")+"|tone:"+(a.tone||"")+"|type:"+item.type
    }).join("\n")

    const sectionDesc=secs.map((s:any,i:number)=>{
      const words=(s.spokenWords||"").trim()
      const visual=(s.visualDirection||"")
      return "Section "+i+" ["+s.type+"]: spoken=\""+words.substring(0,120)+"\" visual=\""+visual.substring(0,60)+"\""
    }).join("\n")

    const voiceoverRules=hasVoiceover?`
7. CRITICAL — VOICEOVER MODE: This ad has a voiceover narration. The voiceover provides ALL the spoken audio. Therefore:
   - STRONGLY PREFER clips classified as BROLL (product shots, demos, close-ups, lifestyle, ingredients, results)
   - AVOID clips classified as TALKING_HEAD (people speaking to camera) because their mouth movement will conflict with the voiceover audio
   - Only use TALKING_HEAD clips if absolutely no BROLL alternative exists for a section
   - Even for SOCIAL PROOF sections, prefer product-in-use or results clips over talking head testimonials`:""

    const prompt="You are an expert direct response video editor for DTC brands.\n\nAnalyse each script section and determine HOW MANY clips it needs to best tell the story visually.\n\nSCRIPT SECTIONS:\n"+sectionDesc+"\n\nCLIP LIBRARY ("+matchPool.length+" clips):\n"+libSummary+"\n\nRULES:\n1. Each section can use 1-4 clips depending on how many distinct visual moments exist in the spoken words\n2. A 30s ad should have roughly 8-15 total clips across all sections\n3. Match clips by VISUAL CONTENT — if script says yellow teeth, find a clip of yellow teeth\n4. Use clip creative_tags, scene_tags, is_talking_head, is_broll, visual_style, transcript, and use_case to find the best visual match\n5. NEVER use the same clip twice across the whole ad\n6. For each clip slot, provide 2 alternatives\n7. Score each match 0-100 based on how well the clip visually matches the script phrase and section type"+voiceoverRules+"\n\nReturn ONLY valid JSON array — one entry per CLIP SLOT:\n[{\"section\":0,\"slot\":0,\"best_id\":\"clip_uuid\",\"alt_ids\":[\"alt1\",\"alt2\"],\"phrase\":\"specific phrase this clip covers\",\"reason\":\"why this clip matches\",\"match_score\":85},...]"

    try{
      const raw=await callClaude([{role:"user",content:prompt}],2000)
      const matches=JSON.parse(raw.replace(/```json/g,"").replace(/```/g,"").trim())
      const validIds=new Set(libItems.map(i=>i.id))

      return secs.map((s:any,i:number)=>{
        const sectionMatches=matches.filter((m:any)=>m.section===i)
        if(sectionMatches.length===0){
          return{...s,matchedClipIds:s.matchedClipIds||[],selectedClipId:s.selectedClipId||null,clipSegments:[{id:"seg-"+i+"-0",clipId:s.selectedClipId||null}]}
        }

        const clipSegments=sectionMatches.map((m:any,si:number)=>{
          const candidates=[m.best_id,...(m.alt_ids||[])].filter((id:string)=>id&&validIds.has(id)&&!usedIds.has(id))
          const clipId=candidates[0]||null
          if(clipId)usedIds.add(clipId)
          return{id:"seg-"+i+"-"+si,clipId,phrase:m.phrase||"",reason:m.reason||"",match_score:m.match_score||null}
        }).filter((seg:any)=>seg.clipId)

        const allMatchedIds=sectionMatches.flatMap((m:any)=>[m.best_id,...(m.alt_ids||[])]).filter((id:string)=>id&&validIds.has(id))
        const firstClipId=clipSegments[0]?.clipId||null

        return{
          ...s,
          matchedClipIds:allMatchedIds,
          selectedClipId:firstClipId,
          clipSegments:clipSegments.length>0?clipSegments:[{id:"seg-"+i+"-0",clipId:null}],
          autoSelected:clipSegments.length>0,
          matchReason:sectionMatches[0]?.reason||"",
        }
      })
    }catch(e){console.error("matchClips failed:",e);return secs}
  }
 async function handleSaveForged(status:"draft"|"complete"){
  const stageWords=(form.awarenessStage||"problem_aware").split("_").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join("")
  const hooksToSave=hookVariations.length>0&&selectedHooks.length>0?selectedHooks.map(i=>hookVariations[i]):null

  async function saveOneAd(secs:any[],hookNum?:number){
    const hookSuffix=hookNum!=null&&hookVariations.length>1?`_Hook${hookNum+1}`:""
    const baseAutoName=`${stageWords}_${form.contentType||"UGC"}_${(form.adLength||"30 seconds").replace(" seconds","s")}${hookSuffix}`
    const supabaseCheck=createClient()
    const{data:existingAds}=await supabaseCheck.from("forged_ads").select("title").ilike("title",`${baseAutoName}%`)
    let version=1
    if(existingAds&&existingAds.length>0){const versions=existingAds.map((a:any)=>{const m=a.title.match(/_v(\d+)$/);return m?parseInt(m[1]):1});version=Math.max(...versions)+1}
    const title=adTitle.trim()||`${baseAutoName}_v${version}`
    let finalVoiceoverUrl=voiceoverUrl
    if(voiceoverUrl&&voiceoverUrl.startsWith("blob:")){
      try{
        const blob=await fetch(voiceoverUrl).then(r=>r.blob())
        const file=new File([blob],"voiceover.mp3",{type:"audio/mpeg"})
        const fd=new FormData();fd.append("file",file)
        const res=await fetch("/api/voiceover/upload",{method:"POST",body:fd})
        const d=await res.json()
        if(d.url)finalVoiceoverUrl=d.url
      }catch(e){console.error("Voiceover upload failed:",e)}
    }
    const adData={title,status,mode:"script" as const,sections:secs,voiceover_url:finalVoiceoverUrl,voiceover_voice:voiceoverVoice,music_url:musicUrl,music_name:musicName,metadata:{...genMeta?.form,productName:genMeta?.productName,hookVariation:hookNum!=null?hookNum+1:null,aspectRatio}}
    const savedAd=await onSaveForgedAd(adData)
    if(savedAd?.id){
      fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:savedAd.id})}).catch(e=>console.error("Background render error:",e))
    }
    return savedAd
  }

  if(selectedHooks.length>1){
    for(let i=0;i<selectedHooks.length;i++){
      const hookSec=hookSections[i]||hookVariations[selectedHooks[i]]||sections
      await saveOneAd(hookSec,selectedHooks[i])
    }
  } else {
    await saveOneAd(sections)
  }

  setAdTitle("")
  onGoToForged()
}
async function generateHookVariations(){
  setGeneratingHooks(true)
  try{
    const bodyText=sections.filter((s:any)=>s.type!=="HOOK").map((s:any)=>s.spokenWords||"").join(" ")
    const prod=products.find((x:Product)=>String((x as any).id)===String(form.productId))||null
    const prompt=`Write 3 different HOOK variations for a direct response video ad.

Brand: ${brand.name||"Unknown"}
Product: ${prod?.name||"General"}
Ad body (stays the same): "${bodyText.substring(0,300)}"

Write 3 hooks using different angles:
1. Question hook — opens with a provocative question
2. Bold statement hook — opens with a surprising or bold claim
3. Pain point hook — opens by naming a specific customer pain

Return ONLY valid JSON:
{"hooks":[{"type":"Question","spokenWords":"exact hook words","visualDirection":"what is shown"}{"type":"Bold Statement","spokenWords":"exact hook words","visualDirection":"what is shown"},{"type":"Pain Point","spokenWords":"exact hook words","visualDirection":"what is shown"}]}`

    const raw=await callClaude([{role:"user",content:prompt}],600)
    const data=JSON.parse(raw.replace(/```json|```/g,"").trim())
    const hooks=data.hooks||[]
    // Build 3 complete section arrays — each with a different hook, same body
    const bodyBections=sections.filter((s:any)=>s.type!=="HOOK")
    const originalHook=sections.find((s:any)=>s.type==="HOOK")||sections[0]
    const originalVariation=[{...originalHook,hookType:"Original",voiceover_url:null},...bodyBections]
    const aiVariations=hooks.map((hook:any)=>[
      {...originalHook,spokenWords:hook.spokenWords,visualDirection:hook.visualDirection,hookType:hook.type,voiceover_url:null},
      ...bodyBections
    ])
    setHookVariations([originalVariation,...aiVariations])
  }catch(e){console.error(e);setHookError("Failed to generate hook variations — try again")}
  setGeneratingHooks(false)
}

  async function handleDeleteScript(id:string){const supabase=createClient();await supabase.from("scripts").delete().eq("id",id);onSaveScripts(scripts.filter((s:Script)=>s.id!==id));setView("list")}

  const reviewSteps=[{id:"script",label:"1. Script"},{id:"audio",label:"2. Audio"},{id:"clips",label:"3. Clip Matching"},{id:"forge",label:"4. Forge"}]

  // ── Choose Mode ──
    if(view==="chooseMode")return<div style={{maxWidth:760,margin:"0 auto",padding:60}}>
    <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:32,fontSize:14}}>← Back</button>
    <STitle size={24} mb={8}>Create New Ad</STitle>
    <div style={{color:C.muted,fontSize:15,marginBottom:40}}>How would you like to start?</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
      <div onClick={()=>setView("generate")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:12,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor=C.accent;(e.currentTarget as any).style.background=C.accentSoft}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>✍️</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Create from Script</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>AI writes a direct response script, matches clips from your library, you add voiceover and music.</div>
      </div>
      <div onClick={()=>setView("automash")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:12,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor="#7C3AED";(e.currentTarget as any).style.background="#7C3AED0a"}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>⚡</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Auto-Mash from Library</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>AI assembles a complete ad from your existing creator clips — using their real voices to tell a logical story.</div>
      </div>
      <div onClick={()=>setView("broll")} style={{background:C.card,border:"2px solid "+C.border,borderRadius:12,padding:28,cursor:"pointer",transition:"all 0.15s"}} onMouseOver={e=>{(e.currentTarget as any).style.borderColor=C.green;(e.currentTarget as any).style.background="#22c55e0a"}} onMouseOut={e=>{(e.currentTarget as any).style.borderColor=C.border;(e.currentTarget as any).style.background=C.card}}>
        <div style={{fontSize:36,marginBottom:12}}>🎬</div>
        <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Add B-Roll</div>
        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Upload a talking head or existing ad. AI keeps the original audio and suggests b-roll clips to overlay.</div>
      </div>
    </div>
  </div>

  if(view==="automash")return<AutoMashMode libraryItems={items} brand={brand} products={products} onSaveForgedAd={onSaveForgedAd} onGoToForged={onGoToForged} onBack={()=>setView("chooseMode")}/>
  if(view==="broll")return<BRollMode libraryItems={items} onSaveForgedAd={onSaveForgedAd} onBack={()=>setView("list")} workspaceId={workspaceId}/>

  if(view==="list")return<div style={{maxWidth:820,margin:"0 auto",padding:28}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <div><STitle size={22} mb={4}>Script Generator</STitle><div style={{color:C.muted,fontSize:14}}>AI direct response scripts powered by your brand data</div></div>
      <Btn onClick={()=>setView("chooseMode")} style={{background:C.accent,color:"#fff"}}>+ Create New Ad</Btn>
    </div>
    {scripts.length===0?<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>✍️</div><STitle mb={6}>No scripts yet</STitle><Btn onClick={()=>setView("chooseMode")} style={{background:C.accent,color:"#fff",marginTop:8}}>Create First Ad</Btn></Card>
    :<div style={{display:"grid",gap:12}}>{[...scripts].reverse().map((script:Script)=>{
      const m=script.metadata||{},stage=STAGES.find(s=>s.value===m.awarenessStage),sc2=STAGE_COLORS[m.awarenessStage]||C.accent
      const hook=(script.sections||[]).find((s:any)=>s.type==="HOOK")||(script.sections||[])[0]
      const assigned=(script.sections||[]).filter((s:any)=>!!s.selectedClipId).length
      return<Card key={script.id} style={{cursor:"pointer"}} onClick={()=>{setSelected(script);setSections(script.sections||[]);setGenMeta({form:script.metadata,productName:script.product_name});setView("detail")}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {script.product_name&&<Chip label={script.product_name} color={{bg:"#6c63ff22",color:"#a5b4fc"}}/>}
            {m.contentType&&<Chip label={m.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
            {stage&&<Chip label={stage.label} color={{bg:sc2+"22",color:sc2}}/>}
            {m.adLength&&<Chip label={m.adLength} color={{bg:"#92400e22",color:"#fbbf24"}}/>}
            {script.sections&&<Chip label={`${assigned}/${script.sections.length} clips`} color={{bg:assigned===script.sections.length?"#22c55e22":"#f59e0b22",color:assigned===script.sections.length?C.green:C.yellow}}/>}
          </div>
          <span style={{fontSize:11,color:C.muted}}>{script.created_at?new Date(script.created_at).toLocaleDateString():""}</span>
        </div>
        {hook&&<div style={{fontSize:13,color:C.muted,fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any}}>"{(hook.spokenWords||"").substring(0,200)}"</div>}
      </Card>
    })}</div>}
  </div>

  if(view==="generate")return<div style={{maxWidth:740,margin:"0 auto",padding:28}}>
    <button onClick={()=>setView("chooseMode")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back</button>
    <STitle size={22}>New Script</STitle>
    <Card style={{marginBottom:14}}><STitle size={14} mb={10}>Quick Request (optional)</STitle><Input textarea value={form.request} onChange={(e:any)=>setF("request",e.target.value)} placeholder={'"30s UGC ad for our serum targeting women with dry skin"'} rows={2}/></Card>
    <Card style={{marginBottom:14}}>
      <STitle size={14} mb={14}>Parameters</STitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:16}}>
        <div><Label>Product</Label><select value={form.productId} onChange={e=>setF("productId",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}><option value="">General</option>{products.map((x:Product)=><option key={(x as any).id} value={(x as any).id}>{x.name}</option>)}</select></div>
        <div><Label>Content Type</Label><select value={form.contentType} onChange={e=>setF("contentType",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}>{FORM_CTYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><Label>Ad Length</Label><select value={form.adLength} onChange={e=>setF("adLength",e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 11px",color:C.text,fontSize:13,outline:"none",width:"100%",cursor:"pointer"}}>{AD_LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
      </div>
      <Label>Market Awareness Stage</Label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{STAGES.map(s=>{const active=form.awarenessStage===s.value,sc2=STAGE_COLORS[s.value]||C.accent;return<div key={s.value} onClick={()=>setF("awarenessStage",s.value)} style={{background:active?sc2+"22":C.surface,border:"2px solid "+(active?sc2:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:13,color:active?sc2:C.text,marginBottom:2}}>{s.label}</div><div style={{fontSize:11,color:C.muted}}>{s.desc}</div></div>})}</div>
    </Card>
    <Card style={{marginBottom:14}}>
      <STitle size={14} mb={6}>Customer Avatar</STitle>
      {savedAvatars.length>0&&<div style={{marginBottom:12}}><Label>Use a saved avatar</Label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{savedAvatars.map((av:CustomerAvatar)=><button key={av.id} onClick={()=>{setF("useAvatarId",av.id);setF("customerAvatar",av.description);setF("painPoints",av.pains);setF("desires",av.desires);setF("objections",av.objections)}} style={{background:form.useAvatarId===av.id?C.accentSoft:C.surface,border:"1px solid "+(form.useAvatarId===av.id?C.accent:C.border),borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,color:form.useAvatarId===av.id?C.accent:C.text}}>{av.name}</button>)}</div></div>}
      <div style={{marginBottom:12}}><Label>Who is this customer?</Label><Input textarea value={form.customerAvatar} onChange={(e:any)=>setF("customerAvatar",e.target.value)} placeholder="e.g. Sarah, 34, busy mum, tried every moisturiser" rows={2}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:12}}>
        <div><Label>Pain Points</Label><Input textarea value={form.painPoints} onChange={(e:any)=>setF("painPoints",e.target.value)} rows={3}/></div>
        <div><Label>Desires</Label><Input textarea value={form.desires} onChange={(e:any)=>setF("desires",e.target.value)} rows={3}/></div>
      </div>
      <Label>Objections</Label><Input textarea value={form.objections} onChange={(e:any)=>setF("objections",e.target.value)} rows={2}/>
    </Card>
    {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:12}}>{error}</div>}
    {(forgedAds||[]).filter((a:ForgedAd)=>a.metadata?.hook_rate||a.metadata?.cpa||a.metadata?.roas||a.star_rating).length>=2&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#15803D",marginBottom:12}}>📈 Using performance data from {(forgedAds||[]).filter((a:ForgedAd)=>a.metadata?.hook_rate||a.metadata?.cpa||a.star_rating).length} ads to improve this script</div>}
    {brand.brand_intelligence?.best_hook_types?.length>0&&<div style={{background:C.accentSoft,border:"1px solid "+C.accent+"33",borderRadius:10,padding:"8px 14px",fontSize:12,color:C.accent,marginBottom:12}}>🧠 Applying brand learnings: best hooks are {brand.brand_intelligence.best_hook_types.slice(0,2).join(", ")}</div>}
    <Btn onClick={handleGen} disabled={generating} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:16,borderRadius:12}}>{generating?"⏳ Writing script & matching clips…":"✨ Generate Script"}</Btn>
  </div>

  if(view==="review"){
    const autoCount=sections.filter(s=>s.autoSelected).length
    return<div style={{padding:0}}>
      <AdWorkspace
        sections={sections}
        setSections={setSections}
        hookVariations={hookVariations}
        selectedHooks={selectedHooks}
        setSelectedHooks={setSelectedHooks}
        activeHookIdx={activeHookIdx}
        setActiveHookIdx={setActiveHookIdx}
        hookSections={hookSections}
        setHookSections={setHookSections}
        voiceoverUrl={voiceoverUrl}
        setVoiceoverUrl={setVoiceoverUrl}
        voiceoverVoice={voiceoverVoice}
        setVoiceoverVoice={setVoiceoverVoice}
        musicUrl={musicUrl}
        setMusicUrl={setMusicUrl}
        musicName={musicName}
        setMusicName={setMusicName}
        captionSettings={captionSettings}
        setCaptionSettings={setCaptionSettings}
        adTitle={adTitle}
        setAdTitle={setAdTitle}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        suggestedMood={suggestedMood}
        items={items}
        brand={brand}
        genMeta={genMeta}
        onSave={handleSaveForged}
        onBack={()=>setView("generate")}
        onMatchClips={async()=>{setMatching(true);const u=await(async()=>{try{return await matchClips(sections,items,!!voiceoverUrl)}catch{return sections}})();setSections(u);setHookSections(prev=>({...prev,[activeHookIdx]:u}));setMatching(false)}}
        onGenerateHooks={generateHookVariations}
        generating={generating}
        matching={matching}
        generatingHooks={generatingHooks}
        hookError={hookError}
        workspaceId={workspaceId}
        isV2={genMeta?.isV2}
        autoCount={autoCount}
        form={form}
      />
    </div>
  }

  if(view==="detail"&&selected){
    const m=selected.metadata||{},stg=STAGES.find(s=>s.value===m.awarenessStage),stgC=STAGE_COLORS[m.awarenessStage]||C.accent
    const disp=sections.length>0?sections:(selected.sections||[])
    const assigned=disp.filter((s:any)=>!!s.selectedClipId).length
    return<div style={{padding:28}}>
      <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to Scripts</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
            {selected.product_name&&<Chip label={selected.product_name} color={{bg:"#6c63ff22",color:"#a5b4fc"}}/>}
            {m.contentType&&<Chip label={m.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
            {stg&&<Chip label={stg.label} color={{bg:stgC+"22",color:stgC}}/>}
            <Chip label={`${assigned}/${disp.length} clips`} color={{bg:assigned===disp.length?"#22c55e22":"#f59e0b22",color:assigned===disp.length?C.green:C.yellow}}/>
          </div>
          <div style={{fontSize:13,color:C.muted}}>Saved {selected.created_at?new Date(selected.created_at).toLocaleDateString():""}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>{setSections(disp);setView("review");setStep("script")}} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44"}}>Edit Script</Btn>
          <Btn onClick={async()=>{
            const fresh=disp.map((s:any)=>({...s,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
            const matched=items.length>0?await matchClips(fresh,items,!!voiceoverUrl):fresh
            setSections(matched);setView("review");setStep("audio")
          }} style={{background:C.green+"22",color:C.green,border:"1px solid "+C.green+"44"}}>↺ Reuse Script</Btn>
          <Btn onClick={()=>handleDeleteScript(selected.id!)} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433"}}>Delete</Btn>
        </div>
      </div>
      <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
        <ScriptTable sections={disp} onChange={setSections} libraryItems={items} readOnly={false} brandName={brand.name} productName={selected.product_name}/>
      </Card>
      <StitchedPreview sections={disp} libraryItems={items}/>
    </div>
  }
  return null
}
