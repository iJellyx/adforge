'use client'
import { useState, useEffect } from 'react'
import { Mic, Volume2, RefreshCw, Play, Pause, Check, Loader2, Search, AlertTriangle, Sparkles } from 'lucide-react'
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
      if(d.voices&&d.voices.length>0){setVoices(d.voices);setSelectedVoice(d.voices[0].id)}
      else setError(d.error||"Check your ELEVENLABS_API_KEY in Vercel Settings")
    }).catch(()=>setError("Could not connect to ElevenLabs")).finally(()=>setLoading(false))
  },[])
  const selectedVoiceObj=voices.find(v=>v.id===selectedVoice)
  const allGenerated=sectionsWithWords.length>0&&sectionsWithWords.every((_:any,i:number)=>sectionAudios[i])

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

  async function regenerateSection(sectionIdx:number){
    if(!selectedVoice||!sectionsWithWords[sectionIdx])return
    setRegeneratingSection(sectionIdx);setError("")
    try{
      const sec=sectionsWithWords[sectionIdx]
      const newAudioUrl=await generateAndUpload(sec.spokenWords,sectionIdx,sectionsWithWords.length)
      const newAudios={...sectionAudios,[sectionIdx]:newAudioUrl}
      setSectionAudios(newAudios)
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
    setGenerating(true);setError("");setProgress(0)

    try{
      if(allHookSections&&allHookSections.length>1){
        const bodySections=sectionsWithWords.filter((s:any)=>s.type!=="HOOK")
        const bodyAudios:Record<number,string>={}
        for(let i=0;i<bodySections.length;i++){
          const sec=bodySections[i]
          const bodyIdx=sectionsWithWords.findIndex((s:any)=>s===sec)
          bodyAudios[bodyIdx]=await generateAndUpload(sec.spokenWords,i,bodySections.length+allHookSections.length)
        }
        const allUpdatedHooks:any[][]=[]
        for(let hi=0;hi<allHookSections.length;hi++){
          const hookVariationSecs=allHookSections[hi]
          const hookSec=hookVariationSecs.find((s:any)=>s.type==="HOOK")
          const hookAudio=hookSec?await generateAndUpload(hookSec.spokenWords,bodySections.length+hi,bodySections.length+allHookSections.length):null
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

      const newAudios:Record<number,string>={}
      for(let i=0;i<sectionsWithWords.length;i++){
        newAudios[i]=await generateAndUpload(sectionsWithWords[i].spokenWords,i,sectionsWithWords.length)
      }
      setSectionAudios(newAudios)

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

  return<div className="bg-card border border-border rounded-lg p-5">
    <div className="flex items-center gap-2 font-bold text-base mb-1">
      <Mic className="w-4 h-4" />
      AI Voiceover -- Per Section
    </div>
    <p className="text-sm text-text-muted mb-4">Generates a separate voiceover for each script section -- perfectly synced to each clip.</p>
    {loading&&<div className="text-text-muted text-sm py-5 text-center">Loading voices...</div>}
    {!loading&&error&&voices.length===0&&<div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2.5 text-xs text-danger mb-3">{error}</div>}
    {!loading&&voices.length>0&&<>
      <div className="mb-3">
        <Label>Select Voice</Label>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input value={voiceSearch} onChange={e=>setVoiceSearch(e.target.value)} placeholder="Filter by name, gender, accent..." className="bg-surface border border-border rounded-md py-2 pl-9 pr-3 text-text text-sm outline-none w-full focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
        </div>
        <div className="max-h-40 overflow-y-auto border border-border rounded-md">
          {filteredVoices.map((v:any)=><div key={v.id} onClick={()=>setSelectedVoice(v.id)} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-border transition-colors duration-150 ${selectedVoice===v.id?"bg-accent-soft":""} hover:bg-card-hover`}>
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all duration-150 ${selectedVoice===v.id?"border-accent bg-accent":"border-border bg-transparent"}`}/>
            <div className="flex-1">
              <div className={`font-semibold text-sm ${selectedVoice===v.id?"text-accent":"text-text"}`}>{v.name}</div>
              <div className="text-[10px] text-text-muted">{[v.gender,v.age,v.accent].filter(Boolean).join(" · ")}</div>
            </div>
            {v.preview_url&&<button onClick={e=>{e.stopPropagation();new Audio(v.preview_url).play()}} className="bg-surface border border-border text-text-muted rounded-md px-2 py-0.5 cursor-pointer text-xs hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
              <Play className="w-3 h-3" />
            </button>}
          </div>)}
        </div>
      </div>

      {/* Section preview */}
      <div className="mb-3.5">
        {allHookSections&&allHookSections.length>1
          ?<>
            <Label>Voiceovers to generate across {allHookSections.length} hook variations</Label>
            <div className="flex flex-col gap-2">
              {allHookSections.map((hookSecs:any[],hi:number)=>{
                const hookSec=hookSecs.find((s:any)=>s.type==="HOOK")
                const isFirst=hi===0
                const bodySections=hookSecs.filter((s:any)=>s.type!=="HOOK")
                return<div key={hi} className="bg-surface rounded-md border border-border overflow-hidden">
                  <div className={`px-3 py-2 border-b border-border flex items-center gap-2 ${isFirst?"bg-white/[0.03]":"bg-accent-soft"}`}>
                    <span className={`text-xs font-bold ${isFirst?"text-text":"text-accent"}`}>{isFirst?"Original Hook":"Hook "+(hi+1)+" -- AI Variation"}</span>
                    {allHookResults&&<span className="text-success text-xs ml-auto flex items-center gap-1"><Check className="w-3 h-3" /> Generated</span>}
                  </div>
                  <div className="px-3 py-2">
                    <div className="text-xs text-text mb-1.5 italic">"{hookSec?.spokenWords?.substring(0,80)}..."</div>
                    {hi===0&&<div className="text-[10px] text-text-muted">+ {bodySections.length} body sections shared across all variations</div>}
                    {hi>0&&<div className="text-[10px] text-text-muted">Hook audio unique · Body audio shared from Hook 1</div>}
                  </div>
                </div>
              })}
            </div>
          </>
          :<>
            <Label>Script Sections ({sectionsWithWords.length} sections to voice)</Label>
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
              {sectionsWithWords.map((s:any,i:number)=>{
                const sc=secColor(s.type)
                const hasAudio=!!sectionAudios[i]
                const isRegenerating=regeneratingSection===i
                return<div key={i} className={`flex items-center gap-2 px-2.5 py-2 bg-surface rounded-md border ${hasAudio?"border-success":"border-border"}`}>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0" style={{background:sc.bg,color:sc.color}}>{s.type}</span>
                  <div className="flex-1 text-xs text-text-muted truncate">{s.spokenWords}</div>
                  {hasAudio?<audio src={sectionAudios[i]} controls className="h-6 w-[120px]"/>:<span className="text-[10px] text-text-muted">Not generated</span>}
                  {hasAudio&&<button onClick={()=>regenerateSection(i)} disabled={isRegenerating||!selectedVoice} title="Regenerate this section" className={`p-1 rounded-md transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${isRegenerating?"text-text-muted cursor-default opacity-60":"text-accent cursor-pointer hover:bg-accent-soft"}`}>
                    {isRegenerating?<Loader2 className="w-3.5 h-3.5 animate-spin" />:<RefreshCw className="w-3.5 h-3.5" />}
                  </button>}
                  {hasAudio&&!isRegenerating&&<Check className="w-3.5 h-3.5 text-success" />}
                </div>
              })}
            </div>
          </>}
      </div>

      {generating&&<div className="mb-3">
        <div className="h-1.5 bg-border rounded-full overflow-hidden mb-1.5">
          <div className="h-full bg-accent rounded-full transition-all duration-300" style={{width:progress+"%"}} />
        </div>
        <div className="text-xs text-text-muted">Generating section {Math.ceil(progress/100*sectionsWithWords.length)+1} of {sectionsWithWords.length}...</div>
      </div>}
      {error&&<div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger mb-3">{error}</div>}

      <div className="flex gap-2.5">
        <Btn onClick={generateAll} disabled={generating||!sectionsWithWords.length||!selectedVoice} className={`flex-1 py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${generating?"bg-border text-text-muted cursor-not-allowed":"bg-accent hover:bg-accent-hover active:scale-[0.99]"}`}>
          {generating?<><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>:allGenerated?<><RefreshCw className="w-4 h-4" /> Regenerate All</>:<><Mic className="w-4 h-4" /> Generate Voiceovers</>}
        </Btn>
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
                const sectionEnd=i<stitchData.sectionOffsets.length-1?stitchData.sectionOffsets[i+1]:Infinity
                const sectionWordTimestamps=allWordTimestamps.filter((w:any)=>w.start>=voOffset-0.05&&w.start<sectionEnd-0.05).map((w:any)=>({word:w.word,start:w.start-voOffset,end:w.end-voOffset}))
                return{...base,vo_offset:voOffset,vo_duration:voDuration,word_timestamps:sectionWordTimestamps}
              }
              return base
            })
            const combinedUrl=stitchData?.url||Object.values(sectionAudios)[0] as string
            onSave(updatedSections,selectedVoiceObj?.name||selectedVoice,combinedUrl,null)
          }
        }} className="bg-success text-black font-bold flex items-center gap-1.5 transition-all duration-150 hover:bg-success/90 focus-visible:ring-2 focus-visible:ring-success/50">
          <Check className="w-3.5 h-3.5" /> Use These
        </Btn>}
      </div>
    </>}
    <div className="text-center mt-3">
      <button onClick={onSkip} className="bg-transparent border-none text-text-muted cursor-pointer text-xs underline hover:text-text transition-colors duration-150">Skip -- my video already has audio</button>
    </div>
  </div>
}
