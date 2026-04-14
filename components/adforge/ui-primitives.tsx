'use client'
import { useState, useEffect, useRef } from 'react'
import { typeColor } from './utils'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

/* ──────────────────────────── Btn ──────────────────────────── */

const variantClasses: Record<string, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:scale-[0.98]',
  secondary:
    'bg-card text-text border border-border hover:border-border-strong',
  ghost:
    'bg-transparent text-text-secondary hover:bg-accent-soft',
  danger:
    'bg-danger-soft text-danger border border-danger/20',
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Btn({
  onClick,
  disabled,
  variant = 'primary',
  size = 'md',
  className,
  style,
  children,
}: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={[
        'rounded-full font-semibold transition-all duration-150 focus-ring cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant] || variantClasses.primary,
        sizeClasses[size] || sizeClasses.md,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}

/* ──────────────────────────── Card ──────────────────────────── */

export function Card({ children, className, style, pad }: any) {
  const mergedStyle = pad ? { padding: pad, ...style } : style
  return (
    <div
      style={mergedStyle}
      className={[
        'bg-card border border-border rounded-lg shadow-md',
        pad ? undefined : 'p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/* ──────────────────────────── STitle ──────────────────────────── */

const titleSizeMap: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
}

export function STitle({ children, size, mb, className }: any) {
  const sizeClass = typeof size === 'number'
    ? undefined
    : titleSizeMap[size || 'sm'] || 'text-lg'

  const mergedStyle: React.CSSProperties = {
    ...(typeof size === 'number' ? { fontSize: size } : {}),
    ...(mb != null ? { marginBottom: mb } : {}),
  }

  return (
    <div
      style={Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined}
      className={[
        'font-extrabold tracking-tight text-text',
        sizeClass,
        mb != null ? undefined : 'mb-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/* ──────────────────────────── Label ──────────────────────────── */

export function Label({ children }: any) {
  return (
    <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
      {children}
    </div>
  )
}

/* ──────────────────────────── Chip ──────────────────────────── */

export function Chip({ label, color, className }: any) {
  const cl = color || typeColor(label)
  // If a color object was passed, use inline style as fallback
  const hasCustomColor = !!color
  return (
    <span
      style={hasCustomColor ? { background: cl.bg, color: cl.color } : undefined}
      className={[
        'px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap',
        !hasCustomColor && 'bg-accent-soft text-accent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  )
}

/* ──────────────────────────── Input ──────────────────────────── */

export function Input({
  value,
  onChange,
  placeholder,
  type,
  textarea,
  rows,
  onKeyDown,
  style,
  className,
}: any) {
  const base = [
    'bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-text',
    'outline-none w-full focus:border-accent focus:ring-1 focus:ring-accent/30',
    'placeholder:text-text-muted transition-colors font-[inherit]',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (textarea) {
    return (
      <textarea
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows || 3}
        style={style}
        className={`${base} resize-y`}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type || 'text'}
      onKeyDown={onKeyDown}
      style={style}
      className={base}
    />
  )
}

/* ──────────────────────────── MultiSelect ──────────────────────────── */

export function MultiSelect({ label, options, selected, onChange }: any) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sel: string[] = selected || []

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={[
          'border rounded-md px-2.5 py-1.5 text-xs cursor-pointer',
          'flex items-center gap-1.5 whitespace-nowrap transition-colors',
          sel.length > 0
            ? 'bg-accent-soft border-accent text-accent font-semibold'
            : 'bg-surface border-border text-text-muted font-normal',
        ].join(' ')}
      >
        {label}
        {sel.length > 0 && (
          <span className="bg-accent text-white rounded-full text-[9px] px-1.5 py-px font-bold">
            {sel.length}
          </span>
        )}
        {open ? (
          <ChevronUp className="w-3 h-3 opacity-50" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-50" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 bg-surface border border-border rounded-md p-1.5 z-[200] min-w-[170px] max-h-[220px] overflow-y-auto shadow-lg">
          {options.map((opt: string) => {
            const active = sel.includes(opt)
            return (
              <div
                key={opt}
                onClick={() =>
                  onChange(
                    active
                      ? sel.filter((x: string) => x !== opt)
                      : [...sel, opt]
                  )
                }
                className={[
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-[13px]',
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'bg-transparent text-text hover:bg-accent-soft',
                ].join(' ')}
              >
                {/* Checkbox */}
                <div
                  className={[
                    'w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0',
                    active
                      ? 'bg-accent border-accent'
                      : 'bg-transparent border-border-strong',
                  ].join(' ')}
                >
                  {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>
                {opt}
              </div>
            )
          })}
          {sel.length > 0 && (
            <div
              onClick={() => onChange([])}
              className="border-t border-border mt-1 pt-1.5 px-2.5 text-center text-[11px] text-text-muted cursor-pointer hover:text-text-secondary"
            >
              Clear
            </div>
          )}
        </div>
      )}
    </div>
  )
}
