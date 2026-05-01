'use client'
import { useState, useEffect, useRef } from 'react'
import { C } from './constants'
import { typeColor } from './utils'

/**
 * AdSplit-style primitives.
 *
 * Buttons are full pills. The default `Btn` is the white-with-black-border
 * secondary; pass `style={{background:C.accent,color:'#fff'}}` for the black
 * primary variant — most call sites already do exactly that, so flipping
 * the default keeps existing usage but gives "naked" Btn calls a sensible
 * AdSplit shape (white pill).
 *
 * Cards are pure white with a crisp 1px near-black border, no fluffy shadow.
 */
export function Btn({onClick,disabled,style,children,type}:any){
  return <button
    onClick={onClick}
    disabled={disabled}
    type={type||"button"}
    style={{
      background:"var(--af-card)",
      color:"var(--af-text)",
      border:"1px solid var(--af-border)",
      borderRadius:9999,
      padding:"9px 18px",
      fontWeight:600,
      fontSize:13.5,
      cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.4:1,
      fontFamily:"inherit",
      letterSpacing:"-0.01em",
      transition:"opacity 0.15s, transform 0.05s, background 0.15s",
      display:"inline-flex",
      alignItems:"center",
      gap:6,
      whiteSpace:"nowrap" as const,
      ...style
    }}
  >{children}</button>
}

export function Label({children}:any){
  return <div style={{
    fontSize:11,
    fontWeight:700,
    color:C.muted,
    marginBottom:8,
    letterSpacing:"0.08em",
    textTransform:"uppercase" as const
  }}>{children}</div>
}

export function Card({children,style,pad,interactive}:any){
  return <div style={{
    background:C.card,
    border:"1px solid "+C.border,
    borderRadius:16,
    padding:pad??20,
    transition:interactive?"transform 0.15s, box-shadow 0.15s":undefined,
    cursor:interactive?"pointer":undefined,
    ...style
  }}>{children}</div>
}

export function STitle({children,size,mb}:any){
  return <div style={{
    fontWeight:800,
    fontSize:size||20,
    marginBottom:mb!=null?mb:14,
    color:C.text,
    letterSpacing:"-0.02em",
    lineHeight:1.2
  }}>{children}</div>
}

export function Chip({label,color}:any){
  const cl=color||typeColor(label)
  return <span style={{
    background:cl.bg,
    color:cl.color,
    padding:"3px 10px",
    borderRadius:9999,
    fontSize:10.5,
    fontWeight:700,
    whiteSpace:"nowrap" as const,
    border:"1px solid "+cl.bg,
    letterSpacing:"0.01em"
  }}>{label}</span>
}

export function Input({value,onChange,placeholder,type,textarea,rows,onKeyDown,style}:any){
  const s={
    background:C.surface,
    border:"1px solid "+C.border,
    borderRadius:10,
    padding:"10px 13px",
    color:C.text,
    fontSize:14,
    outline:"none",
    width:"100%",
    boxSizing:"border-box" as const,
    fontFamily:"inherit",
    ...style
  }
  if(textarea)return <textarea value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} rows={rows||3} style={{...s,resize:"vertical" as const}}/>
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type||"text"} style={s} onKeyDown={onKeyDown}/>
}

export function MultiSelect({label,options,selected,onChange}:any){
  const [open,setOpen]=useState(false)
  const ref=useRef<HTMLDivElement>(null)
  const sel:string[]=selected||[]
  useEffect(()=>{
    function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener("mousedown",h)
    return()=>document.removeEventListener("mousedown",h)
  },[])
  const isActive=sel.length>0
  return <div ref={ref} style={{position:"relative"}}>
    <button onClick={()=>setOpen(!open)} style={{
      background:isActive?C.accent:C.card,
      color:isActive?"var(--af-accent-text)":C.text,
      border:"1px solid "+(isActive?C.accent:C.border),
      borderRadius:9999,
      padding:"6px 13px",
      fontSize:12.5,
      fontWeight:isActive?600:500,
      cursor:"pointer",
      display:"flex",
      alignItems:"center",
      gap:6,
      whiteSpace:"nowrap" as const,
      fontFamily:"inherit"
    }}>
      {label}
      {isActive&&<span style={{background:"#fff",color:C.accent,borderRadius:99,fontSize:10,padding:"1px 6px",fontWeight:700}}>{sel.length}</span>}
      <span style={{fontSize:8,opacity:0.5}}>{open?"▲":"▼"}</span>
    </button>
    {open&&<div style={{
      position:"absolute",
      top:"calc(100% + 6px)",
      left:0,
      background:C.card,
      border:"1px solid "+C.border,
      borderRadius:12,
      padding:6,
      zIndex:200,
      minWidth:190,
      maxHeight:240,
      overflowY:"auto",
      boxShadow:"0 8px 24px rgba(15,15,15,0.10)"
    }}>
      {options.map((opt:string)=>{
        const active=sel.includes(opt)
        return <div key={opt} onClick={()=>onChange(active?sel.filter((x:string)=>x!==opt):[...sel,opt])} style={{
          display:"flex",
          alignItems:"center",
          gap:8,
          padding:"7px 9px",
          borderRadius:8,
          cursor:"pointer",
          background:active?C.accentSoft:"transparent",
          color:C.text,
          fontSize:13,
          fontWeight:active?600:400
        }}>
          <div style={{
            width:14,height:14,borderRadius:4,
            border:"1.5px solid "+(active?C.accent:C.border),
            background:active?C.accent:"transparent",
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0
          }}>
            {active&&<span style={{color:"var(--af-accent-text)",fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>}
          </div>
          {opt}
        </div>
      })}
      {sel.length>0&&<div onClick={()=>onChange([])} style={{
        borderTop:"1px solid "+C.border,
        marginTop:4,padding:"7px 9px",
        textAlign:"center" as const,
        fontSize:11,color:C.muted,cursor:"pointer"
      }}>Clear</div>}
    </div>}
  </div>
}
