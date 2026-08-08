import { useEffect, useRef, useState } from 'react'

function prefersReduced(): boolean {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// easeOutExpo：起步快、尾部缓，数字滚动用它比线性自然得多
const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

/**
 * 数字滚动。大额数字直接「出现」会显得很死，滚动一下能制造分量感。
 * 尊重「减少动态效果」偏好：开启时直接落到终值，不做动画。
 */
export function CountUp({
  value,
  duration = 1000,
  decimals = 2,
  className = '',
}: {
  value: number
  duration?: number
  decimals?: number
  className?: string
}) {
  const [shown, setShown] = useState(() => (prefersReduced() ? value : 0))
  const fromRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (prefersReduced()) {
      setShown(value)
      return
    }
    const from = fromRef.current
    const delta = value - from
    if (delta === 0) return

    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const v = from + delta * ease(p)
      setShown(v)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // 组件卸载/值再变时，以当前显示值为新起点，避免跳回 0 重滚
      fromRef.current = shown
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span className={`tnum ${className}`}>
      {shown.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}
