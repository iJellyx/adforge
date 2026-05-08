'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Check, SkipForward, Scissors, Save, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react'
import { C, CLIP_ROLES } from './constants'
import { fmt, muxThumb, toNum, fx, secColor } from './utils'
import { Btn, Label } from './ui-primitives'
import { TagEditor } from './TagEditor'
import type { Item } from './types'

/**
 * Large pop-out clip review modal.
 * Features: big video with trim scrub bar, approve/reject/skip, next/prev nav,
 * keyboard shortcuts (A=approve, R=reject, S=skip, Space=play, J/L=prev/next, [/]=trim in/out).
 */
export function ClipReviewModal({
  clips,
  startIndex = 0,
  onClose,
  onRefresh,
}: {
  clips: Item[]
  startIndex?: number
  onClose: () => void
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [index, setIndex] = useState(startIndex)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{type:'success'|'error',msg:string}|null>(null)
  // Local set of clip IDs the user has acted on in this session. The `clips`
  // prop won't reflect a status change until the parent re-renders after
  // onRefresh(), so we track here to avoid bouncing back to a clip we just
  // approved during rapid triage.
  const [handledIds, setHandledIds] = useState<Set<string>>(() => new Set())

  const clip = clips[index]
  const total = clips.length

  // Trim state — timeline is zoomed to the clip's actual range.
  // tlStart..tlEnd = the visible span on the timeline (with small buffer at edges).
  // inPt..outPt = the user's selected trim within that span (starts at clip bounds).
  const clipStart = useMemo(() => toNum(clip?.start_seconds, 0), [clip?.id])
  const clipEnd = useMemo(() => toNum(clip?.end_seconds, clipStart + toNum(clip?.duration_seconds, 5)), [clip?.id])
  const clipDur = Math.max(0.1, clipEnd - clipStart)
  // Visible timeline: the clip's range plus 10% padding on each side (or 1s min, whichever larger)
  const pad = Math.max(1, clipDur * 0.1)
  const tlStart = useMemo(() => Math.max(0, clipStart - pad), [clip?.id])
  const tlEnd = useMemo(() => clipEnd + pad, [clip?.id])
  const tlDur = Math.max(0.1, tlEnd - tlStart)

  const [inPt, setInPt] = useState(clipStart)
  const [outPt, setOutPt] = useState(clipEnd)
  const [curTime, setCurTime] = useState(clipStart)
  const [playing, setPlaying] = useState(false)
  const [drag, setDrag] = useState<'in'|'out'|null>(null)
  const [trimDirty, setTrimDirty] = useState(false)
  const vidRef = useRef<HTMLVideoElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)

  // Reset trim when switching clips
  useEffect(() => {
    setInPt(clipStart)
    setOutPt(clipEnd)
    setCurTime(clipStart)
    setPlaying(false)
    setTrimDirty(false)
  }, [clip?.id, clipStart, clipEnd])

  // Load video source + seek to in-point
  useEffect(() => {
    const v = vidRef.current
    if (!v || !clip?.mux_playback_id) return
    v.src = `https://stream.mux.com/${clip.mux_playback_id}/capped-1080p.mp4`
    const onMeta = () => { if (v) v.currentTime = inPt }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [clip?.id])

  // Playback loop: auto-pause at out-point
  useEffect(() => {
    const v = vidRef.current; if (!v) return
    function onUpdate(){
      if (!v) return
      setCurTime(v.currentTime)
      if (v.currentTime >= outPt) { v.pause(); v.currentTime = inPt; setPlaying(false) }
    }
    v.addEventListener('timeupdate', onUpdate)
    return () => v.removeEventListener('timeupdate', onUpdate)
  }, [inPt, outPt])

  function seekTo(t:number) {
    const v = vidRef.current; if (!v) return
    const clamped = Math.max(tlStart, Math.min(tlEnd, t))
    v.currentTime = clamped
    setCurTime(clamped)
  }

  function togglePlay() {
    const v = vidRef.current; if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else { if (v.currentTime >= outPt || v.currentTime < inPt) v.currentTime = inPt; v.play().catch(()=>{}); setPlaying(true) }
  }

  function showToast(type:'success'|'error', msg:string) {
    setToast({type, msg})
    setTimeout(() => setToast(null), type === 'success' ? 1800 : 3500)
  }

  // Actions
  async function setStatus(status:'approved'|'rejected') {
    if (!clip) return
    setSaving(true)
    const { error } = await supabase.from('items').update({ clip_status: status }).eq('id', clip.id)
    setSaving(false)
    if (error) {
      console.error('[ClipReviewModal] setStatus error:', error)
      if (error.message?.toLowerCase().includes('column') && error.message?.toLowerCase().includes('clip_status')) {
        showToast('error', 'Missing DB column. Run: ALTER TABLE items ADD COLUMN clip_status text DEFAULT \'pending\'')
      } else {
        showToast('error', 'Update failed: ' + error.message)
      }
      return
    }
    // Mark locally-handled before scanning so we don't bounce back to the
    // just-acted clip via the still-stale `clips` prop.
    const newHandled = new Set(handledIds)
    if (clip?.id) newHandled.add(clip.id)
    setHandledIds(newHandled)
    onRefresh()
    // After approve/reject, jump to the next clip that's still pending so
    // the triage flow doesn't dump the user into already-handled clips. If
    // no pending clips remain, surface a "you're done" toast and close.
    advanceToNextPending(newHandled)
  }

  function advanceToNextPending(handled: Set<string>) {
    // Find next clip whose status is pending (or unset) AND we haven't
    // already acted on this session. Scan from index+1 wrapping back to 0.
    const isPending = (c?: Item) => !c?.clip_status || c.clip_status === 'pending'
    const n = clips.length
    if (n === 0) { onClose(); return }
    for (let off = 1; off <= n; off++) {
      const i = (index + off) % n
      const candidate = clips[i]
      if (!candidate) continue
      if (handled.has(candidate.id)) continue
      if (isPending(candidate)) { setIndex(i); return }
    }
    // No pending clips left — celebrate and close.
    showToast('success', '🎉 All clips reviewed!')
    setTimeout(() => onClose(), 1100)
  }

  async function saveTrim() {
    if (!clip) return
    const start = inPt
    const end = outPt
    const duration = Math.max(0, end - start)
    if (duration <= 0) { showToast('error', 'Invalid trim range'); return }
    setSaving(true)
    const { error } = await supabase.from('items').update({
      start_seconds: start,
      end_seconds: end,
      duration_seconds: duration,
      thumbnail_time: start + duration/2,
    }).eq('id', clip.id)
    setSaving(false)
    if (error) { console.error(error); showToast('error', 'Trim save failed: ' + error.message); return }
    setTrimDirty(false)
    showToast('success', `Trimmed to ${duration.toFixed(1)}s`)
    onRefresh()
  }

  async function setRole(role:string) {
    if (!clip) return
    const { error } = await supabase.from('items').update({ clip_role: role }).eq('id', clip.id)
    if (error) { showToast('error', 'Role update failed: '+error.message); return }
    onRefresh()
  }

  async function updateTags(newTags:string[]) {
    if (!clip) return
    const analysis = { ...(clip.analysis || {}), scene_tags: newTags }
    const { error } = await supabase.from('items').update({ analysis }).eq('id', clip.id)
    if (error) { showToast('error', 'Tag update failed: '+error.message); return }
    onRefresh()
  }

  function goNext() {
    if (index < total - 1) setIndex(i => i + 1)
    else onClose()
  }
  function goPrev() { if (index > 0) setIndex(i => i - 1) }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      // Don't trigger shortcuts when typing in an input
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setStatus('approved') }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setStatus('rejected') }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); goNext() }
      else if (e.key === 'j' || e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === 'l' || e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      else if (e.key === '[') { e.preventDefault(); const t=Math.min(curTime, outPt-0.5); setInPt(t); setTrimDirty(true); seekTo(t) }
      else if (e.key === ']') { e.preventDefault(); const t=Math.max(curTime, inPt+0.5); setOutPt(t); setTrimDirty(true); seekTo(t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, total, inPt, outPt, curTime, playing])

  // Timeline is zoomed to [tlStart, tlEnd]. Helpers convert between time and %.
  const timeToPct = (t:number) => ((t - tlStart) / tlDur) * 100
  const pctToTime = (p:number) => tlStart + p * tlDur

  function getPctFromX(e:MouseEvent|React.MouseEvent):number {
    const rect = tlRef.current?.getBoundingClientRect(); if (!rect) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }
  function onTlDown(e:React.MouseEvent) {
    const pct = getPctFromX(e); const t = pctToTime(pct)
    const inPctVal = timeToPct(inPt) / 100
    const outPctVal = timeToPct(outPt) / 100
    const inDist = Math.abs(pct - inPctVal)
    const outDist = Math.abs(pct - outPctVal)
    if (inDist < 0.04 && inDist <= outDist) setDrag('in')
    else if (outDist < 0.04) setDrag('out')
    else seekTo(t)
  }
  useEffect(() => {
    function onMove(e:MouseEvent) {
      if (!drag) return
      const pct = getPctFromX(e); const t = pctToTime(pct)
      if (drag === 'in') { const v=Math.min(t, outPt-0.3); const c=Math.max(tlStart, v); setInPt(c); setTrimDirty(true); seekTo(c) }
      else { const v=Math.max(t, inPt+0.3); const c=Math.min(tlEnd, v); setOutPt(c); setTrimDirty(true); seekTo(c) }
    }
    function onUp(){ setDrag(null) }
    if (drag) { window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp) }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, inPt, outPt, tlStart, tlEnd, tlDur])

  if (!clip) return null

  const inPct = timeToPct(inPt)
  const outPct = timeToPct(outPt)
  const curPct = timeToPct(curTime)
  const selDur = outPt - inPt
  const thumbCount = 12

  const qualScore = clip.analysis?.quality_score as string | undefined
  const qualColor = qualScore === 'High' ? '#22c55e' : qualScore === 'Medium' ? '#f59e0b' : qualScore === 'Low' ? '#ef4444' : null
  const status = clip.clip_status || 'pending'
  const roleColor = clip.clip_role ? secColor(clip.clip_role.toUpperCase()) : null

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:600,
      display:'flex', alignItems:'stretch', justifyContent:'center',
      fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:1400, display:'flex', flexDirection:'column', color:C.text
      }}>
        {/* Header bar */}
        <div style={{display:'flex',alignItems:'center',gap:16,padding:'14px 24px',background:'var(--af-card)',borderBottom:'1px solid var(--af-border)'}}>
          <button onClick={onClose} title="Close (Esc)" style={{background:'none',border:'none',color:'var(--af-text-secondary)',cursor:'pointer',padding:8,borderRadius:8,display:'flex'}}><X size={20}/></button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{clip.title}</div>
            <div style={{fontSize:12,color:'var(--af-text-secondary)',marginTop:2,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <span>{index + 1} of {total}</span>
              {clip.creator && <span>· {clip.creator}</span>}
              {clip.duration_seconds != null && <span>· {fmt(clip.duration_seconds)}</span>}
              {qualColor && <span style={{display:'inline-flex',alignItems:'center',gap:4}}>· <span style={{width:8,height:8,borderRadius:'50%',background:qualColor,display:'inline-block'}}/>{qualScore}</span>}
              {roleColor && clip.clip_role && <span style={{background:roleColor.bg,color:roleColor.color,padding:'1px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>{clip.clip_role.toUpperCase()}</span>}
              {status === 'approved' && <span style={{background:'var(--af-green-soft)',color:'var(--af-green)',padding:'1px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>APPROVED</span>}
              {status === 'rejected' && <span style={{background:'var(--af-red-soft)',color:'var(--af-red)',padding:'1px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>REJECTED</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={goPrev} disabled={index===0} title="Previous (←)" style={{background:'var(--af-surface)',border:'1px solid var(--af-border)',color:'var(--af-text)',cursor:index===0?'not-allowed':'pointer',padding:'8px 12px',borderRadius:8,opacity:index===0?0.4:1,display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600,fontFamily:'inherit'}}><ChevronLeft size={15}/></button>
            <button onClick={goNext} title="Next (→ or S to skip)" style={{background:'var(--af-surface)',border:'1px solid var(--af-border)',color:'var(--af-text)',cursor:'pointer',padding:'8px 12px',borderRadius:8,display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600,fontFamily:'inherit'}}><ChevronRight size={15}/></button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{padding:'10px 24px',fontSize:13,fontWeight:600,textAlign:'center',background:toast.type==='error'?'var(--af-red-soft)':'var(--af-green-soft)',color:toast.type==='error'?'var(--af-red)':'var(--af-green)'}}>{toast.msg}</div>
        )}

        {/* Main body: large video on left, metadata panel on right */}
        <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 360px',minHeight:0,background:'var(--af-bg)'}}>
          {/* Video + timeline */}
          <div style={{display:'flex',flexDirection:'column',padding:20,gap:14,minHeight:0}}>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#000',borderRadius:14,overflow:'hidden',position:'relative',minHeight:0}}>
              <video ref={vidRef} playsInline preload="auto" muted={false} style={{maxHeight:'100%',maxWidth:'100%',objectFit:'contain',cursor:'pointer'}} onClick={togglePlay} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}/>
              {!playing && (
                <div onClick={togglePlay} style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'rgba(0,0,0,0.2)'}}>
                  <div style={{width:72,height:72,borderRadius:'50%',background:'rgba(0,0,0,0.65)',border:'2px solid rgba(255,255,255,0.4)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
                    <Play size={28} fill="#fff"/>
                  </div>
                </div>
              )}
              <div style={{position:'absolute',bottom:12,right:14,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:6,backdropFilter:'blur(4px)'}}>{fx(curTime-inPt>=0?curTime-inPt:0)}s / {fx(selDur)}s</div>
            </div>

            {/* Trim timeline */}
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,fontSize:11}}>
                <div style={{display:'flex',gap:12}}>
                  <span style={{color:'var(--af-green)',fontWeight:700}}>Start: {fx(inPt,2)}s</span>
                  <span style={{color:'var(--af-accent)',fontWeight:700}}>Duration: {fx(selDur,2)}s</span>
                  <span style={{color:'var(--af-red)',fontWeight:700}}>End: {fx(outPt,2)}s</span>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button onClick={togglePlay} title="Play/pause (Space)" style={{background:'var(--af-surface)',border:'1px solid var(--af-border)',color:'var(--af-text)',cursor:'pointer',padding:'6px 10px',borderRadius:7,display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,fontFamily:'inherit'}}>{playing?<Pause size={12}/>:<Play size={12}/>}{playing?'Pause':'Play'}</button>
                  {trimDirty && (
                    <button onClick={saveTrim} disabled={saving} style={{background:'var(--af-accent)',color:'#fff',border:'none',cursor:'pointer',padding:'6px 14px',borderRadius:7,display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,fontFamily:'inherit'}}><Save size={12}/>Save Trim</button>
                  )}
                </div>
              </div>

              <div ref={tlRef} onMouseDown={onTlDown} style={{position:'relative',height:72,borderRadius:10,overflow:'hidden',cursor:'crosshair',userSelect:'none',background:'#000'}}>
                <div style={{position:'absolute',inset:0,display:'flex'}}>
                  {Array.from({length:thumbCount},(_,ti)=>{
                    const tt=tlStart+(ti/thumbCount)*tlDur
                    return <div key={ti} style={{flex:1,backgroundImage:`url(${muxThumb(clip.mux_playback_id || '', tt)})`,backgroundSize:'cover',backgroundPosition:'center'}}/>
                  })}
                </div>
                <div style={{position:'absolute',top:0,left:0,width:inPct+'%',height:'100%',background:'rgba(0,0,0,0.72)'}}/>
                <div style={{position:'absolute',top:0,right:0,width:(100-outPct)+'%',height:'100%',background:'rgba(0,0,0,0.72)'}}/>
                <div style={{position:'absolute',top:0,left:inPct+'%',width:(outPct-inPct)+'%',height:'100%',border:'2px solid var(--af-accent)',boxSizing:'border-box' as const,pointerEvents:'none'}}/>
                <div style={{position:'absolute',top:-3,left:`calc(${inPct}% - 8px)`,width:16,height:78,background:'var(--af-green)',borderRadius:4,cursor:'ew-resize',zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>
                  <div style={{width:2,height:28,background:'rgba(255,255,255,0.9)',borderRadius:2}}/>
                </div>
                <div style={{position:'absolute',top:-3,left:`calc(${outPct}% - 8px)`,width:16,height:78,background:'var(--af-red)',borderRadius:4,cursor:'ew-resize',zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>
                  <div style={{width:2,height:28,background:'rgba(255,255,255,0.9)',borderRadius:2}}/>
                </div>
                <div style={{position:'absolute',top:0,left:`calc(${curPct}% - 1px)`,width:2,height:'100%',background:'#fff',pointerEvents:'none',zIndex:20,boxShadow:'0 0 6px rgba(255,255,255,0.5)'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--af-text-secondary)',marginTop:6}}>
                {Array.from({length:6},(_,ti)=><span key={ti}>{fx(tlStart+(ti/5)*tlDur,1)}s</span>)}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={()=>setStatus('rejected')} disabled={saving} title="Reject (R)"
                style={{flex:1,background:status==='rejected'?'var(--af-red)':'var(--af-red-soft)',color:status==='rejected'?'#fff':'var(--af-red)',border:'1px solid '+(status==='rejected'?'var(--af-red)':'rgba(248,113,113,0.3)'),borderRadius:10,padding:'12px',cursor:'pointer',fontSize:14,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:7,fontFamily:'inherit',transition:'all 0.15s'}}><X size={17}/>Reject <kbd style={{marginLeft:6,fontSize:10,opacity:0.7,background:'rgba(0,0,0,0.2)',padding:'2px 6px',borderRadius:4,fontFamily:'inherit'}}>R</kbd></button>
              <button onClick={goNext} disabled={saving} title="Skip (S)"
                style={{flex:1,background:'var(--af-surface)',color:'var(--af-text)',border:'1px solid var(--af-border)',borderRadius:10,padding:'12px',cursor:'pointer',fontSize:14,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:7,fontFamily:'inherit',transition:'all 0.15s'}}><SkipForward size={17}/>Skip <kbd style={{marginLeft:6,fontSize:10,opacity:0.7,background:'rgba(0,0,0,0.08)',padding:'2px 6px',borderRadius:4,fontFamily:'inherit'}}>S</kbd></button>
              <button onClick={()=>setStatus('approved')} disabled={saving} title="Approve (A)"
                style={{flex:1.5,background:status==='approved'?'var(--af-green)':'var(--af-green-soft)',color:status==='approved'?'#000':'var(--af-green)',border:'1px solid '+(status==='approved'?'var(--af-green)':'rgba(74,222,128,0.3)'),borderRadius:10,padding:'12px',cursor:'pointer',fontSize:14,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',gap:7,fontFamily:'inherit',transition:'all 0.15s'}}><Check size={18}/>Approve <kbd style={{marginLeft:6,fontSize:10,opacity:0.6,background:'rgba(0,0,0,0.15)',padding:'2px 6px',borderRadius:4,fontFamily:'inherit'}}>A</kbd></button>
            </div>
          </div>

          {/* Right panel: metadata */}
          <div style={{borderLeft:'1px solid var(--af-border)',overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:18,background:'var(--af-surface)'}}>
            <div>
              <Label>Clip Role</Label>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {CLIP_ROLES.map(role => {
                  const rc = secColor(role.toUpperCase())
                  const active = clip.clip_role === role
                  return (
                    <button key={role} onClick={()=>setRole(role)} style={{
                      background: active ? rc.bg : 'transparent',
                      color: active ? rc.color : 'var(--af-text-secondary)',
                      border: '1px solid ' + (active ? (rc.bd || rc.color + '44') : 'var(--af-border)'),
                      borderRadius: 99,
                      padding: '3px 9px',
                      fontSize: 10,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.1s',
                    }}>{role.toUpperCase()}</button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label>Scene Tags</Label>
              <TagEditor tags={clip.analysis?.scene_tags || []} onUpdate={updateTags}/>
            </div>

            {clip.analysis?.use_case && (
              <div>
                <Label>Use Case</Label>
                <div style={{fontSize:12,color:'var(--af-text)',lineHeight:1.5}}>{clip.analysis.use_case}</div>
              </div>
            )}

            {clip.transcript && (
              <div>
                <Label>Transcript</Label>
                <div style={{background:'var(--af-bg)',border:'1px solid var(--af-border)',borderRadius:10,padding:12,maxHeight:180,overflowY:'auto',fontSize:12,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{clip.transcript}</div>
              </div>
            )}

            {/* Keyboard shortcuts help */}
            <div style={{marginTop:'auto',paddingTop:14,borderTop:'1px solid var(--af-border)',fontSize:10,color:'var(--af-text-secondary)'}}>
              <div style={{fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em',fontSize:10}}>Shortcuts</div>
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'5px 10px',fontSize:11}}>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>Space</kbd><span>Play / pause</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>A</kbd><span>Approve</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>R</kbd><span>Reject</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>S</kbd><span>Skip</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>← →</kbd><span>Prev / next</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>[ ]</kbd><span>Trim in / out at playhead</span>
                <kbd style={{background:'var(--af-card)',border:'1px solid var(--af-border)',borderRadius:4,padding:'1px 6px',textAlign:'center',fontFamily:'inherit'}}>Esc</kbd><span>Close</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
