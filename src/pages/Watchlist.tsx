import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass, Star, X } from '@phosphor-icons/react'
import { watchlist as watchApi, market } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useQuotes } from '../lib/useQuotes'
import { useToasts } from '../lib/toast'
import type { FundEstimate, StockSuggest, WatchlistItem } from '../lib/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { fmtMoney, fmtPct, pnlClass } from '../lib/format'

type Tab = 'STOCK' | 'FUND'

const TAB_LABEL: Record<Tab, string> = { STOCK: '股票', FUND: '基金' }
const TAB_HINT: Record<Tab, string> = {
  STOCK: '输入代码或名称搜索 A 股，如 600519 / 茅台',
  FUND: '输入名称搜索基金，如 国泰有色 / 纳斯达克',
}

export default function Watchlist() {
  const api = useApi()
  const toast = useToasts()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('STOCK')
  const [items, setItems] = useState<WatchlistItem[] | null>(null)

  const load = useCallback(() => {
    api(() => watchApi.list())
      .then(setItems)
      .catch(() => setItems([]))
  }, [api])
  useEffect(() => {
    load()
  }, [load])

  // 当前 tab 下的自选项
  const list = useMemo(() => (items ?? []).filter((i) => i.item_type === tab), [items, tab])

  // 行情：股票走批量报价（useQuotes 自带刷新），基金走盘中估值（盘内实时，盘外回落官方净值）
  const codes = useMemo(() => list.map((i) => i.code), [list])
  const quotes = useQuotes(tab === 'STOCK' ? codes : [])
  const [fundEsts, setFundEsts] = useState<Record<string, FundEstimate>>({})
  useEffect(() => {
    if (tab !== 'FUND' || codes.length === 0) {
      setFundEsts({})
      return
    }
    const refresh = () =>
      api(() => market.fundsEstimate(codes))
        .then((fs) => {
          const m: Record<string, FundEstimate> = {}
          for (const f of fs) m[f.code] = f
          setFundEsts(m)
        })
        .catch(() => setFundEsts({}))
    refresh()
    // 后端 60s 缓存，前端 60s 刷新一次就够（盘中估值每分钟更新）
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, codes.join(','), api])

  const add = async (s: StockSuggest) => {
    try {
      await api(() => watchApi.add(s.type, s.code, s.name))
      toast.success(`已添加 ${s.name}`)
      load()
    } catch {
      toast.error('添加失败，请重试')
    }
  }

  const remove = async (i: WatchlistItem) => {
    try {
      await api(() => watchApi.remove(i.item_type, i.code))
      toast.info(`已移除 ${i.name}`)
      load()
    } catch {
      toast.error('移除失败，请重试')
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶栏：标题 + 股票/基金切换 */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title-1 font-bold tracking-tight">自选</h1>
        <div className="flex items-center gap-2 shrink-0">
          {(['STOCK', 'FUND'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`min-h-9 px-4 rounded-full text-caption font-semibold transition-colors ${
                tab === t ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索添加 */}
      <WatchSearchInput tab={tab} onAdd={add} />

      {/* 列表 */}
      <Card>
        {items === null ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full rounded-tile" />
            <Skeleton className="h-12 w-full rounded-tile" />
            <Skeleton className="h-12 w-full rounded-tile" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            compact
            icon={<Star size={26} />}
            title={`还没有${TAB_LABEL[tab]}自选`}
            description={`在上方搜索框输入${TAB_LABEL[tab]}名称或代码，选中即可加入自选。`}
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.map((i) => {
              const q = quotes[i.code]
              const est = fundEsts[i.code]
              // 基金：盘内用估值，盘外回落官方净值
              const isFund = tab === 'FUND'
              const hasEst = isFund && !!est && est.estimate_nav > 0
              const price = isFund ? (hasEst ? est!.estimate_nav : est?.unit_nav) : q?.price
              const pct = isFund
                ? hasEst
                  ? est!.estimate_change_pct
                  : est?.daily_change_pct
                : q?.change_pct
              const hasData = isFund ? !!est : !!q
              return (
                <li
                  key={`${i.item_type}-${i.code}`}
                  onClick={() => i.item_type === 'STOCK' && navigate(`/stock/${i.code}`)}
                  className={`flex items-center gap-3 px-5 py-3.5 ${i.item_type === 'STOCK' ? 'cursor-pointer hover:bg-surface-2/40' : ''} transition-colors`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{i.name}</p>
                    <p className="mt-0.5 text-micro text-ink-faint tnum">{i.code}</p>
                  </div>
                  <div className="text-right shrink-0 max-w-[55%]">
                    <p className="text-body font-semibold tnum">
                      {hasData ? fmtMoney(price, isFund ? 4 : 2) : '—'}
                    </p>
                    <p className={`mt-0.5 text-micro tnum font-medium ${pnlClass(pct)}`}>
                      {hasData
                        ? fmtPct(pct)
                        : '暂无行情'}
                    </p>
                    {/* 第三行：参考价 / 已闭市 / 日内范围 */}
                    <p className="mt-0.5 text-[11px] text-ink-faint tnum truncate">
                      {isFund
                        ? hasEst
                          ? `净值 ${est!.unit_nav.toFixed(4)}`
                          : '已闭市'
                        : q
                          ? `昨收 ${fmtMoney(q.prev_close, 2)} · 高 ${fmtMoney(q.high, 2)} · 低 ${fmtMoney(q.low, 2)}`
                          : '—'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(i)
                    }}
                    className="w-9 h-9 grid place-items-center rounded-full text-ink-faint hover:text-danger hover:bg-surface-2 transition-colors shrink-0"
                    aria-label={`移除 ${i.name}`}
                    title="移除自选"
                  >
                    <X size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** 搜索框：按当前 tab 过滤类型（股票/基金），选中即回调添加。 */
function WatchSearchInput({ tab, onAdd }: { tab: Tab; onAdd: (s: StockSuggest) => void }) {
  const api = useApi()
  const [keyword, setKeyword] = useState('')
  const [suggestions, setSuggestions] = useState<StockSuggest[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const doSearch = useCallback(
    (kw: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (!kw.trim()) {
        setSuggestions([])
        setOpen(false)
        return
      }
      setSearching(true)
      timerRef.current = setTimeout(async () => {
        try {
          const results = await api(() => market.stockSearch(kw, 10))
          setSuggestions((results ?? []).filter((s) => s.type === tab))
          setOpen(true)
        } catch {
          setSuggestions([])
          setOpen(false)
        } finally {
          setSearching(false)
        }
      }, 250)
    },
    [api, tab],
  )

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // 切换 tab 时清空上一次的候选
  useEffect(() => {
    setKeyword('')
    setSuggestions([])
    setOpen(false)
  }, [tab])

  const select = (s: StockSuggest) => {
    onAdd(s)
    setKeyword('')
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MagnifyingGlass
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
        />
        <input
          type="text"
          inputMode="search"
          placeholder={TAB_HINT[tab]}
          value={keyword}
          onChange={(e) => {
            const v = e.target.value
            setKeyword(v)
            doSearch(v)
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true)
          }}
          className="w-full h-12 rounded-tile border border-line bg-surface pl-10 pr-9 text-body text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
        />
        {searching && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint animate-pulse">
            搜索中…
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-tile border border-line bg-surface shadow-pop max-h-60 overflow-auto">
          {suggestions.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => select(s)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{s.name}</span>
                <span className="block text-micro text-ink-faint tnum">{s.code}</span>
              </span>
              <span className="text-micro text-ink-faint shrink-0">{TAB_LABEL[s.type]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
