import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Sparkle, TrendDown, TrendUp } from '@phosphor-icons/react'
import { strategy } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useToasts } from '../lib/toast'
import type { AnalysisRecord, StockAnalysis, StrategyReport, TechnicalDetail } from '../lib/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { CandleChart } from '../components/charts/CandleChart'
import { fmtMoney } from '../lib/format'

// 图表最多渲染的 K 线根数（太多会糊成一团）
const CHART_N = 120

function TrendPill({ trend }: { trend: StrategyReport['trend'] }) {
  if (trend === 'up')
    return (
      <span className="px-2 py-0.5 rounded-full bg-up/10 text-up text-micro font-semibold">
        <TrendUp size={12} className="inline mr-0.5 -mt-0.5" />
        趋势向上
      </span>
    )
  if (trend === 'down')
    return (
      <span className="px-2 py-0.5 rounded-full bg-down/10 text-down text-micro font-semibold">
        <TrendDown size={12} className="inline mr-0.5 -mt-0.5" />
        趋势向下
      </span>
    )
  return <span className="px-2 py-0.5 rounded-full bg-surface-2 text-ink-soft text-micro font-semibold">震荡</span>
}

export default function StockDetail() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const toast = useToasts()

  const [detail, setDetail] = useState<TechnicalDetail | null>(null)
  const [report, setReport] = useState<StrategyReport | null>(null)
  const [detailErr, setDetailErr] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisErr, setAnalysisErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setReport(null)
    setAnalysis(null)
    setAnalyses([])
    setDetailErr(null)
    setAnalysisErr(null)
    api(() => strategy.detail(code))
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setDetailErr(e?.message || '加载技术面失败'))
    api(() => strategy.one(code))
      .then((r) => alive && setReport(r))
      .catch(() => alive && setReport(null))
    api(() => strategy.analyses(code))
      .then((r) => alive && setAnalyses(r.items))
      .catch(() => alive && setAnalyses([]))
    return () => {
      alive = false
    }
  }, [code, api])

  // 图表只取最近 CHART_N 根
  const chart = useMemo(() => {
    if (!detail || detail.klines.length === 0) return null
    const start = Math.max(0, detail.klines.length - CHART_N)
    const slice = <T,>(a: T[]) => a.slice(start)
    return {
      klines: slice(detail.klines),
      ma5: slice(detail.ma5),
      ma10: slice(detail.ma10),
      ma20: slice(detail.ma20),
      ma60: slice(detail.ma60),
      bollUp: slice(detail.boll_up),
      bollMid: slice(detail.boll_mid),
      bollLow: slice(detail.boll_low),
    }
  }, [detail])

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true)
    setAnalysisErr(null)
    try {
      const a = await api(() => strategy.analysis(code))
      setAnalysis(a)
      if (a.raw && !a.direction) toast.info('AI 返回了非结构化内容，已原文展示')
      // 分析成功后刷新历史列表
      api(() => strategy.analyses(code))
        .then((r) => setAnalyses(r.items))
        .catch(() => {})
    } catch (e) {
      setAnalysisErr((e as { message?: string })?.message || 'AI 分析失败')
    } finally {
      setAnalyzing(false)
    }
  }, [code, api, toast])

  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 grid place-items-center rounded-full text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 text-right">
          <p className="font-semibold truncate">
            {detail?.name || code}
            <span className="text-micro text-ink-faint tnum font-normal ml-1">{code}</span>
          </p>
          {detail && (
            <p className="text-micro text-ink-faint tnum mt-0.5">最新收盘 ¥{fmtMoney(detail.last_close, 2)}</p>
          )}
        </div>
        {report && <TrendPill trend={report.trend} />}
      </div>

      {/* K 线图 */}
      <Card padded className="px-3 sm:px-4 py-4">
        {detailErr ? (
          <EmptyState compact title="技术面加载失败" description={detailErr} />
        ) : !chart ? (
          <Skeleton className="h-[260px] w-full rounded-tile" />
        ) : (
          <>
            <div className="flex items-center gap-3 text-[11px] text-ink-faint mb-2 px-1">
              <span className="flex items-center gap-1"><i className="w-3 h-[2px] rounded bg-accent inline-block" />MA5</span>
              <span className="flex items-center gap-1"><i className="w-3 h-[2px] rounded bg-[#14b8a6] inline-block" />MA10</span>
              <span className="flex items-center gap-1"><i className="w-3 h-[2px] rounded bg-[#f59e0b] inline-block" />MA20</span>
              <span className="flex items-center gap-1"><i className="w-3 h-[2px] rounded bg-[#8b5cf6] inline-block" />MA60</span>
              <span className="ml-auto">布林带(20,2) 虚线</span>
            </div>
            <CandleChart {...chart} />
            {/* 支撑压力 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Level label="近端支撑" v={detail!.support} tone="down" />
              <Level label="近端压力" v={detail!.resistance} tone="up" />
              <Level label="远端支撑" v={detail!.support_far} tone="down" />
              <Level label="远端压力" v={detail!.resistance_far} tone="up" />
            </div>
          </>
        )}
      </Card>

      {/* 中性技术信号 */}
      {report && report.signals.length > 0 && (
        <Card padded className="px-4 py-4">
          <p className="text-micro font-semibold text-ink-soft mb-2">技术指标（中性参考）</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {report.signals.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between gap-2 text-caption">
                <span className="text-ink-faint shrink-0">{s.name}</span>
                <span className="text-right">{s.text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 决策复盘 */}
      {report?.decision_review && (
        <Card padded className="px-4 py-4">
          <p className="text-micro font-semibold text-ink-soft mb-2">决策复盘（来自你的账本）</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption">
            <span className="text-ink-faint">建仓 <b className="text-ink">{report.decision_review.first_buy_date || '—'}</b></span>
            <span className="text-ink-faint">持有 <b className="text-ink tnum">{report.decision_review.holding_days}</b> 天</span>
            <span className="text-ink-faint">成本 <b className="text-ink tnum">¥{fmtMoney(report.decision_review.cost_price, 2)}</b></span>
            <span className={`font-semibold tnum ${report.decision_review.pnl_pct >= 0 ? 'text-up' : 'text-down'}`}>
              {report.decision_review.pnl_pct >= 0 ? '+' : ''}
              {(report.decision_review.pnl_pct * 100).toFixed(2)}%
            </span>
          </div>
        </Card>
      )}

      {/* AI 分析（咨询） */}
      <Card padded className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkle size={18} weight="bold" className="text-accent" />
            <h2 className="text-title-3 font-semibold">AI 分析</h2>
          </div>
          {!analysis && (
            <Button size="sm" onClick={runAnalysis} loading={analyzing} icon={<Sparkle size={16} weight="bold" />}>
              {analyzing ? '分析中…' : '开始分析'}
            </Button>
          )}
        </div>

        {analysisErr && <p className="mt-2 text-caption text-down">{analysisErr}</p>}

        {analysis && (analysis.direction || analysis.advice || analysis.trigger || analysis.risk) && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Block title="方向判断" text={analysis.direction} />
            <Block title="交易建议" text={analysis.advice} />
            <Block title="触发条件" text={analysis.trigger} />
            <Block title="风险提示" text={analysis.risk} />
          </div>
        )}
        {analysis && analysis.raw && !analysis.direction && (
          <pre className="mt-3 whitespace-pre-wrap text-caption text-ink-soft">{analysis.raw}</pre>
        )}
        {analysis && (
          <p className="mt-3 text-[11px] text-ink-faint">以上由 AI 生成，仅供研究参考，不构成投资建议。</p>
        )}
      </Card>

      {/* AI 分析历史 + 后验复盘 */}
      {analyses.length > 0 && (
        <Card padded className="px-4 py-4">
          <p className="text-micro font-semibold text-ink-soft mb-2">分析历史 · 后验复盘</p>
          <ul className="divide-y divide-line-soft">
            {analyses.map((a) => {
              const verdict =
                a.verdict === 'correct'
                  ? { t: '✓ 判断正确', c: 'text-up' }
                  : a.verdict === 'wrong'
                    ? { t: '✗ 判断错误', c: 'text-down' }
                    : { t: '— 中性', c: 'text-ink-faint' }
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption text-ink">
                      {(a.direction || '（无方向判断）').slice(0, 40)}
                    </p>
                    <p className="text-micro text-ink-faint tnum mt-0.5">
                      {a.created_at?.slice(0, 10) || ''} · 分析时 ¥{fmtMoney(a.price_at, 2)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-caption font-semibold ${verdict.c}`}>{verdict.t}</p>
                    <p className={`text-micro tnum ${a.pnl_pct >= 0 ? 'text-up' : 'text-down'}`}>
                      {a.price_at > 0 ? `${a.pnl_pct >= 0 ? '+' : ''}${(a.pnl_pct * 100).toFixed(2)}%` : '—'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Level({ label, v, tone }: { label: string; v: number; tone: 'up' | 'down' }) {
  return (
    <div className="rounded-tile bg-surface-2/50 px-3 py-2">
      <p className="text-micro text-ink-faint">{label}</p>
      <p className={`text-caption font-semibold tnum mt-0.5 ${tone === 'up' ? 'text-up' : 'text-down'}`}>
        ¥{fmtMoney(v, 2)}
      </p>
    </div>
  )
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-tile bg-surface-2/40 px-3.5 py-3">
      <p className="text-micro font-semibold text-ink-soft mb-1">{title}</p>
      <p className="text-caption text-ink leading-relaxed whitespace-pre-wrap">{text || '—'}</p>
    </div>
  )
}
