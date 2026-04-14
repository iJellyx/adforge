'use client'
import { useState } from 'react'
import { ChevronUp, ChevronDown, Mic, Music, Check, Save, Zap, RefreshCw, Search, AlertTriangle, Settings, Loader2, X } from 'lucide-react'
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
  const [audioOpen,setAudioOpen]=useState(!voiceoverUrl)
  const [settingsOpen,setSettingsOpen]=useState(false)

  return<div className="flex gap-0 min-h-screen">
    {/* LEFT COLUMN */}
    <div className="flex-[3] p-6 overflow-y-auto border-r border-border">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2.5">
        <button onClick={onBack} className="bg-transparent border-none text-text-muted cursor-pointer text-sm hover:text-text transition-colors duration-150">&larr; Back</button>
        <div className="text-sm text-text-muted">{genMeta?.productName} &middot; {genMeta?.form?.contentType}</div>
        {autoCount>0&&<span className="bg-success-soft border border-success/40 rounded-full px-2.5 py-1 text-xs text-success font-semibold flex items-center gap-1"><Zap className="w-3 h-3" /> {autoCount} auto-matched</span>}
      </div>

      {/* Hook Variations */}
      {hookVariations.length>0?<div className="mb-5">
        <div className="flex gap-2 flex-wrap mb-3">
          {hookVariations.map((_:any[],i:number)=>{
            const hook=hookVariations[i]?.[0]
            const isActive=activeHookIdx===i
            return<button key={i} onClick={()=>{
              setActiveHookIdx(i)
              const existingSecs=hookSections[i]
              if(existingSecs)setSections(existingSecs)
              else setSections(hookVariations[i]||sections)
            }} className={`rounded-md px-3.5 py-1.5 cursor-pointer text-xs transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${isActive?"bg-accent text-white font-bold border border-accent":"bg-surface text-text-muted border border-border hover:border-border-strong font-medium"}`}>
              {i===0?"Original":`Hook ${i+1} -- ${hook?.hookType||""}`}{isActive&&<Check className="w-3 h-3 inline ml-1" />}
            </button>
          })}
        </div>
      </div>:<div className="mb-4">
        <Btn onClick={onGenerateHooks} disabled={generatingHooks||sections.length===0} className={`flex items-center gap-1.5 border border-accent/30 transition-all duration-150 ${generatingHooks?"bg-border text-text-muted":"bg-accent-soft text-accent hover:bg-accent hover:text-white"}`}>
          {generatingHooks?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>:<><Zap className="w-3.5 h-3.5" /> Generate 3 Hook Variations</>}
        </Btn>
        {hookError&&<div className="text-xs text-danger mt-1.5">{hookError}</div>}
      </div>}

      {/* V2 banner */}
      {isV2&&<div className="bg-success-soft border-[1.5px] border-success/40 rounded-md px-3.5 py-2.5 text-sm text-success mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4" /> Creating v2 from <strong>"{genMeta?.sourceTitle}"</strong> -- same structure, ready for a new hook.
      </div>}

      {/* Script Table */}
      <Card className="p-0 overflow-hidden mb-4">
        <ScriptTable sections={sections} onChange={(s:any[])=>{setSections(s);setHookSections(prev=>({...prev,[activeHookIdx]:s}))}} libraryItems={items} readOnly={false} brandName={brand.name} productName={genMeta?.productName} voiceoverUrl={voiceoverUrl}/>
      </Card>

      {/* Re-match button */}
      <Btn onClick={onMatchClips} disabled={matching||items.length===0} className={`flex items-center gap-1.5 border border-accent/30 transition-all duration-150 ${matching?"bg-border text-text-muted":"bg-accent-soft text-accent hover:bg-accent hover:text-white"}`}>
        {matching?<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Matching...</>:<><RefreshCw className="w-3.5 h-3.5" /> Re-match Clips</>}
      </Btn>
    </div>

    {/* RIGHT COLUMN */}
    <div className="flex-[2] p-6 sticky top-0 h-screen overflow-y-auto">
      {/* Live Preview */}
      <div className="mb-5">
        <StitchedPreview sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} captionSettings={captionSettings} onCaptionChange={setCaptionSettings}/>
      </div>

      {/* Audio Panel */}
      <div className="mb-4 border border-border rounded-lg overflow-hidden">
        <button onClick={()=>setAudioOpen(!audioOpen)} className="w-full flex justify-between items-center px-4 py-3 bg-surface border-none cursor-pointer text-sm font-semibold text-text hover:bg-card-hover transition-colors duration-150">
          <span className="flex items-center gap-2"><Mic className="w-4 h-4" /> Audio</span>
          {audioOpen?<ChevronUp className="w-3.5 h-3.5 text-text-muted" />:<ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
        </button>
        {audioOpen&&<div className="p-4 bg-card">
          {/* Voiceover status */}
          {voiceoverUrl&&<div className="bg-success-soft border border-success/30 rounded-md px-4 py-2.5 mb-3 flex items-center gap-2.5">
            <Check className="w-4 h-4 text-success" />
            <div className="flex-1"><div className="text-sm font-semibold text-success">Voiceover ready -- {voiceoverVoice}</div><audio src={voiceoverUrl} controls className="w-full h-7 mt-1"/></div>
            <button onClick={()=>{setVoiceoverUrl(null);setVoiceoverVoice(null)}} className="bg-transparent border-none text-text-muted cursor-pointer text-xs underline hover:text-text transition-colors duration-150">Remove</button>
          </div>}

          {/* Music status */}
          {musicUrl&&<div className="bg-accent-soft border border-accent/30 rounded-md px-4 py-2.5 mb-3 flex items-center gap-2.5">
            <Check className="w-4 h-4 text-accent" />
            <div className="flex-1"><div className="text-sm font-semibold text-accent">Music selected -- {musicName}</div><audio src={musicUrl} controls className="w-full h-7 mt-1"/></div>
            <button onClick={()=>{setMusicUrl(null);setMusicName(null)}} className="bg-transparent border-none text-text-muted cursor-pointer text-xs underline hover:text-text transition-colors duration-150">Remove</button>
          </div>}

          {/* Voiceover Generator */}
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

          {/* Music Picker */}
          <div className="mt-4">
            <MusicPicker suggestedMood={suggestedMood} onSave={(url:string|null,name:string|null)=>{setMusicUrl(url);setMusicName(name)}}/>
          </div>
        </div>}
      </div>

      {/* Settings Panel */}
      <div className="mb-4 border border-border rounded-lg overflow-hidden">
        <button onClick={()=>setSettingsOpen(!settingsOpen)} className="w-full flex justify-between items-center px-4 py-3 bg-surface border-none cursor-pointer text-sm font-semibold text-text hover:bg-card-hover transition-colors duration-150">
          <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Settings</span>
          {settingsOpen?<ChevronUp className="w-3.5 h-3.5 text-text-muted" />:<ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
        </button>
        {settingsOpen&&<div className="p-4 bg-card">
          {/* Ad Title */}
          <div className="mb-4">
            <Label>Ad Name (optional)</Label>
            <input value={adTitle} onChange={e=>setAdTitle(e.target.value)} placeholder={`e.g. ProblemAware_${form?.contentType||"UGC"}_${(form?.adLength||"30s").replace(" seconds","s")}_v1`} className="bg-surface border border-border rounded-md px-3 py-2 text-text text-sm outline-none w-full focus-visible:ring-2 focus-visible:ring-accent/50 transition-all duration-150"/>
          </div>

          {/* Aspect Ratio */}
          <div className="mb-4">
            <Label>Aspect Ratio</Label>
            <div className="flex gap-2 flex-wrap">
              {[{ratio:"9:16",label:"9:16 Portrait",platform:"TikTok/Reels/Stories"},{ratio:"1:1",label:"1:1 Square",platform:"Instagram/Facebook Feed"},{ratio:"4:5",label:"4:5 Vertical",platform:"Facebook/Instagram Feed"},{ratio:"16:9",label:"16:9 Landscape",platform:"YouTube/Website"}].map(opt=><button key={opt.ratio} onClick={()=>setAspectRatio(opt.ratio)} className={`rounded-md px-3 py-2.5 cursor-pointer text-xs flex flex-col items-center gap-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${aspectRatio===opt.ratio?"bg-accent text-white font-bold border border-accent":"bg-surface text-text border border-border hover:border-border-strong"}`}>
                <div>{opt.label}</div>
                <div className="text-[10px] opacity-70">{opt.platform}</div>
              </button>)}
            </div>
          </div>

          {/* Caption toggle */}
          <div>
            <Label>Captions</Label>
            <button onClick={()=>setCaptionSettings({...captionSettings,enabled:!captionSettings.enabled})} className={`rounded-md px-3.5 py-2 cursor-pointer text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 ${captionSettings.enabled?"bg-accent text-white border border-accent":"bg-surface text-text border border-border hover:border-border-strong"}`}>{captionSettings.enabled?"Captions ON":"Captions OFF"}</button>
          </div>
        </div>}
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
          if(ratio>1.25)return<div className="bg-warning-soft border-[1.5px] border-warning/30 rounded-md px-3.5 py-2.5 text-sm text-warning mb-4 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Voiceover may be longer than your clips (~{Math.round(estVoDur)}s script vs ~{Math.round(totalClipDur)}s clips). Consider adding more clips or trimming the script.</div>
          if(ratio<0.7)return<div className="bg-warning-soft border-[1.5px] border-warning/30 rounded-md px-3.5 py-2.5 text-sm text-warning mb-4 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Clips are longer than voiceover (~{Math.round(estVoDur)}s script vs ~{Math.round(totalClipDur)}s clips). Video will continue after voiceover ends.</div>
          return null
        })()}

        <div className="flex gap-2.5 mb-4">
          <Btn onClick={()=>onSave("draft")} className="flex-1 bg-surface text-text border border-border py-3.5 text-sm rounded-lg flex items-center justify-center gap-1.5 hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
            <Save className="w-4 h-4" /> Save Draft
          </Btn>
          <Btn onClick={()=>onSave("complete")} className="flex-1 bg-success text-black font-bold py-3.5 text-sm rounded-lg flex items-center justify-center gap-1.5 hover:bg-success/90 active:scale-[0.99] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-success/50">
            <Check className="w-4 h-4" /> Save {selectedHooks.length>1?`${selectedHooks.length} Hook Variations`:"& Complete"}
          </Btn>
        </div>

        <ExportVideo sections={sections} libraryItems={items} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} onSave={onSave}/>
      </div>
    </div>
  </div>
}
