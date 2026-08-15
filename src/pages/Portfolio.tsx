import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, ListPlus, Plus, Trash, ChartLine, ClockCounterClockwise, Info, PencilSimple } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { portfolio, brokers as brokerApi, accounts as accountApi, ApiError } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useQuotes } from '../lib/useQuotes'
import { useSettings } from '../lib/settings'
import { useToasts } from '../lib/toast'
import type { Action, ActionType, Broker, DividendEvent, Holding, Quote, Account } from '../lib/types'
import { AssetsView } from './Assets'
import { StrategyView } from './Strategy'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Reveal } from '../components/motion/Reveal'
import { PageHeader } from '../components/layout/PageHeader'
import { fmtMoney, fmtNum, dateOnly } from '../lib/format'

const actionLabels: Record<ActionType, string> = {
  BUY: '买入',
  SELL: '卖出',
  ADD: '增股',
  BONUS: '送转',
  DIVIDEND: '分红',
}

/**
 * 每种动作的表单语义都不一样，与其在 JSX 里堆三元表达式，不如把差异集中到一张表：
 *  - priceLabel  价格字段到底代表什么（送转没有价格，分红是"每股派息"）
 *  - sharesLabel 股数字段的含义（分红填的是"参与分红的股数"）
 *  - lockPrice   价格是否强制为 0（送转必须为 0，否则 FIFO 会当成有成本的批次，摊薄失效）
 *  - hint        一句话解释这个动作会对账本做什么
 */
const actionSpec: Record<
  ActionType,
  { priceLabel: string; sharesLabel: string; lockPrice?: boolean; hint?: string }
> = {
  BUY: { priceLabel: '买入价', sharesLabel: '股数' },
  SELL: { priceLabel: '卖出价', sharesLabel: '股数' },
  ADD: { priceLabel: '成本价', sharesLabel: '股数', hint: '人工补录一批已有持仓。' },
  BONUS: {
    priceLabel: '价格',
    sharesLabel: '送转得到的股数',
    lockPrice: true,
    hint: '送股/转增按 0 成本入账，股数变大、总投入不变，成本会被自动摊薄。',
  },
  DIVIDEND: {
    priceLabel: '每股派息',
    sharesLabel: '参与分红的股数',
    hint: '现金分红计入已实现收益，不改变股数。记了这笔就不会再用除权事件摊薄成本，避免同一笔钱算两次。',
  },
}

const today = () => new Date().toISOString().slice(0, 10)

export default function Portfolio() {
  const api = useApi()
  const toast = useToasts()
  const { settings, update: updateSettings } = useSettings()

  // A股 / 基金 / 策略 视图切换：读 URL ?view=funds|strategy
  const [searchParams, setSearchParams] = useSearchParams()
  const rawView = searchParams.get('view')
  const view: 'stocks' | 'funds' | 'strategy' = rawView === 'funds' ? 'funds' : rawView === 'strategy' ? 'strategy' : 'stocks'
  const switchView = (v: 'stocks' | 'funds' | 'strategy') => {
    setSearchParams(v === 'stocks' ? {} : { view: v }, { replace: true })
  }

  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  // 初始打开设置里选定的「默认账户」，没设过则为全部
  const [activeAccount, setActiveAccount] = useState<number | null>(
    settings.defaultAccount ?? null,
  )
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, Action[]>>({})
  const [loadingCode, setLoadingCode] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [presetCode, setPresetCode] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ code: string; action: Action } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 账户管理
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [pendingAccountDelete, setPendingAccountDelete] = useState<Account | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)

  const load = () => {
    void api(() => portfolio.listHoldings(activeAccount))
      .then(setHoldings)
      .catch(() => setHoldings([]))
    void api(() => brokerApi.list())
      .then(setBrokers)
      .catch(() => setBrokers([]))
    void api(() => accountApi.list())
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }
  useEffect(load, [api, activeAccount])

  // 切换账户 Tab 时同步写回设置，下次打开持仓记住选择
  const selectAccount = (id: number | null) => {
    setActiveAccount(id)
    updateSettings({ defaultAccount: id })
  }

  const confirmDeleteAccount = async () => {
    if (!pendingAccountDelete) return
    setDeletingAccount(true)
    try {
      await api(() => accountApi.remove(pendingAccountDelete.id))
      toast.success('账户已删除')
      if (activeAccount === pendingAccountDelete.id) selectAccount(null)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setDeletingAccount(false)
      setPendingAccountDelete(null)
    }
  }

  const totalCost = useMemo(
    () => (holdings ?? []).reduce((s, h) => s + h.shares * h.cost_price, 0),
    [holdings],
  )
  // 累计分红 = 手工分红流水的收入 + 除权事件摊掉的金额。
  // 两者互斥（后端保证），所以直接相加不会双计。
  const totalDividend = useMemo(
    () =>
      (holdings ?? []).reduce(
        (s, h) => s + (h.income_realized ?? 0) + (h.dividend_per_share ?? 0) * h.shares,
        0,
      ),
    [holdings],
  )

  // 实时行情：按持仓代码批量拉报价，无源时优雅降级为 {}（前端显示「暂无行情」）。
  const holdingCodes = useMemo(() => (holdings ?? []).map((h) => h.stock_code), [holdings])
  const quotes = useQuotes(holdingCodes)

  // 市值口径汇总：有报价的用市价，没有的回落成本（绝不以假数据充市值）。
  const totalMarketValue = useMemo(
    () =>
      (holdings ?? []).reduce(
        (s, h) => s + (quotes[h.stock_code] ? quotes[h.stock_code].price * h.shares : h.shares * h.cost_price),
        0,
      ),
    [holdings, quotes],
  )
  const hasQuote = useMemo(() => (holdings ?? []).some((h) => quotes[h.stock_code]), [holdings, quotes])

  // 今日盈亏 = Σ((现价-昨收) × 持仓股数)
  const todayPnl = useMemo(
    () =>
      (holdings ?? []).reduce((s, h) => {
        const q = quotes[h.stock_code]
        if (!q) return s
        return s + (q.price - q.prev_close) * h.shares
      }, 0),
    [holdings, quotes],
  )

  const toggle = (code: string) => {
    setExpanded((cur) => {
      const next = cur === code ? null : code
      if (next && !actions[next]) {
        setLoadingCode(next)
        void api(() => portfolio.listActions(next))
          .then((list) => setActions((m) => ({ ...m, [next]: list })))
          .catch(() => setActions((m) => ({ ...m, [next]: [] })))
          .finally(() => setLoadingCode(null))
      }
      return next
    })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { code, action } = pendingDelete
    setDeleting(true)
    void api(() => portfolio.deleteAction(action.id))
      .then(() => {
        setActions((m) => ({ ...m, [code]: (m[code] || []).filter((a) => a.id !== action.id) }))
        toast.success('流水已删除')
        load()
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '删除失败'))
      .finally(() => {
        setDeleting(false)
        setPendingDelete(null)
      })
  }

  const openAdd = (code = '') => {
    setPresetCode(code)
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* ===== 顶栏：标题 + 操作 + 视图切换 ===== */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-title-1 font-bold tracking-tight">
          {view === 'funds' ? '基金持仓' : view === 'strategy' ? '策略' : '持仓'}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {view === 'stocks' && (
            <Button icon={<Plus size={18} weight="bold" />} onClick={() => openAdd()} size="sm">
              记一笔
            </Button>
          )}
          <button
            onClick={() => switchView('stocks')}
            aria-pressed={view === 'stocks'}
            className={`min-h-9 px-4 rounded-full text-caption font-semibold transition-colors ${
              view === 'stocks' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
            }`}
          >
            A股
          </button>
          <button
            onClick={() => switchView('funds')}
            aria-pressed={view === 'funds'}
            className={`min-h-9 px-4 rounded-full text-caption font-semibold transition-colors ${
              view === 'funds' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
            }`}
          >
            基金
          </button>
          <button
            onClick={() => switchView('strategy')}
            aria-pressed={view === 'strategy'}
            className={`min-h-9 px-4 rounded-full text-caption font-semibold transition-colors ${
              view === 'strategy' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
            }`}
          >
            策略
          </button>
        </div>
      </div>

      {/* 账户 Tab 栏：仅基金视图需要分类 */}
      {view === 'funds' && accounts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => selectAccount(null)}
            className={`shrink-0 px-4 py-2 rounded-full text-caption font-medium transition-colors ${
              activeAccount === null
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
            }`}
          >
            全部
          </button>
          {accounts.map((a) => (
            <div key={a.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => selectAccount(a.id)}
                className={`flex items-center gap-1 pl-4 pr-7 py-2 rounded-full text-caption font-medium transition-colors ${
                  activeAccount === a.id
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
                }`}
              >
                {a.name}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPendingAccountDelete(a) }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-danger/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] leading-none"
                title={`删除「${a.name}」`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setEditingAccount(null); setAccountModalOpen(true) }}
            className="shrink-0 min-h-9 px-3 py-2 rounded-full text-caption font-medium text-accent border border-dashed border-line hover:border-accent/50 transition-colors"
          >
            + 新建账户
          </button>
        </div>
      )}

      {view === 'strategy' ? (
        <StrategyView />
      ) : view === 'funds' ? (
        <AssetsView />
      ) : (
        <>
      {/* ===== A股视图 ===== */}

      {/* 汇总条：一行关键指标，对齐老版顶栏风格 */}
      {holdings && holdings.length > 0 && (
        <Reveal delay={0.03}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Metric label="总资产" value={`¥${fmtMoney(totalMarketValue, 0)}`} highlight />
            <Metric label="持仓成本" value={`¥${fmtMoney(totalCost, 0)}`} />
            <Metric
              label="浮动盈亏"
              value={`${totalMarketValue - totalCost >= 0 ? '+' : ''}¥${fmtMoney(totalMarketValue - totalCost, 0)}`}
              valueClass={totalMarketValue - totalCost >= 0 ? 'text-up' : 'text-down'}
              sub={totalCost > 0 ? `${totalMarketValue - totalCost >= 0 ? '+' : ''}${fmtNum(((totalMarketValue - totalCost) / totalCost) * 100, 2)}%` : undefined}
            />
            <Metric label="标的数" value={String(holdings.length)} />
            {totalDividend > 0 && (
              <Metric label="累计分红" value={`¥${fmtMoney(totalDividend, 0)}`} valueClass="text-up" />
            )}
            {hasQuote && (
              <Metric
                label="今日盈亏"
                value={fmtMoney(todayPnl, 0)}
                valueClass={todayPnl >= 0 ? 'text-up' : 'text-down'}
              />
            )}
          </div>
        </Reveal>
      )}

      {/* 总览卡：左侧核心数字 + 右侧资产配置环形图 */}
      {holdings && holdings.length > 0 && (
        <Reveal delay={0.06}>
          <div className="rounded-tile bg-surface ring-card shadow-card p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-6">
            {/* 左侧：核心数字 */}
            <div className="flex-1 min-w-0 space-y-4">
              <div>
                <p className="text-micro text-ink-faint">持仓总览</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-display font-bold tnum">¥{fmtMoney(totalMarketValue, 0)}</span>
                  {totalCost > 0 && (
                    <span className={`text-caption font-semibold tnum ${totalMarketValue - totalCost >= 0 ? 'text-up' : 'text-down'}`}>
                      {totalMarketValue - totalCost >= 0 ? '+' : ''}¥{fmtMoney(totalMarketValue - totalCost, 0)}
                      {' '}({totalMarketValue - totalCost >= 0 ? '+' : ''}{fmtNum(((totalMarketValue - totalCost) / totalCost) * 100, 2)}%)
                    </span>
                  )}
                </div>
                <p className="mt-1 text-micro text-ink-soft tnum">
                  成本 ¥{fmtMoney(totalCost, 0)} · 标的 {holdings.length} 只
                </p>
              </div>
            </div>

            {/* 右侧：资产配置环形图 */}
            <AllocationDonut holdings={holdings} quotes={quotes} totalMarketValue={totalMarketValue} />
          </div>
        </Reveal>
      )}

      {holdings === null ? (
        <div className="space-y-3">
          <Skeleton className="h-[4.5rem] rounded-card" />
          <Skeleton className="h-[4.5rem] rounded-card" />
        </div>
      ) : holdings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListPlus size={30} weight="duotone" />}
            title="还没有持仓"
            description="录入第一笔买入后，成本、分布和趋势都会自动算出来。"
            action={
              <Button icon={<Plus size={18} weight="bold" />} onClick={() => openAdd()}>
                记一笔交易
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="rounded-tile bg-surface ring-card shadow-card overflow-hidden">
          {/* 表头 */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-surface-2/60 text-[11px] text-ink-faint font-medium border-b border-line-soft">
            <span className="col-span-3">名称 / 代码</span>
            <span className="col-span-2 text-right">持仓市值</span>
            <span className="col-span-2 text-right">成本</span>
            <span className="col-span-1 text-right">盈亏</span>
            <span className="col-span-1 text-right">今日</span>
            <span className="col-span-1 text-right">仓位</span>
            <span className="col-span-2 text-right">操作</span>
          </div>

          {holdings.map((h, i) => {
            const open = expanded === h.stock_code
            const list = actions[h.stock_code]
            const q: Quote | undefined = quotes[h.stock_code]
            const costValue = h.shares * h.cost_price
            const marketValue = q ? q.price * h.shares : costValue
            const pnl = q ? marketValue - costValue : 0
            const pnlPct = q && costValue > 0 ? (pnl / costValue) * 100 : 0
            const todayChange = q ? ((q.price - q.prev_close) / q.prev_close) * 100 : 0
            const todayVal = q ? (q.price - q.prev_close) * h.shares : 0
            const posPct = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0

            return (
              <Reveal key={h.id} delay={Math.min(i * 0.03, 0.15)}>
                <div className={`${open ? 'bg-accent/5' : ''}`}>
                  <button
                    onClick={() => toggle(h.stock_code)}
                    aria-expanded={open}
                    className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-left items-center transition-colors hover:bg-surface-2/40 active:bg-surface-2 sm:grid-cols-12"
                  >
                    {/* 名称+代码 */}
                    <div className="col-span-12 sm:col-span-3 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">{h.stock_name || h.stock_code}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
                        <span className="tnum">{h.stock_code}</span>
                        {q && (
                          <span className={`tnum ${todayChange >= 0 ? 'text-up' : 'text-down'}`}>
                            {todayChange >= 0 ? '+' : ''}{fmtNum(todayChange, 2)}%
                          </span>
                        )}
                      </div>
                      {((h.dividend_per_share ?? 0) > 0 || (h.income_realized ?? 0) > 0) && (
                        <div className="mt-1 flex flex-wrap gap-x-2">
                          {(h.dividend_per_share ?? 0) > 0 && (
                            <span className="text-[10px] text-up tnum" title={`原始成本 ${fmtMoney(h.cost_price_raw ?? 0)}，摊薄后 ${fmtMoney(h.cost_price)}`}>
                              除权摊薄 −{fmtMoney(h.dividend_per_share ?? 0)}/股
                            </span>
                          )}
                          {(h.income_realized ?? 0) > 0 && (
                            <span className="text-[10px] text-up tnum">已收分红 ¥{fmtMoney(h.income_realized ?? 0, 0)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 市值 */}
                    <div className="hidden sm:flex col-span-2 flex-col items-end justify-center">
                      <span className="text-sm font-semibold tnum">¥{fmtMoney(marketValue, 0)}</span>
                      <span className="text-[10px] text-ink-faint tnum">{fmtNum(h.shares, 0)}股</span>
                    </div>

                    {/* 成本 */}
                    <div className="hidden sm:flex col-span-2 flex-col items-end justify-center">
                      <span className="text-sm tnum">¥{fmtMoney(costValue, 0)}</span>
                      <span className="text-[10px] text-ink-faint tnum">@{fmtMoney(h.cost_price)}</span>
                    </div>

                    {/* 盈亏 */}
                    <div className="hidden sm:flex col-span-1 flex-col items-end justify-center">
                      {q ? (
                        <>
                          <span className={`text-sm font-semibold tnum ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                            {pnl >= 0 ? '+' : ''}{fmtNum(pnlPct, 1)}%
                          </span>
                          <span className={`text-[10px] tnum ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                            {pnl >= 0 ? '+' : ''}¥{fmtMoney(pnl, 0)}
                          </span>
                        </>
                      ) : <span className="text-[10px] text-ink-faint">—</span>}
                    </div>

                    {/* 今日 */}
                    <div className="hidden sm:flex col-span-1 flex-col items-end justify-center">
                      {q ? (
                        <span className={`text-sm font-medium tnum ${todayVal >= 0 ? 'text-up' : 'text-down'}`}>
                          {todayVal >= 0 ? '+' : ''}¥{fmtMoney(todayVal, 0)}
                        </span>
                      ) : <span className="text-[10px] text-ink-faint">—</span>}
                    </div>

                    {/* 仓位 */}
                    <div className="hidden sm:flex col-span-1 flex-col items-end justify-center">
                      <span className="text-sm tnum">{fmtNum(posPct, 1)}%</span>
                      <div className="mt-1 w-full h-1 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.min(posPct, 100)}%` }} />
                      </div>
                    </div>

                    {/* 操作：K线 / 历史 / 详情 / 编辑 + 展开箭头 */}
                    <div className="hidden sm:flex col-span-2 items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); toast.info('K 线图开发中') }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="K 线图"
                      >
                        K 线
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggle(h.stock_code) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="交易历史"
                      >
                        历史
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toast.info('个股详情开发中') }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="详情"
                      >
                        详情
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAdd(h.stock_code) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="编辑持仓"
                      >
                        编辑
                      </button>
                      <CaretDown size={16} className={`text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </div>

                    {/* 移动端汇总 */}
                    <div className="flex sm:hidden col-span-12 items-center justify-between mt-1 pt-2 border-t border-line-soft/50">
                      <div className="flex gap-4">
                        <div><p className="text-[10px] text-ink-faint">市值</p><p className="text-sm font-semibold tnum">¥{fmtMoney(marketValue, 0)}</p></div>
                        <div><p className="text-[10px] text-ink-faint">盈亏</p><p className={`text-sm font-semibold tnum ${pnl >= 0 ? 'text-up' : 'text-down'}`}>{q ? `${pnl >= 0 ? '+' : ''}${fmtNum(pnlPct, 1)}%` : '—'}</p></div>
                        <div><p className="text-[10px] text-ink-faint">仓位</p><p className="text-sm tnum">{fmtNum(posPct, 1)}%</p></div>
                      </div>
                      <CaretDown size={16} className={`text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* 展开区 */}
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                        <div className="border-t border-line-soft px-4 py-3 bg-surface-2/30 space-y-3">
                          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                            <span className="text-ink-faint">现价 <b className="text-ink tnum">{q ? fmtMoney(q.price) : '—'}</b></span>
                            <span className="text-ink-faint">成本价 <b className="text-ink tnum">{fmtMoney(h.cost_price)}</b></span>
                            <span className="text-ink-faint">持仓 <b className="text-ink tnum">{fmtNum(h.shares, 0)} 股</b></span>
                            {h.broker && <span className="text-ink-faint">券商 <b className="text-ink">{h.broker}</b></span>}
                          </div>
                          {loadingCode === h.stock_code ? (
                            <Skeleton className="h-14 rounded-tile" />
                          ) : (list ?? []).length === 0 ? (
                            <p className="py-2 text-caption text-ink-soft">该持仓暂无流水记录。</p>
                          ) : (
                            <ul className="divide-y divide-line-soft/50">
                              {(list ?? []).map((a) => (
                                <ActionRow key={a.id} action={a} onDelete={() => setPendingDelete({ code: h.stock_code, action: a })} />
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-3 pt-1">
                            <button onClick={() => openAdd(h.stock_code)} className="min-h-9 inline-flex items-center gap-1.5 px-3 text-caption text-accent font-medium rounded-lg hover:bg-accent/10 transition-colors">
                              <Plus size={14} weight="bold" /> 添加流水
                            </button>
                          </div>
                          <DividendPanel code={h.stock_code} suppressed={(h.income_realized ?? 0) > 0} onChanged={load} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}

      <AddActionModal
        open={modalOpen}
        brokers={brokers}
        accounts={accounts}
        presetCode={presetCode}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false)
          setActions({})
          setExpanded(null)
          toast.success('交易已记录')
          load()
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title="删除这笔流水？"
        description={
          pendingDelete
            ? `${actionLabels[pendingDelete.action.action_type]} ${fmtNum(
                pendingDelete.action.shares,
              )} 股 @ ${fmtMoney(pendingDelete.action.price)}。删除后持仓成本会立即重算，且不可撤销。`
            : undefined
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!pendingAccountDelete}
        busy={deletingAccount}
        title="删除账户？"
        description={
          pendingAccountDelete
            ? `确定删除「${pendingAccountDelete.name}」？关联的持仓会变为未归类。`
            : undefined
        }
        onCancel={() => setPendingAccountDelete(null)}
        onConfirm={confirmDeleteAccount}
      />

      <AccountModal
        open={accountModalOpen}
        account={editingAccount}
        onClose={() => setAccountModalOpen(false)}
        onSaved={() => {
          setAccountModalOpen(false)
          load()
        }}
      />
        </>
      )}
    </div>
  )
}

/**
 * 单条流水。
 *
 * 这里刻意没有用「桌面表格 / 移动卡片」两套 DOM —— 表格在窄屏必然横向
 * 溢出，而两套 DOM 又意味着两份要同步维护的标记。改成一行 flex：
 * 主信息（价格 × 股数）永远在左，金额在宽屏才出现，删除按钮固定 44px。
 */
function ActionRow({ action, onDelete }: { action: Action; onDelete: () => void }) {
  const t = action.action_type
  const tone = t === 'BUY' ? 'up' : t === 'SELL' ? 'down' : 'neutral'

  // 送转没有价格，写成 "0.00 × 300 股" 只会让人困惑；
  // 分红的"价格"是每股派息，得标出来，不然会被当成成交价。
  const detail =
    t === 'BONUS'
      ? `送转入账 ${fmtNum(action.shares)} 股（0 成本）`
      : t === 'DIVIDEND'
        ? `每股派 ${fmtMoney(action.price)} × ${fmtNum(action.shares)} 股`
        : `${fmtMoney(action.price)} × ${fmtNum(action.shares)} 股`

  return (
    <li className="flex items-center gap-3 py-2.5 border-t border-line-soft/70 first:border-t-0">
      <span className="shrink-0 w-11">
        <Badge tone={tone}>{actionLabels[action.action_type]}</Badge>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-caption font-medium tnum">{detail}</p>
        <p className="text-micro text-ink-faint tnum truncate">
          {dateOnly(action.trade_date)}
          {action.broker ? ` · ${action.broker}` : ''}
          {action.note ? ` · ${action.note}` : ''}
        </p>
      </div>

      <span className="hidden sm:block shrink-0 text-caption tnum text-ink-soft">
        {t === 'BONUS' ? '—' : `¥${fmtMoney(action.price * action.shares, 0)}`}
      </span>

      <button
        onClick={onDelete}
        className="shrink-0 w-11 h-11 grid place-items-center rounded-full text-ink-faint
                   transition-colors hover:text-danger hover:bg-danger/10"
        aria-label={`删除 ${dateOnly(action.trade_date)} 的流水`}
      >
        <Trash size={17} />
      </button>
    </li>
  )
}

/**
 * 除权事件面板。
 *
 * 这块存在的意义是让"成本价为什么变了"可追溯：事件列出来，用户能自己核对
 * 每一次摊薄的来源，也能删掉录错的一条让成本立刻还原。
 *
 * suppressed 为 true 时（该股票已有手工分红流水），事件仍然可以录、可以看，
 * 但不会生效——这里必须明说，否则用户会以为功能坏了。
 */
function DividendPanel({
  code,
  suppressed,
  onChanged,
}: {
  code: string
  suppressed: boolean
  onChanged: () => void
}) {
  const api = useApi()
  const toast = useToasts()
  const [events, setEvents] = useState<DividendEvent[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [exDate, setExDate] = useState(today())
  const [cash, setCash] = useState('')
  const [bonus, setBonus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api(() => portfolio.listDividends(code))
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [api, code])

  const submit = async () => {
    const c = parseFloat(cash) || 0
    const b = parseFloat(bonus) || 0
    if (c <= 0 && b <= 0) {
      toast.error('派息和送转率至少填一个')
      return
    }
    setBusy(true)
    try {
      await api(() =>
        portfolio.upsertDividend(code, { ex_date: exDate, cash_per_share: c, bonus_ratio: b }),
      )
      const list = await api(() => portfolio.listDividends(code))
      setEvents(list)
      setAdding(false)
      setCash('')
      setBonus('')
      toast.success('除权事件已保存')
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await api(() => portfolio.deleteDividend(id))
      setEvents((cur) => (cur ?? []).filter((e) => e.id !== id))
      toast.success('已删除，成本已还原')
      onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line-soft/70">
      <div className="flex items-center justify-between gap-3">
        <p className="text-micro font-medium text-ink-soft">除权除息事件</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="min-h-11 inline-flex items-center gap-1 px-1 text-micro text-accent font-medium"
        >
          <Plus size={13} weight="bold" /> {adding ? '收起' : '录一次'}
        </button>
      </div>

      {suppressed && (
        <p className="text-micro text-ink-faint leading-snug">
          该股票已有手工分红流水，分红按「已实现收益」计，除权事件不会再摊薄成本（避免同一笔钱算两次）。
        </p>
      )}

      {adding && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <Input
            label="除权日"
            name="ex_date"
            type="date"
            value={exDate}
            onChange={(e) => setExDate(e.target.value)}
          />
          <Input
            label="每股派息"
            name="cash"
            type="number"
            step="0.001"
            inputMode="decimal"
            placeholder="0.40"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
          <Input
            label="每股送转"
            name="bonus"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0.3"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
          <Button size="sm" loading={busy} onClick={submit} type="button">
            保存
          </Button>
        </div>
      )}

      {events === null ? (
        <Skeleton className="mt-2 h-8 rounded-tile" />
      ) : events.length === 0 ? (
        <p className="mt-1 text-micro text-ink-faint">
          暂无除权记录。交易所口径「每 10 股派 4 元」请填 0.4。
        </p>
      ) : (
        <ul className="mt-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="text-micro tnum text-ink-soft w-24 shrink-0">{e.ex_date}</span>
              <span className="text-micro tnum flex-1 min-w-0 truncate">
                {e.cash_per_share > 0 && `派 ${fmtMoney(e.cash_per_share)}/股`}
                {e.cash_per_share > 0 && e.bonus_ratio > 0 && ' · '}
                {e.bonus_ratio > 0 && `送转 ${e.bonus_ratio}/股`}
              </span>
              <button
                type="button"
                onClick={() => remove(e.id)}
                className="shrink-0 w-9 h-9 grid place-items-center rounded-full text-ink-faint
                           transition-colors hover:text-danger hover:bg-danger/10"
                aria-label={`删除 ${e.ex_date} 的除权事件`}
              >
                <Trash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddActionModal({
  open,
  brokers,
  accounts,
  presetCode,
  onClose,
  onSaved,
}: {
  open: boolean
  brokers: Broker[]
  accounts: Account[]
  presetCode: string
  onClose: () => void
  onSaved: () => void
}) {
  const api = useApi()
  const [code, setCode] = useState(presetCode)
  const [type, setType] = useState<ActionType>('BUY')
  const [price, setPrice] = useState('')
  const [shares, setShares] = useState('')
  const [date, setDate] = useState(today())
  const [broker, setBroker] = useState('')
  const [accountId, setAccountId] = useState<string>('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCode(presetCode)
    setType('BUY')
    setPrice('')
    setShares('')
    setDate(today())
    setBroker(brokers.find((b) => b.is_default)?.name || '')
    setAccountId('')
    setNote('')
    setErrors({})
    setFormError('')
  }, [open, presetCode, brokers])

  const spec = actionSpec[type]

  const estimate = useMemo(() => {
    const p = parseFloat(price)
    const s = parseInt(shares, 10)
    if (Number.isNaN(p) || Number.isNaN(s)) return null
    return p * s
  }, [price, shares])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!code.trim()) next.code = '请填写股票代码'
    const sh = parseInt(shares, 10)
    // 送转的价格恒为 0——后端也会强制归零，前端提前对齐，避免用户看到"我填的价格没生效"
    const pr = spec.lockPrice ? 0 : parseFloat(price)
    if (!sh || sh <= 0) next.shares = '股数必须为正整数'
    if (Number.isNaN(pr) || pr < 0) next.price = '价格不能为负'
    setErrors(next)
    // 校验失败只标红出错的字段，已填的内容一律保留
    if (Object.keys(next).length > 0) return

    setFormError('')
    setBusy(true)
    try {
      await api(() =>
        portfolio.createAction(code.trim(), {
          action_type: type,
          price: pr,
          shares: sh,
          trade_date: date,
          broker: broker || undefined,
          account_id: accountId ? parseInt(accountId, 10) : undefined,
          note: note || undefined,
        }),
      )
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '保存失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="记一笔交易">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="股票代码"
          name="code"
          inputMode="numeric"
          placeholder="如 600519"
          value={code}
          error={errors.code}
          onChange={(e) => setCode(e.target.value)}
        />

        <div>
          <span className="block text-micro font-medium text-ink-soft mb-1.5">交易类型</span>
          <div className="grid grid-cols-3 gap-2">
            {(['BUY', 'SELL', 'ADD', 'BONUS', 'DIVIDEND'] as ActionType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${
                  type === t
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-soft hover:bg-surface-2'
                }`}
              >
                {actionLabels[t]}
              </button>
            ))}
          </div>
          {spec.hint && <p className="mt-2 text-micro text-ink-faint leading-snug">{spec.hint}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={spec.priceLabel}
            name="price"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={spec.lockPrice ? '0' : price}
            disabled={spec.lockPrice}
            error={errors.price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            label={spec.sharesLabel}
            name="shares"
            type="number"
            step="1"
            inputMode="numeric"
            placeholder="0"
            value={shares}
            error={errors.shares}
            onChange={(e) => setShares(e.target.value)}
          />
        </div>

        {estimate !== null && !spec.lockPrice && (
          <p className="text-micro text-ink-soft tnum">
            {type === 'DIVIDEND' ? '分红总额约 ' : '成交金额约 '}
            <span className="font-medium text-ink">¥{fmtMoney(estimate)}</span>
            {type === 'DIVIDEND' ? '（分红不收手续费）' : '（手续费由后端按券商费率估算）'}
          </p>
        )}

        <Input
          label="交易日期"
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <Select
          label="券商"
          name="broker"
          value={broker}
          onChange={(e) => setBroker(e.target.value)}
        >
          <option value="">不指定</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
        </Select>

        {accounts.length > 0 && (
          <Select
            label="归属账户"
            name="account_id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">不指定（未归类）</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </Select>
        )}

        <Input
          label="备注（可选）"
          name="note"
          placeholder="这笔交易的想法"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {formError && (
          <p className="rounded-field bg-danger/10 px-4 py-3 text-caption text-danger">
            {formError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            取消
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            保存
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ──────────────── 子组件 ──────────────── */

/** 汇总条单个指标 */
function Metric({
  label,
  value,
  valueClass,
  sub,
  highlight,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-accent/10 ring-1 ring-accent/20' : 'bg-surface-2/60'}`}>
      <p className="text-[11px] text-ink-faint leading-none">{label}</p>
      <p className={`mt-1 text-sm font-semibold tnum leading-tight ${valueClass ?? (highlight ? 'text-accent' : '')}`}>
        {value}
      </p>
      {sub && <p className={`mt-0.5 text-[11px] tnum leading-none ${valueClass ?? ''}`}>{sub}</p>}
    </div>
  )
}

/** 资产配置环形图（纯 SVG，无依赖） */
function AllocationDonut({
  holdings,
  quotes,
  totalMarketValue,
}: {
  holdings: Holding[]
  quotes: Record<string, Quote>
  totalMarketValue: number
}) {
  // 按持仓市值算占比；无报价的用成本兜底
  const segments = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of holdings) {
      const q = quotes[h.stock_code]
      const v = q ? q.price * h.shares : h.shares * h.cost_price
      // 简单分类：含 "ETF" 或基金代码(5/6开头) → 基金，其余 → 股票
      const kind = /^[56]/.test(h.stock_code) || h.stock_name?.includes('ETF') ? 'fund' : 'stock'
      map.set(kind, (map.get(kind) ?? 0) + v)
    }
    const stock = map.get('stock') ?? 0
    const fund = map.get('fund') ?? 0
    const cash = Math.max(0, totalMarketValue - stock - fund)
    const total = stock + fund + cash || 1
    return [
      { label: '股票', value: stock, pct: stock / total, color: '#3b82f6' },
      { label: '基金', value: fund, pct: fund / total, color: '#8b5cf6' },
      { label: '现金', value: cash, pct: cash / total, color: '#6b7280' },
    ].filter((s) => s.pct > 0.005)
  }, [holdings, quotes, totalMarketValue])

  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const gap = 3

  let accum = -90 // 从顶部开始
  const paths = segments.map((s) => {
    const span = s.pct * 360
    const start = accum
    const end = accum + span
    accum = end
    const largeArc = span > 180 ? 1 : 0
    const radStart = ((start + gap / 2) * Math.PI) / 180
    const radEnd = ((end - gap / 2) * Math.PI) / 180
    const x1 = cx + r * Math.cos(radStart)
    const y1 = cy + r * Math.sin(radStart)
    const x2 = cx + r * Math.cos(radEnd)
    const y2 = cy + r * Math.sin(radEnd)
    return { ...s, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z` }
  })

  return (
    <div className="shrink-0 flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 底环 */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={22} className="text-surface-2" />
        {/* 扇区 */}
        {paths.map((p) => (
          <path key={p.label} d={p.d} fill={p.color} opacity={0.9} />
        ))}
        {/* 内圆（挖空成环形） */}
        <circle cx={cx} cy={cy} r={r - 14} fill="var(--color-surface)" />
        {/* 中心文字 */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-current text-[13px] font-bold tnum" style={{ fill: 'var(--color-ink)' }}>
          ¥{fmtMoney(totalMarketValue, 0)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-current text-[10px]" style={{ fill: 'var(--color-ink-faint)' }}>
          总资产
        </text>
      </svg>
      {/* 图例 */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-[11px] text-ink-soft">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            <span className="tnum font-medium text-ink">{fmtNum(s.pct * 100, 1)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 账户管理弹窗：新建或编辑自定义账户分组。
 */
function AccountModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean
  account: Account | null // null=新建
  onClose: () => void
  onSaved: () => void
}) {
  const api = useApi()
  const toast = useToasts()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<string>('custom')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (account) {
      setName(account.name)
      setKind(account.kind)
    } else {
      setName('')
      setKind('custom')
    }
  }, [open, account])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      if (account) {
        await api(() => accountApi.update(account.id, { name: name.trim(), kind }))
      } else {
        await api(() => accountApi.create({ name: name.trim(), kind }))
      }
      onSaved()
      toast.success(account ? '账户已更新' : '账户已创建')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!account) return
    if (!confirm(`确定删除「${account.name}」？关联持仓会变为未归类。`)) return
    setBusy(true)
    try {
      await api(() => accountApi.remove(account.id))
      onSaved()
      toast.success('账户已删除')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? '编辑账户' : '新建账户'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="账户名称"
          name="name"
          placeholder="如 华泰证券、支付宝、天天基金"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div>
          <span className="block text-micro font-medium text-ink-soft mb-1.5">账户类型</span>
          <div className="grid grid-cols-4 gap-2">
            {(['stock', 'fund', 'bank', 'custom'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${
                  kind === k
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-soft hover:bg-surface-2'
                }`}
              >
                {k === 'stock' ? 'A股' : k === 'fund' ? '基金' : k === 'bank' ? '银行' : '其他'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            取消
          </Button>
          {account && (
            <Button type="button" variant="danger" onClick={handleDelete} className="flex-1">
              删除
            </Button>
          )}
          <Button type="submit" loading={busy} className="flex-1">
            保存
          </Button>
        </div>
      </form>
    </Modal>
  )
}
