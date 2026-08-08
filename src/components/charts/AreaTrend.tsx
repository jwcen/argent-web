import { motion } from 'framer-motion'
import { useId } from 'react'

export interface TrendPoint {
  /** 展示用标签（如 2026-08-08） */
  label: string
  value: number
}

/** Catmull-Rom 转三次贝塞尔，得到平滑但不过冲的曲线 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/**
 * 面积趋势图。
 *
 * 宽度自适应靠 viewBox + preserveAspectRatio="none" 拉伸，
 * 但那样会把描边也压扁 —— 所以描边加 vector-effect="non-scaling-stroke"，
 * 让线宽在任何容器宽度下都保持 2px。这是 SVG 响应式最实用的一招。
 */
export function AreaTrend({
  data,
  compare,
  height = 180,
  className = '',
}: {
  data: TrendPoint[]
  compare?: TrendPoint[]
  height?: number
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const W = 600
  const H = height
  const padY = 14

  if (data.length < 2) return null

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1

  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: padY + (1 - (d.value - min) / span) * (H - padY * 2),
  }))

  const line = smoothPath(pts)
  const area = `${line} L ${W} ${H} L 0 ${H} Z`

  // 基准线共享同一套 min/max 刻度（TWR 与基准同为 100 起点，可直接比较）
  const cpts =
    compare && compare.length >= 2
      ? compare.map((d, i) => ({
          x: (i / (compare.length - 1)) * W,
          y: padY + (1 - (d.value - min) / span) * (H - padY * 2),
        }))
      : null
  const cLine = cpts ? smoothPath(cpts) : ''

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={`累计投入趋势，从 ${data[0].label} 到 ${data[data.length - 1].label}`}
    >
      <defs>
        <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d={area}
        fill={`url(#fill-${uid})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.5 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="var(--c-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
      />
      {cLine && (
        <path
          d={cLine}
          fill="none"
          stroke="var(--c-ink-faint)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
