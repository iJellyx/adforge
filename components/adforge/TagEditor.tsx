'use client'
import { useState } from 'react'
import { Input, Btn } from './ui-primitives'
import { X, Plus } from 'lucide-react'

export function TagEditor({
  tags,
  onUpdate,
}: {
  tags: string[]
  onUpdate: (t: string[]) => void
}) {
  const [newTag, setNewTag] = useState('')

  function addTag() {
    const t = newTag.trim()
    if (!t || tags.includes(t)) {
      setNewTag('')
      return
    }
    onUpdate([...tags, t])
    setNewTag('')
  }

  return (
    <div>
      {/* Tag list */}
      <div className="flex flex-wrap gap-1.5 mb-2.5 min-h-[26px]">
        {tags.length === 0 && (
          <span className="text-xs text-text-muted italic">No tags yet</span>
        )}
        {tags.map((t, i) => (
          <span
            key={i}
            className="bg-success-soft text-success px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-success/20"
          >
            {t}
            <X
              className="w-3 h-3 opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              onClick={() => onUpdate(tags.filter((x) => x !== t))}
            />
          </span>
        ))}
      </div>

      {/* Input + Add */}
      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e: any) => setNewTag(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="Type tag + Enter"
        />
        <Btn
          onClick={addTag}
          variant="primary"
          size="md"
          className="shrink-0 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Btn>
      </div>
    </div>
  )
}
