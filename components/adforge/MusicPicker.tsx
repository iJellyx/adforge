'use client'
import { useState, useEffect, useRef } from 'react'
import { Music, Play, Pause, Check, AlertTriangle, Sparkles, X } from 'lucide-react'
import { MUSIC_MOODS, FALLBACK_TRACKS } from './constants'
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

  return<div className="bg-card border border-border rounded-lg p-5">
    <div className="flex items-center gap-2 font-bold text-base mb-1">
      <Music className="w-4 h-4" />
      Background Music
    </div>
    <p className="text-sm text-text-muted mb-3">Optional -- choose a royalty-free track.</p>
    {suggestedMood&&<div className="bg-accent-soft border border-accent/30 rounded-md px-3 py-2 text-xs text-accent mb-3 flex items-center gap-2">
      <Sparkles className="w-3.5 h-3.5" /> AI suggested: <strong>{suggestedMood}</strong>
    </div>}
    {error&&<div className="bg-warning-soft border border-warning/20 rounded-md px-3 py-2 text-xs text-warning mb-2.5 flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5" /> {error}
    </div>}
    <div className="flex gap-1.5 flex-wrap mb-3">
      {MUSIC_MOODS.map(m=><button key={m} onClick={()=>{setMood(m);search(m)}} className={`rounded-full px-3 py-1 text-xs font-semibold cursor-pointer transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${mood===m?"bg-accent text-white":"bg-surface text-text-muted border border-border hover:border-border-strong"}`}>{m}</button>)}
    </div>
    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
      {tracks.map((track:any)=><div key={track.id} onClick={()=>setSelectedTrack(selectedTrack?.id===track.id?null:track)} className={`flex items-center gap-3 p-3 rounded-md border-2 cursor-pointer transition-all duration-150 ${selectedTrack?.id===track.id?"border-accent bg-accent-soft":"border-border hover:border-border-strong"}`}>
        <button onClick={e=>{e.stopPropagation();togglePlay(track)}} className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${playingId===track.id?"bg-accent text-white":"bg-accent-soft hover:bg-accent text-accent hover:text-white"}`}>
          {playingId===track.id?<Pause className="w-3.5 h-3.5" />:<Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{track.name}</div>
          <div className="text-xs text-text-muted">by {track.artist} · {fmt(track.duration)}</div>
        </div>
        {selectedTrack?.id===track.id&&<Check className="w-4 h-4 text-accent flex-shrink-0" />}
      </div>)}
    </div>
    <div className="flex gap-2.5 mt-3">
      {selectedTrack&&<Btn onClick={()=>onSave(selectedTrack.url,selectedTrack.name)} className="bg-success text-black font-bold flex-1 flex items-center justify-center gap-1.5 transition-all duration-150 hover:bg-success/90 focus-visible:ring-2 focus-visible:ring-success/50">
        <Check className="w-3.5 h-3.5" /> Use "{selectedTrack.name}"
      </Btn>}
      <Btn onClick={()=>onSave(null,null)} className="bg-transparent border border-border text-text-muted hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-border">Skip Music</Btn>
    </div>
  </div>
}
