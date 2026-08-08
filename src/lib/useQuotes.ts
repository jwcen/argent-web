import { useEffect, useState } from 'react'
import { market } from './api'
import type { Quote } from './types'
import { useApi } from './useApi'

// 批量拉取一组代码的实时报价，返回 code -> Quote 的字典。
//
// 设计原则（对齐后端 market 接口的优雅降级）：
// 数据源不可达（沙箱无外网等）时，batchQuote 返回空数组、接口不报错，
// 这里也跟着降级为 {} —— 页面据此显示「暂无行情」而非编造数字。
export function useQuotes(codes: string[] | null | undefined) {
  const api = useApi()
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const key = (codes ?? []).join(',')

  useEffect(() => {
    const list = codes ?? []
    if (list.length === 0) {
      setQuotes({})
      return
    }
    let alive = true
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
    return () => {
      alive = false
    }
  }, [key, api])

  return quotes
}
