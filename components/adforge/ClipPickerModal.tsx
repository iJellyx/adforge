'use client'
import { useState } from 'react'
import type { Item } from './types'
import { C } from './constants'
import { Input, Btn } from './ui-primitives'
import { VideoCard } from './VideoCard'

export function ClipPickerModal({currentId,matchedIds,libraryItems,sectionLabel,onSelect,onClose}:any){
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
  // Sort b-roll first in matched clips
  const sortedMatched=[...fl(matched)].sort((a,b)=>{const ac=classifyItem(a)==="broll"?0:1;const bc=classifyItem(b)==="broll"?0:1;return ac-bc})
  const sortedOthers=[...fl(others)].sort((a,b)=>{const ac=classifyItem(a)==="broll"?0:1;const bc=classifyItem(b)==="broll"?0:1;return ac-bc})

  const clipCard=(item:Item)=>{
    const cls=classifyItem(item)
    return<div key={item.id} style={{cursor:"pointer",position:"relative"}} onClick={()=>{onSelect(item.id);onClose()}}>
      <VideoCard item={item} compact={false} highlight={item.id!==currentId} isSelected={item.id===currentId} onClick={()=>{}} selectMode={false} onToggleSelect={()=>{}}/>
      <div style={{position:"absolute",top:4,right:4,background:cls==="broll"?"#22c55edd":"#f59e0bdd",color:"#fff",fontSize:7,fontWeight:800,padding:"1px 5px",borderRadius:3,zIndex:5}}>{cls==="broll"?"B-ROLL":"TALKING"}</div>
    </div>
  }

  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:24,maxWidth:760,width:"100%",marginTop:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontWeight:700,fontSize:17}}>Change Clip</div><div style={{fontSize:13,color:C.muted}}>for <strong style={{color:C.text}}>{sectionLabel}</strong></div></div><Btn onClick={onClose} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px",fontSize:12}}>✕</Btn></div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search clips…" style={{flex:1}}/>
        <div style={{display:"flex",gap:4}}>
          {([["all","All"],["broll","B-Roll"],["talking_head","Talking"]] as [typeof filterType,string][]).map(([v,l])=><button key={v} onClick={()=>setFilterType(v)} style={{background:filterType===v?C.accent:C.surface,color:filterType===v?"#fff":C.muted,border:"1px solid "+(filterType===v?C.accent:C.border),borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{l}</button>)}
        </div>
      </div>
      {!useApprovedOnly&&eligibleClips.length>0&&<div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#f59e0b",marginBottom:12}}>⚠️ No approved clips yet. Showing all pending clips. Review clips in the Library to approve them.</div>}
      {sortedMatched.length>0&&<div style={{marginBottom:24}}><div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>🎯 AI-Matched ({sortedMatched.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{sortedMatched.map(clipCard)}</div></div>}
      {sortedOthers.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>All Library ({sortedOthers.length})</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>{sortedOthers.map(clipCard)}</div></div>}
      {sortedMatched.length===0&&sortedOthers.length===0&&<div style={{textAlign:"center",padding:40,color:C.muted}}>No clips found{filterType!=="all"?" with this filter. Try 'All'.":"."}</div>}
    </div>
  </div>
}
