'use client'
import { useState, useRef } from 'react'
import { C } from './constants'
import { fmt, toNum, fx } from './utils'

export function TrimSlider({item,trimStart,trimEnd,onUpdate}:any){
  const dur=toNum(item.duration_seconds,30)
  const start=toNum(trimStart??item.start_seconds,0)
  const end=toNum(trimEnd??item.end_seconds,dur)
  const vidRef=useRef<HTMLVideoElement>(null)
  const [scrub,setScrub]=useState(start)

  function preview(t:number){
    const v=vidRef.current;if(!v)return
    v.currentTime=t;setScrub(t)
  }

  return<div style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:10,padding:10,marginBottom:6}}>
    <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Trim clip</div>
    <div style={{position:"relative",paddingTop:"56.25%",background:"#111",borderRadius:7,overflow:"hidden",marginBottom:8}}>
      <video ref={vidRef} src={`https://stream.mux.com/${item.mux_playback_id}/capped-1080p.mp4`} playsInline preload="metadata" muted style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
    </div>
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:3}}>
        <span>In: {fx(start)}s</span>
        <span>Out: {fx(end)}s</span>
        <span>Dur: {fx(end-start)}s</span>
      </div>
      <input type="range" min={0} max={dur} step={0.1} value={start} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:v,trimEnd:Math.max(v+0.5,end)})}} style={{width:"100%",accentColor:C.accent,marginBottom:4}}/>
      <input type="range" min={0} max={dur} step={0.1} value={end} onChange={e=>{const v=parseFloat(e.target.value);preview(v);onUpdate({trimStart:Math.min(start,v-0.5),trimEnd:v})}} style={{width:"100%",accentColor:"#DC2626"}}/>
    </div>
    <div style={{display:"flex",gap:4}}>
      <button onClick={()=>onUpdate({trimStart:item.start_seconds??0,trimEnd:item.end_seconds??dur})} style={{flex:1,background:"#EDE8FF",color:C.accent,border:"none",borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9,fontWeight:700}}>Reset</button>
      <button onClick={()=>preview(start)} style={{flex:1,background:C.surface,color:C.muted,border:"1.5px solid "+C.border,borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9}}>Preview In</button>
      <button onClick={()=>preview(end-0.5)} style={{flex:1,background:C.surface,color:C.muted,border:"1.5px solid "+C.border,borderRadius:6,padding:"4px",cursor:"pointer",fontSize:9}}>Preview Out</button>
    </div>
  </div>
}
