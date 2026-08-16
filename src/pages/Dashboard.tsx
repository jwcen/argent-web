import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  ChartLineUp,
  ChatCircle,
  Plus,
  Receipt,
  Storefront,
  Wallet,
} from '@phosphor-icons/react'
import { portfolio, market, assets as assetApi } from '../lib/api'
import { classifyCategory } from '../lib/category'
import { useApi } from '../lib/useApi'
import { useQuotes } from '../lib/useQuotes'
import { useAuth } from '../lib/auth'
import type { Action, Curve, ExternalAction, ExternalAsset, FundQuote, Holding, MarketIndex, Quote } from '../lib/types'
import { Card } from '../components/ui/Card'
import { Glow } from '../components/ui/Glow'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { CountUp } from '../components/ui/CountUp'
import { Reveal } from '../components/motion/Reveal'
import { Donut, type Slice } from '../components/charts/Donut'
import { AreaTrend, type TrendPoint } from '../components/charts/AreaTrend'
import { BarSpread } from '../components/charts/BarSpread'
import { fmtMoney, fmtNum, dateOnly, nickname } from '../lib/format'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

const todayLabel = () =>
  new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

// 大盘指数返回结构随数据源变化，这里做防御式读取，字段缺失也不崩。
function readIndex(idx: MarketIndex) {
  const v = idx as Record<string, unknown>
  return {
    name: String(v.name ?? v.code ?? '—'),
    price: Number(v.price ?? NaN),
    pct: Number(v.change_pct ?? NaN),
  }
}

// 净值曲线下方的小指标块
function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
}) {
  const toneCls =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'
  return (
    <div className="rounded-tile bg-surface-2/50 px-3 py-2">
      <p className="text-micro text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-caption font-semibold tnum ${toneCls}`}>{value}</p>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const api = useApi()
  const navigate = useNavigate()

  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [actions, setActions] = useState<Action[] | null>(null)
  const [indices, setIndices] = useState<MarketIndex[] | null>(null)
  const [curve, setCurve] = useState<Curve | undefined>(undefined)
  const [assets, setAssets] = useState<ExternalAsset[]>([])
  const [fundNavs, setFundNavs] = useState<Record<string, FundQuote>>({})
  const [fundActions, setFundActions] = useState<ExternalAction[]>([])

  useEffect(() => {
    void api(() => portfolio.listHoldings())
      .then(async (list) => {
        setHoldings(list)
        // 没有「全部流水」端点，按持仓并发拉取后拼起来。
        // 单个失败不能拖垮整张图，所以每个 catch 成空数组。
        const chunks = await Promise.all(
          list.slice(0, 20).map((h) =>
            portfolio.listActions(h.stock_code).catch(() => [] as Action[]),
          ),
        )
        setActions(chunks.flat())
      })
      .catch(() => {
        setHoldings([])
        setActions([])
      })

    // 场外资产（基金/理财等）：概览统计与 A 股合并
    void api(() => assetApi.list())
      .then((list) => {
        setAssets(list)
        // 只有 6 位数字代码的基金类资产才能查净值；其余靠 manual_value/成本兜底
        const fundCodes = list
          .filter((a) => !a.closed && /^\d{6}$/.test(a.code) && (a.asset_type === 'FUND' || a.asset_type === 'GOLD'))
          .map((a) => a.code)
        if (fundCodes.length === 0) {
          setFundNavs({})
        } else {
          void api(() => market.funds(fundCodes))
            .then((fs) => {
              const map: Record<string, FundQuote> = {}
              for (const f of fs) map[f.code] = f
              setFundNavs(map)
            })
            .catch(() => setFundNavs({}))
        }
        // 基金流水并入「流水笔数/交易日/资金流向」统计（失败不打断）
        const openAssets = list.filter((a) => !a.closed)
        void Promise.all(
          openAssets.slice(0, 20).map((a) =>
            assetApi.listActions(a.id).catch(() => [] as import('../lib/types').ExternalAction[]),
          ),
        ).then((chunks) => {
          setFundActions(chunks.flat())
        })
      })
      .catch(() => setAssets([]))

    // 行情依赖外部数据源，挂了就静默降级，不打断主流程
    void api(() => market.indices())
      .then(setIndices)
      .catch(() => setIndices([]))

    // 净值曲线（TWR）——后端按成本基线口径算，无行情时也不崩
    void api(() => portfolio.getCurve(500))
      .then(setCurve)
      .catch(() => setCurve(undefined))
  }, [api])

  // ── 统计口径：A 股 + 场外资产合并 ──
  // 场外资产市值：manual_value 优先（用户手动估值/锁定市值）；其次净值×份额（可查净值时）；
  // 都没有 → 回落成本（绝不以假数据充市值，与资产页同一口径）。
  const fundCost = useMemo(
    () => (assets ?? []).filter((a) => !a.closed).reduce((s, a) => s + (a.cost_amount || 0), 0),
    [assets],
  )
  const fundMarketValue = useMemo(
    () =>
      (assets ?? [])
        .filter((a) => !a.closed)
        .reduce((s, a) => {
          if (a.manual_value != null) return s + a.manual_value
          const nav = fundNavs[a.code]
          if (nav && a.shares) return s + nav.unit_nav * a.shares
          return s + (a.cost_amount || 0)
        }, 0),
    [assets, fundNavs],
  )

  const totalCost = useMemo(
    () => (holdings?.reduce((s, h) => s + h.shares * h.cost_price, 0) ?? 0) + fundCost,
    [holdings, fundCost],
  )

  // 实时行情：按持仓代码批量报价，无源时优雅降级为 {}（不编造市值）。
  const holdingCodes = useMemo(() => (holdings ?? []).map((h) => h.stock_code), [holdings])
  const quotes = useQuotes(holdingCodes)
  const stockMarketValue = useMemo(
    () =>
      (holdings ?? []).reduce(
        (s, h) =>
          s + (quotes[h.stock_code] ? quotes[h.stock_code].price * h.shares : h.shares * h.cost_price),
        0,
      ),
    [holdings, quotes],
  )
  const totalMarketValue = stockMarketValue + fundMarketValue
  const hasQuote = useMemo(
    () =>
      (holdings ?? []).some((h) => quotes[h.stock_code]) ||
      fundMarketValue > fundCost, // 场外资产有真实估值也算「有行情」
    [holdings, quotes, fundMarketValue, fundCost],
  )
  const totalPnL = totalMarketValue - totalCost

  // 持仓分布：A 股 + 场外资产 按「板块分类」聚合（成本口径；场外未关闭的才算）。
  // 先给每个标的打板块标签，再按板块求和，最后取前 N 名 + 其他。
  const slices = useMemo<Slice[]>(() => {
    const items: Slice[] = []
    for (const h of holdings ?? []) {
      const v = h.shares * h.cost_price
      if (v > 0)
        items.push({
          label: classifyCategory({ assetType: 'STOCK', code: h.stock_code, name: h.stock_name }),
          value: v,
        })
    }
    for (const a of assets ?? []) {
      if (a.closed) continue
      const v = a.cost_amount || 0
      if (v > 0)
        items.push({
          label: classifyCategory({ assetType: a.asset_type, code: a.code, name: a.name }),
          value: v,
        })
    }
    const byCat = new Map<string, number>()
    for (const it of items) byCat.set(it.label, (byCat.get(it.label) ?? 0) + it.value)
    const cats = [...byCat.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    const MAX = 6
    if (cats.length <= MAX) return cats
    const rest = cats.slice(MAX).reduce((s, c) => s + c.value, 0)
    const head = cats.slice(0, MAX)
    const other = head.find((c) => c.label === '其他')
    if (other) other.value += rest
    else head.push({ label: '其他', value: rest })
    return head
  }, [holdings, assets])

  // 净值曲线：TWR（起点 100）作主区，沪深300 基准作对比线（同为 100 起点可直接比）
  const twrPoints = useMemo<TrendPoint[]>(
    () => (curve ? curve.dates.map((d, i) => ({ label: d, value: curve.twr[i] })) : []),
    [curve],
  )
  const benchPoints = useMemo<TrendPoint[]>(
    () => (curve && curve.bench ? curve.dates.map((d, i) => ({ label: d, value: curve.bench![i] })) : []),
    [curve],
  )

  const flow = useMemo(() => {
    const stockBuy = (actions ?? [])
      .filter((a) => a.action_type === 'BUY')
      .reduce((s, a) => s + a.price * a.shares, 0)
    const stockSell = (actions ?? [])
      .filter((a) => a.action_type === 'SELL')
      .reduce((s, a) => s + a.price * a.shares, 0)
    // 基金流水：amount 即金额（含费），BUY/ADD 计入买入，REDEEM 计入卖出
    const fundBuy = (fundActions ?? [])
      .filter((a) => a.action_type === 'BUY' || a.action_type === 'ADD')
      .reduce((s, a) => s + (a.amount || 0), 0)
    const fundSell = (fundActions ?? [])
      .filter((a) => a.action_type === 'REDEEM')
      .reduce((s, a) => s + (a.amount || 0), 0)
    return { buy: stockBuy + fundBuy, sell: stockSell + fundSell }
  }, [actions, fundActions])

  // 全部流水（A股 + 基金）用于「流水笔数 / 交易日」统计
  const allActions = useMemo(
    () => [...(actions ?? []), ...(fundActions ?? [])],
    [actions, fundActions],
  )

  const brokerCount = useMemo(
    () => new Set((holdings ?? []).map((h) => h.broker).filter(Boolean)).size,
    [holdings],
  )

  const openAssetCount = useMemo(() => (assets ?? []).filter((a) => !a.closed).length, [assets])

  const loading = holdings === null
  const empty = holdings !== null && holdings.length === 0 && openAssetCount === 0
  const liveIndices = (indices ?? []).map(readIndex).filter((r) => !Number.isNaN(r.price))

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Hero ──────────────────────────────────────────────
          记忆点：一个大到近乎失礼的数字浮在漂移光晕上。
          全页只有这一处用 display 级字号，落差本身就是层级。 */}
      <section className="relative pt-4 pb-8 sm:pt-8 sm:pb-12 overflow-hidden">
        <Glow />
        <div className="relative">
          <p className="text-micro font-medium text-ink-faint tracking-wide">
            {todayLabel()} · {greeting()}
            {user ? `，${nickname(user.email)}` : ''}
          </p>

          {loading ? (
            <Skeleton className="mt-3 h-[clamp(2rem,5.5vw,3.25rem)] w-64 rounded-2xl" />
          ) : (
            <h1 className="mt-2 text-metric font-semibold tnum leading-none">
              <span className="text-[0.42em] align-top mr-1 font-normal text-ink-soft">¥</span>
              <CountUp value={totalCost} decimals={0} />
            </h1>
          )}

          <p className="mt-3 text-caption text-ink-soft">
            累计投入成本 · 覆盖{' '}
            {loading ? '—' : fmtNum((holdings?.length ?? 0) + openAssetCount)} 只标的
          </p>

          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
            <Stat label="流水笔数" value={loading ? null : allActions.length} />
            <Stat
              label="交易日"
              value={loading ? null : new Set(allActions.map((a) => dateOnly(a.trade_date))).size}
            />
            <Stat label="关联券商" value={loading ? null : brokerCount} />
            {hasQuote && !loading && (
              <>
                <div>
                  <dt className="text-micro text-ink-faint">组合市值</dt>
                  <dd className="mt-0.5 text-title-2 font-semibold tnum leading-none">
                    ¥{fmtMoney(totalMarketValue, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-micro text-ink-faint">浮动盈亏</dt>
                  <dd
                    className={`mt-0.5 text-title-2 font-semibold tnum leading-none ${
                      totalPnL >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {totalPnL >= 0 ? '+' : ''}¥{fmtMoney(totalPnL, 0)}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button icon={<Plus size={18} weight="bold" />} onClick={() => navigate('/portfolio')}>
              记一笔交易
            </Button>
            <Button
              variant="secondary"
              icon={<ChatCircle size={18} weight="duotone" />}
              onClick={() => navigate('/ask')}
            >
              问问市场
            </Button>
          </div>
        </div>
      </section>

      {/* ── 大盘指数：拿到数据才渲染，拿不到就当它不存在 ──
          比放一张「暂无数据」的空卡片体面得多。
          移动端用横向 snap 滚动条，不挤压成两列小方块。 */}
      {liveIndices.length > 0 && (
        <Reveal>
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
            {liveIndices.map((r, i) => {
              const up = r.pct >= 0
              return (
                <div
                  key={i}
                  className="snap-start shrink-0 w-[46%] sm:w-auto sm:flex-1 rounded-tile bg-surface ring-card shadow-card px-4 py-3.5"
                >
                  <p className="text-micro text-ink-soft truncate">{r.name}</p>
                  <p className="mt-1 text-title-3 font-semibold tnum">{fmtNum(r.price, 2)}</p>
                  <p className={`mt-0.5 text-micro font-semibold tnum ${up ? 'text-up' : 'text-down'}`}>
                    {Number.isNaN(r.pct) ? '—' : `${up ? '+' : ''}${r.pct.toFixed(2)}%`}
                  </p>
                </div>
              )
            })}
          </div>
        </Reveal>
      )}

      {/* ── Bento 网格 ────────────────────────────────────────
          ⚠️ col-span 必须加在 grid 的直接子元素上。
          之前把它写在 Card 上、外面又包了一层 Reveal 的 motion.div，
          于是跨列从来没生效过 —— 现在统一交给 Reveal 的 className。 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* 组合净值曲线 TWR */}
        <Reveal className="lg:col-span-2" delay={0.05}>
          <Card className="h-full flex flex-col">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-title-3 font-semibold">组合净值</h2>
                <p className="mt-1 text-micro text-ink-faint">
                  时间加权收益（TWR），出入金已剥离 · 与基金净值同口径
                </p>
              </div>
              {curve && (
                <div className="flex items-baseline gap-2 shrink-0">
                  <span
                    className={`text-title-2 font-semibold tnum ${
                      curve.metrics.return_pct >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {curve.metrics.return_pct >= 0 ? '+' : ''}
                    {curve.metrics.return_pct.toFixed(2)}%
                  </span>
                  <span className="text-micro text-ink-faint">区间收益</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex-1 flex flex-col justify-end">
              {curve === undefined ? (
                <Skeleton className="h-[200px] w-full rounded-tile" />
              ) : !curve.dates || curve.dates.length < 2 ? (
                <EmptyState
                  compact
                  icon={<ChartLineUp size={28} weight="duotone" />}
                  title="暂无可绘制的净值"
                  description={curve.note || '记录第一笔买入后这里就会出现净值曲线。'}
                />
              ) : (
                <div className="w-full">
                  <AreaTrend
                    data={twrPoints}
                    compare={benchPoints.length ? benchPoints : undefined}
                    height={200}
                  />
                  <div className="mt-2 flex items-center justify-between text-micro text-ink-faint tnum">
                    <span>{curve.dates[0]}</span>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-0.5 rounded-full bg-accent" /> 净值
                      </span>
                      {curve.bench_name && (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-3 h-0.5 rounded-full bg-ink-faint" /> {curve.bench_name}
                        </span>
                      )}
                    </div>
                    <span>{curve.dates[curve.dates.length - 1]}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Metric
                      label="区间收益"
                      value={`${curve.metrics.return_pct >= 0 ? '+' : ''}${curve.metrics.return_pct.toFixed(2)}%`}
                      tone={curve.metrics.return_pct >= 0 ? 'up' : 'down'}
                    />
                    <Metric label="最大回撤" value={`${curve.metrics.max_drawdown_pct.toFixed(2)}%`} />
                    {curve.metrics.bench_return_pct !== undefined && curve.metrics.bench_return_pct !== null && (
                      <Metric
                        label={`${curve.bench_name ?? '基准'}收益`}
                        value={`${curve.metrics.bench_return_pct >= 0 ? '+' : ''}${curve.metrics.bench_return_pct.toFixed(2)}%`}
                      />
                    )}
                    {curve.metrics.excess_pct !== undefined && curve.metrics.excess_pct !== null && (
                      <Metric
                        label="超额"
                        value={`${curve.metrics.excess_pct >= 0 ? '+' : ''}${curve.metrics.excess_pct.toFixed(2)}%`}
                        tone={curve.metrics.excess_pct >= 0 ? 'up' : 'down'}
                      />
                    )}
                  </div>

                  {curve.metrics.basis === 'cost' && (
                    <p className="mt-3 text-micro text-ink-faint leading-snug">
                      当前为成本基线口径（无实时行情时按投入成本计），接入行情后自动升级为市值口径。
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </Reveal>

        {/* 持仓分布 */}
        <Reveal delay={0.1}>
          <Card className="h-full">
            <h2 className="text-title-3 font-semibold">持仓分布</h2>
            <p className="mt-1 text-micro text-ink-faint">按板块 · 成本口径</p>

            {loading ? (
              <div className="mt-6 flex justify-center">
                <Skeleton className="h-[168px] w-[168px] rounded-full" />
              </div>
            ) : slices.length === 0 ? (
              <EmptyState compact title="暂无持仓" description="记录第一笔买入后这里会出现分布环。" />
            ) : (
              <div className="mt-5 flex flex-col items-center gap-5">
                <div className="relative">
                  <Donut data={slices} />
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-title-2 font-semibold tnum leading-none">{slices.length}</p>
                      <p className="mt-1 text-micro text-ink-faint">类</p>
                    </div>
                  </div>
                </div>
                <ul className="w-full space-y-2">
                  {slices.map((s, i) => (
                    <li key={s.label} className="flex items-center gap-2 text-micro">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 bg-accent"
                        style={{ opacity: Math.max(0.22, 1 - i * 0.18) }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-ink-soft">{s.label}</span>
                      <span className="ml-auto tnum font-medium shrink-0">
                        {totalCost > 0 ? Math.round((s.value / totalCost) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </Reveal>

        {/* 我的持仓 */}
        <Reveal className="lg:col-span-2" delay={0.15}>
          <Card className="h-full" padded={false}>
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6">
              <h2 className="text-title-3 font-semibold inline-flex items-center gap-2">
                <Wallet size={19} weight="duotone" className="text-ink-faint" />
                我的持仓
              </h2>
              <button
                onClick={() => navigate('/portfolio')}
                className="min-h-11 -mr-2 px-2 text-caption text-accent font-medium inline-flex items-center gap-1"
              >
                全部 <ArrowRight size={15} weight="bold" />
              </button>
            </div>

            {loading ? (
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 space-y-2">
                <Skeleton className="h-14 rounded-tile" />
                <Skeleton className="h-14 rounded-tile" />
              </div>
            ) : empty ? (
              <div className="pb-4">
                <EmptyState
                  compact
                  icon={<Wallet size={28} weight="duotone" />}
                  title="还没有持仓"
                  description="把第一笔买入记下来，之后的成本、分布、趋势都会自动算。"
                  action={
                    <Button
                      icon={<Plus size={18} weight="bold" />}
                      onClick={() => navigate('/portfolio')}
                    >
                      记一笔交易
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="mt-2 px-2 sm:px-3 pb-3 sm:pb-4">
                {/* A 股持仓 */}
                {(holdings ?? []).slice(0, 5).map((h) => {
                  const q: Quote | undefined = quotes[h.stock_code]
                  const costValue = h.shares * h.cost_price
                  const mv = q ? q.price * h.shares : costValue
                  const pnl = q ? mv - costValue : 0
                  const pct = q && costValue > 0 ? (pnl / costValue) * 100 : 0
                  return (
                  <li key={h.id}>
                    <button
                      onClick={() => navigate('/portfolio')}
                      className="w-full min-h-[3.5rem] flex items-center justify-between gap-3 rounded-tile px-3 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {h.stock_name || h.stock_code}
                        </span>
                        <span className="block text-micro text-ink-faint tnum">
                          {h.stock_code}
                          {h.broker ? ` · ${h.broker}` : ''}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-medium tnum">
                          ¥{fmtMoney(mv, 0)}
                        </span>
                        {q ? (
                          <span
                            className={`block text-micro font-semibold tnum ${
                              pnl >= 0 ? 'text-up' : 'text-down'
                            }`}
                          >
                            {pnl >= 0 ? '+' : ''}¥{fmtMoney(pnl, 0)}（
                            {pnl >= 0 ? '+' : ''}
                            {fmtNum(pct, 2)}%）
                          </span>
                        ) : (
                          <span className="block text-micro text-ink-faint tnum">
                            {fmtNum(h.shares)} 股 @ {fmtMoney(h.cost_price)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                  )
                })}
                {/* 场外资产（基金等） */}
                {(assets ?? [])
                  .filter((a) => !a.closed)
                  .slice(0, 4)
                  .map((a) => {
                    const nav = fundNavs[a.code]
                    const mv =
                      a.manual_value != null
                        ? a.manual_value
                        : nav && a.shares
                          ? nav.unit_nav * a.shares
                          : a.cost_amount || 0
                    const pnl = mv - (a.cost_amount || 0)
                    const pct = a.cost_amount > 0 ? (pnl / a.cost_amount) * 100 : 0
                    const hasEst = a.manual_value != null || (nav && a.shares)
                    return (
                    <li key={`a${a.id}`}>
                      <button
                        onClick={() => navigate('/portfolio?view=funds')}
                        className="w-full min-h-[3.5rem] flex items-center justify-between gap-3 rounded-tile px-3 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{a.name || a.code}</span>
                          <span className="block text-micro text-ink-faint tnum">
                            {a.code}
                            {a.platform ? ` · ${a.platform}` : ''}
                            {a.shares ? ` · ${fmtNum(a.shares)} 份` : ''}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-medium tnum">¥{fmtMoney(mv, 0)}</span>
                          {hasEst ? (
                            <span
                              className={`block text-micro font-semibold tnum ${
                                pnl >= 0 ? 'text-up' : 'text-down'
                              }`}
                            >
                              {pnl >= 0 ? '+' : ''}¥{fmtMoney(pnl, 0)}（
                              {pnl >= 0 ? '+' : ''}
                              {fmtNum(pct, 2)}%）
                            </span>
                          ) : (
                            <span className="block text-micro text-ink-faint tnum">
                              成本 ¥{fmtMoney(a.cost_amount || 0, 0)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                    )
                  })}
              </ul>
            )}
          </Card>
        </Reveal>

        {/* 资金流向 + 快捷入口 */}
        <Reveal delay={0.2}>
          <div className="h-full flex flex-col gap-4 sm:gap-5">
            <Card>
              <h2 className="text-title-3 font-semibold inline-flex items-center gap-2">
                <Receipt size={19} weight="duotone" className="text-ink-faint" />
                资金流向
              </h2>
              {actions === null ? (
                <Skeleton className="mt-5 h-12 rounded-tile" />
              ) : flow.buy + flow.sell === 0 ? (
                <p className="mt-4 text-caption text-ink-soft">还没有成交记录。</p>
              ) : (
                <>
                  <div className="mt-4 flex items-baseline gap-4">
                    <div>
                      <p className="text-micro text-ink-faint">买入</p>
                      <p className="text-title-3 font-semibold tnum text-up">
                        ¥{fmtMoney(flow.buy, 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-micro text-ink-faint">卖出</p>
                      <p className="text-title-3 font-semibold tnum text-down">
                        ¥{fmtMoney(flow.sell, 0)}
                      </p>
                    </div>
                  </div>
                  <BarSpread
                    className="mt-4"
                    segments={[
                      { label: '买入', value: flow.buy, tone: 'up' },
                      { label: '卖出', value: flow.sell, tone: 'down' },
                    ]}
                  />
                </>
              )}
            </Card>

            <Card className="flex-1">
              <h2 className="text-title-3 font-semibold">快捷入口</h2>
              <div className="mt-4 space-y-2">
                <QuickAction
                  icon={<Storefront size={18} weight="duotone" />}
                  label="券商费率"
                  onClick={() => navigate('/brokers')}
                />
                <QuickAction
                  icon={<ChatCircle size={18} weight="duotone" />}
                  label="问问市场"
                  onClick={() => navigate('/ask')}
                />
              </div>
            </Card>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-micro text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-title-2 font-semibold tnum leading-none">
        {value === null ? '—' : fmtNum(value)}
      </dd>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full min-h-12 flex items-center gap-3 rounded-tile bg-surface-2 px-4 py-3 text-left
                 transition-[background-color,transform] duration-200 hover:bg-surface-3 active:scale-[0.99]"
    >
      <span className="text-accent">{icon}</span>
      <span className="font-medium text-caption">{label}</span>
      <ArrowUpRight size={16} className="ml-auto text-ink-faint" />
    </button>
  )
}
