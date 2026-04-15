'use client'
import { useState } from 'react'
import type { Item } from './types'
import { C } from './constants'
import { Input, Btn } from './ui-primitives'
import { VideoCard } from './VideoCard'

export function ClipPickerModal({currentId,matchedIds,libraryItems,sectionLabel,requiredDuration,onSelect,onClose}:any){
  const [search,setSearch]=useState("")
  const [filterType,setFilterType]=useState<"all"|"broll"|"talking_head">("all")

  function classifyItem(item:Item):"broll"|"talking_head"|"mixed"{
    const a=item.analysis||{}
    // Prefer explicit flags from AI analysis
    if(a.is_broll===true)return"broll"
    if(a.is_talking_head===true)return"talking_head"
    // Fallback heuristic
    const tags=((a.scene_tags||[]).join(" ")+" "+(a.content_type||"")).toLowerCase()
    if(tags.includes("product")||tags.includes("close-up")||tags.includes("demo")||tags.includes("lifestyle")||tags.includes("b-roll")||tags.includes("ingredient"))return"broll"
    if(tags.includes("talking head")||tags.includes("person speaking"))return"talking_head"
    return"mixed"
  }

  // Duration-locked mode helpers
  const reqDur=typeof requiredDuration==="number"?requiredDuration:null
  function getDurationBadge(item:Item):{label:string,color:string,bg:string,disabled:boolean}{
    if(reqDur==null)return{label:"",color:"",bg:"",disabled:false}
    const dur=item.duration_seconds||0
    const diff=dur-reqDur
    if(Math.abs(diff)<0.1)return{label:"\u2713 Exact",color:C.green,bg:"#22c55e22",disabled:false}
    if(dur>=reqDur)return{label:"Trim to fit",color:C.accent,bg:C.accentSoft||"#6c63ff22",disabled:false}
    return{label:"Too short",color:C.red||"#ef4444",bg:"#ef444422",disabled:true}
  }

  // Sort helper for duration-locked mode: exact first, then longer (smallest delta), then shorter (disabled)
  function durSort(a:Item,b:Item):number{
    if(reqDur==null)return 0
    const aDur=a.duration_seconds||0
    const bDur=b.duration_seconds||0
    const aExact=Math.abs(aDur-reqDur)<0.1
    const bExact=Math.abs(bDur-reqDur)<0.1
    if(aExact&&!bExact)return-1
    if(!aExact&&bExact)return 1
    const aOk=aDur>=reqDur
    const bOk=bDur>=reqDur
    if(aOk&&!bOk)return-1
    if(!aOk&&bOk)return 1
    if(aOk&&bOk)return(aDur-reqDur)-(bDur-reqDur) // smaller surplus first
    return(bDur-aDur) // both too short: longer first
  }

  // Prefer approved clips, fall back to pending if no approved clips exist
  const approvedClips=libraryItems.filter((i:Item)=>i.clip_status==="approved")
  const useApprovedOnly=approvedClips.length>0
  const eligibleClips=useApprovedOnly?approvedClips:libraryItems.filter((i:Item)=>i.clip_status!=="rejected")

  const matched=eligibleClips.filter((i:Item)=>matchedIds.includes(i.id))
  const others=eligibleClips.filter((i:Item)=>!matchedIds.includes(i.id))
  const fl=(arr:Item[])=>{
    let r=arr
    if(search.trim())r=r.filter((i:Item)=>[i.title,i.creator,...(i.analysis?.scene_tags||[])].some((f:any)=>f&&String(f).toLowerCase().includes(search.toLowerCase())))
    if(filterType!=="all")r=r.filter((i:Item)=>classifyItem(i)===filterType)
    return r
  }
  // Sort: in duration-locked mode, sort by duration relevance; otherwise b-roll first
  const defaultSort=(a:Item,b:Item)=>{const ac=classifyItem(a)==="broll"?0:1;const bc=classifyItem(b)==="broll"?0:1;return ac-bc}
  const sortFn=reqDur!=null?durSort:defaultSort
  const sortedMatched=[...fl(matched)].sort(sortFn)
  const sortedOthers=[...fl(others)].sort(sortFn)

  const clipCard=(item:Item)=>{
    const cls=classifyItem(item)
    const badge=getDurationBadge(item)
    const isDisabled=badge.disabled
    return<div key={item.id} style={{cursor:isDisabled?"not-allowed":"pointer",position:"relative",opacity:isDisabled?0.4:1}} onClick={()=>{if(isDisabled)return;onSelect(item.id);if(!reqDur||(Math.abs((item.duration_seconds||0)-reqDur)<0.1))onClose()}}>
      <VideoCard item={item} compact={false} highlight={item.id!==currentId} isSelected={item.id===currentId} onClick={()=>{}} selectMode={false} onToggleSelect={()=>{}}/>
      <div style={{position:"absolute",top:4,right:4,background:cls==="broll"?"#22c55edd":"#f59e0bdd",color:"#fff",fontSize:7,fontWeight:800,padding:"1px 5px",borderRadius:3,zIndex:5}}>{cls==="broll"?"B-ROLL":"TALKING"}</div>
      {reqDur!=null&&badge.label&&<div style={{position:"absolute",bottom:4,left:4,background:badge.bg,color:badge.color,fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:4,zIndex:5,border:"1px solid "+badge.color+"44"}}>{badge.label}{isDisabled&&item.duration_seconds!=null&&" ("+(item.duration_seconds).toFixed(1)+"s < "+reqDur.toFixed(1)+"s)"}</div>}
    </div>
  }

  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:24,maxWidth:760,width:"100%",marginTop:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontWeight:700,fontSize:17}}>Change Clip</div><div style={{fontSize:13,color:C.muted}}>for <strong style={{color:C.text}}>{sectionLabel}</strong>{reqDur!=null&&<span style={{marginLeft:8,fontSize:11,color:C.accent,fontWeight:700}}>({reqDur.toFixed(1)}s required)</span>}</div></div><Btn onClick={onClose} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px",fontSize:12}}>✕</Btn></div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search clips…" style={{flex:1}}/>
        <div style={{display:"flex",gap:4}}>
          {([["all","All"],["broll","B-Roll"],["talking_head","Talking"]] as [typeof filterType,string][]).map(([v,l])=><button key={v} onClick={()=>setFilterType(v)} style={{background:filterType===v?C.accent:C.surface,color:filterType===v?"#fff":C.muted,border:"1px solid "+(filterType===v?C.accent:C.border),borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{l}</button>)}
        </div>
      </div>
      {!useApprovedOnly&&eligibleClips.length>0&&<div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#f59e0b",marginBottom:12}}>No approved clips yet. Showing all pending clips. Review clips in the Library to approve them.</div>}
      {sortedMatched.length>0&&<div style={{marginBottom:24}}><div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>AI-Matched ({sortedMatched.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{sortedMatched.map(clipCard)}</div></div>}
      {sortedOthers.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>All Library ({sortedOthers.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{sortedOthers.map(clipCard)}</div></div>}
      {sortedMatched.length===0&&sortedOthers.length===0&&<div style={{textAlign:"center",padding:40,color:C.muted}}>No clips found{filterType!=="all"?" with this filter. Try 'All'.":"."}</div>}
    </div>
  </div>
}
