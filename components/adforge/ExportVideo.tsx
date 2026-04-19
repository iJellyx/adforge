'use client'
import { useState } from 'react'
import type { Item } from './types'
import { C } from './constants'
import { Btn } from './ui-primitives'

export function ExportVideo({sections,libraryItems,voiceoverUrl,musicUrl,onSave,aspectRatio}:any){
  const [exporting,setExporting]=useState(false)
  const [progress,setProgress]=useState(0)
  const [msg,setMsg]=useState("")
  const [done,setDone]=useState(false)

  const clips=(sections||[]).map((s:any)=>{
    const item=s.selectedClipId?libraryItems.find((i:Item)=>i.id===s.selectedClipId):null
    if(!item?.mux_playback_id)return null
    return{item,label:s.type||s.label||"",selectedClipId:s.selectedClipId}
  }).filter(Boolean)

  async function doExport(){
  if(!clips.length){setMsg("No clips assigned — assign clips to all sections before exporting.");return}
  setExporting(true);setDone(false);setProgress(10);setMsg("Submitting to Shotstack…")
  try{
    const itemIds=clips.map((c:any)=>c.item.id)
    // Save to Forged Ads first if not already saved
    let savedAdId:string|null=null
    if(onSave){
      setMsg("Saving ad…")
      savedAdId=await onSave()
    }
    const res=await fetch("/api/export",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        sections:sections.filter((s:any)=>s.selectedClipId),
        itemIds,
        voiceoverUrl:voiceoverUrl||null,
        musicUrl:musicUrl||null,
        aspectRatio:aspectRatio||"9:16",
      })
    })
    const rawText=await res.text()
    let data:any
    try{data=JSON.parse(rawText)}catch{throw new Error(rawText.substring(0,200))}
    if(!res.ok)throw new Error(data.error||`Server error: ${res.status}`)

    if(data.url){
      setProgress(95);setMsg("Downloading MP4…")
      const dlRes=await fetch(`/api/export/status?id=${data.renderId}&download=true`)
      const blob=await dlRes.blob()
      const blobUrl=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=blobUrl
      a.download=`adforge-ad-${Date.now()}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
      setProgress(100);setMsg("✓ MP4 ready!");setDone(true)
    } else if(data.renderId){
      // Still rendering — poll from client
      setProgress(50);setMsg("Rendering video… (this takes 1–2 mins)")
      const renderId=data.renderId
      const apiKey=process.env.NEXT_PUBLIC_SHOTSTACK_API_KEY||""
      let attempts=0
      while(attempts<40){
        await new Promise(r=>setTimeout(r,4000))
        const statusRes=await fetch(`/api/export/status?id=${renderId}`)
        const statusData=await statusRes.json()
        if(statusData.url){
         setProgress(95);setMsg("Downloading MP4…")
         const dlRes=await fetch(`/api/export/status?id=${renderId}&download=true`)
         const blob=await dlRes.blob()
         const blobUrl=URL.createObjectURL(blob)
         const a=document.createElement("a")
         a.href=blobUrl
         a.download=`adforge-ad-${Date.now()}.mp4`
         a.click()
  setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
          setProgress(100);setMsg("✓ MP4 ready!");setDone(true)
          break
        }
        if(statusData.failed)throw new Error("Render failed on Shotstack")
        attempts++
        setProgress(50+Math.round(attempts/40*40));setMsg(`Rendering… ${Math.round((attempts/40)*100)}%`)
      }
    }
  }catch(e:any){
    setMsg("Export failed: "+e.message)
    console.error(e)
  }
  setExporting(false)
}

  const assignedCount=clips.length
  const total=(sections||[]).length

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:20,marginTop:16}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>⬇️ Export Final Ad as MP4</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Stitches all clips{voiceoverUrl?" + voiceover":""}{musicUrl?" + music":""} into a single MP4 file on the server.</div>
    <div style={{background:"#ffffff08",border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.muted,marginBottom:12}}>⚠️ Requires Mux paid plan for MP4 access. Max ~60s of total ad length on Vercel's free plan.</div>
    <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
      <div style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"7px 12px",fontSize:12}}>🎬 {assignedCount}/{total} clips assigned</div>
      {voiceoverUrl&&<div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,padding:"7px 12px",fontSize:12,color:C.green}}>🎙️ Voiceover ready</div>}
      {musicUrl&&<div style={{background:"#6c63ff11",border:"1px solid #6c63ff33",borderRadius:8,padding:"7px 12px",fontSize:12,color:C.accent}}>🎵 Music selected</div>}
    </div>
    {exporting&&<div style={{marginBottom:14}}>
      <div style={{height:6,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",width:progress+"%",background:C.green,borderRadius:4,transition:"width 0.5s"}}/></div>
      <div style={{fontSize:12,color:C.muted}}>{msg}</div>
    </div>}
    {!exporting&&msg&&<div style={{fontSize:13,color:done?C.green:C.red,marginBottom:12,fontWeight:600}}>{msg}</div>}
    <Btn onClick={doExport} disabled={exporting||assignedCount===0} style={{background:exporting?C.border:C.green,color:exporting?"#aaa":"#000",fontWeight:700,width:"100%",padding:14,fontSize:15,borderRadius:12}}>
      {exporting?`⏳ ${msg}`:"⬇️ Download MP4"}
    </Btn>
  </div>
}
