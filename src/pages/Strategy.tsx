import { useEffect, useMemo, useState } from 'react'
import { Flask, ChartLineUp, Warning } from '@phosphor-icons/react'
import { strategy as strategyApi } from '../lib/api'
import { useToasts } from '../lib/toast'
import type {
  BacktestReport,
  BacktestStrategy,
  StrategyReport,
  SignalItem,
} from '../lib/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { fmtMoney, fmtNum } from '../lib/format'

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`

function stateColor(s: SignalItem['state']): string {
  switch (s) {
    case 'above':
    case 'golden':
      return 'text-up'
    case 'below':
    case 'dead':
      return 'text-down'
    case 'overbought':
    case 'oversold':
      return 'text-amber-600 dark:text-amber-400'
    default:
      return 'text-ink-soft'
  }
}

function TrendPill({ trend }: { trend: StrategyReport['trend'] }) {
  if (trend === 'up')
    return <span className="px-2 py-0.5 rounded-full bg-up/10 text-up text-micro font-semibold">趋势向上</span>
  if (trend === 'down')
    return <span className="px-2 py-0.5 rounded-full bg-down/10 text-down text-micro font-semibold">趋势向下</span>
  return <span className="px-2 py-0.5 rounded-full bg-surface-2 text-ink-soft text-micro font-semibold">震荡</span>
}

// 双净值曲线对比图（纯 SVG，无依赖）。两条曲线起点均已归一为 1。
function EquityChart({ timing, hold }: { timing: number[]; hold: number[] }) {
  const W = 640
  const H = 220
  const pad = 28
  if (timing.length < 2 || hold.length < 2) return null
  const all = [...timing, ...hold]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (timing.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2)
  const toPath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const oneY = y(1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="净值曲线对比">
      <line x1={pad} y1={oneY} x2={W - pad} y2={oneY} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="4 4" />
      <path d={toPath(hold)} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeOpacity={0.9} />
      <path d={toPath(timing)} fill="none" stroke="#3b82f6" strokeWidth={2} />
      <text x={pad} y={pad - 8} className="fill-ink-faint text-[10px]">择时(蓝) vs 持有(灰)</text>
    </svg>
  )
}

export function StrategyView() {
  const toast = useToasts()
  const [reports, setReports] = useState<StrategyReport[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // 回测面板状态
  const [code, setCode] = useState('')
  const [strat, setStrat] = useState<BacktestStrategy>('single_ma')
  const [maN, setMaN] = useState(60)
  const [maFast, setMaFast] = useState(20)
  const [maSlow, setMaSlow] = useState(60)
  const [bt, setBt] = useState<BacktestReport | null>(null)
  const [btBusy, setBtBusy] = useState(false)
  const [btErr, setBtErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setReports(null)
    setLoadErr(null)
    strategyApi
      .list()
      .then((r) => {
        if (!alive) return
        setReports(r.items)
        if (r.items.length > 0) setCode(r.items[0].code)
      })
      .catch((e) => {
        if (!alive) return
        setLoadErr(e?.message || '加载策略数据失败')
      })
    return () => {
      alive = false
    }
  }, [])

  const overview = useMemo(() => {
    if (!reports) return null
    const up = reports.filter((r) => r.trend === 'up').length
    const down = reports.filter((r) => r.trend === 'down').length
    const above = reports.filter((r) => r.signals.some((s) => s.name.startsWith('价格 vs 20') && s.state === 'above')).length
    return { total: reports.length, up, down, above }
  }, [reports])

  const runBacktest = async () => {
    if (!code) {
      toast.error('请先输入股票代码')
      return
    }
    setBtBusy(true)
    setBtErr(null)
    try {
      const payload: Record<string, unknown> = { code, strategy: strat }
      if (strat === 'single_ma') payload.ma_n = maN
      if (strat === 'ma_cross') {
        payload.ma_fast = maFast
        payload.ma_slow = maSlow
      }
      const rep = await strategyApi.backtest(payload as never)
      setBt(rep)
    } catch (e: unknown) {
      setBtErr((e as { message?: string })?.message || '回测失败（可能需要网络获取历史 K 线）')
    } finally {
      setBtBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 免责声明 */}
      <div className="flex items-start gap-2 rounded-tile bg-surface-2/60 px-4 py-3 text-micro text-ink-soft">
        <Warning size={16} weight="bold" className="text-amber-500 mt-0.5 shrink-0" />
        <span>
          以下为<b>技术指标中性参考</b>与基于你真实账本的<b>决策复盘</b>，<b>不构成任何投资建议</b>。
          历史回测显示，简单均线择时在 A 股长期多跑不赢「一直持有」，请勿据此盲目操作。
        </span>
      </div>

      {/* 概览 */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card padded className="px-4 py-3">
            <p className="text-micro text-ink-faint">持仓数</p>
            <p className="text-title-2 font-semibold tnum mt-0.5">{overview.total}</p>
          </Card>
          <Card padded className="px-4 py-3">
            <p className="text-micro text-ink-faint">趋势向上</p>
            <p className="text-title-2 font-semibold tnum mt-0.5 text-up">{overview.up}</p>
          </Card>
          <Card padded className="px-4 py-3">
            <p className="text-micro text-ink-faint">趋势向下</p>
            <p className="text-title-2 font-semibold tnum mt-0.5 text-down">{overview.down}</p>
          </Card>
          <Card padded className="px-4 py-3">
            <p className="text-micro text-ink-faint">价在 20 日线上</p>
            <p className="text-title-2 font-semibold tnum mt-0.5">{overview.above}</p>
          </Card>
        </div>
      )}

      {/* 持仓策略列表 */}
      {!reports && !loadErr && (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-tile" />
          <Skeleton className="h-24 rounded-tile" />
        </div>
      )}

      {loadErr && <EmptyState title="策略数据加载失败" description={loadErr} />}

      {reports && reports.length === 0 && (
        <EmptyState title="暂无 A 股持仓" description="先去「A股」视图记一笔交易，这里会显示技术指标与决策复盘。" />
      )}

      {reports &&
        reports.map((r) => (
          <Card key={r.code} padded className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {r.name || r.code} <span className="text-micro text-ink-faint tnum font-normal">{r.code}</span>
                </p>
                <p className="text-micro text-ink-faint tnum mt-0.5">
                  现价 ¥{fmtNum(r.last_close, 2)}
                </p>
              </div>
              <TrendPill trend={r.trend} />
            </div>

            {/* 中性信号 */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {r.signals.map((s) => (
                <div key={s.name} className="flex items-baseline justify-between gap-2 text-caption">
                  <span className="text-ink-faint shrink-0">{s.name}</span>
                  <span className={`text-right ${stateColor(s.state)}`}>{s.text}</span>
                </div>
              ))}
            </div>

            {/* 决策复盘：基于真实账本的事实 */}
            {r.decision_review && (
              <div className="mt-3 rounded-tile bg-surface-2/50 px-3 py-2.5">
                <p className="text-micro font-semibold text-ink-soft mb-1.5">决策复盘（来自你的账本）</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption">
                  <span className="text-ink-faint">
                    建仓 <b className="text-ink">{r.decision_review.first_buy_date || '—'}</b>
                  </span>
                  <span className="text-ink-faint">
                    持有 <b className="text-ink tnum">{r.decision_review.holding_days}</b> 天
                  </span>
                  <span className="text-ink-faint">
                    成本 <b className="text-ink tnum">¥{fmtNum(r.decision_review.cost_price, 2)}</b>
                  </span>
                  <span className={`font-semibold tnum ${r.decision_review.pnl_pct >= 0 ? 'text-up' : 'text-down'}`}>
                    {signed(r.decision_review.pnl_pct)}（{r.decision_review.pnl_abs >= 0 ? '+' : ''}¥
                    {fmtMoney(Math.abs(r.decision_review.pnl_abs), 0)}）
                  </span>
                </div>
              </div>
            )}
          </Card>
        ))}

      {/* 回测面板 */}
      <Card padded className="px-4 py-4 mt-2">
        <div className="flex items-center gap-2 mb-3">
          <Flask size={18} weight="bold" className="text-accent" />
          <h2 className="text-title-3 font-semibold">均线择时回测</h2>
        </div>
        <p className="text-micro text-ink-faint mb-3">
          用历史日 K 线验证「均线择时」是否跑得赢「一直持有」。信号次日执行并已修正前视偏差。
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-micro text-ink-faint">股票代码</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="600519" className="w-28" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-micro text-ink-faint">策略</span>
            <Select value={strat} onChange={(e) => setStrat(e.target.value as BacktestStrategy)}>
              <option value="single_ma">单均线择时</option>
              <option value="ma_cross">双均线金叉</option>
              <option value="consensus">多指标共识</option>
            </Select>
          </label>
          {strat === 'single_ma' && (
            <label className="flex flex-col gap-1">
              <span className="text-micro text-ink-faint">均线周期</span>
              <Input
                type="number"
                value={String(maN)}
                onChange={(e) => setMaN(Number(e.target.value) || 60)}
                className="w-20"
              />
            </label>
          )}
          {strat === 'ma_cross' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-ink-faint">快线</span>
                <Input
                  type="number"
                  value={String(maFast)}
                  onChange={(e) => setMaFast(Number(e.target.value) || 20)}
                  className="w-20"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-ink-faint">慢线</span>
                <Input
                  type="number"
                  value={String(maSlow)}
                  onChange={(e) => setMaSlow(Number(e.target.value) || 60)}
                  className="w-20"
                />
              </label>
            </>
          )}
          <Button onClick={runBacktest} disabled={btBusy} icon={<ChartLineUp size={16} weight="bold" />}>
            {btBusy ? '回测中…' : '运行回测'}
          </Button>
        </div>

        {btErr && <p className="mt-3 text-caption text-down">{btErr}</p>}

        {bt && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="择时收益" value={signed(bt.total_return)} tone={bt.total_return >= 0 ? 'up' : 'down'} />
              <Metric label="持有收益" value={signed(bt.hold_return)} tone={bt.hold_return >= 0 ? 'up' : 'down'} />
              <Metric
                label="超额"
                value={signed(bt.excess)}
                tone={bt.excess >= 0 ? 'up' : 'down'}
                sub="择时 − 持有"
              />
              <Metric label="最大回撤" value={signed(bt.max_dd)} tone="down" />
              <Metric label="交易胜率" value={pct(bt.win_rate, 0)} />
              <Metric label="在场比例" value={pct(bt.time_in_market, 0)} />
            </div>
            <div className="text-ink-soft">
              <EquityChart timing={bt.curve_timing} hold={bt.curve_hold} />
              <p className="text-micro text-ink-faint mt-1">{bt.note}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
  sub?: string
}) {
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'
  return (
    <div className="rounded-tile bg-surface-2/50 px-3 py-2.5">
      <p className="text-micro text-ink-faint">{label}</p>
      <p className={`text-title-3 font-semibold tnum mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink-faint mt-0.5">{sub}</p>}
    </div>
  )
}
