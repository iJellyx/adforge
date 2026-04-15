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
  const [uploadedTracks,setUploadedTracks]=useState<any[]>([])
  const [uploading,setUploading]=useState(false)
  const [uploadError,setUploadError]=useState("")
  const fileInputRef=useRef<HTMLInputElement>(null)
  const [tab,setTab]=useState<"library"|"upload">("library")

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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]
    if(!file)return
    setUploadError("")
    setUploading(true)
    try{
      // Measure duration client-side while upload runs
      const durationPromise=new Promise<number>(resolve=>{
        const audio=new Audio()
        audio.preload="metadata"
        audio.onloadedmetadata=()=>resolve(audio.duration||0)
        audio.onerror=()=>resolve(0)
        audio.src=URL.createObjectURL(file)
      })

      const fd=new FormData()
      fd.append("file",file)
      const res=await fetch("/api/music/upload",{method:"POST",body:fd})
      const data=await res.json()
      if(!res.ok){
        setUploadError(data.error||"Upload failed")
        setUploading(false)
        if(fileInputRef.current)fileInputRef.current.value=""
        return
      }

      const duration=await durationPromise
      const newTrack={
        id:"u_"+Date.now(),
        name:data.name||file.name.replace(/\.[^.]+$/,""),
        artist:"Uploaded",
        duration:Math.round(duration||0),
        url:data.url,
        preview_url:data.url,
        uploaded:true,
      }
      setUploadedTracks(prev=>[newTrack,...prev])
      setSelectedTrack(newTrack)
      setTab("upload")
      if(fileInputRef.current)fileInputRef.current.value=""
    }catch(err:any){
      setUploadError(err.message||"Upload failed")
    }
    setUploading(false)
  }

  const visibleTracks=tab==="upload"?uploadedTracks:tracks

  return <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:20}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🎵 Background Music</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Optional — choose a royalty-free track or upload your own.</div>

    {suggestedMood&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.accent,marginBottom:12}}>✨ AI suggested: <strong>{suggestedMood}</strong></div>}

    {/* Source tabs */}
    <div style={{display:"flex",gap:4,marginBottom:12,borderBottom:"1px solid "+C.border}}>
      <button onClick={()=>setTab("library")} style={{background:"none",border:"none",borderBottom:"2px solid "+(tab==="library"?C.accent:"transparent"),color:tab==="library"?C.accent:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:tab==="library"?700:500,fontFamily:"inherit"}}>
        Royalty-free library
      </button>
      <button onClick={()=>setTab("upload")} style={{background:"none",border:"none",borderBottom:"2px solid "+(tab==="upload"?C.accent:"transparent"),color:tab==="upload"?C.accent:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:tab==="upload"?700:500,fontFamily:"inherit"}}>
        Upload your own {uploadedTracks.length>0&&<span style={{background:C.accent,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 6px",marginLeft:4,fontWeight:800}}>{uploadedTracks.length}</span>}
      </button>
    </div>

    {tab==="library"&&<>
      {error&&<div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#fbbf24",marginBottom:10}}>⚠️ {error}</div>}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {MUSIC_MOODS.map(m=><button key={m} onClick={()=>{setMood(m);search(m)}} style={{background:mood===m?C.accent:C.surface,color:mood===m?"#fff":C.muted,border:"1px solid "+(mood===m?C.accent:C.border),borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{m}</button>)}
      </div>
    </>}

    {tab==="upload"&&<div style={{marginBottom:12}}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/m4a,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg"
        onChange={handleFileSelect}
        style={{display:"none"}}
      />
      <div onClick={()=>!uploading&&fileInputRef.current?.click()}
        onDragOver={e=>{e.preventDefault();e.stopPropagation()}}
        onDrop={async(e:React.DragEvent)=>{
          e.preventDefault()
          const f=e.dataTransfer.files?.[0]
          if(f&&fileInputRef.current){
            const dt=new DataTransfer()
            dt.items.add(f)
            fileInputRef.current.files=dt.files
            handleFileSelect({target:{files:dt.files}} as any)
          }
        }}
        style={{
          border:"2px dashed "+(uploading?C.accent:C.border),
          borderRadius:10,
          padding:"24px 16px",
          textAlign:"center",
          cursor:uploading?"default":"pointer",
          background:uploading?C.accentSoft:"transparent",
          transition:"all 0.15s",
          marginBottom:10,
        }}
      >
        {uploading?<>
          <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:4}}>Uploading…</div>
          <div style={{fontSize:11,color:C.muted}}>Don't refresh the page.</div>
        </>:<>
          <div style={{fontSize:22,marginBottom:6}}>⬆️</div>
          <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>Drop an audio file or click to choose</div>
          <div style={{fontSize:11,color:C.muted}}>MP3, WAV, M4A, OGG · Max 25MB</div>
        </>}
      </div>
      {uploadError&&<div style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:11,color:C.red,marginBottom:10}}>⚠️ {uploadError}</div>}
      {uploadedTracks.length===0&&!uploading&&<div style={{fontSize:11,color:C.muted,textAlign:"center",padding:"8px 0"}}>Your uploads will appear here</div>}
    </div>}

    <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:240,overflowY:"auto"}}>
      {visibleTracks.map((track:any)=><div key={track.id} onClick={()=>setSelectedTrack(selectedTrack?.id===track.id?null:track)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:"2px solid "+(selectedTrack?.id===track.id?C.accent:C.border),background:selectedTrack?.id===track.id?C.accentSoft:C.surface,cursor:"pointer"}}>
        <button onClick={e=>{e.stopPropagation();togglePlay(track)}} style={{width:30,height:30,borderRadius:"50%",background:playingId===track.id?C.accent:C.border,border:"none",color:"#fff",cursor:"pointer",fontSize:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{playingId===track.id?"⏸":"▶"}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{track.name}</div>
          <div style={{fontSize:11,color:C.muted}}>
            {track.uploaded?<span style={{background:C.accentSoft,color:C.accent,padding:"1px 6px",borderRadius:99,fontSize:9,fontWeight:700,marginRight:6}}>Your upload</span>:<>by {track.artist} · </>}
            {track.duration?fmt(track.duration):"—"}
          </div>
        </div>
        {selectedTrack?.id===track.id&&<span style={{color:C.accent,fontSize:12,fontWeight:700,flexShrink:0}}>✓</span>}
      </div>)}
      {tab==="library"&&visibleTracks.length===0&&loading&&<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"12px 0"}}>Loading…</div>}
    </div>

    <div style={{display:"flex",gap:10,marginTop:12}}>
      {selectedTrack&&<Btn onClick={()=>onSave(selectedTrack.url,selectedTrack.name)} style={{background:C.green,color:"#000",fontWeight:700,flex:1}}>✓ Use "{selectedTrack.name}"</Btn>}
      <Btn onClick={()=>onSave(null,null)} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Skip music</Btn>
    </div>
  </div>
}
