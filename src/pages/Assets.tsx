import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Coins,
  CurrencyCircleDollar,
  Robot,
  PiggyBank,
  Money,
  Diamond,
  Plus,
  Trash,
  PencilSimple,
  CaretDown,
  Repeat,
  CalendarBlank,
  ArrowsLeftRight,
  Camera,
} from '@phosphor-icons/react'
import { assets as assetApi, dca as dcaApi, market as marketApi, imports as importApi, portfolio as portfolioApi, ApiError } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useToasts } from '../lib/toast'
import type { AssetType, DCASchedule, ExternalAction, ExternalAsset, FundQuote, ImportRecord } from '../lib/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Switch } from '../components/ui/Switch'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Reveal } from '../components/motion/Reveal'
import { PageHeader } from '../components/layout/PageHeader'
import { fmtMoney, fmtNum, dateOnly } from '../lib/format'

const ASSET_META: Record<AssetType, { label: string; icon: typeof Coins; tint: string }> = {
  FUND: { label: '基金', icon: Coins, tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-300' },
  CRYPTO: { label: '加密', icon: CurrencyCircleDollar, tint: 'bg-amber-500/12 text-amber-600 dark:text-amber-300' },
  BOT: { label: '机器人', icon: Robot, tint: 'bg-violet-500/12 text-violet-600 dark:text-violet-300' },
  WEALTH: { label: '理财', icon: PiggyBank, tint: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300' },
  CASH: { label: '现金', icon: Money, tint: 'bg-teal-500/12 text-teal-600 dark:text-teal-300' },
  GOLD: { label: '黄金', icon: Diamond, tint: 'bg-yellow-500/12 text-yellow-600 dark:text-yellow-300' },
}

const FREQ_LABEL: Record<string, string> = {
  daily_trading: '交易日',
  weekly: '每周',
  monthly: '每月',
}
const ACTION_LABEL: Record<string, string> = {
  BUY: '买入',
  ADD: '追加',
  REDEEM: '赎回',
  DEPOSIT: '存入',
  WITHDRAW: '取出',
  INTEREST: '利息',
  DIVIDEND: '分红',
}

const today = () => new Date().toISOString().slice(0, 10)

// AssetsView 是「场外资产」视图（基金/加密/理财/现金/黄金）。
// 已并入持仓页（?view=funds），不再独立成导航页面：顶部操作行自带，
// 标题交给宿主页面（Portfolio）统一渲染。
export function AssetsView() {
  const api = useApi()
  const toast = useToasts()

  const [assets, setAssets] = useState<ExternalAsset[] | null>(null)
  const [schedules, setSchedules] = useState<DCASchedule[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [actionsMap, setActionsMap] = useState<Record<number, ExternalAction[]>>({})
  const [loadingAsset, setLoadingAsset] = useState<number | null>(null)

  const [assetModal, setAssetModal] = useState<{ open: boolean; editing?: ExternalAsset }>({ open: false })
  const [lotModal, setLotModal] = useState<{ open: boolean; asset: ExternalAsset; kind: 'add' | 'reduce' } | null>(null)
  const [dcaModal, setDcaModal] = useState<{ open: boolean; editing?: DCASchedule }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'asset' | 'action' | 'dca'; assetId?: number; actionId?: number; dcaId?: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    void api(() => assetApi.list())
      .then(setAssets)
      .catch(() => setAssets([]))
    void api(() => dcaApi.list())
      .then(setSchedules)
      .catch(() => setSchedules([]))
  }
  useEffect(load, [api])

  const openAssets = useMemo(
    () => (assets ?? []).filter((a) => !a.closed),
    [assets],
  )

  const totalCost = openAssets.reduce((s, a) => s + a.cost_amount, 0)
  const totalValue = openAssets.reduce((s, a) => s + (a.manual_value ?? 0), 0)
  const totalPnl = totalValue - totalCost

  const toggle = (id: number) => {
    setExpanded((cur) => {
      const next = cur === id ? null : id
      if (next && !actionsMap[next]) {
        setLoadingAsset(next)
        void api(() => assetApi.listActions(next))
          .then((list) => setActionsMap((m) => ({ ...m, [next]: list })))
          .catch(() => setActionsMap((m) => ({ ...m, [next]: [] })))
          .finally(() => setLoadingAsset(null))
      }
      return next
    })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    setDeleting(true)
    const run = (() => {
      switch (pendingDelete.kind) {
        case 'asset':
          return assetApi.remove(pendingDelete.assetId!)
        case 'action':
          return assetApi.deleteAction(pendingDelete.assetId!, pendingDelete.actionId!)
        case 'dca':
          return dcaApi.remove(pendingDelete.dcaId!)
      }
    })()
    void api(() => run)
      .then(() => {
        toast.success('已删除')
        if (pendingDelete.kind === 'asset') setAssets((list) => (list ?? []).filter((a) => a.id !== pendingDelete.assetId))
        if (pendingDelete.kind === 'dca') setSchedules((list) => list.filter((d) => d.id !== pendingDelete.dcaId))
        if (pendingDelete.kind === 'action') {
          setActionsMap((m) => ({
            ...m,
            [pendingDelete.assetId!]: (m[pendingDelete.assetId!] || []).filter((a) => a.id !== pendingDelete.actionId),
          }))
        }
        load()
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '删除失败'))
      .finally(() => {
        setDeleting(false)
        setPendingDelete(null)
      })
  }

  const assetName = (id: number) => assets?.find((a) => a.id === id)?.name ?? `#${id}`

  return (
    <div className="space-y-6">
      {/* 操作行：截图导入 / 记一笔资产（并入持仓页后，标题由宿主页提供） */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<Camera size={18} weight="bold" />} onClick={() => setImportOpen(true)}>
          截图导入
        </Button>
        <Button icon={<Plus size={18} weight="bold" />} onClick={() => setAssetModal({ open: true })}>
          记一笔资产
        </Button>
      </div>

      {/* 汇总条 */}
      {assets && openAssets.length > 0 && (
        <Reveal delay={0.05}>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-tile bg-surface ring-card shadow-card px-5 py-4">
            <div>
              <p className="text-micro text-ink-faint">场外成本合计</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">¥{fmtMoney(totalCost, 0)}</p>
            </div>
            <div>
              <p className="text-micro text-ink-faint">市值估值</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">¥{fmtMoney(totalValue, 0)}</p>
            </div>
            <div>
              <p className="text-micro text-ink-faint">浮动盈亏</p>
              <p className={`mt-0.5 text-title-2 font-semibold tnum leading-none ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                {totalPnl >= 0 ? '+' : '-'}¥{fmtMoney(Math.abs(totalPnl), 0)}
              </p>
            </div>
            <div>
              <p className="text-micro text-ink-faint">资产数</p>
              <p className="mt-0.5 text-title-2 font-semibold tnum leading-none">{openAssets.length}</p>
            </div>
          </div>
        </Reveal>
      )}

      {/* 资产列表 */}
      {assets === null ? (
        <div className="space-y-3">
          <Skeleton className="h-[5.5rem] rounded-card" />
          <Skeleton className="h-[5.5rem] rounded-card" />
        </div>
      ) : openAssets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowsLeftRight size={30} weight="duotone" />}
            title="还没有场外资产"
            description="基金、理财、黄金、加密都可以在这里记账，和 A 股持仓分开看。"
            action={
              <Button icon={<Plus size={18} weight="bold" />} onClick={() => setAssetModal({ open: true })}>
                记一笔资产
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {openAssets.map((a, i) => {
            const meta = ASSET_META[a.asset_type]
            const Icon = meta.icon
            const open = expanded === a.id
            const list = actionsMap[a.id]
            const value = a.manual_value ?? null
            const pnl = value === null ? null : value - a.cost_amount
            return (
              <Reveal key={a.id} delay={Math.min(i * 0.04, 0.2)}>
                <Card padded={false} className="overflow-hidden">
                  <div className="flex items-stretch">
                    <div className={`grid place-items-center w-[4.25rem] shrink-0 ${meta.tint}`}>
                      <Icon size={26} weight="duotone" />
                    </div>
                    <button
                      onClick={() => toggle(a.id)}
                      aria-expanded={open}
                      className="flex-1 flex items-center justify-between gap-3 px-4 py-4 text-left
                                 transition-colors hover:bg-surface-2/60 active:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold truncate">{a.name}</span>
                          <Badge tone="outline" className="shrink-0">
                            {meta.label}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-micro text-ink-faint tnum truncate">
                          {a.code}
                          {a.platform ? ` · ${a.platform}` : ''}
                          {a.shares != null ? ` · ${fmtNum(a.shares)} 份` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-right">
                          <span className="block font-semibold tnum">
                            {value === null ? '—' : `¥${fmtMoney(value, 0)}`}
                          </span>
                          <span className="block text-micro tnum">
                            {pnl === null ? (
                              <span className="text-ink-faint">成本 ¥{fmtMoney(a.cost_amount, 0)}</span>
                            ) : (
                              <span className={pnl >= 0 ? 'text-up' : 'text-down'}>
                                {pnl >= 0 ? '+' : '-'}¥{fmtMoney(Math.abs(pnl), 0)}
                              </span>
                            )}
                          </span>
                        </span>
                        <CaretDown
                          size={18}
                          className={`text-ink-faint transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                        />
                      </span>
                    </button>
                    {/* 操作：加仓 / 减仓 / 涨水 / 变幅 / 编辑 / 删除 */}
                    <div className="flex items-center pr-2 shrink-0 gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setLotModal({ open: true, asset: a, kind: 'add' }) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="加仓"
                      >
                        加仓
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLotModal({ open: true, asset: a, kind: 'reduce' }) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="减仓"
                      >
                        减仓
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toast.info('分红记录开发中') }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="涨水 / 分红"
                      >
                        涨水
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssetModal({ open: true, editing: a }) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="修改估值 / 变幅"
                      >
                        变幅
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssetModal({ open: true, editing: a }) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-accent/30 hover:text-accent transition-colors"
                        title="编辑资产"
                      >
                        编辑
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete({ kind: 'asset', assetId: a.id }) }}
                        className="min-h-7 px-2.5 rounded-full text-[11px] font-medium border border-line text-ink-soft hover:bg-surface-2 hover:border-danger/30 hover:text-danger transition-colors"
                        title="删除资产"
                      >
                        删除
                      </button>
                    </div>
                  </div>

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
                          <div className="flex flex-wrap gap-2 mb-3">
                            <Button size="sm" variant="secondary" icon={<Plus size={15} weight="bold" />} onClick={() => setLotModal({ open: true, asset: a, kind: 'add' })}>
                              加仓
                            </Button>
                            <Button size="sm" variant="secondary" icon={<ArrowsLeftRight size={15} weight="bold" />} onClick={() => setLotModal({ open: true, asset: a, kind: 'reduce' })}>
                              减仓
                            </Button>
                          </div>
                          {loadingAsset === a.id ? (
                            <Skeleton className="h-16 rounded-tile" />
                          ) : (list ?? []).length === 0 ? (
                            <p className="py-3 text-caption text-ink-soft">该资产暂无流水记录。</p>
                          ) : (
                            <ul>
                              {(list ?? []).map((act) => (
                                <li key={act.id} className="flex items-center gap-3 py-2.5 border-t border-line-soft/70 first:border-t-0">
                                  <span className="shrink-0 w-14">
                                    <Badge tone="neutral">{ACTION_LABEL[act.action_type] ?? act.action_type}</Badge>
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-caption font-medium tnum">
                                      {act.action_type === 'REDEEM' || act.action_type === 'WITHDRAW' || act.action_type === 'INTEREST' || act.action_type === 'DIVIDEND' ? '-' : '+'}
                                      ¥{fmtMoney(act.amount, 0)}
                                      {act.shares != null ? ` · ${fmtNum(act.shares)} 份` : ''}
                                    </p>
                                    <p className="text-micro text-ink-faint tnum truncate">
                                      {dateOnly(act.trade_date)}
                                      {act.status === 'pending' ? ' · 待确认' : ''}
                                      {act.note ? ` · ${act.note}` : ''}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => setPendingDelete({ kind: 'action', assetId: a.id, actionId: act.id })}
                                    className="shrink-0 w-11 h-11 grid place-items-center rounded-full text-ink-faint hover:text-danger hover:bg-danger/10"
                                    aria-label="删除流水"
                                  >
                                    <Trash size={16} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
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

      {/* 定投计划 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-title-3 font-semibold flex items-center gap-2">
            <Repeat size={20} weight="duotone" className="text-accent" /> 定投计划
          </h2>
          <Button size="sm" variant="ghost" icon={<Plus size={15} weight="bold" />} onClick={() => setDcaModal({ open: true })}>
            新建
          </Button>
        </div>
        {schedules.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon={<CalendarBlank size={26} weight="duotone" />}
              title="还没有定投计划"
              description="为某笔资产设定定期投入，系统会在到期待你确认后记账。"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {schedules.map((d) => (
              <Reveal key={d.id}>
                <Card className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {assetName(d.asset_id)}
                      <span className="ml-2 text-micro font-normal text-ink-faint">
                        {FREQ_LABEL[d.frequency] ?? d.frequency}
                        {d.frequency === 'weekly' && d.day_of_week != null ? ` 周${'日一二三四五六'[d.day_of_week]}` : ''}
                        {d.frequency === 'monthly' && d.day_of_month != null ? ` ${d.day_of_month} 号` : ''}
                      </span>
                    </p>
                    <p className="mt-1 text-micro text-ink-soft tnum">
                      每期 {d.mode === 'shares' ? `${fmtNum(d.value)} 份` : `¥${fmtMoney(d.value, 0)}`}
                      {d.status === 'paused' ? ' · 已暂停' : d.next_due ? ` · 下次 ${dateOnly(d.next_due)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center shrink-0">
                    <button
                      onClick={() => setDcaModal({ open: true, editing: d })}
                      className="w-11 h-11 grid place-items-center rounded-full text-ink-faint hover:text-accent hover:bg-accent/10"
                      aria-label="编辑定投"
                    >
                      <PencilSimple size={17} />
                    </button>
                    <button
                      onClick={() => setPendingDelete({ kind: 'dca', dcaId: d.id })}
                      className="w-11 h-11 grid place-items-center rounded-full text-ink-faint hover:text-danger hover:bg-danger/10"
                      aria-label="删除定投"
                    >
                      <Trash size={17} />
                    </button>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* 截图导入 */}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false)
            toast.success('导入完成')
            load()
          }}
        />
      )}

      {/* 资产创建/编辑 */}
      {assetModal.open && (
        <AssetModal
          editing={assetModal.editing}
          onClose={() => setAssetModal({ open: false })}
          onSaved={() => {
            setAssetModal({ open: false })
            toast.success('资产已保存')
            load()
          }}
        />
      )}

      {/* 加/减仓 */}
      {lotModal?.open && (
        <LotModal
          asset={lotModal.asset}
          kind={lotModal.kind}
          onClose={() => setLotModal(null)}
          onSaved={() => {
            setLotModal(null)
            toast.success('流水已记录')
            setActionsMap({})
            setExpanded(null)
            load()
          }}
        />
      )}

      {/* 定投创建/编辑 */}
      {dcaModal.open && (
        <DcaModal
          assets={assets ?? []}
          editing={dcaModal.editing}
          onClose={() => setDcaModal({ open: false })}
          onSaved={() => {
            setDcaModal({ open: false })
            toast.success('定投已保存')
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title="确认删除？"
        description="删除后相关数据会立即移除，且不可撤销。"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function AssetModal({ editing, onClose, onSaved }: { editing?: ExternalAsset; onClose: () => void; onSaved: () => void }) {
  const api = useApi()
  const toast = useToasts()
  const [type, setType] = useState<AssetType>(editing?.asset_type ?? 'FUND')
  const [code, setCode] = useState(editing?.code ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [platform, setPlatform] = useState(editing?.platform ?? '')
  const [cost, setCost] = useState(editing?.cost_amount ? String(editing.cost_amount) : '')
  const [shares, setShares] = useState(editing?.shares != null ? String(editing.shares) : '')
  const [value, setValue] = useState(editing?.manual_value != null ? String(editing.manual_value) : '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? today())
  const [yieldRate, setYieldRate] = useState(editing?.annual_yield_rate != null ? String(editing.annual_yield_rate) : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [fundInfo, setFundInfo] = useState<FundQuote | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  // 输代码自动带出基金名称 + 最新净值（FUND/CRYPTO 类型才查，其他类型跳过）。
  // 用 useMemo 的依赖触发：code 连续输入时只有稳定后才查（简单 debounce 由 setTimeout 完成）。
  useEffect(() => {
    const c = code.trim()
    if (!c || editing || (type !== 'FUND' && type !== 'CRYPTO')) {
      setFundInfo(null)
      return
    }
    setLookingUp(true)
    const t = setTimeout(() => {
      void api(() => marketApi.funds([c]))
        .then((list) => {
          const f = list[0]
          setFundInfo(f ?? null)
          if (f && !name.trim()) setName(f.name) // 名称没手动填就自动带出
        })
        .catch(() => setFundInfo(null))
        .finally(() => setLookingUp(false))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, type])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!code.trim()) next.code = '请填写代码'
    if (!name.trim()) next.name = '请填写名称'
    const costN = parseFloat(cost)
    if (cost && (Number.isNaN(costN) || costN < 0)) next.cost = '成本不能为负'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    const body = {
      asset_type: type,
      code: code.trim(),
      name: name.trim(),
      platform: platform || undefined,
      cost_amount: costN || 0,
      shares: shares ? parseFloat(shares) : null,
      manual_value: value ? parseFloat(value) : null,
      note: note || undefined,
      start_date: startDate || undefined,
      annual_yield_rate: yieldRate ? parseFloat(yieldRate) : null,
    }
    try {
      if (editing) await api(() => assetApi.update(editing.id, body))
      else await api(() => assetApi.create(body))
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? '编辑资产' : '记一笔资产'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <span className="block text-micro font-medium text-ink-soft mb-1.5">资产类型</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ASSET_META) as AssetType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${
                  type === t ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-soft hover:bg-surface-2'
                }`}
              >
                {ASSET_META[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="代码" name="code" placeholder="如 110011" value={code} error={errors.code} onChange={(e) => setCode(e.target.value)} />
          <Input label="名称" name="name" placeholder="如 易方达蓝筹" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        </div>
        {lookingUp ? (
          <p className="text-micro text-ink-faint">查询基金信息中…</p>
        ) : fundInfo ? (
          <p className="text-micro text-ink-soft tnum">
            已查到：{fundInfo.name} · 最新净值 <span className="text-accent font-semibold">{fundInfo.unit_nav.toFixed(4)}</span>
            {fundInfo.date ? `（${fundInfo.date}）` : ''}
          </p>
        ) : null}
        <Input label="平台（可选）" name="platform" placeholder="如 蚂蚁财富" value={platform} onChange={(e) => setPlatform(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="成本金额" name="cost" type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={cost} error={errors.cost} onChange={(e) => setCost(e.target.value)} />
          <Input label="份额（可选）" name="shares" type="number" step="0.0001" inputMode="decimal" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="当前市值（可选）" name="value" type="number" step="0.01" inputMode="decimal" placeholder="留空则显示 —" value={value} onChange={(e) => setValue(e.target.value)} />
          <Input label="年化收益%（可选）" name="yield" type="number" step="0.1" inputMode="decimal" placeholder="如 5.2" value={yieldRate} onChange={(e) => setYieldRate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="起始日期" name="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="备注（可选）" name="note" placeholder="这笔资产的想法" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">取消</Button>
          <Button type="submit" loading={busy} className="flex-1">{editing ? '保存' : '创建'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function LotModal({ asset, kind, onClose, onSaved }: { asset: ExternalAsset; kind: 'add' | 'reduce'; onClose: () => void; onSaved: () => void }) {
  const api = useApi()
  const toast = useToasts()
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [fee, setFee] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false) // T+1 待确认（OTC 基金申购/赎回）
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const actionType = kind === 'add' ? 'BUY' : 'REDEEM'

  // 金额 ÷ 净值 → 自动算份额（有净值时给提示，不强制写回，用户可手动覆盖）
  const amt = parseFloat(amount)
  const nav = parseFloat(unitPrice)
  const autoShares = !Number.isNaN(amt) && !Number.isNaN(nav) && nav > 0 && amt > 0 ? amt / nav : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    const amt = parseFloat(amount)
    if (Number.isNaN(amt) || amt <= 0) next.amount = '金额必须大于 0'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    const body = {
      action_type: actionType,
      amount: amt,
      shares: shares ? parseFloat(shares) : autoShares ?? null,
      unit_price: unitPrice ? parseFloat(unitPrice) : null,
      fee: fee ? parseFloat(fee) : 0,
      trade_date: date,
      status: pending ? 'pending' : 'confirmed',
      note: note || undefined,
    }
    try {
      if (kind === 'add') await api(() => assetApi.addLot(asset.id, body))
      else await api(() => assetApi.reduceLot(asset.id, body))
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={kind === 'add' ? `给 ${asset.name} 加仓` : `从 ${asset.name} 减仓`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="金额" name="amount" type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} error={errors.amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="份额（可选）" name="shares" type="number" step="0.0001" inputMode="decimal" placeholder={autoShares ? autoShares.toFixed(4) : '0'} value={shares} onChange={(e) => setShares(e.target.value)} />
          <Input label="单价/净值（可选）" name="price" type="number" step="0.0001" inputMode="decimal" placeholder="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
        {autoShares != null && !shares && (
          <p className="text-micro text-ink-soft tnum">
            按净值 {nav.toFixed(4)} 计算，本次约 <span className="text-accent font-semibold">{autoShares.toFixed(4)}</span> 份
          </p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-tile bg-surface-2/60 px-4 py-3">
          <div>
            <p className="text-caption font-medium">T+1 待确认</p>
            <p className="text-micro text-ink-faint">场外基金申购/赎回未结算份额时开启</p>
          </div>
          <Switch checked={pending} onChange={setPending} label="T+1 待确认" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="费用（可选）" name="fee" type="number" step="0.01" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          <Input label="交易日期" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input label="备注（可选）" name="note" placeholder="这笔交易的想法" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">取消</Button>
          <Button type="submit" loading={busy} className="flex-1">保存</Button>
        </div>
      </form>
    </Modal>
  )
}

function DcaModal({ assets, editing, onClose, onSaved }: { assets: ExternalAsset[]; editing?: DCASchedule; onClose: () => void; onSaved: () => void }) {
  const api = useApi()
  const toast = useToasts()
  const open = assets.filter((a) => !a.closed)
  const [assetId, setAssetId] = useState<number>(editing?.asset_id ?? open[0]?.id ?? 0)
  const [mode, setMode] = useState(editing?.mode ?? 'amount')
  const [value, setValue] = useState(editing?.value ? String(editing.value) : '')
  const [frequency, setFrequency] = useState(editing?.frequency ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(editing?.day_of_month != null ? String(editing.day_of_month) : '1')
  const [dayOfWeek, setDayOfWeek] = useState(editing?.day_of_week != null ? String(editing.day_of_week) : '1')
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [note, setNote] = useState(editing?.note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!assetId) next.assetId = '请选择资产'
    const v = parseFloat(value)
    if (Number.isNaN(v) || v <= 0) next.value = '金额/份额必须大于 0'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    const body = {
      asset_id: assetId,
      mode,
      value: v,
      frequency,
      day_of_month: frequency === 'monthly' ? parseInt(dayOfMonth, 10) : null,
      day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek, 10) : null,
      status,
      note: note || undefined,
    }
    try {
      if (editing) await api(() => dcaApi.update(editing.id, body))
      else await api(() => dcaApi.create(body))
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? '编辑定投' : '新建定投'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Select label="关联资产" name="assetId" value={String(assetId)} onChange={(e) => setAssetId(parseInt(e.target.value, 10))}>
          <option value="">请选择</option>
          {open.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="每期金额/份额" name="value" type="number" step="0.01" inputMode="decimal" placeholder="0" value={value} error={errors.value} onChange={(e) => setValue(e.target.value)} />
          <div>
            <span className="block text-micro font-medium text-ink-soft mb-1.5">投入方式</span>
            <div className="grid grid-cols-2 gap-2">
              {(['amount', 'shares'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${mode === m ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-soft hover:bg-surface-2'}`}>
                  {m === 'amount' ? '金额' : '份额'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <span className="block text-micro font-medium text-ink-soft mb-1.5">频率</span>
          <div className="grid grid-cols-3 gap-2">
            {([['daily_trading', '交易日'], ['weekly', '每周'], ['monthly', '每月']] as const).map(([f, l]) => (
              <button key={f} type="button" aria-pressed={frequency === f} onClick={() => setFrequency(f)}
                className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${frequency === f ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-soft hover:bg-surface-2'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {frequency === 'weekly' && (
          <Select label="星期几" name="dow" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
            {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
              <option key={i} value={i}>周{d}</option>
            ))}
          </Select>
        )}
        {frequency === 'monthly' && (
          <Input label="每月几号" name="dom" type="number" min="1" max="28" inputMode="numeric" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        )}
        <div>
          <span className="block text-micro font-medium text-ink-soft mb-1.5">状态</span>
          <div className="grid grid-cols-2 gap-2">
            {([['active', '启用'], ['paused', '暂停']] as const).map(([s, l]) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                className={`min-h-11 rounded-field text-caption font-medium border transition-colors ${status === s ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-soft hover:bg-surface-2'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <Input label="备注（可选）" name="note" placeholder="这笔定投的想法" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">取消</Button>
          <Button type="submit" loading={busy} className="flex-1">保存</Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * 截图导入：上传基金/券商 App 截图 → LLM 识别 → 展示可编辑草稿 → 逐条入库。
 *
 * 识别只调 /api/import/screenshot（返回草稿）；确认后按 kind 分流：
 *   - fund  → 已有同 code 资产则加仓，否则先建资产再加仓
 *   - stock → 走持仓流水接口（BUY）
 */
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const api = useApi()
  const toast = useToasts()
  const fileRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<string | null>(null) // data URL 预览
  const [file, setFile] = useState<File | null>(null)
  const [records, setRecords] = useState<ImportRecord[] | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const pick = (f: File | undefined | null) => {
    if (!f || !f.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setFile(f)
    setRecords(null)
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.readAsDataURL(f)
  }

  const recognize = async () => {
    if (!file) return
    setRecognizing(true)
    setRecords(null)
    try {
      const res = await api(() => importApi.screenshot(file))
      setRecords(res.records ?? [])
      if (!res.records || res.records.length === 0) toast.info('没有识别到投资记录，换个截图试试')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '识别失败')
    } finally {
      setRecognizing(false)
    }
  }

  const patch = (i: number, p: Partial<ImportRecord>) => {
    setRecords((rs) => (rs ?? []).map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  }

  const remove = (i: number) => {
    setRecords((rs) => (rs ?? []).filter((_, idx) => idx !== i))
  }

  const doImport = async () => {
    if (!records || records.length === 0) return
    setImporting(true)
    let ok = 0
    let fail = 0
    let skippedNoCode = 0
    try {
      // 基金导入前拉一次现有资产，用于「同 code → 加仓」而非重复建资产
      let existing: ExternalAsset[] = []
      try {
        existing = await api(() => assetApi.list())
      } catch {
        existing = []
      }

      // 截图识别常拿不到代码（App 持仓页通常不显示）。
      // 对 code 为空但有名称的记录，用名称搜代码补全，避免建出空 code 的资产。
      const enriched = await Promise.all(
        records.map(async (r) => {
          if (!r.code && r.name) {
            try {
              const sugg = await api(() => marketApi.stockSearch(r.name, 5))
              if (sugg.length > 0) {
                const norm = (s: string) => s.replace(/\s/g, '')
                const exact = sugg.find((s) => norm(s.name) === norm(r.name))
                const pick = exact || sugg[0]
                return { ...r, code: pick?.code || '' }
              }
            } catch {
              /* 搜不到就保留空 code，下面会跳过 */
            }
          }
          return r
        }),
      )

      for (const r of enriched) {
        const code = r.code.trim()
        if (!code) {
          skippedNoCode++
          continue
        }
        try {
          if (r.kind === 'fund') {
            const found = existing.find((a) => a.code === code && a.asset_type === 'FUND')
            let assetId = found?.id
            if (!assetId) {
              const created = await api(() =>
                assetApi.create({
                  asset_type: 'FUND',
                  code,
                  name: r.name || code,
                  platform: r.platform || '截图导入',
                  start_date: r.trade_date || undefined,
                }),
              )
              assetId = created.id
            }
            await api(() =>
              assetApi.addLot(assetId!, {
                action_type: r.action_type === 'REDEEM' ? 'REDEEM' : 'BUY',
                amount: r.amount ?? 0,
                shares: r.shares != null ? r.shares : null,
                unit_price: r.nav != null ? r.nav : null,
                trade_date: r.trade_date || today(),
                status: r.status === 'pending' ? 'pending' : 'confirmed',
              }),
            )
          } else {
            // stock → A 股持仓流水
            await api(() =>
              portfolioApi.createAction(code, {
                action_type: r.action_type === 'SELL' ? 'SELL' : 'BUY',
                price: r.price ?? r.nav ?? 0,
                shares: Math.round(r.shares ?? 0),
                trade_date: r.trade_date || today(),
              }),
            )
          }
          ok++
        } catch {
          fail++
        }
      }
    } finally {
      setImporting(false)
    }
    if (ok > 0) {
      const parts = [`已导入 ${ok} 条`]
      if (fail > 0) parts.push(`${fail} 条失败`)
      if (skippedNoCode > 0) parts.push(`${skippedNoCode} 条缺代码已跳过（可手填后重导）`)
      toast.success(parts.join('，'))
      onImported()
    } else {
      toast.error(fail > 0 ? '全部导入失败，请检查字段后重试' : '没有可导入的记录')
    }
  }

  return (
    <Modal open onClose={onClose} title="截图导入">
      <div className="space-y-4">
        {/* 上传区 */}
        {!image ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              pick(e.dataTransfer.files?.[0])
            }}
            className={`w-full min-h-36 rounded-tile border-2 border-dashed grid place-items-center text-center px-6 transition-colors ${
              dragOver ? 'border-accent bg-accent-soft/50' : 'border-line text-ink-soft hover:border-accent/50'
            }`}
          >
            <div>
              <Camera size={30} weight="duotone" className="mx-auto mb-2 text-ink-faint" />
              <p className="text-caption font-medium">点击或拖入基金/券商 App 截图</p>
              <p className="mt-1 text-micro text-ink-faint">支付宝、天天基金、券商持仓页均可</p>
            </div>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-tile bg-surface-2">
            <img src={image} alt="截图预览" className="w-full max-h-64 object-contain" />
            <button
              type="button"
              onClick={() => {
                setImage(null)
                setFile(null)
                setRecords(null)
              }}
              className="absolute top-2 right-2 w-9 h-9 grid place-items-center rounded-full bg-black/55 text-white text-micro"
              aria-label="重选图片"
            >
              换图
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {/* 识别按钮 */}
        {image && !recognizing && records === null && (
          <Button className="w-full" onClick={recognize} icon={<Camera size={18} weight="bold" />}>
            开始识别
          </Button>
        )}
        {recognizing && <Skeleton className="h-24 rounded-tile" />}

        {/* 识别结果 */}
        {records !== null && (
          <div className="space-y-3">
            <p className="text-caption font-medium text-ink-soft">
              识别到 {records.length} 条记录，可修改后导入：
            </p>
            {records.length === 0 ? (
              <p className="text-caption text-ink-faint">无记录。换个更清晰的截图重试。</p>
            ) : (
              records.map((r, i) => (
                <div key={i} className="rounded-tile bg-surface-2/60 px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={r.kind === 'fund' ? 'accent' : 'neutral'}>{r.kind === 'fund' ? '基金' : '股票'}</Badge>
                      <span className="text-caption font-medium truncate">{r.name || r.code || `记录 ${i + 1}`}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="w-9 h-9 grid place-items-center rounded-full text-ink-faint hover:text-danger hover:bg-danger/10"
                      aria-label="删除该条"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="代码" value={r.code} onChange={(e) => patch(i, { code: e.target.value })} />
                    <Input label="名称" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input label="金额" type="number" value={r.amount != null ? String(r.amount) : ''} onChange={(e) => patch(i, { amount: parseFloat(e.target.value) || 0 })} />
                    <Input label="份额/股数" type="number" value={r.shares != null ? String(r.shares) : ''} onChange={(e) => patch(i, { shares: parseFloat(e.target.value) || 0 })} />
                    <Input
                      label={r.kind === 'fund' ? '净值' : '单价'}
                      type="number"
                      value={r.kind === 'fund' ? (r.nav != null ? String(r.nav) : '') : (r.price != null ? String(r.price) : '')}
                      onChange={(e) =>
                        r.kind === 'fund'
                          ? patch(i, { nav: parseFloat(e.target.value) || 0 })
                          : patch(i, { price: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="交易日期" type="date" value={r.trade_date ?? ''} onChange={(e) => patch(i, { trade_date: e.target.value })} />
                    <Select label="动作" value={r.action_type || (r.kind === 'fund' ? 'BUY' : 'SELL')} onChange={(e) => patch(i, { action_type: e.target.value })}>
                      {r.kind === 'fund' ? (
                        <>
                          <option value="BUY">申购 / 买入</option>
                          <option value="REDEEM">赎回</option>
                        </>
                      ) : (
                        <>
                          <option value="BUY">买入</option>
                          <option value="SELL">卖出</option>
                        </>
                      )}
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-micro text-ink-soft cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.status === 'pending'}
                      onChange={(e) => patch(i, { status: e.target.checked ? 'pending' : 'confirmed' })}
                      className="accent-accent"
                    />
                    T+1 待确认（未结算）
                  </label>
                </div>
              ))
            )}
          </div>
        )}

        {/* 操作 */}
        {records !== null && records.length > 0 && (
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="button" loading={importing} className="flex-1" onClick={doImport}>
              确认导入
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
