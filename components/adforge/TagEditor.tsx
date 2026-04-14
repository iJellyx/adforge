'use client'
import { useState } from 'react'
import { C } from './constants'
import { Input, Btn } from './ui-primitives'

export function TagEditor({tags,onUpdate}:{tags:string[],onUpdate:(t:string[])=>void}){
  const [newTag,setNewTag]=useState("")
  function addTag(){const t=newTag.trim();if(!t||tags.includes(t)){setNewTag("");return;}onUpdate([...tags,t]);setNewTag("")}
  return<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,minHeight:26}}>{tags.length===0&&<span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>No tags yet</span>}{tags.map((t,i)=><span key={i} style={{background:"#22c55e18",color:"#4ade80",padding:"3px 9px",borderRadius:99,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:5,border:"1px solid #22c55e33"}}>{t}<span onClick={()=>onUpdate(tags.filter(x=>x!==t))} style={{cursor:"pointer",fontSize:13,opacity:0.7}}>×</span></span>)}</div>
    <div style={{display:"flex",gap:8}}><Input value={newTag} onChange={(e:any)=>setNewTag(e.target.value)} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();addTag()}}} placeholder="Type tag + Enter"/><Btn onClick={addTag} style={{background:C.accent,color:"#fff",flexShrink:0,padding:"9px 14px"}}>Add</Btn></div>
  </div>
}
