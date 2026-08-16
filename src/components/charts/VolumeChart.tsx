import type { KlineBar } from '../../lib/types'

/**
 * 量价图：成交量柱（按涨跌着色）+ 5日/10日量均线 + 量比标签。
 *
 * 与 CandleChart 共享同一坐标系（同一 padL/padR 与 klines 序列），
 * 这样叠在蜡烛图正下方时，每根柱与蜡烛对得齐。
 */
export function VolumeChart({
  klines,
  ma5,
  ma10,
  ratio,
}: {
  klines: KlineBar[]
  ma5: number[]
  ma10: number[]
  ratio: number
}) {
  const W = 640
  const H = 110
  const padL = 8
  const padR = 56
  const padT = 8
  const padB = 20
  const n = klines.length
  if (n < 2) return null

  const vols = klines.map((k) => k.volume)
  let max = 0
  for (const v of vols) if (v > max) max = v
  if (max <= 0) return null

  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const step = (W - padL - padR) / (n - 1)
  const barW = Math.max(1, Math.min(9, step * 0.62))

  const toPath = (arr: number[]) => {
    let d = ''
    for (let i = 0; i < n; i++) {
      const v = arr[i]
      if (v <= 0) continue
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
    }
    return d
  }

  // 量比语义标签
  const ratioTone =
    ratio >= 1.5
      ? { t: `放量 ×${ratio.toFixed(2)}`, c: 'text-up' }
      : ratio >= 0.7
        ? { t: `温和 ×${ratio.toFixed(2)}`, c: 'text-ink-soft' }
        : { t: `缩量 ×${ratio.toFixed(2)}`, c: 'text-ink-faint' }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="量价图">
      {/* 量均线 */}
      <path d={toPath(ma10)} fill="none" stroke="#f59e0b" strokeOpacity={0.9} strokeWidth={1.2} />
      <path d={toPath(ma5)} fill="none" stroke="var(--c-accent)" strokeWidth={1.4} />

      {/* 量柱 */}
      {klines.map((k, i) => {
        const up = k.close >= k.open
        const c = up ? 'var(--c-up)' : 'var(--c-down)'
        const cy = y(k.volume)
        return (
          <rect
            key={i}
            x={x(i) - barW / 2}
            y={cy}
            width={barW}
            height={Math.max(1, H - padB - cy)}
            fill={c}
            opacity={0.85}
          />
        )
      })}

      {/* 量比 + 图例 */}
      <text x={padL} y={padT + 9} className="fill-ink-faint text-[10px]">
        <tspan className={`fill-current ${ratioTone.c}`}>{ratioTone.t}</tspan>
        <tspan dx={6} className="fill-ink-faint">量 MA5(蓝)/MA10(橙)</tspan>
      </text>
    </svg>
  )
}