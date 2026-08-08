import { motion } from 'framer-motion'

export interface Segment {
  label: string
  value: number
  tone?: 'up' | 'down' | 'accent' | 'neutral'
}

const toneVar: Record<NonNullable<Segment['tone']>, string> = {
  up: 'var(--c-up)',
  down: 'var(--c-down)',
  accent: 'var(--c-accent)',
  neutral: 'var(--c-ink-faint)',
}

/**
 * 分段占比条：一条横杠里按比例切分，下面配图例。
 *
 * 比饼图更适合「两三个类别的相对体量」——人眼比较长度远比比较角度准。
 * 各段之间留 2px 缝（gap），比描边更干净，深浅两套主题都不用改。
 *
 * 动画方向是「从左往右长出来」，所以动的是 width 而不是 opacity；
 * 用 flex-basis 会在末段留下空隙，这里改用 flexGrow 按比例分配。
 */
export function BarSpread({
  segments,
  height = 12,
  className = '',
}: {
  segments: Segment[]
  height?: number
  className?: string
}) {
  const total = segments.reduce((s, d) => s + Math.abs(d.value), 0)
  const items = segments.filter((s) => Math.abs(s.value) > 0)
  if (total <= 0 || items.length === 0) return null

  return (
    <div className={className}>
      <div className="flex gap-[2px] w-full overflow-hidden" style={{ height }}>
        {items.map((s, i) => {
          const frac = Math.abs(s.value) / total
          return (
            <motion.span
              key={s.label}
              className="rounded-full"
              style={{ background: toneVar[s.tone ?? 'accent'] }}
              initial={{ width: 0 }}
              animate={{ width: `${frac * 100}%` }}
              transition={{ duration: 0.8, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            />
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-micro text-ink-soft">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: toneVar[s.tone ?? 'accent'] }}
              aria-hidden="true"
            />
            {s.label}
            <span className="tnum text-ink font-medium">
              {Math.round((Math.abs(s.value) / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
