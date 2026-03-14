import { NextRequest, NextResponse } from 'next/server'
import Mux from '@mux/mux-node'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  })

  const supabase = createServiceClient()
  const { filename, contentType, metadata } = await req.json()

  const { data: item, error } = await supabase
    .from('items')
    .insert({
      type: 'original',
      title: metadata.title || filename.replace(/\.[^/.]+$/, ''),
      creator: metadata.creator || '',
      creator_age: metadata.creatorAge || '',
      creator_gender: metadata.creatorGender || '',
      description: metadata.description || '',
      transcript: metadata.transcript || '',
      mux_status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

 const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: ['public'],
      passthrough: item.id,
    },
    cors_origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  })

  return NextResponse.json({ itemId: item.id, uploadUrl: upload.url })
}