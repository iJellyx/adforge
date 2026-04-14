'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Item, ForgedAd, BrandProfile } from '../types'
import { C, STAGES, STAGE_COLORS } from '../constants'
import { muxThumb, secColor, gradeColor } from '../utils'
import { Btn, Label, Card, STitle, Chip } from '../ui-primitives'
import { StitchedPreview } from '../StitchedPreview'
import { ScorePanel } from '../ScorePanel'
import { ExportVideo } from '../ExportVideo'
import { ArrowDown, Play, Check, Clock, AlertTriangle, X, Search, Star, Copy, Pencil, Zap, Trash2, Film, BarChart3 } from 'lucide-react'

function ForgedAdDownload({ad,onRefresh}:{ad:ForgedAd,onRefresh:()=>void}){
  const [checking,setChecking]=useState(false)
  const [downloading,setDownloading]=useState(false)
  const [msg,setMsg]=useState("")

  useEffect(()=>{
    if(ad.render_status==="rendering")checkStatus()
  },[])

  async function checkStatus(){
    setChecking(true)
    try{
      const res=await fetch("/api/export/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      const data=await res.json()
      if(data.status==="ready"||data.status==="rendering"||data.status==="failed"){
        onRefresh()
      }
    }catch(e){console.error(e)}
    setChecking(false)
  }

  async function startRender(){
    setMsg("Starting render...")
    try{
      await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      onRefresh()
      setMsg("Rendering started — check back in 1-2 mins")
    }catch(e:any){setMsg("Error: "+e.message)}
  }

  async function downloadMp4(){
    if(!ad.render_url)return
    setDownloading(true);setMsg("Downloading...")
    try{
      const res=await fetch(ad.render_url)
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=url
      a.download=`${ad.title||"adforge-ad"}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(url),15000)
      setMsg("Downloaded!")
    }catch(e:any){setMsg("Download failed: "+e.message)}
    setDownloading(false)
  }

  const renderStatus=ad.render_status||"pending"

  return(
    <div className="bg-card border border-border rounded-lg p-5 mt-4">
      <div className="font-bold text-base mb-1 flex items-center gap-2"><ArrowDown className="w-4 h-4" /> Download MP4</div>

      {renderStatus==="pending"&&<div>
        <div className="text-sm text-text-muted mb-3">Render not started yet.</div>
        <Btn onClick={startRender} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:12}}>{msg||"Start Rendering"}</Btn>
      </div>}

      {renderStatus==="rendering"&&<div>
        <div className="bg-warning-soft border border-warning/20 rounded-lg px-3.5 py-2.5 text-sm text-warning mb-3 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Rendering in progress — usually takes 1-2 minutes.</div>
        <div className="flex gap-2.5">
          <Btn onClick={checkStatus} disabled={checking} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",flex:1}}>{checking?"Checking...":"Check Status"}</Btn>
        </div>
        {msg&&<div className="text-xs text-text-muted mt-2">{msg}</div>}
      </div>}

      {renderStatus==="ready"&&<div>
        <div className="bg-success-soft border border-success/20 rounded-lg px-3.5 py-2.5 text-sm text-success mb-3 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Your MP4 is ready to download!</div>
        <Btn onClick={downloadMp4} disabled={downloading} style={{background:"var(--color-success)",color:"#000",fontWeight:700,width:"100%",padding:14,fontSize:15,borderRadius:12}}>{downloading?"Downloading...":"Download MP4"}</Btn>
        {msg&&<div className={`text-xs mt-2 font-semibold ${msg.includes("Downloaded")?"text-success":"text-danger"}`}>{msg}</div>}
      </div>}

      {renderStatus==="failed"&&<div>
        <div className="bg-danger-soft border border-danger/20 rounded-lg px-3.5 py-2.5 text-sm text-danger mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Render failed. Try again.</div>
        <Btn onClick={startRender} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:12}}>Retry Render</Btn>
      </div>}
    </div>
  )
}

// ── Forged Ad Card ────────────────────────────────────────────────────────
function ForgedAdCard({ad,items,onOpen,onRefresh,selectMode,isSelected,onToggleSelect,onDuplicate}:{ad:ForgedAd,items:Item[],onOpen:()=>void,onRefresh:()=>void,selectMode:boolean,isSelected:boolean,onToggleSelect:()=>void,onDuplicate?:()=>void}){
  const supabase=createClient()
  const [hovered,setHovered]=useState(false)
  const [thumbIdx,setThumbIdx]=useState(0)
  const [downloading,setDownloading]=useState(false)
  const [rating,setRating]=useState(ad.star_rating||0)
  const [hoverRating,setHoverRating]=useState(0)
  const intervalRef=useRef<any>(null)

  const clips=(ad.sections||[]).map((s:any)=>{
    const item=s.selectedClipId?items.find((i:Item)=>i.id===s.selectedClipId):null
    return item?.mux_playback_id?item:null
  }).filter(Boolean)

  const firstClip=clips[0]

  useEffect(()=>{
    if(hovered&&clips.length>1){
      intervalRef.current=setInterval(()=>setThumbIdx(i=>(i+1)%clips.length),800)
    } else {
      clearInterval(intervalRef.current);setThumbIdx(0)
    }
    return()=>clearInterval(intervalRef.current)
  },[hovered,clips.length])

  const currentClip=clips[thumbIdx]||firstClip
  const currentThumb=currentClip?.mux_playback_id?muxThumb(currentClip.mux_playback_id,currentClip.thumbnail_time||0):null

  const renderStatus=(ad as any).render_status||"pending"
  const renderBadge=renderStatus==="ready"?{cls:"bg-success-soft text-success border-success/30",label:"Ready"}:renderStatus==="rendering"?{cls:"bg-warning-soft text-warning border-warning/30",label:"Rendering"}:renderStatus==="failed"?{cls:"bg-danger-soft text-danger border-danger/30",label:"Failed"}:{cls:"bg-white/10 text-text-muted border-white/10",label:"Pending"}

  async function quickDownload(e:React.MouseEvent){
    e.stopPropagation()
    if(!(ad as any).render_url){onOpen();return}
    setDownloading(true)
    try{
      const res=await fetch((ad as any).render_url)
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a");a.href=url;a.download=`${ad.title||"ad"}.mp4`;a.click()
      setTimeout(()=>URL.revokeObjectURL(url),15000)
    }catch(e){onOpen()}
    setDownloading(false)
  }

  async function saveRating(r:number){
    setRating(r)
    await supabase.from("forged_ads").update({star_rating:r}).eq("id",ad.id)
  }

  const stage=STAGES.find(s=>s.value===ad.metadata?.awarenessStage)
  const stageColor=STAGE_COLORS[ad.metadata?.awarenessStage||""]||C.accent

  function handleClick(){if(selectMode)onToggleSelect();else onOpen()}

  return(
    <div
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      onClick={handleClick}
      className={`bg-card border-2 rounded-lg overflow-hidden cursor-pointer transition-all duration-150 flex flex-col relative hover:shadow-glow ${
        isSelected?"border-accent":hovered?"border-accent":"border-border hover:border-border-strong"
      } ${hovered&&!selectMode?"-translate-y-0.5":""}`}
    >
      {/* Select checkbox */}
      {selectMode&&<div className={`absolute top-2 left-2 z-20 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center ${isSelected?"bg-accent border-white":"bg-black/40 border-white/30"}`}>
        {isSelected&&<Check className="w-3 h-3 text-white" />}
      </div>}

      {/* Thumbnail */}
      <div className="relative pt-[177.78%] bg-[#111] overflow-hidden shrink-0">
        {currentThumb&&<img src={currentThumb} alt="" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"/>}

        {hovered&&!selectMode&&<div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/40 border-2 border-white/30 flex items-center justify-center"><Play className="w-5 h-5 text-white" /></div>
        </div>}

        {clips.length>1&&hovered&&<div className="absolute bottom-10 left-2 right-2 flex gap-0.5">
          {clips.map((_:any,i:number)=><div key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${i===thumbIdx?"bg-white":"bg-white/30"}`}/>)}
        </div>}

        {/* Render status */}
        <div className={`absolute top-2 right-2 ${renderBadge.cls} text-[9px] font-bold px-[7px] py-0.5 rounded-full backdrop-blur-sm border`} style={selectMode?{right:8}:renderStatus==="ready"?{right:40}:undefined}>
          {renderBadge.label}
        </div>

        {renderStatus==="ready"&&!selectMode&&<button onClick={quickDownload} disabled={downloading} className="absolute top-2 right-2 bg-black/40 border border-white/20 text-white rounded-lg px-2 py-1.5 cursor-pointer text-sm backdrop-blur-sm hover:bg-black/60 transition-colors">
          {downloading?"...":""}
          <ArrowDown className="w-3.5 h-3.5" />
        </button>}

        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap max-w-[calc(100%-16px)]">
          {ad.metadata?.contentType&&<span className="bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">{ad.metadata.contentType}</span>}
          {stage&&<span className="text-white text-[8px] font-bold px-1.5 py-0.5 rounded" style={{background:stageColor+"dd"}}>{stage.label}</span>}
        </div>

        <div className="absolute bottom-2 right-2 flex gap-1">
          {ad.voiceover_url&&<span className="bg-black/60 text-[10px] px-1 py-0.5 rounded">🎙️</span>}
          {ad.music_url&&<span className="bg-black/60 text-[10px] px-1 py-0.5 rounded">🎵</span>}
        </div>
      </div>

      {/* Card body */}
      <div className="px-3 py-2.5 flex-1 flex flex-col gap-1.5">
        <div className="flex justify-between items-start gap-1.5">
          <div className="font-bold text-xs leading-tight overflow-hidden line-clamp-2 flex-1">{ad.title}</div>
          {ad.metadata?.grade&&<div className="shrink-0 text-[11px] font-extrabold px-[7px] py-0.5 rounded-md leading-snug border" style={{background:gradeColor(ad.metadata.grade).bg,color:gradeColor(ad.metadata.grade).text,borderColor:gradeColor(ad.metadata.grade).text+"33"}} title={`Clip-Script Match: ${ad.metadata.score||0}/100`}>{ad.metadata.grade}</div>}
        </div>
        <div className="flex gap-0.5" onMouseLeave={()=>setHoverRating(0)}>
          {[1,2,3,4,5].map(star=><span key={star} onMouseEnter={e=>{e.stopPropagation();setHoverRating(star)}} onClick={e=>{e.stopPropagation();saveRating(star)}} className={`cursor-pointer text-sm transition-colors ${(hoverRating||rating)>=star?"text-warning":"text-black/15"}`}><Star className="w-3.5 h-3.5" fill={(hoverRating||rating)>=star?"currentColor":"none"} /></span>)}
        </div>
        <div className="text-[10px] text-text-muted">{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.metadata?.adLength?` · ${ad.metadata.adLength}`:""}</div>
        {(ad as any).notes&&<div className="text-[10px] text-text-muted italic overflow-hidden whitespace-nowrap text-ellipsis">{(ad as any).notes}</div>}
        {onDuplicate&&!selectMode&&<button onClick={e=>{e.stopPropagation();onDuplicate()}} className="mt-1 w-full bg-accent-soft text-accent border border-accent/20 rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-accent-muted transition-colors flex items-center justify-center gap-1"><Copy className="w-3 h-3" /> Duplicate</button>}
      </div>
    </div>
  )
}

export function ForgedAdsTab({ads,items,brand,setBrand,onRefresh,onEditAd,onCreateV2}:{ads:ForgedAd[],items:Item[],brand:BrandProfile,setBrand:(b:BrandProfile)=>void,onRefresh:()=>void,onEditAd:(ad:ForgedAd)=>void,onCreateV2:(ad:ForgedAd)=>void}){
  const supabase=createClient()
  const [previewId,setPreviewId]=useState<string|null>(null)
  const [search,setSearch]=useState("")
  const [activeTag,setActiveTag]=useState<string|null>(null)
  const [renderFilter,setRenderFilter]=useState<string|null>(null)
  const [expandedStages,setExpandedStages]=useState<Record<string,boolean>>({})
  const [editingNotes,setEditingNotes]=useState<string|null>(null)
  const [notesVal,setNotesVal]=useState("")
  const [selectMode,setSelectMode]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [deleting,setDeleting]=useState(false)
  const [autoRendering,setAutoRendering]=useState(false)
  const [perfOpen,setPerfOpen]=useState(false)
  const [perfVals,setPerfVals]=useState<Record<string,string>>({})
  const [perfSaving,setPerfSaving]=useState(false)
  const pollRef=useRef<any>(null)

  const previewAd=previewId?ads.find(a=>a.id===previewId):null

  useEffect(()=>{
    if(previewAd){setPerfVals({hook_rate:previewAd.metadata?.hook_rate||"",cpa:previewAd.metadata?.cpa||"",roas:previewAd.metadata?.roas||"",spend:previewAd.metadata?.spend||""});setPerfOpen(false)}
  },[previewId])

  async function updateBrandIntelligence(updatedAds:ForgedAd[]){
    const adsWithData=updatedAds.filter(a=>a.metadata?.hook_rate||a.metadata?.cpa||a.metadata?.roas||a.star_rating)
    if(adsWithData.length<2)return
    const avg=(arr:number[])=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10:0
    const hookPerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const hook=(a.sections||[]).find((s:any)=>s.type==="HOOK");const hookType=hook?.hookType||"Unknown";const rate=parseFloat(a.metadata?.hook_rate||"0");if(rate>0){if(!hookPerf[hookType])hookPerf[hookType]=[];hookPerf[hookType].push(rate)}})
    const hookEntries=Object.entries(hookPerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(b[1])-avg(a[1]))
    const best_hook_types=hookEntries.filter(([,v])=>avg(v)>=40).map(([k])=>k)
    const worst_hook_types=hookEntries.filter(([,v])=>avg(v)<30).map(([k])=>k)
    const topAds=adsWithData.filter(a=>parseFloat(a.metadata?.hook_rate||"0")>=45||(a.star_rating||0)>=4)
    const best_hook_patterns:string[]=[]
    topAds.forEach(a=>{const hook=(a.sections||[]).find((s:any)=>s.type==="HOOK");const words=(hook?.spokenWords||"").trim();if(!words)return;if(/^\d/.test(words.split(" ")[0]))best_hook_patterns.push("Opens with a number");if(/I |My |We /.test(words.substring(0,20)))best_hook_patterns.push("First-person opening");if(words.split(" ").length<=6)best_hook_patterns.push("Short punchy hook (under 7 words)");if(/\?$/.test(words.trim()))best_hook_patterns.push("Ends with a question");if(/stop|wait|don't|never/i.test(words.substring(0,30)))best_hook_patterns.push("Pattern interrupt / negative opener")})
    const ctypePerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const ct=a.metadata?.contentType||"Unknown";const cpa=parseFloat(a.metadata?.cpa||"0");if(cpa>0){if(!ctypePerf[ct])ctypePerf[ct]=[];ctypePerf[ct].push(cpa)}})
    const ctypeEntries=Object.entries(ctypePerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(a[1])-avg(b[1]))
    const best_content_type=ctypeEntries[0]?.[0]||""
    const hookLengths=topAds.map(a=>{const h=(a.sections||[]).find((s:any)=>s.type==="HOOK");return(h?.spokenWords||"").trim().split(/\s+/).filter(Boolean).length}).filter(l=>l>0)
    const avg_winning_hook_length=hookLengths.length?Math.round(hookLengths.reduce((a,b)=>a+b,0)/hookLengths.length):0
    const sectionCounts=topAds.map(a=>(a.sections||[]).length).filter(n=>n>0)
    const avg_section_count=sectionCounts.length?Math.round(avg(sectionCounts)):0
    const winningStructures=topAds.map(a=>(a.sections||[]).map((s:any)=>s.type).join(" > ")).filter(Boolean)
    const structureCounts:Record<string,number>={}
    winningStructures.forEach(s=>{structureCounts[s]=(structureCounts[s]||0)+1})
    const best_structures=Object.entries(structureCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s)
    const lengthPerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const len=a.metadata?.adLength||"Unknown";const rate=parseFloat(a.metadata?.hook_rate||"0");if(rate>0){if(!lengthPerf[len])lengthPerf[len]=[];lengthPerf[len].push(rate)}})
    const lengthEntries=Object.entries(lengthPerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(b[1])-avg(a[1]))
    const best_ad_length=lengthEntries[0]?.[0]||""
    const stagePerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const st=a.metadata?.awarenessStage||"Unknown";const rate=parseFloat(a.metadata?.hook_rate||"0");if(rate>0){if(!stagePerf[st])stagePerf[st]=[];stagePerf[st].push(rate)}})
    const stageEntries=Object.entries(stagePerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(b[1])-avg(a[1]))
    const best_awareness_stage=stageEntries[0]?.[0]||""
    const intel={best_hook_types,worst_hook_types,best_hook_patterns:[...new Set(best_hook_patterns)],best_content_type,avg_winning_hook_length,best_ad_length,best_awareness_stage,avg_section_count,best_structures,total_ads_analysed:adsWithData.length,last_updated:new Date().toISOString()}
    const updated={...brand,brand_intelligence:intel}
    setBrand(updated)
    if(brand.id)await supabase.from("brand_profile").update({brand_intelligence:intel}).eq("id",brand.id)
  }

  async function savePerf(){
    if(!previewAd)return
    setPerfSaving(true)
    const newMeta={...previewAd.metadata,...perfVals}
    await supabase.from("forged_ads").update({metadata:newMeta}).eq("id",previewAd.id)
    const updatedAds=ads.map(a=>a.id===previewAd.id?{...a,metadata:newMeta}:a)
    await updateBrandIntelligence(updatedAds)
    setPerfSaving(false);onRefresh();setPerfOpen(false)
  }

  useEffect(()=>{
    async function pollRenderStatus(){
      const rendering=ads.filter(a=>(a as any).render_status==="rendering")
      if(rendering.length===0)return
      for(const ad of rendering){
        try{
          const res=await fetch("/api/export/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
          const data=await res.json()
          if(data.status==="ready"||data.status==="failed"){onRefresh();break}
        }catch(e){}
      }
    }
    pollRenderStatus()
    pollRef.current=setInterval(pollRenderStatus,15000)
    return()=>clearInterval(pollRef.current)
  },[ads.map(a=>(a as any).render_status).join(",")])

  async function deleteAd(id:string){await supabase.from("forged_ads").delete().eq("id",id);onRefresh()}
  async function markComplete(id:string){await supabase.from("forged_ads").update({status:"complete",updated_at:new Date().toISOString()}).eq("id",id);onRefresh()}
  async function saveNotes(id:string){await supabase.from("forged_ads").update({notes:notesVal}).eq("id",id);setEditingNotes(null);onRefresh()}

  async function bulkDelete(){
    if(!selectedIds.length)return
    setDeleting(true)
    for(const id of selectedIds){await supabase.from("forged_ads").delete().eq("id",id)}
    setSelectedIds([]);setSelectMode(false);setDeleting(false);onRefresh()
  }

  async function autoRenderAll(){
    setAutoRendering(true)
    const pending=ads.filter(a=>(a as any).render_status==="pending"||(a as any).render_status==="failed"||!(a as any).render_status)
    for(const ad of pending){
      try{await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})}catch(e){}
    }
    onRefresh();setAutoRendering(false)
  }

  const filtered=ads.filter(ad=>{
    if(renderFilter&&(ad as any).render_status!==renderFilter)return false
    if(search.trim()){const q=search.toLowerCase();if(![ad.title,ad.metadata?.contentType,ad.metadata?.productName,ad.metadata?.awarenessStage,(ad as any).notes].some((f:any)=>f&&String(f).toLowerCase().includes(q)))return false}
    if(activeTag){if(![ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName].some((f:any)=>f&&f===activeTag))return false}
    return true
  })

  const stageOrder=["problem_aware","unaware","solution_aware","product_aware","most_aware",""]
  const stageGroups:Record<string,ForgedAd[]>={}
  filtered.forEach(ad=>{const s=ad.metadata?.awarenessStage||"";if(!stageGroups[s])stageGroups[s]=[];stageGroups[s].push(ad)})
  const allStages=[...stageOrder.filter(s=>stageGroups[s]?.length>0),...Object.keys(stageGroups).filter(s=>!stageOrder.includes(s)&&stageGroups[s]?.length>0)]

  function toggleStage(s:string){setExpandedStages(prev=>({...prev,[s]:prev[s]===false?true:false}))}
  function isExpanded(s:string){return expandedStages[s]!==false}

  const totalReady=ads.filter(a=>(a as any).render_status==="ready").length
  const totalRendering=ads.filter(a=>(a as any).render_status==="rendering").length
  const totalPending=ads.filter(a=>(a as any).render_status==="pending"||!(a as any).render_status||(a as any).render_status==="failed").length
  const allFilteredIds=filtered.map(a=>a.id)

  return(
    <div className="p-7 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <STitle size={24} mb={4}><Zap className="w-5 h-5 inline" /> Forged Ads</STitle>
          <div className="text-sm text-text-muted">Your complete video ad library — organised by awareness stage</div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {totalPending>0&&<Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",fontSize:12,padding:"7px 14px"}}>{autoRendering?"Rendering...":(<><Film className="w-3.5 h-3.5 inline"/> Render All ({totalPending})</>)}</Btn>}
          {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"7px 14px"}}>Select</Btn>}
          {selectMode&&<>
            <Btn onClick={()=>{setSelectedIds(allFilteredIds)}} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",fontSize:12,padding:"7px 14px"}}>Select All ({filtered.length})</Btn>
            <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"rgba(239,68,68,0.2)":"var(--color-border)",color:selectedIds.length>0?"var(--color-danger)":"var(--color-text-muted)",border:"1px solid "+(selectedIds.length>0?"rgba(239,68,68,0.4)":"var(--color-border)"),fontSize:12,padding:"7px 14px"}}><Trash2 className="w-3 h-3 inline"/> Delete ({selectedIds.length})</Btn>
            <Btn onClick={()=>{setSelectMode(false);setSelectedIds([])}} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"7px 14px"}}>Cancel</Btn>
          </>}
        </div>
      </div>

      {/* Search + filter row */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ads by name, product, stage..." className="flex-1 min-w-[220px] bg-surface border border-border rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent transition-colors"/>
        <button onClick={()=>setRenderFilter(renderFilter==="ready"?null:"ready")} className={`rounded-lg px-3.5 py-[7px] cursor-pointer text-xs font-semibold border transition-colors ${renderFilter==="ready"?"bg-success-soft border-success text-success":"bg-surface border-border text-text-muted hover:border-border-strong"}`}><Check className="w-3 h-3 inline" /> Ready ({totalReady})</button>
        <button onClick={()=>setRenderFilter(renderFilter==="rendering"?null:"rendering")} className={`rounded-lg px-3.5 py-[7px] cursor-pointer text-xs font-semibold border transition-colors ${renderFilter==="rendering"?"bg-warning-soft border-warning text-warning":"bg-surface border-border text-text-muted hover:border-border-strong"}`}><Clock className="w-3 h-3 inline" /> Rendering ({totalRendering})</button>
        {(activeTag||renderFilter||search)&&<button onClick={()=>{setActiveTag(null);setRenderFilter(null);setSearch("")}} className="bg-transparent border-none text-text-muted cursor-pointer text-xs underline">Clear filters</button>}
      </div>

      {/* Tag cloud */}
      {ads.length>0&&<div className="flex gap-1.5 flex-wrap mb-5">
        {[...new Set(ads.flatMap(ad=>[ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName&&ad.metadata.productName!=="General"?ad.metadata.productName:null].filter(Boolean)))].map((tag:any)=><button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)} className={`rounded-full px-3 py-1 cursor-pointer text-[11px] font-semibold border transition-colors ${activeTag===tag?"bg-accent text-white border-accent":"bg-surface text-text-muted border-border hover:border-border-strong"}`}>{tag}</button>)}
      </div>}

      {/* Preview modal */}
      {previewAd&&<div onClick={()=>setPreviewId(null)} className="fixed inset-0 bg-black/90 z-[300] flex items-start justify-center p-5 overflow-y-auto">
        <div onClick={e=>e.stopPropagation()} className="bg-surface border border-border rounded-xl p-6 max-w-[900px] w-full mt-5 animate-scale-in">
          <div className="flex justify-between items-start mb-5 gap-4">
            <div className="flex-1">
              <div className="font-bold text-lg mb-1.5">{previewAd.title}</div>
              <div className="flex gap-2 flex-wrap items-center mb-2">
                <span className={`rounded-full text-[10px] font-bold px-[7px] py-px border ${previewAd.status==="complete"?"bg-success-soft border-success/30 text-success":"bg-warning-soft border-warning/30 text-warning"}`}>{previewAd.status==="complete"?"Complete":"Draft"}</span>
                {previewAd.mode==="broll"&&<Chip label="B-Roll" color={{bg:"#22c55e22",color:"var(--color-success)"}}/>}
                {previewAd.metadata?.contentType&&<Chip label={previewAd.metadata.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
                {previewAd.metadata?.awarenessStage&&<Chip label={STAGES.find(s=>s.value===previewAd.metadata?.awarenessStage)?.label||previewAd.metadata.awarenessStage} color={{bg:STAGE_COLORS[previewAd.metadata.awarenessStage]+"22",color:STAGE_COLORS[previewAd.metadata.awarenessStage]}}/>}
                {previewAd.created_at&&<span className="text-[11px] text-text-muted">Created {new Date(previewAd.created_at).toLocaleDateString()}</span>}
              </div>
              {editingNotes===previewAd.id
                ?<div className="flex gap-2 mt-2">
                  <input value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Add internal notes..." autoFocus className="flex-1 bg-surface border border-accent rounded-lg px-2.5 py-1.5 text-text text-sm outline-none"/>
                  <Btn onClick={()=>saveNotes(previewAd.id)} style={{background:"var(--color-success)",color:"#000",fontWeight:700,padding:"6px 12px",fontSize:12}}>Save</Btn>
                  <Btn onClick={()=>setEditingNotes(null)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",padding:"6px 12px",fontSize:12}}>Cancel</Btn>
                </div>
                :<div onClick={()=>{setEditingNotes(previewAd.id);setNotesVal((previewAd as any).notes||"")}} className={`text-xs cursor-pointer mt-1.5 underline ${(previewAd as any).notes?"text-text-muted":"text-accent"}`}>
                  {(previewAd as any).notes?`${(previewAd as any).notes}`:"+ Add notes"}
                </div>}
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              {previewAd.mode!=="broll"&&<Btn onClick={()=>{onEditAd(previewAd);setPreviewId(null)}} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",fontSize:12,padding:"6px 12px"}}><Pencil className="w-3 h-3 inline"/> Edit</Btn>}
              {previewAd.mode!=="broll"&&<Btn onClick={()=>{onCreateV2(previewAd);setPreviewId(null)}} style={{background:"rgba(34,197,94,0.08)",color:"var(--color-success)",border:"1px solid rgba(34,197,94,0.27)",fontSize:12,padding:"6px 12px"}}><Zap className="w-3 h-3 inline"/> v2</Btn>}
              {previewAd.status==="draft"&&<Btn onClick={()=>{markComplete(previewAd.id);setPreviewId(null)}} style={{background:"rgba(34,197,94,0.13)",color:"var(--color-success)",border:"1px solid rgba(34,197,94,0.27)",fontSize:12,padding:"6px 12px"}}>Mark Complete</Btn>}
              <Btn onClick={()=>{deleteAd(previewAd.id);setPreviewId(null)}} style={{background:"rgba(239,68,68,0.13)",color:"var(--color-danger)",border:"1px solid rgba(239,68,68,0.2)",fontSize:12,padding:"6px 12px"}}><Trash2 className="w-3 h-3 inline"/> Delete</Btn>
              <Btn onClick={()=>setPreviewId(null)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",padding:"5px 12px"}}><X className="w-3.5 h-3.5"/></Btn>
            </div>
          </div>
          {previewAd.sections&&previewAd.sections.length>0&&<div className="mb-5"><StitchedPreview sections={previewAd.sections} libraryItems={items} voiceoverUrl={previewAd.voiceover_url} musicUrl={previewAd.music_url}/></div>}
          <div className="flex gap-3 flex-wrap mb-4">
            {previewAd.voiceover_url&&<div className="flex-1 min-w-[200px]"><div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Voiceover · {previewAd.voiceover_voice}</div><audio src={previewAd.voiceover_url} controls className="w-full h-9"/></div>}
            {previewAd.music_url&&<div className="flex-1 min-w-[200px]"><div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Music · {previewAd.music_name}</div><audio src={previewAd.music_url} controls className="w-full h-9"/></div>}
          </div>
          {/* Performance logging */}
          <div className="mb-4">
            {!perfOpen
              ?<button onClick={()=>setPerfOpen(true)} className="bg-surface border border-border text-text-muted rounded-lg px-3.5 py-1.5 cursor-pointer text-xs w-full text-left hover:border-border-strong transition-colors flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> {previewAd.metadata?.hook_rate?`Hook rate: ${previewAd.metadata.hook_rate}%${previewAd.metadata?.cpa?` · CPA: £${previewAd.metadata.cpa}`:""}${previewAd.metadata?.roas?` · ROAS: ${previewAd.metadata.roas}x`:""}`:"Log performance data"}
              </button>
              :<div className="bg-bg border border-border rounded-lg p-3.5">
                <div className="font-bold text-sm mb-2.5 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Log Performance Data</div>
                <div className="grid grid-cols-2 gap-2.5 mb-3">
                  {([["Hook Rate %","hook_rate","e.g. 42"],["CPA ($)","cpa","e.g. 18"],["ROAS","roas","e.g. 3.2"],["Spend ($)","spend","e.g. 500"]] as [string,string,string][]).map(([label,key,ph])=>
                    <div key={key}><Label>{label}</Label><input value={perfVals[key]||""} onChange={e=>setPerfVals(v=>({...v,[key]:e.target.value}))} placeholder={ph} className="bg-surface border border-border rounded-lg px-2.5 py-[7px] text-text text-sm outline-none w-full"/></div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Btn onClick={savePerf} disabled={perfSaving} style={{background:"var(--color-accent)",color:"#fff",flex:1}}>{perfSaving?"Saving...":"Save + Update Intelligence"}</Btn>
                  <Btn onClick={()=>setPerfOpen(false)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)"}}>Cancel</Btn>
                </div>
              </div>}
          </div>
          <ScorePanel ad={previewAd} onScored={(scored)=>{onRefresh()}}/>
          <ForgedAdDownload ad={previewAd} onRefresh={onRefresh}/>
        </div>
      </div>}

      {/* Empty state */}
      {ads.length===0&&<Card style={{textAlign:"center",padding:60}}><Zap className="w-10 h-10 mx-auto mb-3 text-text-muted" /><STitle mb={6}>No forged ads yet</STitle><div className="text-text-muted text-sm">Create an ad from the Scripts tab and save it here.</div></Card>}
      {ads.length>0&&filtered.length===0&&<Card style={{textAlign:"center",padding:40}}><Search className="w-7 h-7 mx-auto mb-2 text-text-muted" /><div className="text-text-muted text-sm">No ads match your filters.<br/><button onClick={()=>{setSearch("");setActiveTag(null);setRenderFilter(null)}} className="bg-transparent border-none text-accent cursor-pointer text-sm underline mt-2">Clear all filters</button></div></Card>}

      {/* Pending renders section */}
      {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").length>0&&<div className="mb-5 border border-warning/30 rounded-lg overflow-hidden">
        <div className="bg-warning-soft px-5 py-3.5 flex items-center gap-3 border-b border-warning/20">
          <div className="w-2.5 h-2.5 rounded-full bg-warning shrink-0"/>
          <div className="flex-1">
            <div className="font-bold text-[15px] text-warning flex items-center gap-1.5"><Clock className="w-4 h-4" /> Waiting to Render</div>
            <div className="text-[11px] text-text-muted mt-0.5">These ads are saved but haven't been rendered to MP4 yet</div>
          </div>
          <Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:"var(--color-warning)",color:"#000",fontWeight:700,fontSize:12,padding:"7px 14px"}}>{autoRendering?"Starting...":(<><Film className="w-3.5 h-3.5 inline"/> Render All</>)}</Btn>
        </div>
        <div className="p-4 bg-bg flex flex-col gap-2">
          {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").map(ad=><div key={ad.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-3.5 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm overflow-hidden whitespace-nowrap text-ellipsis">{ad.title}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.render_status==="failed"?<span className="text-danger ml-2"><AlertTriangle className="w-3 h-3 inline"/> Last render failed</span>:""}</div>
            </div>
            <Btn onClick={async()=>{await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})});onRefresh()}} style={{background:"var(--color-accent-soft)",color:"var(--color-accent)",border:"1px solid var(--color-accent-muted)",fontSize:12,padding:"6px 12px",flexShrink:0}}><Film className="w-3 h-3 inline"/> Render</Btn>
            <Btn onClick={()=>setPreviewId(ad.id)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"6px 10px",flexShrink:0}}>Open</Btn>
          </div>)}
        </div>
      </div>}

      {/* Stage folders */}
      {allStages.map(stageKey=>{
        const stageAds=stageGroups[stageKey]||[]
        const stageInfo=STAGES.find(s=>s.value===stageKey)
        const stageColor=STAGE_COLORS[stageKey]||C.accent
        const expanded=isExpanded(stageKey)
        const readyCount=stageAds.filter(a=>(a as any).render_status==="ready").length

        return<div key={stageKey} className="mb-4 border border-border rounded-lg overflow-hidden">
          <div onClick={()=>toggleStage(stageKey)} className={`bg-card px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-card-hover transition-colors ${expanded?"border-b border-border":""}`}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:stageColor}}/>
            <div className="flex-1">
              <div className="font-bold text-[15px]">{stageInfo?.label||"General"}</div>
              {stageInfo&&<div className="text-[11px] text-text-muted mt-0.5">{stageInfo.desc}</div>}
            </div>
            <div className="flex gap-2 items-center">
              <span className="rounded-full text-[11px] font-bold px-2.5 py-0.5 border" style={{background:stageColor+"22",color:stageColor,borderColor:stageColor+"44"}}>{stageAds.length} ad{stageAds.length!==1?"s":""}</span>
              {readyCount>0&&<span className="bg-success-soft text-success border border-success/30 rounded-full text-[11px] font-bold px-2.5 py-0.5"><Check className="w-3 h-3 inline"/> {readyCount} ready</span>}
              <span className="text-xs text-text-muted ml-1">{expanded?"▲":"▼"}</span>
            </div>
          </div>
          {expanded&&<div className="p-5 bg-bg">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
              {stageAds.map(ad=><ForgedAdCard key={ad.id} ad={ad} items={items} onOpen={()=>setPreviewId(ad.id)} onRefresh={onRefresh} selectMode={selectMode} isSelected={selectedIds.includes(ad.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(ad.id)?prev.filter(x=>x!==ad.id):[...prev,ad.id])} onDuplicate={()=>onCreateV2(ad)}/>)}
            </div>
          </div>}
        </div>
      })}
    </div>
  )
}
