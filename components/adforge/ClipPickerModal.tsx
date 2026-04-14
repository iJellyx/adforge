'use client'
import { useState } from 'react'
import { Search, X, Target, AlertTriangle } from 'lucide-react'
import type { Item } from './types'
import { C } from './constants'
import { Input, Btn } from './ui-primitives'
import { VideoCard } from './VideoCard'

export function ClipPickerModal({currentId,matchedIds,libraryItems,sectionLabel,onSelect,onClose}:any){
  const [search,setSearch]=useState("")
  const [filterType,setFilterType]=useState<"all"|"broll"|"talking_head">("all")

  function classifyItem(item:Item):"broll"|"talking_head"|"mixed"{
    const a=item.analysis||{}
    if(a.is_broll===true)return"broll"
    if(a.is_talking_head===true)return"talking_head"
    const tags=((a.scene_tags||[]).join(" ")+" "+(a.content_type||"")).toLowerCase()
    if(tags.includes("product")||tags.includes("close-up")||tags.includes("demo")||tags.includes("lifestyle")||tags.includes("b-roll")||tags.includes("ingredient"))return"broll"
    if(tags.includes("talking head")||tags.includes("person speaking"))return"talking_head"
    return"mixed"
  }

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
  const sortedMatched=[...fl(matched)].sort((a,b)=>{const ac=classifyItem(a)==="broll"?0:1;const bc=classifyItem(b)==="broll"?0:1;return ac-bc})
  const sortedOthers=[...fl(others)].sort((a,b)=>{const ac=classifyItem(a)==="broll"?0:1;const bc=classifyItem(b)==="broll"?0:1;return ac-bc})

  const clipCard=(item:Item)=>{
    const cls=classifyItem(item)
    return<div key={item.id} className="cursor-pointer relative" onClick={()=>{onSelect(item.id);onClose()}}>
      <VideoCard item={item} compact={false} highlight={item.id!==currentId} isSelected={item.id===currentId} onClick={()=>{}} selectMode={false} onToggleSelect={()=>{}}/>
      <div className={`absolute top-1 right-1 text-white text-[7px] font-extrabold px-1.5 py-0.5 rounded z-5 ${cls==="broll"?"bg-success/90":"bg-warning/90"}`}>{cls==="broll"?"B-ROLL":"TALKING"}</div>
    </div>
  }

  return<div onClick={onClose} className="bg-overlay fixed inset-0 z-[300] flex items-start justify-center pt-10 overflow-y-auto animate-fade-in">
    <div onClick={e=>e.stopPropagation()} className="bg-surface border border-border rounded-xl p-6 max-w-3xl w-full shadow-xl animate-scale-in mt-10 mb-10">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="font-bold text-[17px]">Change Clip</div>
          <div className="text-sm text-text-muted">for <strong className="text-text">{sectionLabel}</strong></div>
        </div>
        <button onClick={onClose} className="bg-transparent border border-border text-text-muted rounded-md px-3 py-1.5 text-xs cursor-pointer hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Search clips..." className="bg-surface border border-border rounded-md py-2 pl-9 pr-3 text-text text-sm outline-none w-full focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
        </div>
        <div className="flex gap-1">
          {([["all","All"],["broll","B-Roll"],["talking_head","Talking"]] as [typeof filterType,string][]).map(([v,l])=><button key={v} onClick={()=>setFilterType(v)} className={`rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${filterType===v?"bg-accent text-white":"bg-surface text-text-muted border border-border hover:border-border-strong"}`}>{l}</button>)}
        </div>
      </div>
      {!useApprovedOnly&&eligibleClips.length>0&&<div className="bg-warning-soft border border-warning/20 rounded-md p-3 text-xs text-warning mb-3 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> No approved clips yet. Showing all pending clips. Review clips in the Library to approve them.
      </div>}
      {sortedMatched.length>0&&<div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-wider text-success mb-3 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> AI-Matched ({sortedMatched.length})</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">{sortedMatched.map(clipCard)}</div>
      </div>}
      {sortedOthers.length>0&&<div>
        <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">All Library ({sortedOthers.length})</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">{sortedOthers.map(clipCard)}</div>
      </div>}
      {sortedMatched.length===0&&sortedOthers.length===0&&<div className="text-center py-10 text-text-muted">No clips found{filterType!=="all"?" with this filter. Try 'All'.":"."}</div>}
    </div>
  </div>
}
