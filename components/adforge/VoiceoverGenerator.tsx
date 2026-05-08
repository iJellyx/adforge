'use client'
import { useState, useEffect } from 'react'
import { C } from './constants'
import { secColor } from './utils'
import { Btn, Label } from './ui-primitives'

export function VoiceoverGenerator({sections,allHookSections,onSave,onSkip}:any){
  const [voices,setVoices]=useState<any[]>([])
  const [selectedVoice,setSelectedVoice]=useState("")
  const [loading,setLoading]=useState(false)
  const [generating,setGenerating]=useState(false)
  const [progress,setProgress]=useState(0)
  const [error,setError]=useState("")
  const [voiceSearch,setVoiceSearch]=useState("")
  const [sectionAudios,setSectionAudios]=useState<Record<number,string>>({})
  const [allHookResults,setAllHookResults]=useState<any[][]|null>(null)
  const [regeneratingSection,setRegeneratingSection]=useState<number|null>(null)

  const sectionsWithWords=(sections||[]).filter((s:any)=>s.spokenWords?.trim())

  // Expose regenerateSection globally so ScriptTable can call it
  useEffect(()=>{
    (window as any).__voiceoverRegenerateSection=async(sectionIdx:number,callback:(success:boolean)=>void)=>{
      await regenerateSection(sectionIdx)
      callback(true)
    }
    return ()=>{delete(window as any).__voiceoverRegenerateSection}
  },[regenerateSection,sectionAudios,selectedVoice,sectionsWithWords])

  useEffect(()=>{
    setLoading(true)
    fetch("/api/elevenlabs/voices").then(r=>r.json()).then(d=>{
      if(d.voices&&d.voices.length>0){
        setVoices(d.voices)
        // Pre-select the user's last-used voice if it still exists in the
        // catalogue, else fall back to the first voice. Persistence is local
        // (per-browser) which matches single-user accounts; a real "default
        // voice" field on the brand is a future migration.
        let initial=d.voices[0].id
        try{
          const stored=typeof window!=="undefined"?window.localStorage.getItem("adforge.lastVoiceId"):null
          if(stored&&d.voices.some((v:any)=>v.id===stored))initial=stored
        }catch{/* private mode etc. */}
        setSelectedVoice(initial)
      }
      else setError(d.error||"Check your ELEVENLABS_API_KEY in Vercel Settings")
    }).catch(()=>setError("Could not connect to ElevenLabs")).finally(()=>setLoading(false))
  },[])

  // Persist whichever voice the user actually generated with so the next ad
  // pre-selects it. Saving on click-to-select would be too aggressive (user
  // might be auditioning); saving on generate captures intent.
  function rememberVoice(){
    try{ if(selectedVoice) window.localStorage.setItem("adforge.lastVoiceId", selectedVoice) }catch{/* ignore */}
  }

  // Auto-generate as soon as voices load AND there's a script — saves the user
  // a click on the most-used path. They can interrupt by hitting "Stop" or
  // changing the voice; we only fire once per mount and never if VO is
  // already in flight or has been generated this session.
  const autoGenFiredRef=useState({fired:false})[0]
  useEffect(()=>{
    if(loading||generating||error)return
    if(!selectedVoice||sectionsWithWords.length===0)return
    if(Object.keys(sectionAudios).length>0)return
    if(autoGenFiredRef.fired)return
    autoGenFiredRef.fired=true
    const t=setTimeout(()=>{ generateAll() }, 800) // small delay so user can change voice
    return ()=>clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading,selectedVoice,sectionsWithWords.length])
  const selectedVoiceObj=voices.find(v=>v.id===selectedVoice)
  const allGenerated=sectionsWithWords.length>0&&sectionsWithWords.every((_:any,i:number)=>sectionAudios[i])

  // Generate and upload audio for a single text
  async function generateAndUpload(text:string,idx:number,total:number):Promise<string>{
    setProgress(Math.round((idx/total)*90))
    const res=await fetch("/api/elevenlabs/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,voiceId:selectedVoice})})
    if(!res.ok)throw new Error(`ElevenLabs error: ${res.status}`)
    const blob=await res.blob()
    const file=new File([blob],`vo_${idx}_${Date.now()}.mp3`,{type:"audio/mpeg"})
    const fd=new FormData();fd.append("file",file)
    const upRes=await fetch("/api/voiceover/upload",{method:"POST",body:fd})
    const upData=await upRes.json()
    return upData.url||URL.createObjectURL(blob)
  }

  // Regenerate audio for a single section
  async function regenerateSection(sectionIdx:number){
    if(!selectedVoice||!sectionsWithWords[sectionIdx])return
    setRegeneratingSection(sectionIdx);setError("")
    try{
      const sec=sectionsWithWords[sectionIdx]
      const newAudioUrl=await generateAndUpload(sec.spokenWords,sectionIdx,sectionsWithWords.length)
      const newAudios={...sectionAudios,[sectionIdx]:newAudioUrl}
      setSectionAudios(newAudios)

      // Re-stitch all section audios
      try{
        const sectionUrls=sectionsWithWords.map((_:any,i:number)=>newAudios[i]).filter(Boolean)
        if(sectionUrls.length>1){
          const stitchRes=await fetch("/api/voiceover/stitch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sectionUrls})})
          const stitchData=await stitchRes.json()
          if(stitchData.url){
            ;(window as any).__voStitchData={url:stitchData.url,sectionOffsets:stitchData.sectionOffsets,sectionDurations:stitchData.sectionDurations,wordTimestamps:stitchData.wordTimestamps||[]}
          }
        }
      }catch(e){console.warn("Stitch failed, using individual section URL:",e)}
    }catch(e:any){setError(e.message)}
    setRegeneratingSection(null)
  }

  async function generateAll(){
    if(!selectedVoice||!sectionsWithWords.length)return
    rememberVoice()
    setGenerating(true);setError("");setProgress(0)

    try{
      if(allHookSections&&allHookSections.length>1){
        // Generate voiceovers for all hook variations
        // Body sections are shared — generate once
        const bodySections=sectionsWithWords.filter((s:any)=>s.type!=="HOOK")
        const bodyAudios:Record<number,string>={}
        for(let i=0;i<bodySections.length;i++){
          const sec=bodySections[i]
          const bodyIdx=sectionsWithWords.findIndex((s:any)=>s===sec)
          bodyAudios[bodyIdx]=await generateAndUpload(sec.spokenWords,i,bodySections.length+allHookSections.length)
        }

        // Generate hook voiceover for each variation separately
        const allUpdatedHooks:any[][]=[]
        for(let hi=0;hi<allHookSections.length;hi++){
          const hookVariationSecs=allHookSections[hi]
          const hookSec=hookVariationSecs.find((s:any)=>s.type==="HOOK")
          const hookAudio=hookSec?await generateAndUpload(hookSec.spokenWords,bodySections.length+hi,bodySections.length+allHookSections.length):null

          // Build updated sections for this hook variation
          const updatedSecs=hookVariationSecs.map((s:any,si:number)=>{
            if(s.type==="HOOK")return{...s,voiceover_url:hookAudio}
            const bodyIdx=sectionsWithWords.findIndex((bs:any)=>bs.spokenWords===s.spokenWords)
            return{...s,voiceover_url:bodyAudios[bodyIdx]||null}
          })
          allUpdatedHooks.push(updatedSecs)
        }

        const newAudios:Record<number,string>={}
        allUpdatedHooks[0].forEach((s:any,i:number)=>{if(s.voiceover_url)newAudios[i]=s.voiceover_url})
        setSectionAudios(newAudios)
        setProgress(100)
        const combinedUrl=allUpdatedHooks[0].find((s:any)=>s.voiceover_url)?.voiceover_url||""
        setAllHookResults(allUpdatedHooks)
        setGenerating(false)
        return
      }

      // Single hook — original flow
      const newAudios:Record<number,string>={}
      for(let i=0;i<sectionsWithWords.length;i++){
        newAudios[i]=await generateAndUpload(sectionsWithWords[i].spokenWords,i,sectionsWithWords.length)
      }
      setSectionAudios(newAudios)

      // Stitch all section audios into one continuous voiceover
      try{
        setProgress(95)
        const sectionUrls=sectionsWithWords.map((_:any,i:number)=>newAudios[i]).filter(Boolean)
        if(sectionUrls.length>1){
          const stitchRes=await fetch("/api/voiceover/stitch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sectionUrls})})
          const stitchData=await stitchRes.json()
          if(stitchData.url){
            ;(window as any).__voStitchData={url:stitchData.url,sectionOffsets:stitchData.sectionOffsets,sectionDurations:stitchData.sectionDurations,wordTimestamps:stitchData.wordTimestamps||[]}
          }
        }
      }catch(e){console.warn("Stitch failed, using first section URL:",e)}

      setProgress(100)
    }catch(e:any){setError(e.message)}
    setGenerating(false)
  }
  const filteredVoices=voices.filter(v=>!voiceSearch||v.name.toLowerCase().includes(voiceSearch.toLowerCase())||(v.gender||"").toLowerCase().includes(voiceSearch.toLowerCase())||(v.accent||"").toLowerCase().includes(voiceSearch.toLowerCase()))

  return<div style={{background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:20}}>
    <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>🎙️ AI Voiceover — Per Section</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Generates a separate voiceover for each script section — perfectly synced to each clip.</div>
    {loading&&<div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading voices…</div>}
    {!loading&&error&&voices.length===0&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{error}</div>}
    {!loading&&voices.length>0&&<>
      <div style={{marginBottom:12}}>
        <Label>Select Voice</Label>
        <input value={voiceSearch} onChange={e=>setVoiceSearch(e.target.value)} placeholder="Filter by name, gender, accent…" style={{background:C.surface,border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,marginBottom:8}}/>
        <div style={{maxHeight:160,overflowY:"auto",border:"1px solid "+C.border,borderRadius:10}}>
          {filteredVoices.map((v:any)=><div key={v.id} onClick={()=>setSelectedVoice(v.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer",background:selectedVoice===v.id?C.accentSoft:"transparent",borderBottom:"1px solid "+C.border}}>
            <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid "+(selectedVoice===v.id?C.accent:C.border),background:selectedVoice===v.id?C.accent:"transparent",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:selectedVoice===v.id?C.accent:C.text}}>{v.name}</div><div style={{fontSize:10,color:C.muted}}>{[v.gender,v.age,v.accent].filter(Boolean).join(" · ")}</div></div>
            {v.preview_url&&<button onClick={e=>{e.stopPropagation();new Audio(v.preview_url).play()}} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11}}>▶</button>}
          </div>)}
        </div>
      </div>

      {/* Section preview */}
      <div style={{marginBottom:14}}>
        {allHookSections&&allHookSections.length>1
          ?<>
            <Label>Voiceovers to generate across {allHookSections.length} hook variations</Label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {allHookSections.map((hookSecs:any[],hi:number)=>{
                const hookSec=hookSecs.find((s:any)=>s.type==="HOOK")
                const isFirst=hi===0
                const bodySections=hookSecs.filter((s:any)=>s.type!=="HOOK")
                return<div key={hi} style={{background:C.surface,borderRadius:10,border:"1px solid "+C.border,overflow:"hidden"}}>
                  <div style={{padding:"8px 12px",background:isFirst?"#ffffff08":C.accentSoft,borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:isFirst?C.text:C.accent}}>{isFirst?"Original Hook":"Hook "+(hi+1)+" — AI Variation"}</span>
                    {allHookResults&&<span style={{color:C.green,fontSize:12,marginLeft:"auto"}}>✓ Generated</span>}
                  </div>
                  <div style={{padding:"8px 12px"}}>
                    <div style={{fontSize:12,color:C.text,marginBottom:6,fontStyle:"italic"}}>"{hookSec?.spokenWords?.substring(0,80)}…"</div>
                    {hi===0&&<div style={{fontSize:10,color:C.muted}}>+ {bodySections.length} body sections shared across all variations</div>}
                    {hi>0&&<div style={{fontSize:10,color:C.muted}}>Hook audio unique · Body audio shared from Hook 1</div>}
                  </div>
                </div>
              })}
            </div>
          </>
          :<>
            <Label>Script Sections ({sectionsWithWords.length} sections to voice)</Label>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
              {sectionsWithWords.map((s:any,i:number)=>{
                const sc=secColor(s.type)
                const hasAudio=!!sectionAudios[i]
                const isRegenerating=regeneratingSection===i
                return<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:C.surface,borderRadius:8,border:"1px solid "+(hasAudio?C.green:C.border)}}>
                  <span style={{background:sc.bg,color:sc.color,fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:4,flexShrink:0}}>{s.type}</span>
                  <div style={{flex:1,fontSize:11,color:C.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{s.spokenWords}</div>
                  {hasAudio?<audio src={sectionAudios[i]} controls style={{height:24,width:120}}/>:<span style={{fontSize:10,color:C.muted}}>Not generated</span>}
                  {hasAudio&&<button onClick={()=>regenerateSection(i)} disabled={isRegenerating||!selectedVoice} title="Regenerate this section" style={{background:"none",border:"none",color:isRegenerating?C.muted:C.accent,cursor:isRegenerating?"default":"pointer",fontSize:13,padding:"2px 6px",display:"flex",alignItems:"center",justifyContent:"center",opacity:isRegenerating?0.6:1}}>{isRegenerating?"⏳":"🔄"}</button>}
                  {hasAudio&&!isRegenerating&&<span style={{color:C.green,fontSize:12}}>✓</span>}
                </div>
              })}
            </div>
          </>}
      </div>

      {generating&&<div style={{marginBottom:12}}>
        <div style={{height:5,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:progress+"%",background:C.accent,borderRadius:4,transition:"width 0.3s"}}/></div>
        <div style={{fontSize:11,color:C.muted}}>Generating section {Math.ceil(progress/100*sectionsWithWords.length)+1} of {sectionsWithWords.length}…</div>
      </div>}
      {error&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#ef4444",marginBottom:12}}>{error}</div>}

      <div style={{display:"flex",gap:10}}>
        <Btn onClick={generateAll} disabled={generating||!sectionsWithWords.length||!selectedVoice} style={{background:generating?C.border:C.accent,color:"#fff",flex:1}}>{generating?"⏳ Generating…":allGenerated?"🔄 Regenerate All":"🎙️ Generate Voiceovers"}</Btn>
        {(allGenerated||allHookResults)&&<Btn onClick={()=>{
          if(allHookResults){
            const combinedUrl=allHookResults[0].find((s:any)=>s.voiceover_url)?.voiceover_url||""
            onSave(allHookResults[0],selectedVoiceObj?.name||selectedVoice,combinedUrl,allHookResults)
          } else {
            const stitchData=(window as any).__voStitchData
            const allWordTimestamps=stitchData?.wordTimestamps||[]
            const updatedSections=sectionsWithWords.map((s:any,i:number)=>{
              const base=sectionAudios[i]?{...s,voiceover_url:sectionAudios[i]}:s
              if(stitchData?.sectionOffsets){
                const voOffset=stitchData.sectionOffsets[i]||0
                const voDuration=stitchData.sectionDurations[i]||0
                // Extract word timestamps for this section
                const sectionEnd=i<stitchData.sectionOffsets.length-1?stitchData.sectionOffsets[i+1]:Infinity
                const sectionWordTimestamps=allWordTimestamps.filter((w:any)=>w.start>=voOffset-0.05&&w.start<sectionEnd-0.05).map((w:any)=>({word:w.word,start:w.start-voOffset,end:w.end-voOffset}))
                return{...base,vo_offset:voOffset,vo_duration:voDuration,word_timestamps:sectionWordTimestamps}
              }
              return base
            })
            const combinedUrl=stitchData?.url||Object.values(sectionAudios)[0] as string
            onSave(updatedSections,selectedVoiceObj?.name||selectedVoice,combinedUrl,null)
          }
        }} style={{background:C.green,color:"#000",fontWeight:700}}>✓ Use These</Btn>}
      </div>
    </>}
    <div style={{textAlign:"center",marginTop:12}}><button onClick={onSkip} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Skip — my video already has audio</button></div>
  </div>
}
