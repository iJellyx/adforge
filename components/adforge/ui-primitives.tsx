'use client'
import { useState, useEffect, useRef } from 'react'
import { C } from './constants'
import { typeColor } from './utils'

export function Btn({onClick,disabled,style,children}:any){return<button onClick={onClick} disabled={disabled} style={{border:"none",borderRadius:50,padding:"9px 20px",fontWeight:700,fontSize:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontFamily:"inherit",transition:"opacity 0.15s",...style}}>{children}</button>}
export function Label({children}:any){return<div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:6,letterSpacing:"0.02em"}}>{children}</div>}
export function Card({children,style,pad}:any){return<div style={{background:C.card,border:"1.5px solid "+C.border,borderRadius:16,padding:pad||20,boxShadow:"0 2px 12px rgba(91,73,255,0.06)",...style}}>{children}</div>}
export function STitle({children,size,mb}:any){return<div style={{fontWeight:800,fontSize:size||17,marginBottom:mb!=null?mb:16,color:C.text,letterSpacing:"-0.02em"}}>{children}</div>}
export function Chip({label,color}:any){const cl=color||typeColor(label);return<span style={{background:cl.bg,color:cl.color,padding:"3px 10px",borderRadius:50,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>}
export function Input({value,onChange,placeholder,type,textarea,rows,onKeyDown,style}:any){
  const s={background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"10px 13px",color:C.text,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box" as const,fontFamily:"inherit",...style}
  if(textarea)return<textarea value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} rows={rows||3} style={{...s,resize:"vertical" as const}}/>
  return<input value={value} onChange={onChange} placeholder={placeholder} type={type||"text"} style={s} onKeyDown={onKeyDown}/>
}
export function MultiSelect({label,options,selected,onChange}:any){
  const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);const sel:string[]=selected||[]
  useEffect(()=>{function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[])
  return<div ref={ref} style={{position:"relative"}}>
    <button onClick={()=>setOpen(!open)} style={{background:sel.length>0?C.accentSoft:C.surface,border:"1px solid "+(sel.length>0?C.accent:C.border),borderRadius:8,padding:"6px 11px",color:sel.length>0?C.accent:C.muted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",fontWeight:sel.length>0?600:400}}>
      {label}{sel.length>0&&<span style={{background:C.accent,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 5px",fontWeight:700}}>{sel.length}</span>}<span style={{fontSize:8,opacity:0.5}}>{open?"▲":"▼"}</span>
    </button>
    {open&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:6,zIndex:200,minWidth:170,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px #0008"}}>
      {options.map((opt:string)=>{const active=sel.includes(opt);return<div key={opt} onClick={()=>onChange(active?sel.filter((x:string)=>x!==opt):[...sel,opt])} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:7,cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.text,fontSize:13}}><div style={{width:14,height:14,borderRadius:3,border:"2px solid "+(active?C.accent:C.border),background:active?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{active&&<span style={{color:"#fff",fontSize:8,fontWeight:900}}>✓</span>}</div>{opt}</div>})}
      {sel.length>0&&<div onClick={()=>onChange([])} style={{borderTop:"1px solid "+C.border,marginTop:4,padding:"6px 9px",textAlign:"center",fontSize:11,color:C.muted,cursor:"pointer"}}>Clear</div>}
    </div>}
  </div>
}
