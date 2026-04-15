import { C } from './constants'

export function muxThumb(playbackId: string, time = 0) { return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=400` }
export function gradeColor(grade:string):{bg:string,text:string}{
  const g=(grade||"").charAt(0).toUpperCase()
  if(g==="A")return{bg:"#22c55e22",text:"#22c55e"}
  if(g==="B")return{bg:"#6c63ff22",text:"#8B7FFF"}
  if(g==="C")return{bg:"#f59e0b22",text:"#f59e0b"}
  return{bg:"#ef444422",text:"#ef4444"}
}
export function muxMp4(playbackId: string) { return `https://stream.mux.com/${playbackId}/high.mp4` }
export function fmt(s?: number | string | null) {
  const n = typeof s === 'number' ? s : (s != null && s !== '' ? Number(s) : null)
  if (n == null || isNaN(n)) return "0:00"
  return `${Math.floor(n/60)}:${Math.floor(n%60).toString().padStart(2,"0")}`
}

// Safely convert any value to a number for math operations
export function toNum(v: any, fallback = 0): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (v == null || v === '') return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

// Safely format a number with fixed decimals; works on strings or undefined
export function fx(v: any, decimals = 1): string {
  return toNum(v).toFixed(decimals)
}
export function typeColor(t?: string) {
  const m: Record<string,any> = { "UGC":{bg:"#EDE8FF",color:"#5B49FF"},"Founder Clip":{bg:"#EFF6FF",color:"#2563EB"},"Tutorial":{bg:"#F0FDF4",color:"#16A34A"},"Behind the Scenes":{bg:"#FFFBEB",color:"#D97706"},"High Production":{bg:"#FDF2F8",color:"#9D174D"},"Testimonial":{bg:"#EFF6FF",color:"#1D4ED8"},"Product Demo":{bg:"#ECFDF5",color:"#059669"},"Clip":{bg:"#FFF7ED",color:"#C2410C"},"Talking Head":{bg:"#F5F3FF",color:"#7C3AED"} }
  return m[t||""]||{bg:"#EDE8FF",color:"#5B49FF"}
}
export function secColor(t?: string) {
  const m: Record<string,any> = { "HOOK":{bg:"#FEF2F2",color:"#DC2626",bd:"#FECACA"},"PROBLEM":{bg:"#FFFBEB",color:"#D97706",bd:"#FCD34D"},"AGITATE":{bg:"#FFF7ED",color:"#C2410C",bd:"#FED7AA"},"SOLUTION":{bg:"#F0FDF4",color:"#16A34A",bd:"#86EFAC"},"SOCIAL PROOF":{bg:"#EFF6FF",color:"#2563EB",bd:"#BFDBFE"},"CTA":{bg:"#EDE8FF",color:"#5B49FF",bd:"#C4B5FD"},"BODY":{bg:"#F9FAFB",color:"#6B7280",bd:"#E5E7EB"} }
  return m[t||""]||{bg:"#EDE8FF",color:C.muted,bd:C.border}
}
export function getDurationRange(secs?: number){if(!secs)return"";if(secs<5)return"Under 5s";if(secs<15)return"5–15s";if(secs<30)return"15–30s";if(secs<60)return"30–60s";return"Over 60s"}
export async function callClaude(messages: any[], maxTokens = 1500) {
  const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,maxTokens})})
  const d=await res.json();return d.text||""
}
