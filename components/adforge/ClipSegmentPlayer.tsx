'use client'
import { useState, useEffect, useRef } from 'react'

export function ClipSegmentPlayer({playbackId,start,end,muted}:{playbackId:string,start:number,end?:number,muted:boolean}){
  const vidRef=useRef<HTMLVideoElement>(null)
  const [playing,setPlaying]=useState(false)
  const src=`https://stream.mux.com/${playbackId}/capped-1080p.mp4`

  useEffect(()=>{
    const v=vidRef.current;if(!v)return
    function seek(){if(v)v.currentTime=start}
    if(v.readyState>=1)seek();else v.addEventListener("loadedmetadata",seek,{once:true})
  },[src,start])

  function onTimeUpdate(){
    const v=vidRef.current;if(!v)return
    if(end&&v.currentTime>=end){v.pause();v.currentTime=start;setPlaying(false)}
  }

  function toggle(){
    const v=vidRef.current;if(!v)return
    if(playing){v.pause();setPlaying(false)}else{v.play().catch(()=>{});setPlaying(true)}
  }

  return(
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <video ref={vidRef} src={src} playsInline preload="metadata" muted={muted}
        style={{width:"100%",height:"100%",objectFit:"contain",maxHeight:"100%"}}
        onTimeUpdate={onTimeUpdate}
        onPlay={()=>setPlaying(true)}
        onPause={()=>setPlaying(false)}/>
      <div onClick={toggle} style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
        {!playing&&<div style={{width:36,height:36,borderRadius:"50%",background:"#000a",border:"2px solid #fff6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>▶</div>}
      </div>
    </div>
  )
}
