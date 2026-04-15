'use client'
import { useState } from 'react'
import { Item, ForgedAd, BrandProfile, CaptionSettings } from './types'
import { C, SEC_TYPES, DEFAULT_CAPTIONS } from './constants'
import { secColor, callClaude } from './utils'
import { Btn, Label, Card, STitle, Input } from './ui-primitives'
import { ScriptTable } from './ScriptTable'
import { VoiceoverGenerator } from './VoiceoverGenerator'
import { MusicPicker } from './MusicPicker'
import { StitchedPreview } from './StitchedPreview'
import { ExportVideo } from './ExportVideo'

export function AdWorkspace({
  sections,setSections,
  hookVariations,selectedHooks,setSelectedHooks,
  activeHookIdx,setActiveHookIdx,
  hookSections,setHookSections,
  voiceoverUrl,setVoiceoverUrl,
  voiceoverVoice,setVoiceoverVoice,
  musicUrl,setMusicUrl,
  musicName,setMusicName,
  captionSettings,setCaptionSettings,
  adTitle,setAdTitle,
  aspectRatio,setAspectRatio,
  suggestedMood,
  items,brand,genMeta,
  onSave,onBack,onMatchClips,onGenerateHooks,
  generating,matching,generatingHooks,hookError,
  workspaceId,isV2,autoCount,form
}:{
  sections:any[]
  setSections:(s:any[])=>void
  hookVariations:any[][]
  selectedHooks:number[]
  setSelectedHooks:(h:number[])=>void
  activeHookIdx:number
  setActiveHookIdx:(i:number)=>void
  hookSections:Record<number,any[]>
  setHookSections:(fn:(prev:Record<number,any[]>)=>Record<number,any[]>)=>void
  voiceoverUrl:string|null
  setVoiceoverUrl:(u:string|null)=>void
  voiceoverVoice:string|null
  setVoiceoverVoice:(v:string|null)=>void
  musicUrl:string|null
  setMusicUrl:(u:string|null)=>void
  musicName:string|null
  setMusicName:(n:string|null)=>void
  captionSettings:CaptionSettings
  setCaptionSettings:(s:CaptionSettings)=>void
  adTitle:string
  setAdTitle:(t:string)=>void
  aspectRatio:string
  setAspectRatio:(r:string)=>void
  suggestedMood:string|null
  items:Item[]
  brand:BrandProfile
  genMeta:any
  onSave:(status:'draft'|'complete')=>Promise<void>
  onBack:()=>void
  onMatchClips:()=>Promise<void>
  onGenerateHooks:()=>Promise<void>
  generating:boolean
  matching:boolean
  generatingHooks:boolean
  hookError:string
  workspaceId:string
  isV2?:boolean
  autoCount:number
  form:any
}){
  const assignedCount = sections.filter((s:any)=>s.selectedClipId||(s.clipSegments||[]).some((seg:any)=>seg.clipId)).length
  const totalSections = sections.length

  return<div style={{minHeight:"100vh",background:"var(--af-bg)"}}>
    {/* STICKY TOP ACTION BAR — always visible */}
    <div style={{position:"sticky",top:0,zIndex:20,background:"var(--af-surface)",borderBottom:"1px solid "+C.border,padding:"12px 24px",display:"flex",alignItems:"center",gap:16,backdropFilter:"blur(8px)"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"var(--af-text-secondary)",cursor:"pointer",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:7,fontFamily:"inherit",transition:"background 0.15s"}} onMouseEnter={e=>(e.currentTarget as any).style.background="var(--af-card)"} onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}>&larr; Back</button>
      <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:10}}>
        <input
          value={adTitle}
          onChange={e=>setAdTitle(e.target.value)}
          placeholder={`${genMeta?.productName||"Untitled ad"} — ${genMeta?.form?.contentType||""} ${(genMeta?.form?.adLength||"30s").replace(" seconds","s")}`}
          style={{flex:1,minWidth:0,maxWidth:420,background:"transparent",border:"1px solid transparent",borderRadius:8,padding:"6px 10px",color:"var(--af-text)",fontSize:15,fontWeight:600,outline:"none",fontFamily:"inherit",transition:"border-color 0.15s, background 0.15s"}}
          onFocus={e=>{e.currentTarget.style.borderColor="var(--af-border-strong)";e.currentTarget.style.background="var(--af-card)"}}
          onBlur={e=>{e.currentTarget.style.borderColor="transparent";e.currentTarget.style.background="transparent"}}
        />
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"var(--af-text-secondary)",flexWrap:"nowrap"}}>
        <span title="Clips assigned" style={{background:assignedCount===totalSections?"var(--af-green-soft)":"var(--af-card)",color:assignedCount===totalSections?"var(--af-green)":"var(--af-text-secondary)",padding:"4px 9px",borderRadius:99,fontWeight:600,border:"1px solid "+(assignedCount===totalSections?"rgba(74,222,128,0.25)":"var(--af-border)")}}>{assignedCount}/{totalSections} clips</span>
        <span title="Voiceover" style={{background:voiceoverUrl?"var(--af-green-soft)":"var(--af-card)",color:voiceoverUrl?"var(--af-green)":"var(--af-text-secondary)",padding:"4px 9px",borderRadius:99,fontWeight:600,border:"1px solid "+(voiceoverUrl?"rgba(74,222,128,0.25)":"var(--af-border)")}}>{voiceoverUrl?"✓ VO":"VO"}</span>
        <span title="Music" style={{background:musicUrl?"var(--af-accent-soft)":"var(--af-card)",color:musicUrl?"var(--af-accent)":"var(--af-text-secondary)",padding:"4px 9px",borderRadius:99,fontWeight:600,border:"1px solid "+(musicUrl?"rgba(139,127,255,0.25)":"var(--af-border)")}}>{musicUrl?"✓ Music":"Music"}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={()=>onSave("draft")} style={{background:"var(--af-card)",color:"var(--af-text)",border:"1px solid var(--af-border)",padding:"8px 14px",fontSize:13,borderRadius:8}}>Save draft</Btn>
        <Btn onClick={()=>onSave("complete")} style={{background:"var(--af-accent)",color:"#fff",padding:"8px 16px",fontSize:13,borderRadius:8,fontWeight:700}}>{selectedHooks.length>1?`Save ${selectedHooks.length} variations`:"Complete"}</Btn>
      </div>
    </div>

    <div style={{display:"flex",gap:0,minHeight:"calc(100vh - 60px)"}}>
    {/* LEFT COLUMN */}
    <div style={{flex:3,padding:24,overflowY:"auto",borderRight:"1px solid "+C.border}}>
      {/* Context row */}
      {autoCount>0&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <span style={{background:"var(--af-green-soft)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:99,padding:"3px 10px",fontSize:11,color:"var(--af-green)",fontWeight:600}}>&#10022; {autoCount} auto-matched</span>
      </div>}

      {/* Hook Variations */}
      {hookVariations.length>0?<div style={{marginBottom:20}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {hookVariations.map((_:any[],i:number)=>{
            const hook=hookVariations[i]?.[0]
            const isActive=activeHookIdx===i
            return<button key={i} onClick={()=>{
              setActiveHookIdx(i)
              const existingSecs=hookSections[i]
              if(existingSecs)setSections(existingSecs)
              else setSections(hookVariations[i]||sections)
            }} style={{background:isActive?C.accent:C.surface,color:isActive?"#fff":C.muted,border:"1px solid "+(isActive?C.accent:C.border),borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:isActive?700:500}}>
              {i===0?"Original":`Hook ${i+1} — ${hook?.hookType||""}`}{isActive?" \u2713":""}
            </button>
          })}
        </div>
      </div>:<div style={{marginBottom:16}}>
        <Btn onClick={onGenerateHooks} disabled={generatingHooks||sections.length===0} style={{background:generatingHooks?C.border:C.accentSoft,color:generatingHooks?C.muted:C.accent,border:"1px solid "+C.accent+"44"}}>{generatingHooks?"\u23F3 Generating\u2026":"\u26A1 Generate 3 Hook Variations"}</Btn>
        {hookError&&<div style={{fontSize:11,color:C.red,marginTop:6}}>{hookError}</div>}
      </div>}

      {/* V2 banner */}
      {isV2&&<div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#15803D",marginBottom:12}}>&zwj;&#9889; Creating v2 from <strong>&ldquo;{genMeta?.sourceTitle}&rdquo;</strong> &mdash; same structure, ready for a new hook.</div>}

      {/* Script Table */}
      <Card style={{padding:0,overflow:"hidden",marginBottom:16}}>
        <ScriptTable sections={sections} onChange={(s:any[])=>{setSections(s);setHookSections(prev=>({...prev,[activeHookIdx]:s}))}} libraryItems={items} readOnly={false} brandName={brand.name} productName={genMeta?.productName} voiceoverUrl={voiceoverUrl}/>
      </Card>

      {/* Re-match button */}
      <Btn onClick={onMatchClips} disabled={matching||items.length===0} style={{background:matching?C.border:C.accentSoft,color:matching?C.muted:C.accent,border:"1px solid "+C.accent+"44"}}>{matching?"\uD83D\uDD0D Matching\u2026":"\uD83D\uDD04 Re-match Clips"}</Btn>
    </div>

    {/* RIGHT COLUMN — everything visible in one view, no collapsibles */}
    <div style={{flex:2,padding:"20px 24px",overflowY:"auto",maxHeight:"calc(100vh - 60px)",display:"flex",flexDirection:"column",gap:16}}>
      {/* Live Preview */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"var(--af-muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Preview</div>
        <StitchedPreview sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} captionSettings={captionSettings} onCaptionChange={setCaptionSettings}/>
      </div>

      {/* Voiceover — compact when ready, full UI when not */}
      <div style={{background:"var(--af-card)",border:"1px solid "+C.border,borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:voiceoverUrl?"1px solid var(--af-border)":"none",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--af-text)",display:"flex",alignItems:"center",gap:6}}>🎙️ Voiceover</span>
          {voiceoverUrl ? (
            <>
              <span style={{fontSize:11,color:"var(--af-green)",fontWeight:600,background:"var(--af-green-soft)",padding:"2px 8px",borderRadius:99,border:"1px solid rgba(74,222,128,0.25)"}}>✓ {voiceoverVoice}</span>
              <audio src={voiceoverUrl} controls style={{flex:1,height:28,minWidth:0}}/>
              <button onClick={()=>{setVoiceoverUrl(null);setVoiceoverVoice(null)}} style={{background:"none",border:"none",color:"var(--af-text-secondary)",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>Regenerate</button>
            </>
          ) : (
            <span style={{fontSize:11,color:"var(--af-text-secondary)"}}>Choose a voice below and generate per-section voiceover.</span>
          )}
        </div>
        {!voiceoverUrl && (
          <div style={{padding:14}}>
            <VoiceoverGenerator
              sections={sections}
              allHookSections={selectedHooks.length>1?selectedHooks.map(hi=>hookVariations[hi]||sections):null}
              onSave={(updatedSections:any[],voice:string,combinedUrl:string,allUpdatedHooks?:any[][])=>{
                setSections(updatedSections)
                setVoiceoverVoice(voice)
                setVoiceoverUrl(combinedUrl)
                if(allUpdatedHooks){
                  const newHS:Record<number,any[]>={}
                  selectedHooks.forEach((hi,i)=>{newHS[i]=allUpdatedHooks[i]||updatedSections})
                  setHookSections(prev=>({...prev,...newHS}))
                }
              }}
              onSkip={()=>{setVoiceoverUrl(null);setVoiceoverVoice(null)}}
            />
          </div>
        )}
      </div>

      {/* Music — compact when ready */}
      <div style={{background:"var(--af-card)",border:"1px solid "+C.border,borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:musicUrl?"1px solid var(--af-border)":"none",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--af-text)",display:"flex",alignItems:"center",gap:6}}>🎵 Music</span>
          {musicUrl ? (
            <>
              <span style={{fontSize:11,color:"var(--af-accent)",fontWeight:600,background:"var(--af-accent-soft)",padding:"2px 8px",borderRadius:99,border:"1px solid rgba(139,127,255,0.25)"}}>✓ {musicName}</span>
              <audio src={musicUrl} controls style={{flex:1,height:28,minWidth:0}}/>
              <button onClick={()=>{setMusicUrl(null);setMusicName(null)}} style={{background:"none",border:"none",color:"var(--af-text-secondary)",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>Change</button>
            </>
          ) : (
            <span style={{fontSize:11,color:"var(--af-text-secondary)"}}>Pick a track below (optional).</span>
          )}
        </div>
        {!musicUrl && (
          <div style={{padding:14}}>
            <MusicPicker suggestedMood={suggestedMood} onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
          </div>
        )}
      </div>

      {/* Settings — always visible, compact grid */}
      <div style={{background:"var(--af-card)",border:"1px solid "+C.border,borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--af-text)",display:"flex",alignItems:"center",gap:6}}>⚙️ Output</div>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"var(--af-muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Aspect ratio</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[{ratio:"9:16",label:"9:16",sub:"Reels"},{ratio:"1:1",label:"1:1",sub:"Feed"},{ratio:"4:5",label:"4:5",sub:"Feed"},{ratio:"16:9",label:"16:9",sub:"YT"}].map(opt=>(
              <button key={opt.ratio} onClick={()=>setAspectRatio(opt.ratio)} style={{background:aspectRatio===opt.ratio?"var(--af-accent)":"var(--af-surface)",color:aspectRatio===opt.ratio?"#fff":"var(--af-text)",border:"1px solid "+(aspectRatio===opt.ratio?"var(--af-accent)":"var(--af-border)"),borderRadius:8,padding:"8px 4px",cursor:"pointer",fontSize:11,fontWeight:aspectRatio===opt.ratio?700:500,display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontFamily:"inherit",transition:"all 0.12s"}}>
                <div style={{fontSize:12,fontWeight:700}}>{opt.label}</div>
                <div style={{fontSize:9,opacity:0.7}}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"var(--af-muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Captions</div>
          <button onClick={()=>setCaptionSettings({...captionSettings,enabled:!captionSettings.enabled})} style={{background:captionSettings.enabled?"var(--af-accent)":"var(--af-surface)",color:captionSettings.enabled?"#fff":"var(--af-text)",border:"1px solid "+(captionSettings.enabled?"var(--af-accent)":"var(--af-border)"),borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>{captionSettings.enabled?"Captions on":"Captions off"}</button>
        </div>
      </div>

      {/* Save/Export */}
      <div>
        {/* Voiceover sync warning */}
        {voiceoverUrl&&(()=>{
          const totalClipDur=sections.reduce((acc:number,s:any)=>{
            const segs=s.clipSegments?.length?s.clipSegments:[{clipId:s.selectedClipId}]
            return acc+segs.reduce((a2:number,seg:any)=>{const item=items.find((i:Item)=>i.id===seg.clipId);if(!item)return a2;const start=seg.trimStart??item.start_seconds??0;const end=seg.trimEnd??item.end_seconds??(start+(item.duration_seconds||3));return a2+Math.max(0,end-start)},0)
          },0)
          const totalWords=sections.reduce((acc:number,s:any)=>acc+((s.spokenWords||"").trim().split(/\s+/).filter(Boolean).length),0)
          const estVoDur=totalWords/2.5
          if(totalClipDur===0||estVoDur===0)return null
          const ratio=estVoDur/totalClipDur
          if(ratio>1.25)return<div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#92400E",marginBottom:16}}>&zwj;&#9888;&#65039; Voiceover may be longer than your clips (~{Math.round(estVoDur)}s script vs ~{Math.round(totalClipDur)}s clips). Consider adding more clips or trimming the script.</div>
          if(ratio<0.7)return<div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#92400E",marginBottom:16}}>&zwj;&#9888;&#65039; Clips are longer than voiceover (~{Math.round(estVoDur)}s script vs ~{Math.round(totalClipDur)}s clips). Video will continue after voiceover ends.</div>
          return null
        })()}

        <ExportVideo sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} onSave={onSave}/>
      </div>
    </div>
    </div>
  </div>
}
