import { type ReactNode } from 'react'

/**
 * iOS 风格的开关。受控组件：checked + onChange(!checked)。
 * 触摸目标本身 44×28（含外环留白），满足最小可点击尺寸。
 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-4 focus-visible:ring-accent/20 ${
        checked ? 'bg-accent' : 'bg-surface-3'
      }`}
    >
      <span
        className={`absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/**
 * 设置项的一行：左文案（标题 + 可选说明），右控件。
 * 用 grid 让左右两列在窄屏也不挤压。
 */
export function SettingRow({
  title,
  desc,
  children,
}: {
  title: string
  desc?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-caption font-medium text-ink">{title}</div>
        {desc && <div className="mt-0.5 text-micro text-ink-faint leading-relaxed">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
