import { useState } from 'react'
import type { KlineBar } from '../../lib/types'

/**
 * K 线蜡烛图（纯 SVG，无依赖）+ 均线 + 布林带叠加 + 买卖汉字标注 + 悬停十字光标/tooltip。
 *
 * 配色遵循 A 股惯例：涨红（--c-up）、跌绿（--c-down）。
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

  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null)

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

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = rect.width / W
    const svgX = (e.clientX - rect.left) / scale
    const idx = Math.round((svgX - padL) / step)
    if (idx >= 0 && idx < n) {
      setHover({ i: idx, cx: e.clientX, cy: e.clientY })
    }
  }

  const hk = hover ? klines[hover.i] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-crosshair"
        role="img"
        aria-label="K线图"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
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

        {/* 买卖信号：汉字标注 */}
        {(buys || []).map((i) => {
          if (i < 0 || i >= n) return null
          const cx = x(i)
          const yLow = y(klines[i].low)
          const ay = Math.min(yLow + 14, H - padB + 14)
          return (
            <text key={`b${i}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-up)" fontSize={11} fontWeight={700}>
              买
            </text>
          )
        })}
        {(sells || []).map((i) => {
          if (i < 0 || i >= n) return null
          const cx = x(i)
          const yHigh = y(klines[i].high)
          const ay = Math.max(yHigh - 12, padT + 4)
          return (
            <text key={`s${i}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-down)" fontSize={11} fontWeight={700}>
              卖
            </text>
          )
        })}

        {/* 十字光标竖线 */}
        {hover && (
          <line
            x1={x(hover.i)}
            y1={padT}
            x2={x(hover.i)}
            y2={H - padB}
            stroke="var(--c-ink-soft)"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* 日期标签（首/中/尾） */}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[9px]">
            {(klines[i]?.date || '').slice(5)}
          </text>
        ))}
      </svg>

      {/* 悬停 tooltip */}
      {hover && hk && (
        <div
          className="pointer-events-none fixed z-50 min-w-[150px] rounded-tile border border-line bg-surface/95 backdrop-blur px-3 py-2 text-caption shadow-pop"
          style={{
            left: hover.cx > window.innerWidth - 180 ? hover.cx - 168 : hover.cx + 16,
            top: Math.max(8, hover.cy - 20),
          }}
        >
          <p className="text-micro text-ink-faint tnum">{hk.date}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 tnum">
            <span className="text-ink-faint">开</span>
            <span className="text-right">{hk.open.toFixed(2)}</span>
            <span className="text-ink-faint">高</span>
            <span className="text-right text-up">{hk.high.toFixed(2)}</span>
            <span className="text-ink-faint">低</span>
            <span className="text-right text-down">{hk.low.toFixed(2)}</span>
            <span className="text-ink-faint">收</span>
            <span className="text-right font-semibold">{hk.close.toFixed(2)}</span>
            <span className="text-ink-faint">涨跌</span>
            <span className={`text-right font-semibold ${hk.close >= hk.open ? 'text-up' : 'text-down'}`}>
              {hk.open > 0 ? `${((hk.close - hk.open) / hk.open * 100) >= 0 ? '+' : ''}${((hk.close - hk.open) / hk.open * 100).toFixed(2)}%` : '—'}
            </span>
            <span className="text-ink-faint">量</span>
            <span className="text-right">{fmtVol(hk.volume)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtVol(v: number): string {
  if (!v) return '—'
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return String(Math.round(v))
}
