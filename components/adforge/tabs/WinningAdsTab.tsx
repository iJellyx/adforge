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
    setError("");setView("processing");setProgress(5);setProgressMsg("Uploading video…")
    try{
      const res=await fetch("/api/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:file.name,contentType:file.type,metadata:{title:title.trim(),creator:"winning_ad",autoClip:false},workspaceId})})
      const{itemId,uploadUrl,error:uploadErr}=await res.json()
      if(uploadErr)throw new Error(uploadErr)
      await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress(5+Math.round((e.loaded/e.total)*35))};xhr.onload=()=>resolve();xhr.onerror=()=>reject(new Error("Upload failed"));xhr.open("PUT",uploadUrl);xhr.setRequestHeader("Content-Type",file.type);xhr.send(file)})
      setProgress(40);setProgressMsg("Processing video — waiting for transcript…")
      let transcript="";let duration=0
      for(let attempt=0;attempt<40;attempt++){
        await new Promise(r=>setTimeout(r,4000))
        const{data}=await supabase.from("items").select("mux_status,transcript,duration_seconds").eq("id",itemId).single()
        if(data?.mux_status==="ready"&&data?.transcript){transcript=data.transcript;duration=data.duration_seconds||0;break}
        setProgress(40+Math.min(attempt*1.5,20));setProgressMsg(`Processing… ${Math.round(attempt/40*100)}%`)
      }
      if(!transcript)transcript=`[No transcript — context: "${context||title}"]`
      setProgress(62);setProgressMsg("Analysing creative blueprint…")
      const prod=products.find((x:any)=>String(x.id)===String(productId))||null
      const analysisRaw=await callClaude([{role:"user",content:`Analyse this winning ad transcript and extract the creative blueprint.\n\nTRANSCRIPT: "${transcript.substring(0,1500)}"\nDURATION: ${duration}s\nCONTEXT: "${context||"Not provided"}"\n\nReturn ONLY valid JSON:\n{"hook_type":"Pain Point","hook_words":"exact opening","hook_analysis":"why it works","section_structure":[{"beat":"HOOK","start_s":0,"duration_s":3,"description":"what happens"}],"language_patterns":["pattern"],"power_words":["word"],"energy_arc":"description","avg_cut_frequency":"every 2-3s","creator_brief":"plain English brief for creator","total_duration_s":${duration}}`}],1500)
      const analysisData=JSON.parse(analysisRaw.replace(/```json|```/g,"").trim())
      setAnalysis(analysisData)
      setProgress(78);setProgressMsg("Generating brand-adapted script…")
      const brandCtx=`BRAND: ${brand.name||"Unknown"}\nVoice: ${brand.voice||""}\nCustomer: ${brand.target_customer||""}`
      const prodCtx=prod?`PRODUCT: ${prod.name}\nBenefits: ${prod.benefits||""}\nClaims: ${prod.claims||""}`
      :""
      const structureDesc=(analysisData.section_structure||[]).map((s:any)=>`${s.beat} (${s.duration_s}s): ${s.description}`).join("\n")
      const templateRaw=await callClaude([{role:"user",content:`Rewrite this winning ad structure for a new brand, preserving the exact structural blueprint.\n\n${brandCtx}\n${prodCtx}\n\nBLUEPRINT:\nHook type: ${analysisData.hook_type}\nApproach: ${analysisData.hook_analysis}\nStructure:\n${structureDesc}\nLanguage patterns: ${(analysisData.language_patterns||[]).join(", ")}\nEnergy arc: ${analysisData.energy_arc}\n\nReturn ONLY valid JSON:\n{"sections":[{"id":1,"type":"HOOK","spokenWords":"exact words","visualDirection":"what is shown","durationEstimate":"3s"}],"suggested_music_mood":"Uplifting"}`}],2000)
      const templateData=JSON.parse(templateRaw.replace(/```json|```/g,"").trim())
      let secs=(templateData.sections||[]).map((s:any,i:number)=>({...s,id:Date.now()+i,matchedClipIds:[],selectedClipId:null,autoSelected:false}))
      setProgress(90);setProgressMsg("Matching clips from library…")
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

  if(view==="list")return<div style={{maxWidth:900,margin:"0 auto",padding:28}}>
    {briefSections!==null&&<CreatorBriefModal brand={brand} sections={briefSections} onClose={()=>setBriefSections(null)}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <div><STitle size={22} mb={4}>Winning Ads</STitle><div style={{fontSize:14,color:C.muted}}>Upload ads that perform. AI extracts the blueprint and generates a ready-to-use template for your brand.</div></div>
      <Btn onClick={()=>{setFile(null);setTitle("");setContext("");setProductId("");setError("");setView("upload")}} style={{background:C.accent,color:"#fff",flexShrink:0}}>+ Add Winning Ad</Btn>
    </div>
    {patterns.length===0
      ?<Card style={{textAlign:"center",padding:60,marginTop:24}}>
        <div style={{fontSize:48,marginBottom:16}}>🏆</div>
        <STitle mb={8}>No winning ad patterns yet</STitle>
        <div style={{fontSize:14,color:C.muted,marginBottom:24}}>Upload an ad that has performed well — yours, a competitor's, or a reference.</div>
        <Btn onClick={()=>setView("upload")} style={{background:C.accent,color:"#fff"}}>Upload First Winning Ad</Btn>
      </Card>
      :<div style={{marginTop:20,display:"grid",gap:14}}>
        {patterns.map((p:any,idx:number)=><Card key={p.id||idx}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{p.title}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                {p.hook_type&&<Chip label={p.hook_type+" Hook"} color={{bg:C.accentSoft,color:C.accent}}/>}
                {p.section_count&&<Chip label={p.section_count+" sections"} color={{bg:"#F0FDF4",color:"#15803D"}}/>}
                {p.total_duration_s>0&&<Chip label={p.total_duration_s+"s"} color={{bg:"#FFFBEB",color:"#92400E"}}/>}
              </div>
              {p.analysis?.hook_words&&<div style={{fontSize:13,color:C.muted,fontStyle:"italic",marginBottom:4}}>"{p.analysis.hook_words}"</div>}
              {p.analysis?.creator_brief&&<div style={{fontSize:12,color:C.muted,lineHeight:1.5}}><strong style={{color:C.text}}>Brief:</strong> {p.analysis.creator_brief.substring(0,140)}{p.analysis.creator_brief.length>140?"…":""}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0,flexDirection:"column",alignItems:"flex-end"}}>
              <Btn onClick={()=>createAdFromPattern(p)} style={{background:C.accent,color:"#fff",whiteSpace:"nowrap" as const}}>⚡ Create Ad</Btn>
              <Btn onClick={()=>setBriefSections(p.template_sections||[])} style={{background:"#F0FDF4",color:"#15803D",border:"1px solid #86EFAC",fontSize:12,padding:"6px 12px"}}>📋 Send Brief</Btn>
              <Btn onClick={()=>setSelectedPatternIdx(selectedPatternIdx===idx?null:idx)} style={{background:"none",border:"1px solid "+C.border,color:C.muted,fontSize:12,padding:"5px 12px"}}>{selectedPatternIdx===idx?"Hide":"View analysis"}</Btn>
            </div>
          </div>
          {selectedPatternIdx===idx&&p.analysis&&<div style={{marginTop:16,paddingTop:16,borderTop:"1px solid "+C.border}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:6}}>Section Structure</div>
                {(p.analysis.section_structure||[]).map((s:any,i:number)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                  <span style={{background:secColor(s.beat).bg,color:secColor(s.beat).color,padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:700}}>{s.beat}</span>
                  <span style={{fontSize:11,color:C.muted}}>{s.duration_s}s — {s.description}</span>
                </div>)}
              </div>
              <div><div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:6}}>Language Patterns</div>
                {(p.analysis.language_patterns||[]).map((lp:string,i:number)=><div key={i} style={{fontSize:12,color:C.muted,marginBottom:3}}>• {lp}</div>)}
              </div>
            </div>
            {p.analysis.creator_brief&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#15803D",marginTop:12}}><strong>Creator brief:</strong> {p.analysis.creator_brief}</div>}
          </div>}
        </Card>)}
      </div>}
  </div>

  if(view==="upload")return<div style={{maxWidth:700,margin:"0 auto",padding:28}}>
    <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back</button>
    <STitle size={22}>Add Winning Ad</STitle>
    <div style={{color:C.muted,fontSize:14,marginBottom:24}}>Upload a high-performing ad. AI extracts the creative blueprint and generates a template for your brand.</div>
    <div onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("video/"))setFile(f)}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileRef.current?.click()} style={{border:"2px dashed "+(dragOver?C.accent:file?C.green:C.border),borderRadius:14,padding:"32px 20px",textAlign:"center" as const,cursor:"pointer",background:dragOver?C.accentSoft:file?"#F0FDF4":C.surface,marginBottom:20,transition:"all 0.15s"}}>
      <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}}/>
      {file?<div><div style={{fontSize:36,marginBottom:8}}>✅</div><div style={{fontWeight:700,fontSize:15}}>{file.name}</div><div style={{fontSize:12,color:C.muted}}>{(file.size/1024/1024).toFixed(1)} MB · click to change</div></div>
      :<div><div style={{fontSize:36,marginBottom:8}}>🎬</div><div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Drop video here or click to select</div><div style={{fontSize:12,color:C.muted}}>MP4, MOV, AVI — any format</div></div>}
    </div>
    <Card style={{marginBottom:14}}>
      <div style={{marginBottom:12}}><Label>Ad title *</Label><Input value={title} onChange={(e:any)=>setTitle(e.target.value)} placeholder="e.g. Competitor UGC — 52% hook rate"/></div>
      <div style={{marginBottom:12}}><Label>Why did this ad win? (optional)</Label><Input textarea value={context} onChange={(e:any)=>setContext(e.target.value)} placeholder="High hook rate, cheap CPA, strong emotional hook — any context helps" rows={3}/></div>
      <Label>Product to adapt for</Label>
      <select value={productId} onChange={e=>setProductId(e.target.value)} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",cursor:"pointer"}}>
        <option value="">General brand</option>
        {products.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Card>
    {error&&<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:10,padding:"12px 16px",fontSize:13,color:C.red,marginBottom:16}}>⚠️ {error}</div>}
    <Btn onClick={handleUpload} disabled={!file||!title.trim()} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12}}>🏆 Analyse & Generate Template</Btn>
  </div>

  if(view==="processing")return<div style={{maxWidth:540,margin:"80px auto",padding:28,textAlign:"center" as const}}>
    <div style={{fontSize:48,marginBottom:20}}>🔬</div>
    <STitle size={20} mb={8}>Analysing winning ad…</STitle>
    <div style={{fontSize:14,color:C.muted,marginBottom:28}}>{progressMsg}</div>
    <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:12}}>
      <div style={{height:"100%",width:progress+"%",background:C.accent,borderRadius:99,transition:"width 0.6s ease"}}/>
    </div>
    <div style={{fontSize:12,color:C.muted}}>{progress}%</div>
  </div>

  if(view==="result"&&analysis)return<div style={{maxWidth:860,margin:"0 auto",padding:28}}>
    {briefSections!==null&&<CreatorBriefModal brand={brand} sections={briefSections} onClose={()=>setBriefSections(null)}/>}
    <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",marginBottom:20,fontSize:14}}>← Back to patterns</button>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,gap:16,flexWrap:"wrap"}}>
      <div><STitle size={22} mb={4}>✅ Pattern extracted</STitle><div style={{fontSize:14,color:C.muted}}>Blueprint extracted and adapted to {brand.name||"your brand"}</div></div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={()=>setBriefSections(templateSections)} style={{background:"#F0FDF4",color:"#15803D",border:"1px solid #86EFAC"}}>📋 Send Brief</Btn>
        <Btn onClick={()=>createAdFromPattern(patterns[0])} style={{background:C.accent,color:"#fff"}}>⚡ Create Ad</Btn>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🎣 Hook analysis</div>
        <Chip label={analysis.hook_type+" Hook"} color={{bg:C.accentSoft,color:C.accent}}/>
        <div style={{marginTop:8,fontSize:13,fontStyle:"italic",color:C.muted,marginBottom:6}}>"{analysis.hook_words}"</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{analysis.hook_analysis}</div>
      </Card>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>⚡ Pacing & energy</div>
        <div style={{fontSize:13,marginBottom:6}}><strong>Cuts:</strong> <span style={{color:C.muted}}>{analysis.avg_cut_frequency}</span></div>
        <div style={{fontSize:13,marginBottom:10}}><strong>Energy arc:</strong> <span style={{color:C.muted}}>{analysis.energy_arc}</span></div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(analysis.power_words||[]).map((w:string,i:number)=><span key={i} style={{background:C.accentSoft,color:C.accent,borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:600}}>{w}</span>)}</div>
      </Card>
    </div>
    {analysis.creator_brief&&<Card style={{marginBottom:20,background:"#F0FDF4",border:"1.5px solid #86EFAC"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#15803D",marginBottom:6}}>📋 Creator brief</div>
      <div style={{fontSize:13,color:"#15803D",lineHeight:1.7}}>{analysis.creator_brief}</div>
    </Card>}
    <Card>
      <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>📝 Generated template — adapted to {brand.name||"your brand"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {templateSections.map((s:any,i:number)=>{const sc=secColor(s.type);return<div key={i} style={{background:sc.bg,border:"1px solid "+sc.bd,borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
            <span style={{background:sc.color,color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>{s.type}</span>
            {s.durationEstimate&&<span style={{fontSize:11,color:C.muted}}>{s.durationEstimate}</span>}
            {s.selectedClipId?<span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ clip matched</span>:<span style={{fontSize:11,color:C.yellow}}>⚠ no clip</span>}
          </div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{s.spokenWords}</div>
          {s.visualDirection&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{s.visualDirection}</div>}
        </div>})}
      </div>
    </Card>
  </div>
  return null
}
