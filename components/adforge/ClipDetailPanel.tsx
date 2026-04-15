'use client'
import { useState, useMemo } from 'react'
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
  const [errorMsg,setErrorMsg]=useState<string|null>(null)
  const [successMsg,setSuccessMsg]=useState<string|null>(null)

  function showMsg(type:'success'|'error', msg:string){
    if(type==='success'){setSuccessMsg(msg);setErrorMsg(null);setTimeout(()=>setSuccessMsg(null),2500)}
    else{setErrorMsg(msg);setSuccessMsg(null)}
  }

  const parentVideo = useMemo(()=>{
    if(!item.parent_id) return null
    return items.find(i=>i.id===item.parent_id)||null
  },[item.parent_id,items])

  const qualScore = item.analysis?.quality_score as string|undefined
  const qualColors:Record<string,{bg:string,color:string,label:string}>={
    High:{bg:'#22c55e22',color:'#22c55e',label:'High'},
    Medium:{bg:'#f59e0b22',color:'#f59e0b',label:'Medium'},
    Low:{bg:'#ef444422',color:'#ef4444',label:'Low'},
  }

  // Approval status update
  async function setStatus(status:'pending'|'approved'|'rejected'){
    setSaving(true)
    const { error } = await supabase.from('items').update({clip_status:status}).eq('id',item.id)
    setSaving(false)
    if(error){
      console.error('[ClipDetailPanel] setStatus error:',error)
      if(error.message?.toLowerCase().includes('column') && error.message?.toLowerCase().includes('clip_status')){
        showMsg('error','Missing DB column — run the SQL migration (ALTER TABLE items ADD COLUMN clip_status text DEFAULT \'pending\')')
      } else {
        showMsg('error','Update failed: '+error.message)
      }
      return
    }
    showMsg('success','Status updated to '+status)
    onUpdate()
  }

  // Role update
  async function setRole(role:string){
    setSaving(true)
    const { error } = await supabase.from('items').update({clip_role:role}).eq('id',item.id)
    setActiveRoleOpen(false)
    setSaving(false)
    if(error){
      console.error('[ClipDetailPanel] setRole error:',error)
      showMsg('error','Role update failed: '+error.message)
      return
    }
    showMsg('success','Role updated')
    onUpdate()
  }

  // Tags update
  async function updateTags(newTags:string[]){
    const analysis = {...(item.analysis||{}),scene_tags:newTags}
    const { error } = await supabase.from('items').update({analysis}).eq('id',item.id)
    if(error){
      console.error('[ClipDetailPanel] updateTags error:',error)
      showMsg('error','Tag update failed: '+error.message)
      return
    }
    onUpdate()
  }

  // Save trim
  async function saveTrim(){
    // Coerce all values to numbers (Supabase may return numeric columns as strings)
    const start = Number(trimStart ?? item.start_seconds ?? 0) || 0
    const end = Number(trimEnd ?? item.end_seconds ?? item.duration_seconds ?? 0) || 0
    const duration = Math.max(0, end - start)
    if(duration <= 0){
      showMsg('error','Invalid trim range (duration must be > 0)')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('items').update({
      start_seconds: start,
      end_seconds: end,
      duration_seconds: duration,
      thumbnail_time: start,
    }).eq('id',item.id)
    setSaving(false)
    if(error){
      console.error('[ClipDetailPanel] saveTrim error:',error,'values:',{start,end,duration})
      showMsg('error','Trim save failed: '+error.message)
      return
    }
    showMsg('success','Trim saved ('+duration.toFixed(1)+'s)')
    setTrimStart(null)
    setTrimEnd(null)
    onUpdate()
  }

  const statusButtons:{status:'approved'|'pending'|'rejected',label:string,color:string,icon:string}[] = [
    {status:'approved',label:'Approve',color:C.green,icon:'\u2713'},
    {status:'pending',label:'Pending',color:C.yellow,icon:'\u25CB'},
    {status:'rejected',label:'Reject',color:C.red,icon:'\u2717'},
  ]

  return <div style={{position:'fixed',top:0,right:0,width:370,height:'100vh',background:C.surface,borderLeft:'2px solid '+C.border,zIndex:500,display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(91,73,255,0.1)',fontFamily:'inherit'}}>

    {/* Header */}
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',borderBottom:'1.5px solid '+C.border,flexShrink:0}}>
      <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>{"\u00D7"}</button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text}}>{item.title}</div>
        {parentVideo&&<div style={{fontSize:10,color:C.muted,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{"\uD83D\uDCCE"} from {parentVideo.title}</div>}
      </div>
    </div>

    {/* Feedback banner */}
    {(errorMsg||successMsg)&&<div style={{padding:'10px 14px',borderBottom:'1px solid '+C.border,fontSize:12,fontWeight:600,background:errorMsg?'var(--af-red-soft)':'var(--af-green-soft)',color:errorMsg?'var(--af-red)':'var(--af-green)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <span>{errorMsg||successMsg}</span>
      <button onClick={()=>{setErrorMsg(null);setSuccessMsg(null)}} style={{background:'none',border:'none',color:'inherit',cursor:'pointer',opacity:0.6,fontSize:14,padding:0,lineHeight:1}}>×</button>
    </div>}

    {/* Scrollable body */}
    <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:16}}>

      {/* Video player — reflects live trim selection as user drags sliders */}
      {item.mux_playback_id&&<div style={{borderRadius:10,overflow:'hidden',background:'#000',aspectRatio:'9/16',maxHeight:280}}>
        <ClipSegmentPlayer
          playbackId={item.mux_playback_id}
          start={Number(trimStart ?? item.start_seconds ?? 0) || 0}
          end={Number(trimEnd ?? item.end_seconds ?? item.duration_seconds) || undefined}
          muted={false}
        />
      </div>}

      {/* Approval buttons */}
      <div>
        <Label>Status</Label>
        <div style={{display:'flex',gap:6}}>
          {statusButtons.map(b=>{
            const active = item.clip_status===b.status || (!item.clip_status && b.status==='pending')
            return <Btn key={b.status} onClick={()=>setStatus(b.status)} disabled={saving}
              style={{flex:1,background:active?b.color:C.surface,color:active?'#fff':b.color,border:'1.5px solid '+b.color,padding:'7px 4px',fontSize:11,borderRadius:8,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
              <span>{b.icon}</span> {b.label}
            </Btn>
          })}
        </div>
      </div>

      {/* Role selector */}
      <div>
        <Label>Clip Role</Label>
        <div style={{position:'relative'}}>
          <button onClick={()=>setActiveRoleOpen(!activeRoleOpen)}
            style={{width:'100%',background:C.surface,border:'1.5px solid '+C.border,borderRadius:8,padding:'8px 12px',fontSize:12,cursor:'pointer',color:C.text,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:'inherit'}}>
            {item.clip_role?(()=>{const rc=secColor(item.clip_role.toUpperCase());return<span style={{background:rc.bg,color:rc.color,padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700,border:'1px solid '+(rc.bd||rc.color+'22')}}>{item.clip_role.toUpperCase()}</span>})():<span style={{color:C.muted}}>Select role...</span>}
            <span style={{fontSize:8,opacity:0.5}}>{activeRoleOpen?'\u25B2':'\u25BC'}</span>
          </button>
          {activeRoleOpen&&<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:C.surface,border:'1px solid '+C.border,borderRadius:10,padding:4,zIndex:100,maxHeight:200,overflowY:'auto',boxShadow:'0 8px 24px #0003'}}>
            {CLIP_ROLES.map(role=>{
              const rc=secColor(role.toUpperCase())
              const active = item.clip_role===role
              return <div key={role} onClick={()=>setRole(role)}
                style={{padding:'6px 10px',borderRadius:6,cursor:'pointer',background:active?C.accentSoft:'transparent',display:'flex',alignItems:'center',gap:6,marginBottom:1}}>
                <span style={{background:rc.bg,color:rc.color,padding:'1px 6px',borderRadius:99,fontSize:10,fontWeight:700,border:'1px solid '+(rc.bd||rc.color+'22')}}>{role.toUpperCase()}</span>
              </div>
            })}
          </div>}
        </div>
      </div>

      {/* Quality score */}
      {qualScore&&<div>
        <Label>Quality Score</Label>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{background:qualColors[qualScore]?.bg||C.accentSoft,color:qualColors[qualScore]?.color||C.accent,padding:'4px 12px',borderRadius:99,fontSize:12,fontWeight:700}}>{qualScore}</span>
          <span style={{fontSize:11,color:C.muted}}>AI-assessed</span>
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
        <div style={{display:'flex',gap:12,fontSize:11,color:C.muted,marginBottom:8}}>
          <span>In: <strong style={{color:C.text}}>{fmt(trimStart??item.start_seconds??0)}</strong></span>
          <span>Out: <strong style={{color:C.text}}>{fmt(trimEnd??item.end_seconds??item.duration_seconds)}</strong></span>
          <span>Duration: <strong style={{color:C.text}}>{fmt((trimEnd??item.end_seconds??item.duration_seconds??0)-(trimStart??item.start_seconds??0))}</strong></span>
        </div>
        <TrimSlider item={item} trimStart={trimStart??item.start_seconds??0} trimEnd={trimEnd??item.end_seconds??item.duration_seconds} onUpdate={(v:{trimStart:number,trimEnd:number})=>{setTrimStart(v.trimStart);setTrimEnd(v.trimEnd)}}/>
        <div style={{marginTop:8}}>
          <Btn onClick={saveTrim} disabled={saving} style={{background:C.accent,color:'#fff',width:'100%',textAlign:'center',padding:'8px 0',fontSize:12}}>
            {saving?'Saving...':'Save Trim'}
          </Btn>
        </div>
      </div>}

      {/* Transcript */}
      {item.transcript&&<div>
        <Label>Transcript</Label>
        <div style={{background:C.bg,border:'1px solid '+C.border,borderRadius:10,padding:12,maxHeight:160,overflowY:'auto',fontSize:12,lineHeight:1.6,color:C.text,whiteSpace:'pre-wrap'}}>{item.transcript}</div>
      </div>}

      {/* Metadata */}
      <div>
        <Label>Metadata</Label>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {item.analysis?.content_type&&<MetaRow label="Content Type" value={item.analysis.content_type}/>}
          {item.analysis?.use_case&&<MetaRow label="Use Case" value={item.analysis.use_case}/>}
          {item.analysis?.creative_tags&&item.analysis.creative_tags.length>0&&<MetaRow label="Creative Tags" value={item.analysis.creative_tags.join(', ')}/>}
          {item.analysis?.ad_notes&&<MetaRow label="Ad Notes" value={item.analysis.ad_notes}/>}
          {item.creator&&<MetaRow label="Creator" value={`${item.creator}${item.creator_age?' \u00B7 '+item.creator_age:''}`}/>}
          {item.duration_seconds!=null&&<MetaRow label="Duration" value={fmt(item.duration_seconds)}/>}
          {item.created_at&&<MetaRow label="Created" value={new Date(item.created_at).toLocaleDateString()}/>}
        </div>
      </div>
    </div>
  </div>
}

function MetaRow({label,value}:{label:string,value:string}){
  return <div style={{display:'flex',gap:8,fontSize:11}}>
    <span style={{color:C.muted,minWidth:90,flexShrink:0}}>{label}</span>
    <span style={{color:C.text,fontWeight:500}}>{value}</span>
  </div>
}
