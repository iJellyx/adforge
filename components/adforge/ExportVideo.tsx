'use client'
import { useState } from 'react'
import { Download, AlertTriangle, Loader2, Film, Mic, Music } from 'lucide-react'
import type { Item } from './types'
import { Btn } from './ui-primitives'

export function ExportVideo({sections,libraryItems,voiceoverUrl,musicUrl,onSave}:any){
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
  if(!clips.length){setMsg("No clips assigned -- assign clips to all sections before exporting.");return}
  setExporting(true);setDone(false);setProgress(10);setMsg("Submitting to Shotstack...")
  try{
    const itemIds=clips.map((c:any)=>c.item.id)
    let savedAdId:string|null=null
    if(onSave){
      setMsg("Saving ad...")
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
      })
    })
    const rawText=await res.text()
    let data:any
    try{data=JSON.parse(rawText)}catch{throw new Error(rawText.substring(0,200))}
    if(!res.ok)throw new Error(data.error||`Server error: ${res.status}`)

    if(data.url){
      setProgress(95);setMsg("Downloading MP4...")
      const dlRes=await fetch(`/api/export/status?id=${data.renderId}&download=true`)
      const blob=await dlRes.blob()
      const blobUrl=URL.createObjectURL(blob)
      const a=document.createElement("a")
      a.href=blobUrl
      a.download=`adforge-ad-${Date.now()}.mp4`
      a.click()
      setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
      setProgress(100);setMsg("MP4 ready!");setDone(true)
    } else if(data.renderId){
      setProgress(50);setMsg("Rendering video... (this takes 1-2 mins)")
      const renderId=data.renderId
      let attempts=0
      while(attempts<40){
        await new Promise(r=>setTimeout(r,4000))
        const statusRes=await fetch(`/api/export/status?id=${renderId}`)
        const statusData=await statusRes.json()
        if(statusData.url){
         setProgress(95);setMsg("Downloading MP4...")
         const dlRes=await fetch(`/api/export/status?id=${renderId}&download=true`)
         const blob=await dlRes.blob()
         const blobUrl=URL.createObjectURL(blob)
         const a=document.createElement("a")
         a.href=blobUrl
         a.download=`adforge-ad-${Date.now()}.mp4`
         a.click()
         setTimeout(()=>URL.revokeObjectURL(blobUrl),15000)
          setProgress(100);setMsg("MP4 ready!");setDone(true)
          break
        }
        if(statusData.failed)throw new Error("Render failed on Shotstack")
        attempts++
        setProgress(50+Math.round(attempts/40*40));setMsg(`Rendering... ${Math.round((attempts/40)*100)}%`)
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

  return<div className="bg-card border border-border rounded-lg p-5 mt-4">
    <div className="flex items-center gap-2 font-bold text-base mb-1">
      <Download className="w-4 h-4" />
      Export Final Ad as MP4
    </div>
    <p className="text-sm text-text-muted mb-3">Stitches all clips{voiceoverUrl?" + voiceover":""}{musicUrl?" + music":""} into a single MP4 file on the server.</p>
    <div className="bg-surface border border-border rounded-md px-3 py-2 text-xs text-text-muted mb-3 flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
      Requires Mux paid plan for MP4 access. Max ~60s of total ad length on Vercel's free plan.
    </div>
    <div className="flex gap-2.5 mb-3 flex-wrap">
      <div className="bg-surface border border-border rounded-md px-3 py-2 text-xs flex items-center gap-1.5">
        <Film className="w-3.5 h-3.5" /> {assignedCount}/{total} clips assigned
      </div>
      {voiceoverUrl&&<div className="bg-success-soft border border-success/30 rounded-md px-3 py-2 text-xs text-success flex items-center gap-1.5">
        <Mic className="w-3.5 h-3.5" /> Voiceover ready
      </div>}
      {musicUrl&&<div className="bg-accent-soft border border-accent/30 rounded-md px-3 py-2 text-xs text-accent flex items-center gap-1.5">
        <Music className="w-3.5 h-3.5" /> Music selected
      </div>}
    </div>
    {exporting&&<div className="mb-3.5">
      <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
        <div className="h-full bg-success rounded-full transition-all duration-500" style={{width:progress+"%"}} />
      </div>
      <div className="text-xs text-text-muted">{msg}</div>
    </div>}
    {!exporting&&msg&&<div className={`text-sm mb-3 font-semibold ${done?"text-success":"text-danger"}`}>{msg}</div>}
    <Btn
      onClick={doExport}
      disabled={exporting||assignedCount===0}
      className={`w-full py-3.5 rounded-lg text-base font-bold transition-all duration-150 flex items-center justify-center gap-2 ${
        exporting
          ? "bg-border text-text-muted cursor-not-allowed"
          : "bg-success text-black hover:bg-success/90 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-success/50"
      }`}
    >
      {exporting?<><Loader2 className="w-4 h-4 animate-spin" /> {msg}</>:<><Download className="w-4 h-4" /> Download MP4</>}
    </Btn>
  </div>
}
