'use client'
import { useState } from 'react'
import { ClipboardList, Link2, Copy, Check, ExternalLink, X, Plus, Mic, Video, Anchor, Scissors, Film, MessageSquare } from 'lucide-react'
import type { BrandProfile } from './types'
import { C } from './constants'
import { Btn, Label, STitle, Input } from './ui-primitives'
import { createClient } from '@/lib/supabase/client'

export function CreatorBriefModal({brand,sections,onClose}:{brand:BrandProfile,sections?:any[],onClose:()=>void}){
  const supabase=createClient()
  const [saving,setSaving]=useState(false)
  const [shareUrl,setShareUrl]=useState("")
  const [briefError,setBriefError]=useState("")
  const [copied,setCopied]=useState(false)
  const [productName,setProductName]=useState("")
  const defaultHooks=(sections||[]).filter((s:any)=>s.type==="HOOK"&&s.spokenWords).map((s:any)=>s.spokenWords)
  const defaultScripts=(sections||[]).filter((s:any)=>s.spokenWords?.trim()).map((s:any)=>({type:s.type==="HOOK"?"hook":"voiceover",label:s.type,words:s.spokenWords}))
  const [hooks,setHooks]=useState<string[]>(defaultHooks.length>0?defaultHooks:[""])
  const [scripts,setScripts]=useState<{type:string,label:string,words:string}[]>(defaultScripts.length>0?defaultScripts:[{type:"voiceover",label:"",words:""}])
  const [broll,setBroll]=useState<string[]>([""])
  const [editingStyle,setEditingStyle]=useState("")
  const [editingRefs,setEditingRefs]=useState("")
  const [editingNotes,setEditingNotes]=useState("")
  const [additionalNotes,setAdditionalNotes]=useState("")
  function updHook(i:number,v:string){setHooks(h=>h.map((x,j)=>j===i?v:x))}
  function updScript(i:number,field:string,v:string){setScripts(s=>s.map((x,j)=>j===i?{...x,[field]:v}:x))}
  function updBroll(i:number,v:string){setBroll(b=>b.map((x,j)=>j===i?v:x))}
  async function generateBrief(){
    setSaving(true)
    try{
      const{data,error}=await supabase.from("creator_briefs").insert({brand_name:brand.name||"",product_name:productName,hooks:hooks.filter(h=>h.trim()),scripts:scripts.filter(s=>s.words.trim()),broll_shots:broll.filter(b=>b.trim()),editing_style:editingStyle.trim()||null,editing_references:editingRefs.trim()||null,editing_notes:editingNotes.trim()||null,additional_notes:additionalNotes.trim()||null}).select("share_token").single()
      if(error)throw new Error(error.message)
      setShareUrl(`${window.location.origin}/brief/${data.share_token}`)
    }catch(e:any){setBriefError("Failed to create brief: "+e.message)}
    setSaving(false)
  }
  async function copyUrl(){await navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),2000)}

  return<div onClick={onClose} className="bg-overlay fixed inset-0 z-[400] flex items-start justify-center p-5 overflow-y-auto animate-fade-in">
    <div onClick={e=>e.stopPropagation()} className="bg-card border border-border rounded-xl p-7 max-w-[700px] w-full mt-5 mb-10 shadow-xl animate-scale-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2 font-bold text-xl mb-0.5">
            <ClipboardList className="w-5 h-5" /> Creator Brief
          </div>
          <div className="text-sm text-text-muted">Everything a creator needs to record your ad</div>
        </div>
        <button onClick={onClose} className="bg-transparent border border-border text-text-muted rounded-md px-3 py-1.5 cursor-pointer hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
          <X className="w-4 h-4" />
        </button>
      </div>
      {shareUrl?<>
        <div className="bg-success-soft border-2 border-success/40 rounded-lg p-6 text-center mb-5">
          <Link2 className="w-8 h-8 mx-auto mb-3 text-success" />
          <div className="font-bold text-base text-success mb-2">Brief ready to share!</div>
          <div className="bg-card border-[1.5px] border-success/40 rounded-md px-4 py-3 font-mono text-sm break-all mb-3.5 text-text">{shareUrl}</div>
          <div className="flex gap-2.5 justify-center flex-wrap">
            <Btn onClick={copyUrl} className={`font-bold flex items-center gap-1.5 transition-all duration-150 ${copied?"bg-success text-white":"bg-accent text-white hover:bg-accent-hover"} focus-visible:ring-2 focus-visible:ring-accent/50`}>
              {copied?<><Check className="w-3.5 h-3.5" /> Copied!</>:<><Copy className="w-3.5 h-3.5" /> Copy URL</>}
            </Btn>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="no-underline">
              <Btn className="bg-accent-soft text-accent border border-accent/30 flex items-center gap-1.5 hover:bg-accent hover:text-white transition-all duration-150">
                Preview <ExternalLink className="w-3.5 h-3.5" />
              </Btn>
            </a>
            <Btn onClick={()=>setShareUrl("")} className="bg-transparent border border-border text-text-muted hover:border-border-strong transition-all duration-150">Edit brief</Btn>
          </div>
        </div>
        <Btn onClick={onClose} className="bg-surface border border-border text-text-muted w-full hover:border-border-strong transition-all duration-150">Close</Btn>
      </>:<>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div><Label>Brand name</Label><Input value={brand.name||""} onChange={()=>{}} className="bg-surface text-text-muted"/></div>
          <div><Label>Product (optional)</Label><Input value={productName} onChange={(e:any)=>setProductName(e.target.value)} placeholder="e.g. Vitamin C Serum"/></div>
        </div>
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2.5">
            <Label className="flex items-center gap-1.5"><Anchor className="w-3.5 h-3.5" /> Hooks to record</Label>
            <Btn onClick={()=>setHooks(h=>[...h,""])} className="bg-accent-soft text-accent border border-accent/30 text-xs px-2.5 py-1 flex items-center gap-1 hover:bg-accent hover:text-white transition-all duration-150"><Plus className="w-3 h-3" /> Add</Btn>
          </div>
          {hooks.map((h,i)=><div key={i} className="flex gap-2 mb-2">
            <div className="w-[22px] h-[22px] rounded-full bg-accent-soft text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-[11px]">{i+1}</div>
            <Input value={h} onChange={(e:any)=>updHook(i,e.target.value)} placeholder={`Hook ${i+1} -- exact opening words`} className="flex-1"/>
            {hooks.length>1&&<button onClick={()=>setHooks(h=>h.filter((_,j)=>j!==i))} className="bg-transparent border-none text-text-muted cursor-pointer text-lg flex-shrink-0 hover:text-danger transition-colors duration-150"><X className="w-4 h-4" /></button>}
          </div>)}
        </div>
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2.5">
            <Label className="flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Scripts to record</Label>
            <Btn onClick={()=>setScripts(s=>[...s,{type:"voiceover",label:"",words:""}])} className="bg-accent-soft text-accent border border-accent/30 text-xs px-2.5 py-1 flex items-center gap-1 hover:bg-accent hover:text-white transition-all duration-150"><Plus className="w-3 h-3" /> Add</Btn>
          </div>
          {scripts.map((s,i)=><div key={i} className="border-[1.5px] border-border rounded-lg p-3.5 mb-2.5">
            <div className="flex gap-2.5 mb-2.5 items-center flex-wrap">
              <select value={s.type} onChange={e=>updScript(i,"type",e.target.value)} className="bg-surface border-none rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer outline-none text-text focus-visible:ring-2 focus-visible:ring-accent/50">
                <option value="voiceover">Voiceover</option><option value="talking head">Talking Head</option><option value="hook">Hook</option>
              </select>
              <Input value={s.label} onChange={(e:any)=>updScript(i,"label",e.target.value)} placeholder="Label (optional)" className="flex-1 min-w-[100px]"/>
              {scripts.length>1&&<button onClick={()=>setScripts(s=>s.filter((_,j)=>j!==i))} className="bg-transparent border-none text-text-muted cursor-pointer text-lg hover:text-danger transition-colors duration-150"><X className="w-4 h-4" /></button>}
            </div>
            <Input textarea value={s.words} onChange={(e:any)=>updScript(i,"words",e.target.value)} placeholder="Exact words to say..." rows={3}/>
          </div>)}
        </div>
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2.5">
            <Label className="flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> B-roll shots</Label>
            <Btn onClick={()=>setBroll(b=>[...b,""])} className="bg-accent-soft text-accent border border-accent/30 text-xs px-2.5 py-1 flex items-center gap-1 hover:bg-accent hover:text-white transition-all duration-150"><Plus className="w-3 h-3" /> Add</Btn>
          </div>
          {broll.map((b,i)=><div key={i} className="flex gap-2 mb-2">
            <Input value={b} onChange={(e:any)=>updBroll(i,e.target.value)} placeholder={`Shot ${i+1} -- describe what to film`} className="flex-1"/>
            {broll.length>1&&<button onClick={()=>setBroll(b=>b.filter((_,j)=>j!==i))} className="bg-transparent border-none text-text-muted cursor-pointer text-lg flex-shrink-0 hover:text-danger transition-colors duration-150"><X className="w-4 h-4" /></button>}
          </div>)}
        </div>
        <div className="bg-surface border border-border rounded-lg p-3.5 mb-4">
          <Label className="flex items-center gap-1.5"><Scissors className="w-3.5 h-3.5" /> Editing style & references</Label>
          <div className="mb-2.5"><Input textarea value={editingStyle} onChange={(e:any)=>setEditingStyle(e.target.value)} placeholder="e.g. Fast cuts, bold captions, raw UGC feel..." rows={2}/></div>
          <div className="mb-2.5"><Input textarea value={editingRefs} onChange={(e:any)=>setEditingRefs(e.target.value)} placeholder={"Reference links (one per line)\nhttps://tiktok.com/..."} rows={3}/></div>
          <Input textarea value={editingNotes} onChange={(e:any)=>setEditingNotes(e.target.value)} placeholder="Editing notes -- captions on every word, product close-up at end..." rows={2}/>
        </div>
        <div className="mb-6">
          <Label className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Additional notes</Label>
          <Input textarea value={additionalNotes} onChange={(e:any)=>setAdditionalNotes(e.target.value)} placeholder="Deadlines, deliverables, file format..." rows={3}/>
        </div>
        {briefError&&<div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger mb-3">{briefError}</div>}
        <Btn onClick={generateBrief} disabled={saving} className="bg-accent text-white w-full py-3.5 text-[15px] rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-accent-hover active:scale-[0.99] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
          <Link2 className="w-4 h-4" /> {saving?"Generating link...":"Generate Shareable Brief"}
        </Btn>
      </>}
    </div>
  </div>
}
