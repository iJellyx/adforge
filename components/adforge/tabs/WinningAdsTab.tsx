'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Item, BrandProfile, Product, ForgedAd } from '../types'
import { C, SEC_TYPES, STAGES, STAGE_COLORS, AD_LENGTHS, FORM_CTYPES } from '../constants'
import { muxThumb, secColor, callClaude, fmt } from '../utils'
import { Btn, Label, Card, STitle, Input, Chip } from '../ui-primitives'
import { VideoCard } from '../VideoCard'
import { ScriptTable } from '../ScriptTable'
import { StitchedPreview } from '../StitchedPreview'
import { VoiceoverGenerator } from '../VoiceoverGenerator'
import { MusicPicker } from '../MusicPicker'
import { ExportVideo } from '../ExportVideo'
import { CreatorBriefModal } from '../CreatorBriefModal'
import { ArrowLeft, Trophy, Upload, Film, Zap, FlaskConical, Check, AlertTriangle, FileText, Eye, EyeOff, Sparkles } from 'lucide-react'

export function WinningAdsTab({brand,setBrand,products,items,onSaveForgedAd,onGoToForged,workspaceId}:any){
  const supabase=createClient()
  const [view,setView]=useState<"list"|"upload"|"processing"|"result">("list")
  const [dragOver,setDragOver]=useState(false)
  const [file,setFile]=useState<File|null>(null)
  const [title,setTitle]=useState("")
  const [context,setContext]=useState("")
  const [productId,setProductId]=useState("")
  const [progress,setProgress]=useState(0)
  const [progressMsg,setProgressMsg]=useState("")
  const [error,setError]=useState("")
  const [analysis,setAnalysis]=useState<any>(null)
  const [templateSections,setTemplateSections]=useState<any[]>([])
  const [selectedPatternIdx,setSelectedPatternIdx]=useState<number|null>(null)
  const [briefSections,setBriefSections]=useState<any[]|null>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  const patterns:any[]=brand?.winning_patterns||[]

  async function savePatterns(newPatterns:any[]){const updated={...brand,winning_patterns:newPatterns};setBrand(updated);if(brand.id){await supabase.from("brand_profile").update({winning_patterns:newPatterns}).eq("id",brand.id)}}

  async function handleUpload(){
    if(!file||!title.trim()){setError("Add a title and select a video first.");return}
    setError("");setView("processing");setProgress(5);setProgressMsg("Uploading video...")
    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:file.name,contentType:file.type,metadata:{title:title.trim(),creator:"winning_ad",autoClip:false},workspaceId})})
      const{itemId,uploadUrl,error:uploadErr}=await res.json()
      if(uploadErr)throw new Error(uploadErr)
      await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress(5+Math.round((e.loaded/e.total)*35))};xhr.onload=()=>resolve();xhr.onerror=()=>reject(new Error("Upload failed"));xhr.open("PUT",uploadUrl);xhr.setRequestHeader("Content-Type",file.type);xhr.send(file)})
      setProgress(40);setProgressMsg("Processing video — waiting for transcript...")
      let transcript="";let duration=0
      for(let attempt=0;attempt<40;attempt++){
        await new Promise(r=>setTimeout(r,4000))
        const{data}=await supabase.from("items").select("mux_status,transcript,duration_seconds").eq("id",itemId).single()
        if(data?.mux_status==="ready"&&data?.transcript){transcript=data.transcript;duration=data.duration_seconds||0;break}
        setProgress(40+Math.min(attempt*1.5,20));setProgressMsg(`Processing... ${Math.round(attempt/40*100)}%`)
      }
      if(!transcript)transcript=`[No transcript — context: "${context||title}"]`
      setProgress(62);setProgressMsg("Analysing creative blueprint...")
      const prod=products.find((x:any)=>String(x.id)===String(productId))||null
      const analysisRaw=await callClaude([{role:"user",content:`Analyse this winning ad transcript and extract the creative blueprint.\n\nTRANSCRIPT: "${transcript.substring(0,1500)}"\nDURATION: ${duration}s\nCONTEXT: "${context||"Not provided"}"\n\nReturn ONLY valid JSON:\n{"hook_type":"Pain Point","hook_words":"exact opening","hook_analysis":"why it works","section_structure":[{"beat":"HOOK","start_s":0,"duration_s":3,"description":"what happens"}],"language_patterns":["pattern"],"power_words":["word"],"energy_arc":"description","avg_cut_frequency":"every 2-3s","creator_brief":"plain English brief for creator","total_duration_s":${duration}}`}],1500)
      const analysisData=JSON.parse(analysisRaw.replace(/```json|```/g,"").trim())
      setAnalysis(analysisData)
      setProgress(78);setProgressMsg("Generating brand-adapted script...")
      const brandCtx=`BRAND: ${brand.name||"Unknown"}\nVoice: ${brand.voice||""}\nCustomer: ${brand.target_customer||""}`
      const prodCtx=prod?`PRODUCT: ${prod.name}\nBenefits: ${prod.benefits||""}\nClaims: ${prod.claims||""}`
      :""
      const structureDesc=(analysisData.section_structure||[]).map((s:any)=>`${s.beat} (${s.duration_s}s): ${s.description}`).join("\n")
      const templateRaw=await callClaude([{role:"user",content:`Rewrite this winning ad structure for a new brand, preserving the exact structural blueprint.\n\n${brandCtx}\n${prodCtx}\n\nBLUEPRINT:\nHook type: ${analysisData.hook_type}\nApproach: ${analysisData.hook_analysis}\nStructure:\n${structureDesc}\nLanguage patterns: ${(analysisData.language_patterns||[]).join(", ")}\nEnergy arc: ${analysisData.energy_arc}\n\nReturn ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is shown","durationEstimate":"3s"}],"suggested_music_mood":"Uplifting"}`}],2000)
      const templateData=JSON.parse(templateRaw.replace(/```json|```/g,"").trim())
      let secs=(templateData.sections||[]).map((s:any,i:number)=>({...s,id:Date.now()+i,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
      setProgress(90);setProgressMsg("Matching clips from library...")
      if(items.length>0){
        try{
          const readyClips=items.filter((i:Item)=>i.mux_playback_id&&i.mux_status==="ready")
          if(readyClips.length>0){
            const libSummary=readyClips.slice(0,50).map((i:Item)=>{const a=i.analysis||{};return "ID:"+i.id+"|role:"+(a.clip_role||i.clip_role||"")+"|tags:"+(a.scene_tags||[]).join(",")+"|transcript:"+(i.transcript||"").substring(0,60)}).join("\n")
            const matchRaw=await callClaude([{role:"user",content:"Match clips to sections.\n\nSECTIONS:\n"+secs.map((s:any,i:number)=>`${i} [${s.type}]: "${(s.spokenWords||"").substring(0,80)}"`).join("\n")+"\n\nCLIPS:\n"+libSummary+"\n\nReturn ONLY JSON array: [{\"section\":0,\"best_id\":\"uuid\",\"alt_ids\":[\"uuid1\"],\"reason\":\"why\"},...]"}],1500)
            const matches=JSON.parse(matchRaw.replace(/```json|```/g,"").trim())
            const validIds=new Set(items.map((i:Item)=>i.id));const usedIds=new Set<string>()
            secs=secs.map((s:any,i:number)=>{const m=matches.find((x:any)=>x.section===i);if(!m)return s;const candidates=[m.best_id,...(m.alt_ids||[])].filter((id:string)=>id&&validIds.has(id)&&!usedIds.has(id));const clipId=candidates[0]||null;if(clipId)usedIds.add(clipId);return{...s,selectedClipId:clipId,matchedClipIds:candidates,clipSegments:[{id:"seg-"+i+"-0",clipId}],autoSelected:!!clipId,matchReason:m.reason||""}})
          }
        }catch(e){console.error("clip matching failed",e)}
      }
      setTemplateSections(secs);setProgress(100);setProgressMsg("Done!")
      const newPattern={id:Date.now().toString(),title:title.trim(),context,created_at:new Date().toISOString(),hook_type:analysisData.hook_type,hook_words:analysisData.hook_words,section_count:analysisData.section_structure?.length||secs.length,total_duration_s:duration,analysis:analysisData,template_sections:secs,product_id:productId,suggested_music_mood:templateData.suggested_music_mood||"Uplifting"}
      await savePatterns([newPattern,...patterns])
      setView("result")
    }catch(e:any){setError(e.message||"Analysis failed — try again");setView("upload")}
  }

  async function createAdFromPattern(pattern:any){const saved=await onSaveForgedAd({title:pattern.title+" (pattern)",status:"draft",mode:"script",sections:pattern.template_sections||[],voiceover_url:null,voiceover_voice:null,music_url:null,music_name:null,metadata:{contentType:"Winning Pattern",patternId:pattern.id,patternTitle:pattern.title}});if(saved)onGoToForged()}

  if(view==="list")return(
    <div className="max-w-[900px] mx-auto p-7">
      {briefSections!==null&&<CreatorBriefModal brand={brand} sections={briefSections} onClose={()=>setBriefSections(null)}/>}
      <div className="flex justify-between items-center mb-2">
        <div><STitle size={22} mb={4}>Winning Ads</STitle><div className="text-sm text-text-muted">Upload ads that perform. AI extracts the blueprint and generates a ready-to-use template for your brand.</div></div>
        <Btn onClick={()=>{setFile(null);setTitle("");setContext("");setProductId("");setError("");setView("upload")}} style={{background:"var(--color-accent)",color:"#fff",flexShrink:0}}>+ Add Winning Ad</Btn>
      </div>
      {patterns.length===0
        ?<Card style={{textAlign:"center",padding:60,marginTop:24}}>
          <Trophy className="w-12 h-12 mx-auto mb-4 text-text-muted" />
          <STitle mb={8}>No winning ad patterns yet</STitle>
          <div className="text-sm text-text-muted mb-6">Upload an ad that has performed well — yours, a competitor's, or a reference.</div>
          <Btn onClick={()=>setView("upload")} style={{background:"var(--color-accent)",color:"#fff"}}>Upload First Winning Ad</Btn>
        </Card>
        :<div className="mt-5 grid gap-3.5">
          {patterns.map((p:any,idx:number)=><Card key={p.id||idx}>
            <div className="flex justify-between items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="font-bold text-base mb-1.5">{p.title}</div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {p.hook_type&&<Chip label={p.hook_type+" Hook"} color={{bg:"var(--color-accent-soft)",color:"var(--color-accent)"}}/>}
                  {p.section_count&&<Chip label={p.section_count+" sections"} color={{bg:"#F0FDF4",color:"#15803D"}}/>}
                  {p.total_duration_s>0&&<Chip label={p.total_duration_s+"s"} color={{bg:"#FFFBEB",color:"#92400E"}}/>}
                </div>
                {p.analysis?.hook_words&&<div className="text-sm text-text-muted italic mb-1">"{p.analysis.hook_words}"</div>}
                {p.analysis?.creator_brief&&<div className="text-xs text-text-muted leading-relaxed"><strong className="text-text">Brief:</strong> {p.analysis.creator_brief.substring(0,140)}{p.analysis.creator_brief.length>140?"...":""}</div>}
              </div>
              <div className="flex gap-2 shrink-0 flex-col items-end">
                <Btn onClick={()=>createAdFromPattern(p)} style={{background:"var(--color-accent)",color:"#fff",whiteSpace:"nowrap"}}><Zap className="w-3.5 h-3.5 inline"/> Create Ad</Btn>
                <Btn onClick={()=>setBriefSections(p.template_sections||[])} style={{background:"rgba(34,197,94,0.08)",color:"#15803D",border:"1px solid #86EFAC",fontSize:12,padding:"6px 12px"}}><FileText className="w-3 h-3 inline"/> Send Brief</Btn>
                <Btn onClick={()=>setSelectedPatternIdx(selectedPatternIdx===idx?null:idx)} style={{background:"none",border:"1px solid var(--color-border)",color:"var(--color-text-muted)",fontSize:12,padding:"5px 12px"}}>{selectedPatternIdx===idx?(<><EyeOff className="w-3 h-3 inline"/> Hide</>):(<><Eye className="w-3 h-3 inline"/> View analysis</>)}</Btn>
              </div>
            </div>
            {selectedPatternIdx===idx&&p.analysis&&<div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Section Structure</div>
                  {(p.analysis.section_structure||[]).map((s:any,i:number)=><div key={i} className="flex gap-2 items-center mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:secColor(s.beat).bg,color:secColor(s.beat).color}}>{s.beat}</span>
                    <span className="text-[11px] text-text-muted">{s.duration_s}s — {s.description}</span>
                  </div>)}
                </div>
                <div><div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Language Patterns</div>
                  {(p.analysis.language_patterns||[]).map((lp:string,i:number)=><div key={i} className="text-xs text-text-muted mb-0.5">- {lp}</div>)}
                </div>
              </div>
              {p.analysis.creator_brief&&<div className="bg-success-soft border border-success/30 rounded-lg px-3.5 py-2.5 text-sm text-success mt-3"><strong>Creator brief:</strong> {p.analysis.creator_brief}</div>}
            </div>}
          </Card>)}
        </div>}
    </div>
  )

  if(view==="upload")return(
    <div className="max-w-[700px] mx-auto p-7">
      <button onClick={()=>setView("list")} className="flex items-center gap-1 text-text-muted hover:text-text text-sm cursor-pointer transition-colors bg-transparent border-none mb-5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <STitle size={22}>Add Winning Ad</STitle>
      <div className="text-text-muted text-sm mb-6">Upload a high-performing ad. AI extracts the creative blueprint and generates a template for your brand.</div>
      <div
        onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("video/"))setFile(f)}}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onClick={()=>fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-5 transition-all duration-150 ${
          dragOver?"border-accent bg-accent-soft":file?"border-success bg-success-soft":"border-border bg-surface hover:border-accent"
        }`}
      >
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}}/>
        {file?<div><Check className="w-9 h-9 mx-auto mb-2 text-success" /><div className="font-bold text-[15px]">{file.name}</div><div className="text-xs text-text-muted">{(file.size/1024/1024).toFixed(1)} MB -- click to change</div></div>
        :<div><Film className="w-9 h-9 mx-auto mb-2 text-text-muted" /><div className="font-bold text-[15px] mb-1">Drop video here or click to select</div><div className="text-xs text-text-muted">MP4, MOV, AVI — any format</div></div>}
      </div>
      <Card style={{marginBottom:14}}>
        <div className="mb-3"><Label>Ad title *</Label><Input value={title} onChange={(e:any)=>setTitle(e.target.value)} placeholder="e.g. Competitor UGC — 52% hook rate"/></div>
        <div className="mb-3"><Label>Why did this ad win? (optional)</Label><Input textarea value={context} onChange={(e:any)=>setContext(e.target.value)} placeholder="High hook rate, cheap CPA, strong emotional hook — any context helps" rows={3}/></div>
        <Label>Product to adapt for</Label>
        <select value={productId} onChange={e=>setProductId(e.target.value)} className="bg-surface border border-border rounded-lg px-3 py-2.5 text-text text-sm outline-none w-full cursor-pointer">
          <option value="">General brand</option>
          {products.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Card>
      {error&&<div className="bg-danger-soft border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger mb-4 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</div>}
      <Btn onClick={handleUpload} disabled={!file||!title.trim()} style={{background:"var(--color-accent)",color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12}}><Trophy className="w-4 h-4 inline"/> Analyse & Generate Template</Btn>
    </div>
  )

  if(view==="processing")return(
    <div className="max-w-[540px] mx-auto mt-20 p-7 text-center">
      <FlaskConical className="w-12 h-12 mx-auto mb-5 text-accent animate-pulse-soft" />
      <STitle size={20} mb={8}>Analysing winning ad...</STitle>
      <div className="text-sm text-text-muted mb-7">{progressMsg}</div>
      <div className="h-2 bg-border rounded-full overflow-hidden mb-3">
        <div className="h-full bg-accent rounded-full transition-[width] duration-600" style={{width:progress+"%"}}/>
      </div>
      <div className="text-xs text-text-muted">{progress}%</div>
    </div>
  )

  if(view==="result"&&analysis)return(
    <div className="max-w-[860px] mx-auto p-7">
      {briefSections!==null&&<CreatorBriefModal brand={brand} sections={briefSections} onClose={()=>setBriefSections(null)}/>}
      <button onClick={()=>setView("list")} className="flex items-center gap-1 text-text-muted hover:text-text text-sm cursor-pointer transition-colors bg-transparent border-none mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to patterns
      </button>
      <div className="flex justify-between items-start mb-5 gap-4 flex-wrap">
        <div><STitle size={22} mb={4}><Check className="w-5 h-5 inline text-success" /> Pattern extracted</STitle><div className="text-sm text-text-muted">Blueprint extracted and adapted to {brand.name||"your brand"}</div></div>
        <div className="flex gap-2.5">
          <Btn onClick={()=>setBriefSections(templateSections)} style={{background:"rgba(34,197,94,0.08)",color:"#15803D",border:"1px solid #86EFAC"}}><FileText className="w-3.5 h-3.5 inline"/> Send Brief</Btn>
          <Btn onClick={()=>createAdFromPattern(patterns[0])} style={{background:"var(--color-accent)",color:"#fff"}}><Zap className="w-3.5 h-3.5 inline"/> Create Ad</Btn>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <Card>
          <div className="font-bold text-sm mb-3">Hook analysis</div>
          <Chip label={analysis.hook_type+" Hook"} color={{bg:"var(--color-accent-soft)",color:"var(--color-accent)"}}/>
          <div className="mt-2 text-sm italic text-text-muted mb-1.5">"{analysis.hook_words}"</div>
          <div className="text-xs text-text-muted leading-relaxed">{analysis.hook_analysis}</div>
        </Card>
        <Card>
          <div className="font-bold text-sm mb-3">Pacing & energy</div>
          <div className="text-sm mb-1.5"><strong>Cuts:</strong> <span className="text-text-muted">{analysis.avg_cut_frequency}</span></div>
          <div className="text-sm mb-2.5"><strong>Energy arc:</strong> <span className="text-text-muted">{analysis.energy_arc}</span></div>
          <div className="flex gap-1.5 flex-wrap">{(analysis.power_words||[]).map((w:string,i:number)=><span key={i} className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-[11px] font-semibold">{w}</span>)}</div>
        </Card>
      </div>
      {analysis.creator_brief&&<Card style={{marginBottom:20,background:"var(--color-success-soft)",border:"1.5px solid rgba(34,197,94,0.27)"}}>
        <div className="font-bold text-sm text-success mb-1.5"><FileText className="w-3.5 h-3.5 inline"/> Creator brief</div>
        <div className="text-sm text-success leading-relaxed">{analysis.creator_brief}</div>
      </Card>}
      <Card>
        <div className="font-bold text-[15px] mb-3.5">Generated template — adapted to {brand.name||"your brand"}</div>
        <div className="flex flex-col gap-2.5">
          {templateSections.map((s:any,i:number)=>{const sc=secColor(s.type);return<div key={i} className="rounded-lg px-3.5 py-3 border" style={{background:sc.bg,borderColor:sc.bd}}>
            <div className="flex gap-2 items-center mb-1.5 flex-wrap">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{background:sc.color}}>{s.type}</span>
              {s.durationEstimate&&<span className="text-[11px] text-text-muted">{s.durationEstimate}</span>}
              {s.selectedClipId?<span className="text-[11px] text-success font-semibold"><Check className="w-3 h-3 inline"/> clip matched</span>:<span className="text-[11px] text-warning"><AlertTriangle className="w-3 h-3 inline"/> no clip</span>}
            </div>
            <div className="text-sm font-semibold mb-1">{s.spokenWords}</div>
            {s.visualDirection&&<div className="text-[11px] text-text-muted italic">{s.visualDirection}</div>}
          </div>})}
        </div>
      </Card>
    </div>
  )
  return null
}
