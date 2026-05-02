// ─── Types ──────────────────────────────────────────────────────────────
//
// AdForge is now backed by AdSplit's Supabase. The tables there have new
// names (assets, brand_cards, brand_products), but Supabase VIEWS expose
// them under AdForge's original names (items, brand_profile, products) so
// existing code keeps working. See migration `absorb_adforge_views`.
// A future cleanup will rename through to the real schema.

export type Item = {
  id: string
  type: string                  // 'original' | 'clip' | 'image' (mapped from assets.kind via the items view)
  parent_id?: string
  title: string
  creator?: string
  creator_age?: string
  creator_gender?: string
  description?: string
  transcript?: string
  mux_playback_id?: string
  mux_status?: string
  duration_seconds?: number
  start_seconds?: number
  end_seconds?: number
  thumbnail_time?: number
  analysis?: any
  clip_ids?: string[]
  clip_role?: string
  clip_status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
  folder_id?: string | null
  // Image fields (new — used by images in Stash)
  src_url?: string
  cutout_url?: string
  width?: number
  height?: number
}
export type Script = { id: string; product_name?: string; metadata?: any; sections?: any[]; created_at?: string }
export type BrandProfile = { id?: string; name: string; website: string; description: string; voice: string; target_customer: string; reviews: string; additional_info: string; customer_avatars: CustomerAvatar[]; brand_intelligence?: any; winning_patterns?: any[] }
export type CustomerAvatar = { id: string; name: string; age: string; gender: string; description: string; pains: string; desires: string; objections: string }
export type Product = { id?: string; name: string; description: string; benefits: string; target_customer: string; claims: string; ingredients: string; differentiators: string; reviews: string; notes: string; price: string; url: string }
export type ForgedAd = { id: string; title: string; status: 'draft'|'complete'; mode?: 'script'|'broll'; script_id?: string; sections?: any[]; voiceover_url?: string; voiceover_voice?: string; music_url?: string; music_name?: string; render_id?: string; render_url?: string; render_status?: string; notes?: string; star_rating?: number; metadata?: any; created_at?: string; updated_at?: string; folder_id?: string | null }

export type CaptionStyle = 'word' | 'line' | 'karaoke'
export type CaptionSettings = { enabled: boolean; style: CaptionStyle; accentColor: string; fontSize: number }
export type WordTimestamp = { word: string; start: number; end: number }
