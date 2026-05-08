import type { BrandProfile, Product, CaptionSettings } from './types'

export const C = { bg:"var(--af-bg)",surface:"var(--af-surface)",card:"var(--af-card)",border:"var(--af-border)",accent:"var(--af-accent)",accentSoft:"var(--af-accent-soft)",text:"var(--af-text)",muted:"var(--af-muted)",green:"var(--af-green)",yellow:"var(--af-yellow)",red:"var(--af-red)" }
export const GENDERS = ["Male","Female","Non-binary","Other"]
export const AGE_RANGES = ["Under 18","18-24","25-34","35-44","45+"]
// Section types — the script generator now writes 4P-structured ads
// (Problem → Product → Promise → Proof). Older types (AGITATE, SOLUTION,
// SOCIAL PROOF, BODY) are kept for backward compatibility with existing
// drafts in the database.
export const SEC_TYPES = ["HOOK","PROBLEM","AGITATE","PRODUCT","SOLUTION","PROMISE","PROOF","SOCIAL PROOF","BODY","CTA"]
export const STAGES = [
  {value:"unaware",label:"Unaware",desc:"Don't know they have a problem"},
  {value:"problem_aware",label:"Problem Aware",desc:"Know the problem, not the solution"},
  {value:"solution_aware",label:"Solution Aware",desc:"Know solutions exist, not your product"},
  {value:"product_aware",label:"Product Aware",desc:"Know your product, haven't bought"},
  {value:"most_aware",label:"Most Aware",desc:"Need a reason to buy now"},
]
export const STAGE_COLORS: Record<string,string> = { unaware:"#7C3AED",problem_aware:"#DC2626",solution_aware:"#D97706",product_aware:"#2563EB",most_aware:"#16A34A" }
export const AD_LENGTHS = ["15 seconds","30 seconds","45 seconds","60 seconds","90 seconds"]
export const FORM_CTYPES = ["UGC","Talking Head","Founder Story","Mashup","Testimonial","Problem-Solution","Tutorial","Before & After"]
export const SORTS = ["Newest first","Oldest first","A → Z","Z → A"]
export const DEFAULT_BRAND: BrandProfile = { name:"",website:"",description:"",voice:"",target_customer:"",reviews:"",additional_info:"",customer_avatars:[] }
export const DEFAULT_PRODUCT: Product = { name:"",description:"",benefits:"",target_customer:"",claims:"",ingredients:"",differentiators:"",reviews:"",notes:"",price:"",url:"" }
export const CONTENT_CATEGORIES = ["UGC","Testimonial","Product Demo","Tutorial","Founder Clip","Behind the Scenes","High Production","Talking Head","Other"]
export const DURATION_RANGES = ["Under 5s","5–15s","15–30s","30–60s","Over 60s"]
export const AD_POTENTIALS = ["High","Medium","Low"]
export const MUSIC_MOODS = ["Uplifting","Energetic","Relaxing","Inspiring","Emotional","Fun","Dramatic","Corporate","Acoustic"]

export const FALLBACK_TRACKS = [
  { id:"f1", name:"Upbeat Corporate", tags:"upbeat, corporate", duration:120, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", artist:"SoundHelix" },
  { id:"f2", name:"Inspiring Piano", tags:"piano, inspiring", duration:180, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", artist:"SoundHelix" },
  { id:"f3", name:"Energetic Beat", tags:"energetic, fast", duration:90, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", artist:"SoundHelix" },
  { id:"f4", name:"Calm Acoustic", tags:"calm, relaxing", duration:150, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", artist:"SoundHelix" },
  { id:"f5", name:"Fun & Playful", tags:"fun, light", duration:110, url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", preview_url:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", artist:"SoundHelix" },
]

export const DEFAULT_CAPTIONS: CaptionSettings = {enabled:false,style:"word",accentColor:"#5B49FF",fontSize:22}

export const CLIP_ROLES = ["hook","problem","agitate","solution","social_proof","cta","b_roll","product_demo","reaction","before_after","testimonial","body"]
export const CLIP_STATUSES = ["pending","approved","rejected"] as const
