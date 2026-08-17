import { useEffect, useRef, useState } from 'react'
import type { KlineBar } from '../../lib/types'

// 均线/布林带的显隐配置（颜色与图表里的线一致，开关区同时充当图例）
type MaKey = 'ma5' | 'ma10' | 'ma20' | 'ma60' | 'ma120' | 'ma250' | 'boll'
const MA_CONFIG: { key: MaKey; label: string; color: string }[] = [
  { key: 'ma5', label: 'MA5', color: 'var(--c-accent)' },
  { key: 'ma10', label: 'MA10', color: '#14b8a6' },
  { key: 'ma20', label: 'MA20', color: '#f59e0b' },
  { key: 'ma60', label: 'MA60', color: '#8b5cf6' },
  { key: 'ma120', label: 'MA120', color: '#ec4899' },
  { key: 'ma250', label: 'MA250', color: '#f97316' },
  { key: 'boll', label: 'BOLL', color: 'var(--c-ink-soft)' },
]
const MA_DEFAULT_ON: Record<MaKey, boolean> = {
  ma5: true, ma10: true, ma20: true, ma60: true, ma120: true, ma250: true, boll: true,
}

/**
 * K 线蜡烛图（纯 SVG，无依赖）+ 均线 + 布林带 + 量价图 + 买卖汉字标注 + 悬停十字光标。
 *
 * - 蜡烛图与量价图共享同一 view 窗口，确保上下完全对齐。
 * - 支持鼠标滚轮缩放（以鼠标位置为锚点）、拖动平移、触摸滑动。
 * - 底部提供可见的「滑动栏」（range），可拖动到更早的历史 K 线。
 * - 浅色横向/纵向网格辅助读数。
 *
 * 接收完整 K 线（由调用方决定传多少根），内部 view 控制可见窗口，buys/sells 为相对完整 klines 的下标。
 */
export function CandleChart({
  klines,
  ma5,
  ma10,
  ma20,
  ma60,
  ma120,
  ma250,
  bollUp,
  bollMid,
  bollLow,
  volMa5,
  volMa10,
  volRatio,
  buys,
  sells,
}: {
  klines: KlineBar[]
  ma5: number[]
  ma10: number[]
  ma20: number[]
  ma60: number[]
  ma120: number[]
  ma250: number[]
  bollUp: number[]
  bollMid: number[]
  bollLow: number[]
  volMa5?: number[]
  volMa10?: number[]
  volRatio?: number
  buys?: number[]
  sells?: number[]
}) {
  const W = 640
  const padL = 8
  const padR = 56
  const padT = 14 // 蜡烛区上边距
  const Hc = 300 // 蜡烛区高度
  const gap = 18 // 蜡烛区与量区间距
  const padV = 6 // 量区上边距
  const Hv = 92 // 量区高度
  const padB = 22 // 量区下边距（日期标签）
  const H = padT + Hc + gap + padV + Hv + padB

  const candleTop = padT
  const candleBottom = padT + Hc
  const volTop = candleBottom + gap + padV
  const volBottom = volTop + Hv

  // 默认可见根数（太多会糊成一团，太少看不到趋势）。用户可缩放/滑动。
  const DEFAULT_VIEW = 240
  const MIN_VIEW = 20
  const n = klines.length

  const svgRef = useRef<SVGSVGElement>(null)
  // viewport：[viewStart, viewEnd)，半开区间，相对完整 klines 数组下标。
  const [view, setView] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  // 首次拿到 klines 时初始化为「最近 DEFAULT_VIEW 根」
  useEffect(() => {
    if (n >= 2 && view.end === 0) {
      const end = n
      const start = Math.max(0, end - DEFAULT_VIEW)
      setView({ start, end })
    }
  }, [n, view.end])

  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startView: { start: number; end: number } } | null>(null)
  // 双指捏合缩放状态
  const pinchRef = useRef<{ startDist: number; centerFrac: number; startView: { start: number; end: number } } | null>(null)
  // 均线/布林显隐开关
  const [show, setShow] = useState<Record<MaKey, boolean>>(MA_DEFAULT_ON)

  if (n < 2) return null
  const viewStart = view.end === 0 ? Math.max(0, n - DEFAULT_VIEW) : view.start
  const viewEnd = view.end === 0 ? n : view.end
  const visibleN = viewEnd - viewStart
  if (visibleN < 2) return null

  // 蜡烛区 y 范围（基于可见窗口内的 high/low/ma/boll）
  const yMin = (() => {
    let m = Infinity
    for (let g = viewStart; g < viewEnd; g++) {
      const k = klines[g]
      if (k && k.low < m) m = k.low
      const track = (a: number[]) => { if (a[g] > 0 && a[g] < m) m = a[g] }
      track(ma5); track(ma10); track(ma20); track(ma60); track(ma120); track(ma250)
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
      const track = (a: number[]) => { if (a[g] > 0 && a[g] > m) m = a[g] }
      track(ma5); track(ma10); track(ma20); track(ma60); track(ma120); track(ma250)
      if (bollUp[g] > 0 && bollUp[g] > m) m = bollUp[g]
      if (bollLow[g] > 0 && bollLow[g] > m) m = bollLow[g]
    }
    return m
  })()
  if (!isFinite(yMin) || !isFinite(yMax) || yMax <= yMin) return null
  const ySpan = yMax - yMin

  // 量区 y 范围（基于可见窗口内的成交量）
  let volMax = 0
  for (let g = viewStart; g < viewEnd; g++) {
    const k = klines[g]
    if (k && k.volume > volMax) volMax = k.volume
  }
  if (volMax <= 0) volMax = 1

  const x = (i: number) => padL + (i / (visibleN - 1)) * (W - padL - padR)
  const yC = (v: number) => candleTop + (1 - (v - yMin) / ySpan) * Hc
  const yV = (v: number) => volTop + (1 - v / volMax) * Hv
  const step = (W - padL - padR) / (visibleN - 1)
  const bodyW = Math.max(1, Math.min(9, step * 0.62))

  const toPath = (arr: number[], yScale: (v: number) => number) => {
    let d = ''
    for (let i = 0; i < visibleN; i++) {
      const g = viewStart + i
      const v = arr[g]
      if (v <= 0) continue
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${yScale(v).toFixed(1)} `
    }
    return d
  }

  // 浅色网格线（横向价格刻度 + 纵向日期刻度）
  const gridRows = 4
  const gridLines = Array.from({ length: gridRows + 1 }, (_, r) => {
    const frac = r / gridRows
    const v = yMax - frac * ySpan
    const yy = candleTop + frac * Hc
    return { yy, v }
  })
  // 纵向网格：取可见窗口内均匀分布的若干个位置（与日期标签对齐）
  const vIdxs = [0, Math.floor((visibleN - 1) / 4), Math.floor((visibleN - 1) / 2), Math.floor((3 * (visibleN - 1)) / 4), visibleN - 1]

  // 滚轮交互：纵向滚轮缩放（以鼠标为锚点）；横向滑动（触控板左右滑）仅平移，避免误触缩放
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      const scale = rect.width / W

      // 横向滑动优先用于平移（触控板左右滑），但不拦截捏合缩放（ctrlKey，触控板捏合走 wheel+ctrlKey）
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const shiftBars = (e.deltaX / scale) / step
        const size = viewEnd - viewStart
        let newStart = Math.round(viewStart + shiftBars)
        newStart = Math.max(0, Math.min(n - size, newStart))
        setView({ start: newStart, end: newStart + size })
        return
      }

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
  }, [viewStart, viewEnd, visibleN, n, step])

  // 拖动平移（mouse + window）
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
    // 双击复位到最近 DEFAULT_VIEW 根
    const end = n
    const start = Math.max(0, end - DEFAULT_VIEW)
    setView({ start, end })
  }

  // 触摸交互：单指拖动平移；双指捏合缩放（以两指中点为锚点）
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const [a, b] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const rect = el.getBoundingClientRect()
        const scale = rect.width / W
        const midSvgX = ((a.clientX + b.clientX) / 2 - rect.left) / scale
        const centerFrac = Math.max(0, Math.min(1, (midSvgX - padL) / (W - padL - padR)))
        pinchRef.current = { startDist: dist, centerFrac, startView: { start: viewStart, end: viewEnd } }
        dragRef.current = null
        return
      }
      if (e.touches.length === 1) {
        e.preventDefault()
        const t = e.touches[0]
        dragRef.current = { active: true, startX: t.clientX, startView: { start: viewStart, end: viewEnd } }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      // 双指捏合：以中点为锚点缩放
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const [a, b] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const p = pinchRef.current
        const factor = dist / p.startDist
        const startSize = p.startView.end - p.startView.start
        const newSize = Math.max(MIN_VIEW, Math.min(n, Math.round(startSize / factor)))
        const startCenter = p.startView.start + p.centerFrac * (startSize - 1)
        let newStart = Math.round(startCenter - p.centerFrac * (newSize - 1))
        newStart = Math.max(0, Math.min(n - newSize, newStart))
        setView({ start: newStart, end: newStart + newSize })
        return
      }
      // 单指拖动平移
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
    const onTouchEnd = (e: TouchEvent) => {
      if (dragRef.current?.active) dragRef.current = null
      if (e.touches.length < 2) pinchRef.current = null
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [viewStart, viewEnd, step, n])

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
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

  // 量比语义
  const ratio = volRatio ?? 1
  const ratioTone =
    ratio >= 1.5 ? { t: `放量 ×${ratio.toFixed(2)}`, c: 'text-up' } : ratio >= 0.7 ? { t: `温和 ×${ratio.toFixed(2)}`, c: 'text-ink-soft' } : { t: `缩量 ×${ratio.toFixed(2)}`, c: 'text-ink-faint' }

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
        {/* 网格：纵向（日期刻度） */}
        {vIdxs.map((i) => {
          const g = viewStart + i
          return <line key={`gv${i}`} x1={x(i)} y1={candleTop} x2={x(i)} y2={volBottom} stroke="var(--c-line)" strokeOpacity={0.35} strokeWidth={1} />
        })}

        {/* 网格：横向（价格刻度） */}
        {gridLines.map((gl, r) => (
          <g key={`gh${r}`}>
            <line x1={padL} y1={gl.yy} x2={W - padR} y2={gl.yy} stroke="var(--c-line)" strokeOpacity={0.5} strokeWidth={1} />
            <text x={W - padR + 4} y={gl.yy + 3} className="fill-ink-faint text-[9px] tnum">
              {gl.v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* 布林上下轨（淡虚线） */}
        {show.boll && <path d={toPath(bollUp, yC)} fill="none" stroke="var(--c-ink-soft)" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3" />}
        {show.boll && <path d={toPath(bollLow, yC)} fill="none" stroke="var(--c-ink-soft)" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3" />}
        {/* 均线 */}
        {show.ma250 && <path d={toPath(ma250, yC)} fill="none" stroke="#f97316" strokeOpacity={0.85} strokeWidth={1.5} />}
        {show.ma120 && <path d={toPath(ma120, yC)} fill="none" stroke="#ec4899" strokeOpacity={0.85} strokeWidth={1.2} />}
        {show.ma60 && <path d={toPath(ma60, yC)} fill="none" stroke="#8b5cf6" strokeOpacity={0.85} strokeWidth={1.2} />}
        {show.ma20 && <path d={toPath(ma20, yC)} fill="none" stroke="#f59e0b" strokeOpacity={0.85} strokeWidth={1.2} />}
        {show.ma10 && <path d={toPath(ma10, yC)} fill="none" stroke="#14b8a6" strokeOpacity={0.75} strokeWidth={1.1} />}
        {show.ma5 && <path d={toPath(ma5, yC)} fill="none" stroke="var(--c-accent)" strokeWidth={1.6} />}

        {/* 蜡烛 */}
        {klines.slice(viewStart, viewEnd).map((k, i) => {
          const up = k.close >= k.open
          const c = up ? 'var(--c-up)' : 'var(--c-down)'
          const cx = x(i)
          const yHigh = yC(k.high)
          const yLow = yC(k.low)
          const yOpen = yC(k.open)
          const yClose = yC(k.close)
          const bodyTop = Math.min(yOpen, yClose)
          const bodyH = Math.max(1, Math.abs(yClose - yOpen))
          return (
            <g key={viewStart + i}>
              <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={c} strokeWidth={1} />
              <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={c} rx={0.5} />
            </g>
          )
        })}

        {/* 买卖信号：汉字标注 */}
        {buyLocal.map((g) => {
          const i = g - viewStart
          const cx = x(i)
          const yLow = yC(klines[g].low)
          const ay = Math.min(yLow + 14, candleBottom - 2)
          return (
            <text key={`b${g}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-up)" fontSize={11} fontWeight={700}>
              买
            </text>
          )
        })}
        {sellLocal.map((g) => {
          const i = g - viewStart
          const cx = x(i)
          const yHigh = yC(klines[g].high)
          const ay = Math.max(yHigh - 12, candleTop + 4)
          return (
            <text key={`s${g}`} x={cx} y={ay} textAnchor="middle" fill="var(--c-down)" fontSize={11} fontWeight={700}>
              卖
            </text>
          )
        })}

        {/* 量区：量柱 */}
        {klines.slice(viewStart, viewEnd).map((k, i) => {
          const up = k.close >= k.open
          const c = up ? 'var(--c-up)' : 'var(--c-down)'
          const cy = yV(k.volume)
          return (
            <rect key={`v${viewStart + i}`} x={x(i) - bodyW / 2} y={cy} width={bodyW} height={Math.max(1, volBottom - cy)} fill={c} opacity={0.8} />
          )
        })}
        {/* 量区：量均线 */}
        <path d={toPath(volMa10 ?? [], yV)} fill="none" stroke="#f59e0b" strokeOpacity={0.85} strokeWidth={1.1} />
        <path d={toPath(volMa5 ?? [], yV)} fill="none" stroke="var(--c-accent)" strokeWidth={1.3} />

        {/* 十字光标竖线 */}
        {hover && (
          <line x1={x(hover.i - viewStart)} y1={candleTop} x2={x(hover.i - viewStart)} y2={volBottom} stroke="var(--c-ink-soft)" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />
        )}

        {/* 量比标签 */}
        <text x={padL} y={candleBottom + gap - 4} className="fill-ink-faint text-[10px]">
          <tspan className={`fill-current ${ratioTone.c}`}>{ratioTone.t}</tspan>
          <tspan dx={6}>量 MA5(蓝)/MA10(橙)</tspan>
        </text>

        {/* 日期标签（可见窗口首/中/尾） */}
        {[0, Math.floor((visibleN - 1) / 2), visibleN - 1].map((i) => {
          const g = viewStart + i
          return (
            <text key={`d${g}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[9px]">
              {(klines[g]?.date || '').slice(5)}
            </text>
          )
        })}

        {/* 缩放范围提示 */}
        {visibleN !== DEFAULT_VIEW && visibleN < n && (
          <text x={padL} y={candleTop + 8} className="fill-ink-faint text-[10px]">
            缩放：{visibleN} 根 · 双击复位
          </text>
        )}
      </svg>

      {/* 均线显隐开关（同时充当图例） */}
      <div className="flex flex-wrap gap-1.5 mt-2 px-1">
        {MA_CONFIG.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setShow((s) => ({ ...s, [m.key]: !s[m.key] }))}
            aria-pressed={show[m.key]}
            title={show[m.key] ? `隐藏 ${m.label}` : `显示 ${m.label}`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tnum transition-colors ${
              show[m.key] ? 'border-line bg-surface text-ink-soft' : 'border-line/40 text-ink-faint opacity-45'
            }`}
          >
            <span className="inline-block h-[2px] w-3 rounded" style={{ background: m.color }} />
            {m.label}
          </button>
        ))}
      </div>

      {/* 滑动栏：可拖动到更早的历史 K 线 */}
      {n > DEFAULT_VIEW && (
        <div className="mt-2 px-1">
          <input
            type="range"
            min={0}
            max={n - visibleN}
            value={viewStart}
            onChange={(e) => {
              const s = Math.max(0, Math.min(n - visibleN, Number(e.target.value)))
              setView({ start: s, end: s + visibleN })
            }}
            className="w-full accent-[var(--c-accent)]"
            aria-label="滑动查看历史 K 线"
          />
          <div className="flex justify-between text-[9px] text-ink-faint tnum mt-0.5">
            <span>{klines[0]?.date}</span>
            <span>滚轮/双指缩放 · 左右滑动/单指拖动平移 · 双击复位</span>
            <span>{klines[n - 1]?.date}</span>
          </div>
        </div>
      )}

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
