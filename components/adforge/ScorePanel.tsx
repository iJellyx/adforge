'use client'
import { useState } from 'react'
import type { ForgedAd } from './types'
import { C } from './constants'
import { gradeColor } from './utils'

export function ScorePanel({ad,onScored}:{ad:ForgedAd,onScored:(scored:any)=>void}){
  const [scoring,setScoring]=useState(false)
  const [expanded,setExpanded]=useState(false)
  const [error,setError]=useState("")
  const scoreData=ad.metadata?.score_details
  const grade=ad.metadata?.grade
  const score=ad.metadata?.score

  async function runScore(){
    setScoring(true);setError("")
    try{
      const res=await fetch("/api/ads/score",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adId:ad.id})})
      const d=await res.json()
      if(d.error)throw new Error(d.error)
      onScored(d)
    }catch(e:any){setError(e.message||"Scoring failed")}
    setScoring(false)
  }

  if(!grade&&!scoring){
    return<div style={{marginBottom:16}}>
      <button onClick={runScore} style={{background:"#6c63ff11",border:"1px solid #6c63ff33",color:C.accent,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,width:"100%",textAlign:"left" as const,fontWeight:600}}>
        🎯 Score Clip-Script Alignment
      </button>
      {error&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#ef4444",marginTop:6}}>{error}</div>}
    </div>
  }

  if(scoring){
    return<div style={{marginBottom:16,background:C.bg,border:"1px solid "+C.border,borderRadius:10,padding:16,textAlign:"center"}}>
      <div style={{fontSize:20,marginBottom:6}}>🎯</div>
      <div style={{fontWeight:600,fontSize:13}}>Scoring clip-script alignment…</div>
      <div style={{fontSize:11,color:C.muted,marginTop:4}}>Analyzing each section's visual match. ~10 seconds.</div>
    </div>
  }

  const sections=scoreData?.sections||[]
  const topIssue=scoreData?.top_issue
  const gc=gradeColor(grade||"")

  return<div style={{marginBottom:16}}>
    <div onClick={()=>setExpanded(!expanded)} style={{background:gc.bg,border:"1px solid "+gc.text+"33",borderRadius:expanded?"10px 10px 0 0":"10px",padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
      <div style={{fontSize:24,fontWeight:900,color:gc.text,minWidth:36,textAlign:"center"}}>{grade}</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:C.text}}>Clip-Script Match Score: {score}/100</div>
        {topIssue&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{topIssue}</div>}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={e=>{e.stopPropagation();runScore()}} disabled={scoring} style={{background:"none",border:"1px solid "+C.border,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>↻ Re-score</button>
        <span style={{fontSize:11,color:C.muted}}>{expanded?"▲":"▼"}</span>
      </div>
    </div>
    {expanded&&<div style={{background:C.bg,border:"1px solid "+gc.text+"33",borderTop:"none",borderRadius:"0 0 10px 10px",padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>Section Breakdown</div>
      <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
        {sections.map((s:any)=>{
          const secType=(ad.sections||[])[s.index-1]?.type||"Section"
          const rawAvg=s.avg
          const vm=Number(s.visual_match)||0
          const nf=Number(s.narrative_fit)||0
          const ra=Number(s.role_alignment)||0
          const avg=rawAvg!=null&&!isNaN(Number(rawAvg))?Number(rawAvg):Math.round((vm+nf+ra)/3*10)/10
          const secGc=gradeColor(avg>=8?"A":avg>=6.5?"B":avg>=5?"C":"D")
          return<div key={s.index} style={{background:C.card,border:"1px solid "+C.border,borderRadius:8,padding:"8px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.fix?4:0}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontWeight:700,fontSize:11,color:secGc.text,background:secGc.bg,padding:"1px 6px",borderRadius:4}}>{avg.toFixed(1)}</span>
                <span style={{fontWeight:600,fontSize:12}}>{secType}</span>
              </div>
              <div style={{display:"flex",gap:8,fontSize:10,color:C.muted}}>
                <span title="Visual Match">👁 {s.visual_match}</span>
                <span title="Narrative Fit">📝 {s.narrative_fit}</span>
                <span title="Role Alignment">🎭 {s.role_alignment}</span>
              </div>
            </div>
            {s.fix&&<div style={{fontSize:11,color:C.yellow,marginTop:4,display:"flex",gap:6,alignItems:"flex-start"}}>
              <span style={{flexShrink:0}}>💡</span>
              <span>{s.fix}</span>
            </div>}
          </div>
        })}
      </div>
      {error&&<div style={{background:"#ef444422",border:"1px solid #ef444433",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#ef4444",marginTop:8}}>{error}</div>}
    </div>}
  </div>
}
