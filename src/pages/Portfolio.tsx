import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, ListPlus, Plus, Trash } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { portfolio, brokers as brokerApi, accounts as accountApi, ApiError } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useQuotes } from '../lib/useQuotes'
import { useSettings } from '../lib/settings'
import { useToasts } from '../lib/toast'
import type { Action, ActionType, Broker, DividendEvent, Holding, Quote, Account } from '../lib/types'
import { AssetsView } from './Assets'
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

  // A股 / 基金 视图切换：读 URL ?view=funds（/assets 旧链接重定向到此）
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'funds' ? 'funds' : 'stocks'
  const switchView = (v: 'stocks' | 'funds') => {
    setSearchParams(v === 'funds' ? { view: 'funds' } : {}, { replace: true })
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
    <div className="space-y-6">
      <PageHeader
        title={view === 'funds' ? '基金持仓' : '持仓'}
        description={
          view === 'funds'
            ? '场外基金、理财、黄金等统一记账；截图导入快速录持仓。'
            : '每一笔流水都会自动重算持仓成本，账本本身就是唯一真相源。'
        }
        action={
          view === 'stocks' ? (
            <Button icon={<Plus size={18} weight="bold" />} onClick={() => openAdd()}>
              记一笔交易
            </Button>
          ) : undefined
        }
      />

      {/* A股 / 基金 视图切换 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => switchView('stocks')}
          aria-pressed={view === 'stocks'}
          className={`min-h-10 px-5 rounded-full text-caption font-semibold transition-colors ${
            view === 'stocks' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
          }`}
        >
          A股
        </button>
        <button
          onClick={() => switchView('funds')}
          aria-pressed={view === 'funds'}
          className={`min-h-10 px-5 rounded-full text-caption font-semibold transition-colors ${
            view === 'funds' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
          }`}
        >
          基金
        </button>
      </div>

      {view === 'funds' ? (
        <AssetsView />
      ) : (
        <>
      {/* 账户 Tab 栏：全部 / 各自定义账户 */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
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
            <button
              key={a.id}
              onClick={() => selectAccount(a.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-caption font-medium transition-colors ${
                activeAccount === a.id
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-ink-soft hover:bg-surface-2/80'
              }`}
            >
              {a.name}
            </button>
          ))}
          <button
            onClick={() => { setEditingAccount(null); setAccountModalOpen(true) }}
            className="shrink-0 min-h-9 px-3 py-2 rounded-full text-caption font-medium text-accent border border-dashed border-line hover:border-accent/50 transition-colors"
          >
            + 新建账户
          </button>
        </div>
      )}

      {/* 汇总条：移动端也能一眼看到总量，不用往回滚 */}
      {holdings && holdings.length > 0 && (
        <Reveal delay={0.05}>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-tile bg-surface ring-card shadow-card px-5 py-4">
            <div>
              <p className="text-micro text-ink-faint">持仓成本合计</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">
                ¥{fmtMoney(totalCost, 0)}
              </p>
            </div>
            <div>
              <p className="text-micro text-ink-faint">{hasQuote ? '持仓市值' : '持仓市值（成本口径）'}</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">
                ¥{fmtMoney(totalMarketValue, 0)}
              </p>
            </div>
            {hasQuote && totalCost > 0 && (
              <div>
                <p className="text-micro text-ink-faint">浮动盈亏</p>
                <p
                  className={`mt-0.5 text-title-2 font-semibold tnum leading-none ${
                    totalMarketValue - totalCost >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {totalMarketValue - totalCost >= 0 ? '+' : ''}¥
                  {fmtMoney(totalMarketValue - totalCost, 0)}
                </p>
              </div>
            )}
            <div>
              <p className="text-micro text-ink-faint">标的数量</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">
                {holdings.length}
              </p>
            </div>
            {totalDividend > 0 && (
              <div>
                <p className="text-micro text-ink-faint">累计分红</p>
                <p className="mt-0.5 text-title-2 font-semibold tnum leading-none text-up">
                  ¥{fmtMoney(totalDividend, 0)}
                </p>
              </div>
            )}
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
        <div className="space-y-3">
          {holdings.map((h, i) => {
            const open = expanded === h.stock_code
            const list = actions[h.stock_code]
            const q: Quote | undefined = quotes[h.stock_code]
            const costValue = h.shares * h.cost_price
            const marketValue = q ? q.price * h.shares : costValue
            const pnl = q ? marketValue - costValue : 0
            const pnlPct = q && costValue > 0 ? (pnl / costValue) * 100 : 0
            return (
              <Reveal key={h.id} delay={Math.min(i * 0.04, 0.2)}>
                <Card padded={false} className="overflow-hidden">
                  {/* 折叠头：整行可点，高度远超 44px 触摸目标 */}
                  <button
                    onClick={() => toggle(h.stock_code)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left
                               transition-colors hover:bg-surface-2/60 active:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold truncate">
                          {h.stock_name || h.stock_code}
                        </span>
                        <span className="text-micro text-ink-faint tnum shrink-0">
                          {h.stock_code}
                        </span>
                      </span>
                      <span className="mt-1 block text-micro text-ink-soft tnum">
                        {fmtNum(h.shares)} 股 · 成本 {fmtMoney(h.cost_price)}
                        {q ? ` · 现价 ${fmtMoney(q.price)}` : ''}
                        {h.broker ? ` · ${h.broker}` : ''}
                      </span>

                      {/* 分红痕迹：成本被摊薄过、或收到过现金分红，都要说清楚，
                          否则用户看到"成本比我买入价低"会以为是 bug。 */}
                      {((h.dividend_per_share ?? 0) > 0 || (h.income_realized ?? 0) > 0) && (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {(h.dividend_per_share ?? 0) > 0 && (
                            <span
                              className="text-micro text-up tnum"
                              title={`原始成本 ${fmtMoney(h.cost_price_raw ?? 0)}，累计每股派息 ${fmtMoney(
                                h.dividend_per_share ?? 0,
                              )}，摊薄后 ${fmtMoney(h.cost_price)}`}
                            >
                              除权摊薄 −{fmtMoney(h.dividend_per_share ?? 0)}/股
                            </span>
                          )}
                          {(h.income_realized ?? 0) > 0 && (
                            <span className="text-micro text-up tnum">
                              已收分红 ¥{fmtMoney(h.income_realized ?? 0, 0)}
                            </span>
                          )}
                        </span>
                      )}
                    </span>

                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-right">
                        <span className="block font-semibold tnum">
                          ¥{fmtMoney(marketValue, 0)}
                        </span>
                        <span className="block text-micro text-ink-faint">
                          {q ? '市值' : '市值成本'}
                        </span>
                        {q ? (
                          <span
                            className={`mt-0.5 block text-micro font-semibold tnum ${
                              pnl >= 0 ? 'text-up' : 'text-down'
                            }`}
                          >
                            {pnl >= 0 ? '+' : ''}¥{fmtMoney(pnl, 0)}（
                            {pnl >= 0 ? '+' : ''}
                            {fmtNum(pnlPct, 2)}%）
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-micro text-ink-faint">暂无行情</span>
                        )}
                      </span>
                      <CaretDown
                        size={18}
                        className={`text-ink-faint transition-transform duration-300 ${
                          open ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  </button>

                  {/* 展开区：高度动画用 grid-rows 技巧，避免测量 DOM 高度 */}
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-line-soft px-4 sm:px-5 py-3 bg-surface-2/40">
                          {loadingCode === h.stock_code ? (
                            <Skeleton className="h-16 rounded-tile" />
                          ) : (list ?? []).length === 0 ? (
                            <p className="py-3 text-caption text-ink-soft">该持仓暂无流水记录。</p>
                          ) : (
                            <ul>
                              {(list ?? []).map((a) => (
                                <ActionRow
                                  key={a.id}
                                  action={a}
                                  onDelete={() =>
                                    setPendingDelete({ code: h.stock_code, action: a })
                                  }
                                />
                              ))}
                            </ul>
                          )}

                          <button
                            onClick={() => openAdd(h.stock_code)}
                            className="mt-2 min-h-11 inline-flex items-center gap-1.5 px-1 text-caption text-accent font-medium"
                          >
                            <Plus size={15} weight="bold" /> 给 {h.stock_code} 添加流水
                          </button>

                          <DividendPanel
                            code={h.stock_code}
                            suppressed={(h.income_realized ?? 0) > 0}
                            onChanged={load}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
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
