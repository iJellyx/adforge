'use client'
import { useState } from 'react'
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
  const typeColors:Record<string,{bg:string,color:string}>={voiceover:{bg:"#DBEAFE",color:"#1D4ED8"},hook:{bg:"#FEF3C7",color:"#92400E"},"talking head":{bg:"#D1FAE5",color:"#065F46"}}
  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"#000000dd",zIndex:400,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:28,maxWidth:700,width:"100%",marginTop:20,marginBottom:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div><STitle size={20} mb={2}>📋 Creator Brief</STitle><div style={{fontSize:13,color:C.muted}}>Everything a creator needs to record your ad</div></div>
        <Btn onClick={onClose} style={{background:"none",border:"1px solid "+C.border,color:C.muted,padding:"5px 12px"}}>✕</Btn>
      </div>
      {shareUrl?<>
        <div style={{background:"#F0FDF4",border:"2px solid #86EFAC",borderRadius:14,padding:24,textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:12}}>🔗</div>
          <div style={{fontWeight:700,fontSize:16,color:"#15803D",marginBottom:8}}>Brief ready to share!</div>
          <div style={{background:"#fff",border:"1.5px solid #86EFAC",borderRadius:10,padding:"12px 16px",fontFamily:"monospace",fontSize:13,wordBreak:"break-all" as const,marginBottom:14,color:C.text}}>{shareUrl}</div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <Btn onClick={copyUrl} style={{background:copied?"#22c55e":C.accent,color:"#fff",fontWeight:700}}>{copied?"✓ Copied!":"Copy URL"}</Btn>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><Btn style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44"}}>Preview →</Btn></a>
            <Btn onClick={()=>setShareUrl("")} style={{background:"none",border:"1px solid "+C.border,color:C.muted}}>Edit brief</Btn>
          </div>
        </div>
        <Btn onClick={onClose} style={{background:C.surface,border:"1px solid "+C.border,color:C.muted,width:"100%"}}>Close</Btn>
      </>:<>
        <div style={{marginBottom:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Label>Brand name</Label><Input value={brand.name||""} onChange={()=>{}} style={{background:"#F9FAFB",color:C.muted}}/></div>
          <div><Label>Product (optional)</Label><Input value={productName} onChange={(e:any)=>setProductName(e.target.value)} placeholder="e.g. Vitamin C Serum"/></div>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><Label>🎣 Hooks to record</Label><Btn onClick={()=>setHooks(h=>[...h,""])} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:11,padding:"4px 10px"}}>+ Add</Btn></div>
          {hooks.map((h,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
            <div style={{width:22,height:22,borderRadius:99,background:C.accentSoft,color:C.accent,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:11}}>{i+1}</div>
            <Input value={h} onChange={(e:any)=>updHook(i,e.target.value)} placeholder={`Hook ${i+1} — exact opening words`} style={{flex:1}}/>
            {hooks.length>1&&<button onClick={()=>setHooks(h=>h.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,flexShrink:0}}>×</button>}
          </div>)}
        </div>
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><Label>📝 Scripts to record</Label><Btn onClick={()=>setScripts(s=>[...s,{type:"voiceover",label:"",words:""}])} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:11,padding:"4px 10px"}}>+ Add</Btn></div>
          {scripts.map((s,i)=><div key={i} style={{border:"1.5px solid "+C.border,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",gap:10,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
              <select value={s.type} onChange={e=>updScript(i,"type",e.target.value)} style={{background:typeColors[s.type]?.bg||C.surface,border:"none",borderRadius:99,padding:"4px 10px",color:typeColors[s.type]?.color||C.text,fontSize:11,fontWeight:700,cursor:"pointer",outline:"none"}}>
                <option value="voiceover">🎙️ Voiceover</option><option value="talking head">🎥 Talking Head</option><option value="hook">🎣 Hook</option>
              </select>
              <Input value={s.label} onChange={(e:any)=>updScript(i,"label",e.target.value)} placeholder="Label (optional)" style={{flex:1,minWidth:100}}/>
              {scripts.length>1&&<button onClick={()=>setScripts(s=>s.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>×</button>}
            </div>
            <Input textarea value={s.words} onChange={(e:any)=>updScript(i,"words",e.target.value)} placeholder="Exact words to say…" rows={3}/>
          </div>)}
        </div>
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><Label>🎬 B-roll shots</Label><Btn onClick={()=>setBroll(b=>[...b,""])} style={{background:C.accentSoft,color:C.accent,border:"1px solid "+C.accent+"44",fontSize:11,padding:"4px 10px"}}>+ Add</Btn></div>
          {broll.map((b,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
            <Input value={b} onChange={(e:any)=>updBroll(i,e.target.value)} placeholder={`Shot ${i+1} — describe what to film`} style={{flex:1}}/>
            {broll.length>1&&<button onClick={()=>setBroll(b=>b.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,flexShrink:0}}>×</button>}
          </div>)}
        </div>
        <div style={{border:"1px solid "+C.border,borderRadius:12,padding:14,marginBottom:16}}>
          <Label>✂️ Editing style & references</Label>
          <div style={{marginBottom:10}}><Input textarea value={editingStyle} onChange={(e:any)=>setEditingStyle(e.target.value)} placeholder="e.g. Fast cuts, bold captions, raw UGC feel…" rows={2}/></div>
          <div style={{marginBottom:10}}><Input textarea value={editingRefs} onChange={(e:any)=>setEditingRefs(e.target.value)} placeholder={"Reference links (one per line)\nhttps://tiktok.com/..."} rows={3}/></div>
          <Input textarea value={editingNotes} onChange={(e:any)=>setEditingNotes(e.target.value)} placeholder="Editing notes — captions on every word, product close-up at end…" rows={2}/>
        </div>
        <div style={{marginBottom:24}}><Label>💬 Additional notes</Label><Input textarea value={additionalNotes} onChange={(e:any)=>setAdditionalNotes(e.target.value)} placeholder="Deadlines, deliverables, file format…" rows={3}/></div>
        {briefError&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 12px",fontSize:12,color:C.red,marginBottom:12}}>{briefError}</div>}
        <Btn onClick={generateBrief} disabled={saving} style={{background:C.accent,color:"#fff",width:"100%",padding:14,fontSize:15,borderRadius:12,fontWeight:700}}>{saving?"Generating link…":"🔗 Generate Shareable Brief"}</Btn>
      </>}
    </div>
  </div>
}
