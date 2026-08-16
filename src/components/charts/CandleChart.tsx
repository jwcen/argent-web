import { useEffect, useRef, useState } from 'react'
import type { KlineBar } from '../../lib/types'

/**
 * K 线蜡烛图（纯 SVG，无依赖）+ 均线 + 布林带叠加 + 买卖汉字标注 + 悬停十字光标/tooltip。
 *
 * 支持鼠标滚轮缩放（以鼠标位置为锚点）和拖动平移，内部维护 viewport。
 * 接收完整 K 线（不做预切片），自动默认显示最近 120 根。
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
  const DEFAULT_VIEW = 120 // 默认显示最近 120 根
  const MIN_VIEW = 20 // 最小可见根数
  const n = klines.length

  const svgRef = useRef<SVGSVGElement>(null)
  // viewport：[viewStart, viewEnd)，半开区间，相对完整 klines 数组下标。
  const [view, setView] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  // 首次拿到 klines 时初始化为「最近 120 根」
  useEffect(() => {
    if (n >= 2 && view.end === 0) {
      const end = n
      const start = Math.max(0, end - DEFAULT_VIEW)
      setView({ start, end })
    }
  }, [n, view.end])

  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startView: { start: number; end: number } } | null>(null)

  if (n < 2) return null
  const viewStart = view.end === 0 ? Math.max(0, n - DEFAULT_VIEW) : view.start
  const viewEnd = view.end === 0 ? n : view.end
  const visibleN = viewEnd - viewStart
  if (visibleN < 2) return null

  // 局部 0..visibleN-1 下标的 y/x 坐标
  const yMin = (() => {
    let m = Infinity
    for (let g = viewStart; g < viewEnd; g++) {
      const k = klines[g]
      if (k && k.low < m) m = k.low
      const trackMA = (a: number[]) => { if (a[g] > 0 && a[g] < m) m = a[g] }
      trackMA(ma5); trackMA(ma10); trackMA(ma20); trackMA(ma60)
      if (bollUp[g] > 0 && bollUp[g] < m) m = bollUp[g]
      if (bollLow[g] > 0 && bollLow[g] < m) m = bollLow[g]
    }
    return m
  })()
  const yMax = (() => {
    let m = -Infinity
    for (let g = viewStart; g < viewEnd; g++) {
      const k = klines[g]
      if (k && k.high > m) m = k.high
      const trackMA = (a: number[]) => { if (a[g] > 0 && a[g] > m) m = a[g] }
      trackMA(ma5); trackMA(ma10); trackMA(ma20); trackMA(ma60)
      if (bollUp[g] > 0 && bollUp[g] > m) m = bollUp[g]
      if (bollLow[g] > 0 && bollLow[g] > m) m = bollLow[g]
    }
    return m
  })()
  if (!isFinite(yMin) || !isFinite(yMax) || yMax <= yMin) return null
  const ySpan = yMax - yMin

  const x = (i: number) => padL + (i / (visibleN - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - yMin) / ySpan) * (H - padT - padB)
  const step = (W - padL - padR) / (visibleN - 1)
  const bodyW = Math.max(1, Math.min(9, step * 0.62))

  const toPath = (arr: number[]) => {
    let d = ''
    for (let i = 0; i < visibleN; i++) {
      const g = viewStart + i
      const v = arr[g]
      if (v <= 0) continue
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
    }
    return d
  }

  // 缩放（wheel），以鼠标位置为锚点：缩放后鼠标下的数据下标保持不变
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      const scale = rect.width / W
      const mouseSvgX = (e.clientX - rect.left) / scale
      const mouseFrac = Math.max(0, Math.min(1, (mouseSvgX - padL) / (W - padL - padR)))
      const mouseGlobalIdx = viewStart + mouseFrac * (visibleN - 1)

      const factor = e.deltaY < 0 ? 0.8 : 1.25
      let newSize = Math.max(MIN_VIEW, Math.min(n, Math.round(visibleN * factor)))
      let newStart = Math.round(mouseGlobalIdx - mouseFrac * (newSize - 1))
      newStart = Math.max(0, Math.min(n - newSize, newStart))
      setView({ start: newStart, end: newStart + newSize })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [viewStart, viewEnd, visibleN, n])

  // 拖动平移（mousedown / window mousemove+mouseup），松手前即使光标移出 SVG 也能继续
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d || !d.active) return
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const scale = rect.width / W
      const dxSvg = (e.clientX - d.startX) / scale
      const shiftBars = -dxSvg / step
      const size = d.startView.end - d.startView.start
      let newStart = Math.round(d.startView.start + shiftBars)
      newStart = Math.max(0, Math.min(n - size, newStart))
      setView({ start: newStart, end: newStart + size })
    }
    const onUp = () => {
      if (dragRef.current?.active) {
        dragRef.current = null
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [step, n])

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startView: { start: viewStart, end: viewEnd } }
    document.body.style.cursor = 'grabbing'
  }
  const onDoubleClick = () => {
    // 双击复位到最近 120 根
    const end = n
    const start = Math.max(0, end - DEFAULT_VIEW)
    setView({ start, end })
  }

  // 移动端触摸滑动平移（基础版，不含双指缩放）
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      const t = e.touches[0]
      dragRef.current = { active: true, startX: t.clientX, startView: { start: viewStart, end: viewEnd } }
    }
    const onTouchMove = (e: TouchEvent) => {
      const d = dragRef.current
      if (!d || !d.active || e.touches.length !== 1) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      const scale = rect.width / W
      const dxSvg = (e.touches[0].clientX - d.startX) / scale
      const shiftBars = -dxSvg / step
      const size = d.startView.end - d.startView.start
      let newStart = Math.round(d.startView.start + shiftBars)
      newStart = Math.max(0, Math.min(n - size, newStart))
      setView({ start: newStart, end: newStart + size })
    }
    const onTouchEnd = () => {
      if (dragRef.current?.active) dragRef.current = null
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [viewStart, viewEnd, step, n])

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // 拖动中不更新 hover（避免 tooltip 闪烁）
    if (dragRef.current?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = rect.width / W
    const svgX = (e.clientX - rect.left) / scale
    const localIdx = Math.round((svgX - padL) / step)
    if (localIdx >= 0 && localIdx < visibleN) {
      setHover({ i: viewStart + localIdx, cx: e.clientX, cy: e.clientY })
    }
  }

  const hk = hover ? klines[hover.i] : null
  const buyLocal = (buys ?? []).filter((g) => g >= viewStart && g < viewEnd)
  const sellLocal = (sells ?? []).filter((g) => g >= viewStart && g < viewEnd)

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-zoom-in select-none touch-none"
        role="img"
        aria-label="K线图"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
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
        {klines.slice(viewStart, viewEnd).map((k, i) => {
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
            <g key={viewStart + i}>
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
        {buyLocal.map((g) => {
          const i = g - viewStart
          const cx = x(i)
          const yLow = y(klines[g].low)
          const ay = Math.min(yLow + 14, H - padB + 14)
          return (
            <text key={`b${g}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-up)" fontSize={11} fontWeight={700}>
              买
            </text>
          )
        })}
        {sellLocal.map((g) => {
          const i = g - viewStart
          const cx = x(i)
          const yHigh = y(klines[g].high)
          const ay = Math.max(yHigh - 12, padT + 4)
          return (
            <text key={`s${g}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-down)" fontSize={11} fontWeight={700}>
              卖
            </text>
          )
        })}

        {/* 十字光标竖线 */}
        {hover && (
          <line
            x1={x(hover.i - viewStart)}
            y1={padT}
            x2={x(hover.i - viewStart)}
            y2={H - padB}
            stroke="var(--c-ink-soft)"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* 日期标签（可视区段首/中/尾） */}
        {[0, Math.floor((visibleN - 1) / 2), visibleN - 1].map((i) => {
          const g = viewStart + i
          return (
            <text key={g} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[9px]">
              {(klines[g]?.date || '').slice(5)}
            </text>
          )
        })}

        {/* 缩放范围提示 */}
        {visibleN !== DEFAULT_VIEW && visibleN < n && (
          <text x={padL} y={padT + 8} className="fill-ink-faint text-[10px]">
            缩放：{visibleN} 根 · 双击复位
          </text>
        )}
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
