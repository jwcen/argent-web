import { motion } from 'framer-motion'

export interface Slice {
  label: string
  value: number
}

/**
 * 环形分布图。
 *
 * 配色刻意只用强调色的透明度阶梯，而不是彩虹色板 —— 全站只允许一个
 * 强调色，多色图表会立刻把克制感破坏掉。阶梯同时天然编码了大小顺序。
 */
export function Donut({
  data,
  size = 168,
  thickness = 20,
}: {
  data: Slice[]
  size?: number
  thickness?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2

  let acc = 0
  const arcs = data.map((d, i) => {
    const frac = total > 0 ? d.value / total : 0
    const arc = {
      ...d,
      frac,
      dash: c * frac,
      offset: -c * acc,
      opacity: Math.max(0.22, 1 - i * 0.18),
    }
    acc += frac
    return arc
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`持仓分布，共 ${data.length} 项`}
    >
      {/* 轨道 */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="var(--c-surface-2)"
        strokeWidth={thickness}
      />
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {arcs.map((a, i) => (
          // 生长动画靠 dasharray 从 0 展开；offset 固定为该段起点。
          // 若改成动画 offset，弧会「滑动」而不是「长出来」。
          <motion.circle
            key={a.label}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="var(--c-accent)"
            strokeOpacity={a.opacity}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDashoffset={a.offset}
            initial={{ strokeDasharray: `0 ${c}` }}
            animate={{ strokeDasharray: `${a.dash} ${c - a.dash}` }}
            transition={{ duration: 0.85, delay: 0.12 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </g>
    </svg>
  )
}
