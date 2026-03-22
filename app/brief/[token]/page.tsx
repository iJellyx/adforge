import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function BriefPage({ params }: { params: { token: string } }) {
  const supabase = await createClient()
  const { data: brief } = await supabase
    .from('creator_briefs')
    .select('*')
    .eq('share_token', params.token)
    .single()

  if (!brief) notFound()

  const hooks: string[] = brief.hooks || []
  const scripts: { type: string; label: string; words: string }[] = brief.scripts || []
  const broll: string[] = brief.broll_shots || []

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{brief.brand_name ? `${brief.brand_name} — Creator Brief` : 'Creator Brief'}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F7F6FF; color: #0F1133; line-height: 1.6; }
          .wrap { max-width: 680px; margin: 0 auto; padding: 24px 20px 80px; }
          .header { background: #0F1133; color: #fff; border-radius: 16px; padding: 28px 24px; margin-bottom: 24px; }
          .logo { font-weight: 800; font-size: 22px; letter-spacing: -0.03em; color: #7C6FFF; margin-bottom: 8px; }
          .brand { font-weight: 700; font-size: 20px; margin-bottom: 4px; }
          .product { font-size: 14px; color: rgba(255,255,255,0.5); }
          .card { background: #fff; border: 1.5px solid rgba(91,73,255,0.1); border-radius: 16px; padding: 22px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(91,73,255,0.05); }
          .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6B6894; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
          .section-label span { background: #EDE8FF; color: #5B49FF; border-radius: 99px; padding: 2px 10px; font-size: 10px; }
          .hook-item { background: #F4F2FF; border: 1.5px solid #C4B5FD; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
          .hook-num { font-size: 10px; font-weight: 700; color: #5B49FF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
          .hook-text { font-size: 15px; font-weight: 600; color: #0F1133; line-height: 1.5; }
          .script-item { border: 1.5px solid #E5E7EB; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; background: #FAFAFA; }
          .script-type { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 99px; padding: 2px 10px; margin-bottom: 8px; }
          .type-vo { background: #DBEAFE; color: #1D4ED8; }
          .type-th { background: #D1FAE5; color: #065F46; }
          .type-hook { background: #FEF3C7; color: #92400E; }
          .script-label { font-size: 11px; font-weight: 700; color: #6B6894; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
          .script-words { font-size: 15px; color: #0F1133; line-height: 1.7; background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; margin-top: 8px; }
          .broll-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #F4F2FF; }
          .broll-item:last-child { border-bottom: none; }
          .broll-num { width: 24px; height: 24px; border-radius: 99px; background: #EDE8FF; color: #5B49FF; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
          .broll-text { font-size: 14px; color: #0F1133; line-height: 1.5; }
          .editing-block { background: #F9FAFB; border-radius: 10px; padding: 12px 14px; font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap; }
          .ref-link { color: #5B49FF; font-weight: 600; word-break: break-all; text-decoration: underline; }
          .notes-block { background: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 10px; padding: 14px 16px; font-size: 14px; color: #92400E; line-height: 1.7; white-space: pre-wrap; }
          .footer { text-align: center; font-size: 12px; color: #9CA3AF; margin-top: 40px; }
          .footer strong { color: #5B49FF; }
          @media (max-width: 480px) { .wrap { padding: 16px 16px 60px; } .header { padding: 20px 18px; } .card { padding: 18px; } }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          {/* Header */}
          <div className="header">
            <div className="logo">AdForge</div>
            <div className="brand">{brief.brand_name || 'Creator Brief'}</div>
            {brief.product_name && <div className="product">for {brief.product_name}</div>}
          </div>

          {/* Hooks */}
          {hooks.length > 0 && (
            <div className="card">
              <div className="section-label">🎣 Hooks to record <span>{hooks.length} variations</span></div>
              <p style={{fontSize:13,color:'#6B6894',marginBottom:14,lineHeight:1.5}}>Record each hook as a separate take. Keep them punchy — under 5 seconds each. Start recording before you speak.</p>
              {hooks.map((hook, i) => (
                <div key={i} className="hook-item">
                  <div className="hook-num">Hook {i + 1}</div>
                  <div className="hook-text">{hook}</div>
                </div>
              ))}
            </div>
          )}

          {/* Scripts */}
          {scripts.length > 0 && (
            <div className="card">
              <div className="section-label">📝 Scripts to record <span>{scripts.length} sections</span></div>
              <p style={{fontSize:13,color:'#6B6894',marginBottom:14,lineHeight:1.5}}>Record each section as its own clip. You can do multiple takes — we'll pick the best.</p>
              {scripts.map((s, i) => (
                <div key={i} className="script-item">
                  <span className={`script-type ${s.type === 'voiceover' ? 'type-vo' : s.type === 'hook' ? 'type-hook' : 'type-th'}`}>
                    {s.type === 'voiceover' ? '🎙️ Voiceover' : s.type === 'hook' ? '🎣 Hook' : '🎥 Talking Head'}
                  </span>
                  {s.label && <div className="script-label">{s.label}</div>}
                  <div className="script-words">{s.words}</div>
                </div>
              ))}
            </div>
          )}

          {/* B-roll */}
          {broll.length > 0 && (
            <div className="card">
              <div className="section-label">🎬 B-roll shots to capture <span>{broll.length} shots</span></div>
              <p style={{fontSize:13,color:'#6B6894',marginBottom:14,lineHeight:1.5}}>Shoot each shot for at least 5–10 seconds so we have room to cut. Natural lighting preferred.</p>
              {broll.map((shot, i) => (
                <div key={i} className="broll-item">
                  <div className="broll-num">{i + 1}</div>
                  <div className="broll-text">{shot}</div>
                </div>
              ))}
            </div>
          )}

          {/* Editing style */}
          {(brief.editing_style || brief.editing_references || brief.editing_notes) && (
            <div className="card">
              <div className="section-label">✂️ Editing style & references</div>
              {brief.editing_style && (
                <>
                  <div style={{fontSize:12,fontWeight:700,color:'#6B6894',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>Style</div>
                  <div className="editing-block" style={{marginBottom:14}}>{brief.editing_style}</div>
                </>
              )}
              {brief.editing_references && (
                <>
                  <div style={{fontSize:12,fontWeight:700,color:'#6B6894',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>References</div>
                  <div className="editing-block" style={{marginBottom:14}}>
                    {brief.editing_references.split('\n').map((line: string, i: number) => (
                      <div key={i}>
                        {line.startsWith('http') ? <a href={line} className="ref-link" target="_blank" rel="noopener noreferrer">{line}</a> : line}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {brief.editing_notes && (
                <>
                  <div style={{fontSize:12,fontWeight:700,color:'#6B6894',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>Notes</div>
                  <div className="editing-block">{brief.editing_notes}</div>
                </>
              )}
            </div>
          )}

          {/* Additional notes */}
          {brief.additional_notes && (
            <div className="card">
              <div className="section-label">💬 Additional notes</div>
              <div className="notes-block">{brief.additional_notes}</div>
            </div>
          )}

          <div className="footer">
            <p>Created with <strong>AdForge</strong> · {new Date(brief.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </body>
    </html>
  )
}
