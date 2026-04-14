'use client'
import { useState } from 'react'
import { Target, RefreshCw, ChevronUp, ChevronDown, Eye, FileText, Users, Lightbulb, AlertTriangle } from 'lucide-react'
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
    return<div className="mb-4">
      <button onClick={runScore} className="bg-accent-soft border border-accent/30 text-accent rounded-md px-3.5 py-2 cursor-pointer text-xs w-full text-left font-semibold flex items-center gap-2 hover:bg-accent hover:text-white transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50">
        <Target className="w-4 h-4" /> Score Clip-Script Alignment
      </button>
      {error&&<div className="bg-danger-soft border border-danger/30 rounded-md px-2.5 py-1.5 text-xs text-danger mt-1.5">{error}</div>}
    </div>
  }

  if(scoring){
    return<div className="mb-4 bg-bg border border-border rounded-md p-4 text-center">
      <Target className="w-5 h-5 mx-auto mb-1.5 text-accent animate-pulse" />
      <div className="font-semibold text-sm">Scoring clip-script alignment...</div>
      <div className="text-xs text-text-muted mt-1">Analyzing each section's visual match. ~10 seconds.</div>
    </div>
  }

  const sections=scoreData?.sections||[]
  const topIssue=scoreData?.top_issue
  const gc=gradeColor(grade||"")

  return<div className="mb-4">
    <div onClick={()=>setExpanded(!expanded)} className={`px-3.5 py-2.5 cursor-pointer flex items-center gap-3 border transition-all duration-150 ${expanded?"rounded-t-md":"rounded-md"}`} style={{background:gc.bg,borderColor:gc.text+"33"}}>
      <div className="text-2xl font-black min-w-[36px] text-center" style={{color:gc.text}}>{grade}</div>
      <div className="flex-1">
        <div className="font-bold text-sm text-text">Clip-Script Match Score: {score}/100</div>
        {topIssue&&<div className="text-xs text-text-muted mt-0.5">{topIssue}</div>}
      </div>
      <div className="flex gap-2 items-center">
        <button onClick={e=>{e.stopPropagation();runScore()}} disabled={scoring} className="bg-transparent border border-border text-text-muted rounded-md px-2 py-1 cursor-pointer text-[10px] hover:border-border-strong transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/50 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Re-score
        </button>
        {expanded?<ChevronUp className="w-4 h-4 text-text-muted" />:<ChevronDown className="w-4 h-4 text-text-muted" />}
      </div>
    </div>
    {expanded&&<div className="bg-bg border border-t-0 rounded-b-md p-3.5" style={{borderColor:gc.text+"33"}}>
      <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Section Breakdown</div>
      <div className="flex flex-col gap-1.5">
        {sections.map((s:any)=>{
          const secType=(ad.sections||[])[s.index-1]?.type||"Section"
          const avg=s.avg||Math.round((s.visual_match+s.narrative_fit+s.role_alignment)/3*10)/10
          const secGc=gradeColor(avg>=8?"A":avg>=6.5?"B":avg>=5?"C":"D")
          return<div key={s.index} className="bg-card border border-border rounded-md px-3 py-2">
            <div className={`flex justify-between items-center ${s.fix?"mb-1":""}`}>
              <div className="flex gap-2 items-center">
                <span className="font-bold text-xs px-1.5 py-0.5 rounded" style={{color:secGc.text,background:secGc.bg}}>{avg.toFixed(1)}</span>
                <span className="font-semibold text-xs">{secType}</span>
              </div>
              <div className="flex gap-2 text-[10px] text-text-muted">
                <span title="Visual Match" className="flex items-center gap-0.5"><Eye className="w-3 h-3" /> {s.visual_match}</span>
                <span title="Narrative Fit" className="flex items-center gap-0.5"><FileText className="w-3 h-3" /> {s.narrative_fit}</span>
                <span title="Role Alignment" className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {s.role_alignment}</span>
              </div>
            </div>
            {s.fix&&<div className="text-xs text-warning mt-1 flex gap-1.5 items-start">
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{s.fix}</span>
            </div>}
          </div>
        })}
      </div>
      {error&&<div className="bg-danger-soft border border-danger/30 rounded-md px-2.5 py-1.5 text-xs text-danger mt-2">{error}</div>}
    </div>}
  </div>
}
