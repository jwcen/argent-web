import { useEffect, useState } from 'react'
import { market } from './api'
import type { Quote } from './types'
import { useApi } from './useApi'
import { useSettings } from './settings'

// 批量拉取一组代码的实时报价，返回 code -> Quote 的字典。
//
// 设计原则（对齐后端 market 接口的优雅降级）：
// 数据源不可达（沙箱无外网等）时，batchQuote 返回空数组、接口不报错，
// 这里也跟着降级为 {} —— 页面据此显示「暂无行情」而非编造数字。
//
// 自动刷新：受「设置 → 行情 → 自动刷新」控制；关闭时不轮询，
// 仅在 codes 变化时拉一次。间隔变化会重建定时器。
export function useQuotes(codes: string[] | null | undefined) {
  const api = useApi()
  const { settings } = useSettings()
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const key = (codes ?? []).join(',')

  useEffect(() => {
    const list = codes ?? []
    if (list.length === 0) {
      setQuotes({})
      return
    }
    let alive = true
    const fetchOnce = () =>
      api(() => market.batchQuote(list))
        .then((qs) => {
          if (!alive) return
          const map: Record<string, Quote> = {}
          for (const q of qs) map[q.stock_code] = q
          setQuotes(map)
        })
        .catch(() => {
          if (alive) setQuotes({})
        })

    fetchOnce()
    const sec = Number(settings.quoteRefresh)
    let timer: ReturnType<typeof setInterval> | undefined
    if (sec > 0) timer = setInterval(fetchOnce, sec * 1000)
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
  }, [key, api, settings.quoteRefresh])

  return quotes
}
