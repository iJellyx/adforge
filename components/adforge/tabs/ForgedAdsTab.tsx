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

function ForgedAdDownload({ad,onRefresh}:{ad:ForgedAd,onRefresh:()=>void}){
  const [checking,setChecking]=useState(false)
  const [downloading,setDownloading]=useState(false)
  const [msg,setMsg]=useState("")

  useEffect(()=>{
    // Auto-check status when opened
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
    setMsg("Starting render…")
    try{
      await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      onRefresh()
      setMsg("Rendering started — check back in 1-2 mins")
    }catch(e:any){setMsg("Error: "+e.message)}
  }

  async function downloadMp4(){
    if(!ad.render_url)return
    setDownloading(true);setMsg("Downloading…")
    try{
      const res=await fetch(ad.render_url)
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=url
      a.download=`${ad.title||"adforge-ad"}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(url),15000)
      setMsg("✓ Downloaded!")
    }catch(e:any){setMsg("Download failed: "+e.message)}
    setDownloading(false)
  }

  const renderStatus=ad.render_status||"pending"

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:20,marginTop:16}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⬇️ Download MP4</div>

    {renderStatus==="pending"&&<div>
      <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Render not started yet.</div>
      <Btn onClick={startRender} style={{background:C.accent,color:"#fff",width:"100%",padding:12}}>{msg||"🎬 Start Rendering"}</Btn>
    </div>}

    {renderStatus==="rendering"&&<div>
      <div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#fbbf24",marginBottom:12}}>⏳ Rendering in progress — usually takes 1-2 minutes.</div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={checkStatus} disabled={checking} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44",flex:1}}>{checking?"Checking…":"🔄 Check Status"}</Btn>
      </div>
      {msg&&<div style={{fontSize:12,color:C.muted,marginTop:8}}>{msg}</div>}
    </div>}

    {renderStatus==="ready"&&<div>
      <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,padding:"10px 14px",fontSize:13,color:C.green,marginBottom:12}}>✅ Your MP4 is ready to download!</div>
      <Btn onClick={downloadMp4} disabled={downloading} style={{background:C.green,color:"#000",fontWeight:700,width:"100%",padding:14,fontSize:15,borderRadius:12}}>{downloading?"⏳ Downloading…":"⬇️ Download MP4"}</Btn>
      {msg&&<div style={{fontSize:12,color:msg.includes("✓")?C.green:C.red,marginTop:8,fontWeight:600}}>{msg}</div>}
    </div>}

    {renderStatus==="failed"&&<div>
      <div style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#ef4444",marginBottom:12}}>❌ Render failed. Try again.</div>
      <Btn onClick={startRender} style={{background:C.accent,color:"#fff",width:"100%",padding:12}}>🔄 Retry Render</Btn>
    </div>}
  </div>
}



// ── Forged Ads Tab ────────────────────────────────────────────────────────
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
  const renderBadge=renderStatus==="ready"?{bg:"#22c55e22",color:C.green,label:"✓ Ready"}:renderStatus==="rendering"?{bg:"#f59e0b22",color:C.yellow,label:"⏳ Rendering"}:renderStatus==="failed"?{bg:"#ef444422",color:"#ef4444",label:"❌ Failed"}:{bg:"#ffffff11",color:C.muted,label:"Pending"}

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

  return<div
    onMouseEnter={()=>setHovered(true)}
    onMouseLeave={()=>setHovered(false)}
    onClick={handleClick}
    style={{background:C.card,border:"2px solid "+(isSelected?C.accent:hovered?C.accent:C.border),borderRadius:10,overflow:"hidden",cursor:"pointer",transition:"border-color 0.15s,transform 0.15s",transform:hovered&&!selectMode?"translateY(-2px)":"none",display:"flex",flexDirection:"column",position:"relative"}}
  >
    {/* Select checkbox */}
    {selectMode&&<div style={{position:"absolute",top:8,left:8,zIndex:20,width:22,height:22,borderRadius:6,background:isSelected?C.accent:"#000a",border:"2px solid "+(isSelected?"#fff":"#fff5"),display:"flex",alignItems:"center",justifyContent:"center"}}>
      {isSelected&&<span style={{color:"#fff",fontSize:12,fontWeight:800}}>✓</span>}
    </div>}

    {/* Thumbnail */}
    <div style={{position:"relative",paddingTop:"177.78%",background:"#111",overflow:"hidden",flexShrink:0}}>
      {currentThumb&&<img src={currentThumb} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transition:"opacity 0.3s"}}/>}

      {/* Hover overlay */}
      {hovered&&!selectMode&&<div style={{position:"absolute",inset:0,background:"#00000055",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:"#000a",border:"2px solid #fff6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>▶</div>
      </div>}

      {/* Clip progress dots */}
      {clips.length>1&&hovered&&<div style={{position:"absolute",bottom:40,left:8,right:8,display:"flex",gap:3}}>
        {clips.map((_:any,i:number)=><div key={i} style={{height:2,flex:1,borderRadius:2,background:i===thumbIdx?"#fff":"#ffffff44",transition:"background 0.3s"}}/>)}
      </div>}

      {/* Render status */}
      <div style={{position:"absolute",top:8,right:selectMode?8:renderStatus==="ready"?40:8,background:renderBadge.bg,color:renderBadge.color,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:99,backdropFilter:"blur(4px)",border:"1px solid "+renderBadge.color+"44"}}>
        {renderBadge.label}
      </div>

      {/* Quick download */}
      {renderStatus==="ready"&&!selectMode&&<button onClick={quickDownload} disabled={downloading} style={{position:"absolute",top:8,right:8,background:"#000a",border:"1px solid #fff3",color:"#fff",borderRadius:8,padding:"5px 8px",cursor:"pointer",fontSize:13,backdropFilter:"blur(4px)"}}>
        {downloading?"…":"⬇️"}
      </button>}

      {/* Tag overlays bottom */}
      <div style={{position:"absolute",bottom:8,left:8,display:"flex",gap:4,flexWrap:"wrap",maxWidth:"calc(100% - 16px)"}}>
        {ad.metadata?.contentType&&<span style={{background:"#000b",color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4,backdropFilter:"blur(4px)"}}>{ad.metadata.contentType}</span>}
        {stage&&<span style={{background:stageColor+"dd",color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4}}>{stage.label}</span>}
      </div>

      {/* Audio indicators */}
      <div style={{position:"absolute",bottom:8,right:8,display:"flex",gap:3}}>
        {ad.voiceover_url&&<span style={{background:"#000b",fontSize:10,padding:"2px 4px",borderRadius:4}}>🎙️</span>}
        {ad.music_url&&<span style={{background:"#000b",fontSize:10,padding:"2px 4px",borderRadius:4}}>🎵</span>}
      </div>
    </div>

    {/* Card body — compact */}
    <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:5}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <div style={{fontWeight:700,fontSize:12,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as any,flex:1}}>{ad.title}</div>
        {ad.metadata?.grade&&<div style={{flexShrink:0,background:gradeColor(ad.metadata.grade).bg,color:gradeColor(ad.metadata.grade).text,fontSize:11,fontWeight:800,padding:"2px 7px",borderRadius:6,lineHeight:1.4,border:"1px solid "+gradeColor(ad.metadata.grade).text+"33"}} title={`Clip-Script Match: ${ad.metadata.score||0}/100`}>{ad.metadata.grade}</div>}
      </div>
      <div style={{display:"flex",gap:2}} onMouseLeave={()=>setHoverRating(0)}>
        {[1,2,3,4,5].map(star=><span key={star} onMouseEnter={e=>{e.stopPropagation();setHoverRating(star)}} onClick={e=>{e.stopPropagation();saveRating(star)}} style={{cursor:"pointer",fontSize:13,color:(hoverRating||rating)>=star?"#f59e0b":"rgba(0,0,0,0.15)",transition:"color 0.1s"}}>★</span>)}
      </div>
      <div style={{fontSize:10,color:C.muted}}>{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.metadata?.adLength?` · ${ad.metadata.adLength}`:""}</div>
      {(ad as any).notes&&<div style={{fontSize:10,color:C.muted,fontStyle:"italic",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>📝 {(ad as any).notes}</div>}
      {onDuplicate&&!selectMode&&<button onClick={e=>{e.stopPropagation();onDuplicate()}} style={{marginTop:4,width:"100%",background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"33",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📋 Duplicate</button>}
    </div>
  </div>
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

    // Hook type performance
    const hookPerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const hook=(a.sections||[]).find((s:any)=>s.type==="HOOK");const hookType=hook?.hookType||"Unknown";const rate=parseFloat(a.metadata?.hook_rate||"0");if(rate>0){if(!hookPerf[hookType])hookPerf[hookType]=[];hookPerf[hookType].push(rate)}})
    const hookEntries=Object.entries(hookPerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(b[1])-avg(a[1]))
    const best_hook_types=hookEntries.filter(([,v])=>avg(v)>=40).map(([k])=>k)
    const worst_hook_types=hookEntries.filter(([,v])=>avg(v)<30).map(([k])=>k)

    // Top performing ads
    const topAds=adsWithData.filter(a=>parseFloat(a.metadata?.hook_rate||"0")>=45||(a.star_rating||0)>=4)
    const best_hook_patterns:string[]=[]
    topAds.forEach(a=>{const hook=(a.sections||[]).find((s:any)=>s.type==="HOOK");const words=(hook?.spokenWords||"").trim();if(!words)return;if(/^\d/.test(words.split(" ")[0]))best_hook_patterns.push("Opens with a number");if(/I |My |We /.test(words.substring(0,20)))best_hook_patterns.push("First-person opening");if(words.split(" ").length<=6)best_hook_patterns.push("Short punchy hook (under 7 words)");if(/\?$/.test(words.trim()))best_hook_patterns.push("Ends with a question");if(/stop|wait|don't|never/i.test(words.substring(0,30)))best_hook_patterns.push("Pattern interrupt / negative opener")})

    // Content type performance (lower CPA = better)
    const ctypePerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const ct=a.metadata?.contentType||"Unknown";const cpa=parseFloat(a.metadata?.cpa||"0");if(cpa>0){if(!ctypePerf[ct])ctypePerf[ct]=[];ctypePerf[ct].push(cpa)}})
    const ctypeEntries=Object.entries(ctypePerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(a[1])-avg(b[1]))
    const best_content_type=ctypeEntries[0]?.[0]||""

    // Average winning hook length
    const hookLengths=topAds.map(a=>{const h=(a.sections||[]).find((s:any)=>s.type==="HOOK");return(h?.spokenWords||"").trim().split(/\s+/).filter(Boolean).length}).filter(l=>l>0)
    const avg_winning_hook_length=hookLengths.length?Math.round(hookLengths.reduce((a,b)=>a+b,0)/hookLengths.length):0

    // Section structure analysis — what section counts and types work best
    const sectionCounts=topAds.map(a=>(a.sections||[]).length).filter(n=>n>0)
    const avg_section_count=sectionCounts.length?Math.round(avg(sectionCounts)):0
    const winningStructures=topAds.map(a=>(a.sections||[]).map((s:any)=>s.type).join(" → ")).filter(Boolean)
    const structureCounts:Record<string,number>={}
    winningStructures.forEach(s=>{structureCounts[s]=(structureCounts[s]||0)+1})
    const best_structures=Object.entries(structureCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s)

    // Ad length performance
    const lengthPerf:Record<string,number[]>={}
    adsWithData.forEach(a=>{const len=a.metadata?.adLength||"Unknown";const rate=parseFloat(a.metadata?.hook_rate||"0");if(rate>0){if(!lengthPerf[len])lengthPerf[len]=[];lengthPerf[len].push(rate)}})
    const lengthEntries=Object.entries(lengthPerf).filter(([,v])=>v.length>0).sort((a,b)=>avg(b[1])-avg(a[1]))
    const best_ad_length=lengthEntries[0]?.[0]||""

    // Awareness stage performance
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

  // Auto-poll render status every 15 seconds
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

  // Filter
  const filtered=ads.filter(ad=>{
    if(renderFilter&&(ad as any).render_status!==renderFilter)return false
    if(search.trim()){const q=search.toLowerCase();if(![ad.title,ad.metadata?.contentType,ad.metadata?.productName,ad.metadata?.awarenessStage,(ad as any).notes].some((f:any)=>f&&String(f).toLowerCase().includes(q)))return false}
    if(activeTag){if(![ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName].some((f:any)=>f&&f===activeTag))return false}
    return true
  })

  // Group by awareness stage
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

  return<div style={{padding:28,maxWidth:1200,margin:"0 auto"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <div>
        <STitle size={24} mb={4}>⚡ Forged Ads</STitle>
        <div style={{fontSize:13,color:C.muted}}>Your complete video ad library — organised by awareness stage</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {totalPending>0&&<Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"7px 14px"}}>{autoRendering?"⏳ Rendering…":`🎬 Render All (${totalPending})`}</Btn>}
        {!selectMode&&<Btn onClick={()=>setSelectMode(true)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"7px 14px"}}>Select</Btn>}
        {selectMode&&<>
          <Btn onClick={()=>{setSelectedIds(allFilteredIds)}} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"7px 14px"}}>Select All ({filtered.length})</Btn>
          <Btn onClick={bulkDelete} disabled={selectedIds.length===0||deleting} style={{background:selectedIds.length>0?"#ef444433":C.border,color:selectedIds.length>0?"#ef4444":C.muted,border:"1px solid "+(selectedIds.length>0?"#ef444466":C.border),fontSize:12,padding:"7px 14px"}}>Delete ({selectedIds.length})</Btn>
          <Btn onClick={()=>{setSelectMode(false);setSelectedIds([])}} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"7px 14px"}}>Cancel</Btn>
        </>}
      </div>
    </div>

    {/* Search + filter row */}
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ads by name, product, stage…" style={{flex:1,minWidth:220,background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,outline:"none"}}/>

      {/* Render status filter buttons */}
      <button onClick={()=>setRenderFilter(renderFilter==="ready"?null:"ready")} style={{background:renderFilter==="ready"?"#22c55e33":C.surface,border:"1px solid "+(renderFilter==="ready"?"#22c55e":C.border),color:renderFilter==="ready"?C.green:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>✓ Ready ({totalReady})</button>
      <button onClick={()=>setRenderFilter(renderFilter==="rendering"?null:"rendering")} style={{background:renderFilter==="rendering"?"#f59e0b33":C.surface,border:"1px solid "+(renderFilter==="rendering"?"#f59e0b":C.border),color:renderFilter==="rendering"?C.yellow:C.muted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>⏳ Rendering ({totalRendering})</button>

      {(activeTag||renderFilter||search)&&<button onClick={()=>{setActiveTag(null);setRenderFilter(null);setSearch("")}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Clear filters</button>}
    </div>

    {/* Tag cloud */}
    {ads.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
      {[...new Set(ads.flatMap(ad=>[ad.metadata?.contentType,ad.metadata?.awarenessStage&&STAGES.find(s=>s.value===ad.metadata?.awarenessStage)?.label,ad.metadata?.productName&&ad.metadata.productName!=="General"?ad.metadata.productName:null].filter(Boolean)))].map((tag:any)=><button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)} style={{background:activeTag===tag?C.accent:C.surface,color:activeTag===tag?"#fff":C.muted,border:"1px solid "+(activeTag===tag?C.accent:C.border),borderRadius:99,padding:"4px 11px",cursor:"pointer",fontSize:11,fontWeight:600}}>{tag}</button>)}
    </div>}

    {/* Preview modal */}
    {previewAd&&<div onClick={()=>setPreviewId(null)} style={{position:"fixed",inset:0,background:"#000000ee",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:24,maxWidth:900,width:"100%",marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,gap:16}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:18,marginBottom:6}}>{previewAd.title}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
              <span style={{background:previewAd.status==="complete"?"#22c55e22":"#f59e0b22",color:previewAd.status==="complete"?C.green:C.yellow,border:"1px solid "+(previewAd.status==="complete"?"#22c55e44":"#f59e0b44"),borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{previewAd.status==="complete"?"✅ Complete":"📝 Draft"}</span>
              {previewAd.mode==="broll"&&<Chip label="🎬 B-Roll" color={{bg:"#22c55e22",color:C.green}}/>}
              {previewAd.metadata?.contentType&&<Chip label={previewAd.metadata.contentType} color={{bg:"#0891b222",color:"#38bdf8"}}/>}
              {previewAd.metadata?.awarenessStage&&<Chip label={STAGES.find(s=>s.value===previewAd.metadata?.awarenessStage)?.label||previewAd.metadata.awarenessStage} color={{bg:STAGE_COLORS[previewAd.metadata.awarenessStage]+"22",color:STAGE_COLORS[previewAd.metadata.awarenessStage]}}/>}
              {previewAd.created_at&&<span style={{fontSize:11,color:C.muted}}>Created {new Date(previewAd.created_at).toLocaleDateString()}</span>}
            </div>
            {editingNotes===previewAd.id
              ?<div style={{display:"flex",gap:8,marginTop:8}}>
                <input value={notesVal} onChange={e=>setNotesVal(e.target.value)} placeholder="Add internal notes…" autoFocus style={{flex:1,background:C.surface,border:"1px solid "+C.accent,borderRadius:8,padding:"6px 10px",color:C.text,fontSize:13,outline:"none"}}/>
                <Btn onClick={()=>saveNotes(previewAd.id)} style={{background:C.green,color:"#000",fontWeight:700,padding:"6px 12px",fontSize:12}}>Save</Btn>
                <Btn onClick={()=>setEditingNotes(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"6px 12px",fontSize:12}}>Cancel</Btn>
              </div>
              :<div onClick={()=>{setEditingNotes(previewAd.id);setNotesVal((previewAd as any).notes||"")}} style={{fontSize:12,color:(previewAd as any).notes?C.muted:C.accent,cursor:"pointer",marginTop:6,textDecoration:"underline"}}>
                {(previewAd as any).notes?`📝 ${(previewAd as any).notes}`:"+ Add notes"}
              </div>}
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}}>
            {previewAd.mode!=="broll"&&<Btn onClick={()=>{onEditAd(previewAd);setPreviewId(null)}} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"6px 12px"}}>✏️ Edit Ad</Btn>}
            {previewAd.mode!=="broll"&&<Btn onClick={()=>{onCreateV2(previewAd);setPreviewId(null)}} style={{background:"#F0FDF4",color:"#15803D",border:"1px solid #86EFAC",fontSize:12,padding:"6px 12px"}}>⚡ Create v2</Btn>}
            {previewAd.status==="draft"&&<Btn onClick={()=>{markComplete(previewAd.id);setPreviewId(null)}} style={{background:"#22c55e22",color:C.green,border:"1px solid #22c55e44",fontSize:12,padding:"6px 12px"}}>Mark Complete</Btn>}
            <Btn onClick={()=>{deleteAd(previewAd.id);setPreviewId(null)}} style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433",fontSize:12,padding:"6px 12px"}}>Delete</Btn>
            <Btn onClick={()=>setPreviewId(null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px"}}>✕</Btn>
          </div>
        </div>
        {previewAd.sections&&previewAd.sections.length>0&&<div style={{marginBottom:20}}><StitchedPreview sections={previewAd.sections} libraryItems={items} voiceoverUrl={previewAd.voiceover_url} musicUrl={previewAd.music_url}/></div>}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
          {previewAd.voiceover_url&&<div style={{flex:1,minWidth:200}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎙️ Voiceover · {previewAd.voiceover_voice}</div><audio src={previewAd.voiceover_url} controls style={{width:"100%",height:36}}/></div>}
          {previewAd.music_url&&<div style={{flex:1,minWidth:200}}><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🎵 Music · {previewAd.music_name}</div><audio src={previewAd.music_url} controls style={{width:"100%",height:36}}/></div>}
        </div>
        {/* Performance logging */}
        <div style={{marginBottom:16}}>
          {!perfOpen
            ?<button onClick={()=>setPerfOpen(true)} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,width:"100%",textAlign:"left" as const}}>
              📊 {previewAd.metadata?.hook_rate?`Hook rate: ${previewAd.metadata.hook_rate}%${previewAd.metadata?.cpa?` · CPA: £${previewAd.metadata.cpa}`:""}${previewAd.metadata?.roas?` · ROAS: ${previewAd.metadata.roas}x`:""}`:"+  Log performance data"}
            </button>
            :<div style={{background:C.bg,border:"1px solid "+C.border,borderRadius:10,padding:14}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📊 Log Performance Data</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {([["Hook Rate %","hook_rate","e.g. 42"],["CPA (£)","cpa","e.g. 18"],["ROAS","roas","e.g. 3.2"],["Spend (£)","spend","e.g. 500"]] as [string,string,string][]).map(([label,key,ph])=>
                  <div key={key}><Label>{label}</Label><input value={perfVals[key]||""} onChange={e=>setPerfVals(v=>({...v,[key]:e.target.value}))} placeholder={ph} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"7px 10px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const}}/></div>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={savePerf} disabled={perfSaving} style={{background:C.accent,color:"#fff",flex:1}}>{perfSaving?"Saving…":"💾 Save + Update Intelligence"}</Btn>
                <Btn onClick={()=>setPerfOpen(false)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Cancel</Btn>
              </div>
            </div>}
        </div>
        {/* Clip-Script Match Score */}
        <ScorePanel ad={previewAd} onScored={(scored)=>{onRefresh()}}/>

        <ForgedAdDownload ad={previewAd} onRefresh={onRefresh}/>
      </div>
    </div>}

    {/* Empty state */}
    {ads.length===0&&<Card style={{textAlign:"center",padding:60}}><div style={{fontSize:40,marginBottom:12}}>⚡</div><STitle mb={6}>No forged ads yet</STitle><div style={{color:C.muted,fontSize:13}}>Create an ad from the Scripts tab and save it here.</div></Card>}
    {ads.length>0&&filtered.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:28,marginBottom:8}}>🔍</div><div style={{color:C.muted,fontSize:14}}>No ads match your filters.<br/><button onClick={()=>{setSearch("");setActiveTag(null);setRenderFilter(null)}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:13,textDecoration:"underline",marginTop:8}}>Clear all filters</button></div></Card>}

{/* Pending renders section */}
    {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").length>0&&<div style={{marginBottom:20,border:"1px solid #f59e0b44",borderRadius:10,overflow:"hidden"}}>
      <div style={{background:"#f59e0b11",padding:"14px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #f59e0b33"}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:C.yellow,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:C.yellow}}>⏳ Waiting to Render</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>These ads are saved but haven't been rendered to MP4 yet</div>
        </div>
        <Btn onClick={autoRenderAll} disabled={autoRendering} style={{background:C.yellow,color:"#000",fontWeight:700,fontSize:12,padding:"7px 14px"}}>{autoRendering?"⏳ Starting…":"🎬 Render All"}</Btn>
      </div>
      <div style={{padding:16,background:C.bg,display:"flex",flexDirection:"column",gap:8}}>
        {ads.filter(a=>!a.render_status||a.render_status==="pending"||a.render_status==="failed").map(ad=><div key={ad.id} style={{display:"flex",alignItems:"center",gap:12,background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:"10px 14px"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{ad.title}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{ad.created_at?new Date(ad.created_at).toLocaleDateString():""}{ad.render_status==="failed"?<span style={{color:"#ef4444",marginLeft:8}}>❌ Last render failed</span>:""}</div>
          </div>
          <Btn onClick={async()=>{await fetch("/api/export/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})});onRefresh()}} style={{background:"#EDE8FF",color:C.accent,border:"1px solid "+C.accent+"44",fontSize:12,padding:"6px 12px",flexShrink:0}}>🎬 Render</Btn>
          <Btn onClick={()=>setPreviewId(ad.id)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"6px 10px",flexShrink:0}}>Open</Btn>
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

      return<div key={stageKey} style={{marginBottom:16,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden"}}>
        <div onClick={()=>toggleStage(stageKey)} style={{background:C.card,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",borderBottom:expanded?"1px solid "+C.border:"none"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:stageColor,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15}}>{stageInfo?.label||"General"}</div>
            {stageInfo&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{stageInfo.desc}</div>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{background:stageColor+"22",color:stageColor,border:"1px solid "+stageColor+"44",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 10px"}}>{stageAds.length} ad{stageAds.length!==1?"s":""}</span>
            {readyCount>0&&<span style={{background:"#22c55e22",color:C.green,border:"1px solid #22c55e44",borderRadius:99,fontSize:11,fontWeight:700,padding:"2px 10px"}}>✓ {readyCount} ready</span>}
            <span style={{fontSize:12,color:C.muted,marginLeft:4}}>{expanded?"▲":"▼"}</span>
          </div>
        </div>
        {expanded&&<div style={{padding:20,background:C.bg}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
            {stageAds.map(ad=><ForgedAdCard key={ad.id} ad={ad} items={items} onOpen={()=>setPreviewId(ad.id)} onRefresh={onRefresh} selectMode={selectMode} isSelected={selectedIds.includes(ad.id)} onToggleSelect={()=>setSelectedIds(prev=>prev.includes(ad.id)?prev.filter(x=>x!==ad.id):[...prev,ad.id])} onDuplicate={()=>onCreateV2(ad)}/>)}
          </div>
        </div>}
      </div>
    })}
  </div>
}
