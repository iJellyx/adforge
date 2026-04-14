'use client'
import { useState, useEffect, useRef } from 'react'
import { C, MUSIC_MOODS, FALLBACK_TRACKS } from './constants'
import { fmt } from './utils'
import { Btn } from './ui-primitives'

export function MusicPicker({suggestedMood,onSave}:any){
  const [mood,setMood]=useState(suggestedMood||"Uplifting")
  const [tracks,setTracks]=useState<any[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const [selectedTrack,setSelectedTrack]=useState<any>(null)
  const [playingId,setPlayingId]=useState<string|null>(null)
  const audioRefs=useRef<Record<string,HTMLAudioElement>>({})

  async function search(searchMood?:string){
    const q=searchMood||mood
    setLoading(true);setError("")
    try{const res=await fetch(`/api/pixabay/music?q=${encodeURIComponent(q)}`);const d=await res.json();if(d.tracks&&d.tracks.length>0){setTracks(d.tracks)}else{setError(d.error||"No tracks found");setTracks(FALLBACK_TRACKS)}}catch{setError("Using sample tracks");setTracks(FALLBACK_TRACKS)}
    setLoading(false)
  }
  useEffect(()=>{search()},[])

    useEffect(()=>{
      return()=>{
        Object.values(audioRefs.current).forEach(a=>{a.pause();a.currentTime=0})
      }
    },[])

  function togglePlay(track:any){
    if(playingId===track.id){audioRefs.current[track.id]?.pause();setPlayingId(null)}
    else{Object.values(audioRefs.current).forEach(a=>a.pause());if(!audioRefs.current[track.id]){const a=new Audio(track.preview_url);audioRefs.current[track.id]=a;a.onended=()=>setPlayingId(null)}audioRefs.current[track.id].play().catch(()=>{});setPlayingId(track.id)}
  }

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:20}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🎵 Background Music</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Optional — choose a royalty-free track.</div>
    {suggestedMood&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.accent,marginBottom:12}}>✨ AI suggested: <strong>{suggestedMood}</strong></div>}
    {error&&<div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#fbbf24",marginBottom:10}}>⚠️ {error}</div>}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
      {MUSIC_MOODS.map(m=><button key={m} onClick={()=>{setMood(m);search(m)}} style={{background:mood===m?C.accent:C.surface,color:mood===m?"#fff":C.muted,border:"1px solid "+(mood===m?C.accent:C.border),borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{m}</button>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:240,overflowY:"auto"}}>
      {tracks.map((track:any)=><div key={track.id} onClick={()=>setSelectedTrack(selectedTrack?.id===track.id?null:track)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:"2px solid "+(selectedTrack?.id===track.id?C.accent:C.border),background:selectedTrack?.id===track.id?C.accentSoft:C.surface,cursor:"pointer"}}>
        <button onClick={e=>{e.stopPropagation();togglePlay(track)}} style={{width:30,height:30,borderRadius:"50%",background:playingId===track.id?C.accent:C.border,border:"none",color:"#fff",cursor:"pointer",fontSize:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{playingId===track.id?"⏸":"▶"}</button>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{track.name}</div><div style={{fontSize:11,color:C.muted}}>by {track.artist} · {fmt(track.duration)}</div></div>
        {selectedTrack?.id===track.id&&<span style={{color:C.accent,fontSize:12,fontWeight:700,flexShrink:0}}>✓</span>}
      </div>)}
    </div>
    <div style={{display:"flex",gap:10,marginTop:12}}>
      {selectedTrack&&<Btn onClick={()=>onSave(selectedTrack.url,selectedTrack.name)} style={{background:C.green,color:"#000",fontWeight:700,flex:1}}>✓ Use "{selectedTrack.name}"</Btn>}
      <Btn onClick={()=>onSave(null,null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Skip Music</Btn>
    </div>
  </div>
}
