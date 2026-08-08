import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 ${
        compact ? 'py-8' : 'py-14'
      }`}
    >
      {icon && (
        <div className="mb-4 grid place-items-center w-14 h-14 rounded-2xl bg-surface-2 text-ink-faint">
          {icon}
        </div>
      )}
      <p className="text-title-3 font-semibold tracking-tight">{title}</p>
      {description && (
        <p className="mt-2 text-caption text-ink-soft max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
