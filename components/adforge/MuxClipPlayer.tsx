'use client'
import MuxPlayer from "@mux/mux-player-react"
import { C } from './constants'
import { ClipSegmentPlayer } from './ClipSegmentPlayer'

export function MuxClipPlayer({item}:any){
  if(!item?.mux_playback_id)return<div style={{background:"#111",borderRadius:12,padding:32,textAlign:"center",color:C.muted,marginBottom:16}}><div style={{fontSize:32,marginBottom:8}}>🎬</div><div style={{fontSize:13}}>{item?.mux_status==="pending"||item?.mux_status==="analysing"?"Video is still processing…":"No video available"}</div></div>
  if(item.type==="clip"&&item.start_seconds!=null){
    return<div style={{borderRadius:12,overflow:"hidden",marginBottom:16,background:"#000",aspectRatio:"9/16",maxHeight:500,position:"relative"}}>
      <ClipSegmentPlayer playbackId={item.mux_playback_id} start={item.start_seconds||0} end={item.end_seconds} muted={false}/>
    </div>
  }
  return<div style={{borderRadius:12,overflow:"hidden",marginBottom:16,background:"#000"}}><MuxPlayer playbackId={item.mux_playback_id} startTime={item.start_seconds||0} streamType="on-demand" accentColor={C.accent} style={{width:"100%",aspectRatio:"9/16",maxHeight:500,display:"block"}}/></div>
}
