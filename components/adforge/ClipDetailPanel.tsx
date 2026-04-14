'use client'
import { useState, useMemo } from 'react'
import { X, Check, Circle, XCircle, ChevronDown, ChevronUp, Paperclip, Save, Loader2 } from 'lucide-react'
import { C, CLIP_ROLES } from './constants'
import { fmt, secColor } from './utils'
import { Btn, STitle, Label, Card } from './ui-primitives'
import { ClipSegmentPlayer } from './ClipSegmentPlayer'
import { TagEditor } from './TagEditor'
import { TrimSlider } from './TrimSlider'
import { createClient } from '@/lib/supabase/client'
import type { Item } from './types'

export function ClipDetailPanel({item,items,onClose,onUpdate,workspaceId}:{item:Item,items:Item[],onClose:()=>void,onUpdate:()=>void,workspaceId:string}){
  const supabase = createClient()
  const [saving,setSaving]=useState(false)
  const [trimStart,setTrimStart]=useState<number|null>(null)
  const [trimEnd,setTrimEnd]=useState<number|null>(null)
  const [activeRoleOpen,setActiveRoleOpen]=useState(false)

  const parentVideo = useMemo(()=>{
    if(!item.parent_id) return null
    return items.find(i=>i.id===item.parent_id)||null
  },[item.parent_id,items])

  const qualScore = item.analysis?.quality_score as string|undefined
  const qualColors:Record<string,{cls:string,label:string}>={
    High:{cls:'bg-success-soft text-success',label:'High'},
    Medium:{cls:'bg-warning-soft text-warning',label:'Medium'},
    Low:{cls:'bg-danger-soft text-danger',label:'Low'},
  }

  async function setStatus(status:'pending'|'approved'|'rejected'){
    setSaving(true)
    await supabase.from('items').update({clip_status:status}).eq('id',item.id)
    setSaving(false)
    onUpdate()
  }

  async function setRole(role:string){
    setSaving(true)
    await supabase.from('items').update({clip_role:role}).eq('id',item.id)
    setActiveRoleOpen(false)
    setSaving(false)
    onUpdate()
  }

  async function updateTags(newTags:string[]){
    const analysis = {...(item.analysis||{}),scene_tags:newTags}
    await supabase.from('items').update({analysis}).eq('id',item.id)
    onUpdate()
  }

  async function saveTrim(){
    const start = trimStart ?? item.start_seconds ?? 0
    const end = trimEnd ?? item.end_seconds ?? (item.duration_seconds||0)
    const duration = Math.max(0, end - start)
    setSaving(true)
    await supabase.from('items').update({
      start_seconds: start,
      end_seconds: end,
      duration_seconds: duration,
      thumbnail_time: start,
    }).eq('id',item.id)
    setSaving(false)
    onUpdate()
  }

  const statusButtons:{status:'approved'|'pending'|'rejected',label:string,color:string,icon:React.ReactNode}[] = [
    {status:'approved',label:'Approve',color:'success',icon:<Check className="w-3.5 h-3.5" />},
    {status:'pending',label:'Pending',color:'warning',icon:<Circle className="w-3.5 h-3.5" />},
    {status:'rejected',label:'Reject',color:'danger',icon:<XCircle className="w-3.5 h-3.5" />},
  ]

  return <div className="fixed top-0 right-0 w-[380px] h-screen bg-surface border-l border-border z-[500] flex flex-col shadow-xl animate-slide-in-right">

    {/* Header */}
    <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border flex-shrink-0">
      <button onClick={onClose} className="bg-transparent border-none text-xl cursor-pointer text-text-muted p-0 leading-none hover:text-text transition-colors duration-150">
        <X className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate text-text">{item.title}</div>
        {parentVideo&&<div className="text-[10px] text-text-muted mt-0.5 truncate flex items-center gap-1"><Paperclip className="w-3 h-3" /> from {parentVideo.title}</div>}
      </div>
    </div>

    {/* Scrollable body */}
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

      {/* Video player */}
      {item.mux_playback_id&&<div className="rounded-md overflow-hidden bg-black">
        <ClipSegmentPlayer playbackId={item.mux_playback_id} start={item.start_seconds||0} end={item.end_seconds} muted={false}/>
      </div>}

      {/* Approval buttons */}
      <div>
        <Label>Status</Label>
        <div className="flex gap-1.5">
          {statusButtons.map(b=>{
            const active = item.clip_status===b.status || (!item.clip_status && b.status==='pending')
            const colorMap:Record<string,{activeCls:string,inactiveCls:string}>={
              success:{activeCls:'bg-success text-white border-success',inactiveCls:'bg-surface text-success border-success hover:bg-success-soft'},
              warning:{activeCls:'bg-warning text-black border-warning',inactiveCls:'bg-surface text-warning border-warning hover:bg-warning-soft'},
              danger:{activeCls:'bg-danger text-white border-danger',inactiveCls:'bg-surface text-danger border-danger hover:bg-danger-soft'},
            }
            const cm=colorMap[b.color]||colorMap.warning
            return <Btn key={b.status} onClick={()=>setStatus(b.status)} disabled={saving}
              className={`flex-1 py-2 px-1 text-xs rounded-md text-center flex items-center justify-center gap-1 border-[1.5px] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${active?cm.activeCls:cm.inactiveCls}`}>
              {b.icon} {b.label}
            </Btn>
          })}
        </div>
      </div>

      {/* Role selector */}
      <div>
        <Label>Clip Role</Label>
        <div className="relative">
          <button onClick={()=>setActiveRoleOpen(!activeRoleOpen)}
            className="w-full bg-surface border-[1.5px] border-border rounded-md px-3 py-2 text-xs cursor-pointer text-text font-semibold flex items-center justify-between transition-all duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/50">
            {item.clip_role?(()=>{const rc=secColor(item.clip_role.toUpperCase());return<span className="text-xs font-bold px-2 py-0.5 rounded-full border" style={{background:rc.bg,color:rc.color,borderColor:rc.bd||rc.color+'22'}}>{item.clip_role.toUpperCase()}</span>})():<span className="text-text-muted">Select role...</span>}
            {activeRoleOpen?<ChevronUp className="w-3 h-3 opacity-50" />:<ChevronDown className="w-3 h-3 opacity-50" />}
          </button>
          {activeRoleOpen&&<div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-surface border border-border rounded-md p-1 z-[100] max-h-[200px] overflow-y-auto shadow-lg">
            {CLIP_ROLES.map(role=>{
              const rc=secColor(role.toUpperCase())
              const active = item.clip_role===role
              return <div key={role} onClick={()=>setRole(role)}
                className={`px-2.5 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 mb-0.5 transition-colors duration-150 ${active?'bg-accent-soft':'hover:bg-card-hover'}`}>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border" style={{background:rc.bg,color:rc.color,borderColor:rc.bd||rc.color+'22'}}>{role.toUpperCase()}</span>
              </div>
            })}
          </div>}
        </div>
      </div>

      {/* Quality score */}
      {qualScore&&<div>
        <Label>Quality Score</Label>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${qualColors[qualScore]?.cls||'bg-accent-soft text-accent'}`}>{qualScore}</span>
          <span className="text-xs text-text-muted">AI-assessed</span>
        </div>
      </div>}

      {/* Tags */}
      <div>
        <Label>Scene Tags</Label>
        <TagEditor tags={item.analysis?.scene_tags||[]} onUpdate={updateTags}/>
      </div>

      {/* Trim controls */}
      {item.mux_playback_id&&<div>
        <Label>Trim</Label>
        <div className="flex gap-3 text-xs text-text-muted mb-2">
          <span>In: <strong className="text-text">{fmt(trimStart??item.start_seconds??0)}</strong></span>
          <span>Out: <strong className="text-text">{fmt(trimEnd??item.end_seconds??item.duration_seconds)}</strong></span>
          <span>Duration: <strong className="text-text">{fmt((trimEnd??item.end_seconds??item.duration_seconds??0)-(trimStart??item.start_seconds??0))}</strong></span>
        </div>
        <TrimSlider item={item} trimStart={trimStart??item.start_seconds??0} trimEnd={trimEnd??item.end_seconds??item.duration_seconds} onUpdate={(s:number,e:number)=>{setTrimStart(s);setTrimEnd(e)}}/>
        <div className="mt-2">
          <Btn onClick={saveTrim} disabled={saving} className="bg-accent text-white w-full text-center py-2 text-xs rounded-md font-bold flex items-center justify-center gap-1.5 hover:bg-accent-hover transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
            {saving?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>:<><Save className="w-3.5 h-3.5" /> Save Trim</>}
          </Btn>
        </div>
      </div>}

      {/* Transcript */}
      {item.transcript&&<div>
        <Label>Transcript</Label>
        <div className="bg-bg border border-border rounded-md p-3 max-h-40 overflow-y-auto text-xs leading-relaxed text-text whitespace-pre-wrap">{item.transcript}</div>
      </div>}

      {/* Metadata */}
      <div>
        <Label>Metadata</Label>
        <div className="flex flex-col gap-1.5">
          {item.analysis?.content_type&&<MetaRow label="Content Type" value={item.analysis.content_type}/>}
          {item.analysis?.use_case&&<MetaRow label="Use Case" value={item.analysis.use_case}/>}
          {item.analysis?.creative_tags&&item.analysis.creative_tags.length>0&&<MetaRow label="Creative Tags" value={item.analysis.creative_tags.join(', ')}/>}
          {item.analysis?.ad_notes&&<MetaRow label="Ad Notes" value={item.analysis.ad_notes}/>}
          {item.creator&&<MetaRow label="Creator" value={`${item.creator}${item.creator_age?' · '+item.creator_age:''}`}/>}
          {item.duration_seconds!=null&&<MetaRow label="Duration" value={fmt(item.duration_seconds)}/>}
          {item.created_at&&<MetaRow label="Created" value={new Date(item.created_at).toLocaleDateString()}/>}
        </div>
      </div>
    </div>
  </div>
}

function MetaRow({label,value}:{label:string,value:string}){
  return <div className="flex gap-2 text-xs">
    <span className="text-text-muted min-w-[90px] flex-shrink-0">{label}</span>
    <span className="text-text font-medium">{value}</span>
  </div>
}
