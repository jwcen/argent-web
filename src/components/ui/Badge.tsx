import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'up' | 'down' | 'outline'

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface-2 text-ink-soft',
    accent: 'bg-accent-soft text-accent',
    up: 'bg-up/12 text-up',
    down: 'bg-down/12 text-down',
    outline: 'border border-line text-ink-soft',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
