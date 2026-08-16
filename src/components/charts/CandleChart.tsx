import type { KlineBar } from '../../lib/types'

/**
 * K 线蜡烛图（纯 SVG，无依赖）+ 均线 + 布林带叠加。
 *
 * 配色遵循 A 股惯例：涨红（--c-up）、跌绿（--c-down）。
 * 均线：MA5 强调蓝、MA20 琥珀、MA60 紫；布林上下轨用淡虚线。
 * 数据量较大时由调用方自行切片（建议取最近 120 根）。
 */
export function CandleChart({
  klines,
  ma5,
  ma10,
  ma20,
  ma60,
  bollUp,
  bollMid,
  bollLow,
  buys,
  sells,
}: {
  klines: KlineBar[]
  ma5: number[]
  ma10: number[]
  ma20: number[]
  ma60: number[]
  bollUp: number[]
  bollMid: number[]
  bollLow: number[]
  buys?: number[]
  sells?: number[]
}) {
  const W = 640
  const H = 320
  const padL = 8
  const padR = 56
  const padT = 12
  const padB = 22
  const n = klines.length
  if (n < 2) return null

  let min = Infinity
  let max = -Infinity
  const track = (v: number) => {
    if (v > 0) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  for (const k of klines) {
    track(k.high)
    track(k.low)
  }
  for (let i = 0; i < n; i++) {
    track(ma5[i]); track(ma10[i]); track(ma20[i]); track(ma60[i])
    track(bollUp[i]); track(bollLow[i])
  }
  if (!isFinite(min) || !isFinite(max) || max <= min) return null
  const span = max - min

  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const step = (W - padL - padR) / (n - 1)
  const bodyW = Math.max(1, Math.min(9, step * 0.62))

  const toPath = (arr: number[]) => {
    let d = ''
    for (let i = 0; i < n; i++) {
      const v = arr[i]
      if (v <= 0) continue
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
    }
    return d
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="K线图">
      {/* 布林上下轨（淡虚线） */}
      <path d={toPath(bollUp)} fill="none" stroke="var(--c-ink-soft)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
      <path d={toPath(bollLow)} fill="none" stroke="var(--c-ink-soft)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
      {/* 均线 */}
      <path d={toPath(ma60)} fill="none" stroke="#8b5cf6" strokeOpacity={0.9} strokeWidth={1.2} />
      <path d={toPath(ma20)} fill="none" stroke="#f59e0b" strokeOpacity={0.9} strokeWidth={1.2} />
      <path d={toPath(ma10)} fill="none" stroke="#14b8a6" strokeOpacity={0.8} strokeWidth={1.1} />
      <path d={toPath(ma5)} fill="none" stroke="var(--c-accent)" strokeWidth={1.6} />

      {/* 蜡烛 */}
      {klines.map((k, i) => {
        const up = k.close >= k.open
        const c = up ? 'var(--c-up)' : 'var(--c-down)'
        const cx = x(i)
        const yHigh = y(k.high)
        const yLow = y(k.low)
        const yOpen = y(k.open)
        const yClose = y(k.close)
        const bodyTop = Math.min(yOpen, yClose)
        const bodyH = Math.max(1, Math.abs(yClose - yOpen))
        return (
          <g key={i}>
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={c} strokeWidth={1} />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={c}
              rx={0.5}
            />
          </g>
        )
      })}

      {/* 买卖信号箭头 */}
      {(buys || []).map((i) => {
        if (i < 0 || i >= n) return null
        const cx = x(i)
        const yLow = y(klines[i].low)
        // 买↑：放在蜡烛下方（红 up 配色）
        const ay = Math.min(yLow + 12, H - padB + 12)
        return (
          <g key={`b${i}`}>
            <polygon
              points={`${cx},${ay} ${cx - 4},${ay + 6} ${cx + 4},${ay + 6}`}
              fill="var(--c-up)"
            />
          </g>
        )
      })}
      {(sells || []).map((i) => {
        if (i < 0 || i >= n) return null
        const cx = x(i)
        const yHigh = y(klines[i].high)
        // 卖↓：放在蜡烛上方（绿 down 配色）
        const ay = Math.max(yHigh - 12, padT - 12)
        return (
          <g key={`s${i}`}>
            <polygon
              points={`${cx},${ay} ${cx - 4},${ay - 6} ${cx + 4},${ay - 6}`}
              fill="var(--c-down)"
            />
          </g>
        )
      })}

      {/* 日期标签（首/中/尾） */}
      {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[9px]">
          {(klines[i]?.date || '').slice(5)}
        </text>
      ))}
    </svg>
  )
}
