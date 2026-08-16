// 后端 JSON 响应形状。所有后端响应均为 snake_case（与 argent-go 约定一致），
// 这里直接映射成 TS 接口，避免前端再做字段转换。

export interface User {
  id: number
  email: string
}

export interface Holding {
  id: number
  stock_code: string
  stock_name: string
  shares: number
  /** 已摊薄的成本单价。除权事件会把它压低，用来解释"为什么比买入价低"。 */
  cost_price: number
  purchase_date: string
  broker: string
  account_id?: number | null // 归属账户（null=未归类）
  created_at: string
  updated_at: string

  // 后端衍生字段（omitempty，为 0 时不下发，所以全部可选）
  /** 摊薄前的原始成本，与 cost_price 之差就是每股吃到的分红 */
  cost_price_raw?: number
  fifo_cost_price?: number
  dividend_per_share?: number
  /** 手工 DIVIDEND 流水累计的现金分红收入 */
  income_realized?: number
  /** 可直接加进"总盈亏"的已实现部分（已平仓段 + 分红），加 realized_pnl 会双计 */
  realized_carry?: number
  weighted_days?: number
}

export type ActionType = 'BUY' | 'SELL' | 'ADD' | 'BONUS' | 'DIVIDEND'

/**
 * 除权除息事件——客观的市场事件，跟"我手工记的分红流水"是两码事。
 * 事件用来摊薄成本；流水用来计已实现收益。同一笔钱只能走一条路，否则双计。
 */
export interface DividendEvent {
  id: number
  stock_code: string
  ex_date: string
  cash_per_share: number
  bonus_ratio: number
  source: string
  note: string
  created_at: string
}

export interface Action {
  id: number
  stock_code: string
  action_type: ActionType
  price: number
  shares: number
  tranche_id?: number | null
  note: string
  trade_date: string
  trade_time?: string
  fee?: number | null
  broker?: string
  account_id?: number | null // 归属账户（null=未归类）
  created_at: string
}

export interface Broker {
  id: number
  name: string
  stock_rate: number
  stock_min: number
  etf_rate: number
  etf_min: number
  is_default: boolean
}

export type AccountKind = 'stock' | 'fund' | 'bank' | 'custom'

/** 用户自定义的投资账户分组（如「华泰证券」「支付宝」「天天基金」） */
export interface Account {
  id: number
  name: string
  kind: AccountKind
  color?: string // 可选颜色标签
  sort_order: number
  created_at: string
}

/** 单个账户的持仓汇总快照 */
export interface AccountSummary {
  account_id: number
  account_name: string // 「未归类」表示没有归属账户的持仓
  holding_count: number
  total_cost: number
  total_shares: number
}

export interface WatchlistItem {
  item_type: 'STOCK' | 'FUND'
  code: string
  name: string
  added_at: string
  added_price?: number | null
}

export interface Thesis {
  code: string
  name: string
  thesis: string
  created_at: string
  updated_at: string
}

export interface RealizedResult {
  stock_code: string
  stock_name: string
  realized_pnl: number
  realized_carry: number
}

// ── 场外资産（基金/加密/机器人/理财/现金/黄金）──
export type AssetType = 'FUND' | 'CRYPTO' | 'BOT' | 'WEALTH' | 'CASH' | 'GOLD'

export interface ExternalAsset {
  id: number
  asset_type: AssetType
  code: string
  name: string
  platform: string
  cost_amount: number
  shares?: number | null
  manual_value?: number | null
  note?: string
  annual_yield_rate?: number | null
  start_date?: string
  pending_amount: number
  purchase_fee_rate?: number | null
  closed: boolean
  closed_realized?: number | null
  closed_date?: string
  created_at: string
  updated_at: string
}

export interface ExternalAction {
  id: number
  asset_id: number
  action_type: string
  amount: number
  shares?: number | null
  unit_price?: number | null
  fee: number
  trade_date: string
  trade_time?: string
  status: string // confirmed / pending
  note?: string
  interest_part?: number | null
  created_at: string
}

export interface DCASchedule {
  id: number
  asset_id: number
  mode: string // amount / shares
  value: number
  frequency: string // daily_trading / weekly / monthly
  day_of_month?: number | null
  day_of_week?: number | null
  status: string // active / paused
  next_due?: string
  last_fired_at?: string
  note?: string
}

// ── 基金净值查询（新浪 f_ 接口）──
export interface FundQuote {
  code: string
  name: string
  unit_nav: number
  cum_nav: number
  prev_nav: number
  date: string // YYYY-MM-DD
  change_pct: number
}

// 基金盘中估值（来自东财 Fund_JJJZ_Data，9:30-15:00 实时；非交易时段 estimate_nav=0）
export interface FundEstimate {
  code: string
  name: string
  unit_nav: number           // 官方单位净值
  daily_change_pct: number   // 官方净值日增长率 %
  estimate_nav: number       // 盘中估算净值，非交易时段为 0
  estimate_change_pct: number// 盘中估算增长率 %
}

// ── 截图导入：LLM 识别出的记录草稿 ──
export interface ImportRecord {
  kind: 'fund' | 'stock'
  code: string
  name: string
  action_type: string // BUY | ADD | REDEEM | SELL
  amount?: number
  shares?: number
  nav?: number
  price?: number
  trade_date?: string
  platform?: string
  fee?: number
  status?: string // confirmed / pending
}

// 问问市场：会话与消息
export interface Session {
  id: number
  title: string
  updated_at: string
  msg_count: number
}

export interface Message {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// 大盘指数返回结构依赖数据源，这里放宽类型以兼容不同 provider。
export type MarketIndex = Record<string, unknown>

// 实时行情报价（对齐后端 market.Quote 的 json tag）。
// 沙箱无外网时拿不到，前端按「暂无行情」降级，绝不编造。
export interface Quote {
  stock_code: string
  stock_name: string
  price: number // 当前价
  open: number
  high: number
  low: number
  prev_close: number // 昨收
  volume: number // 股
  amount: number // 元
  change_pct: number // 涨跌幅 %
  amplitude: number // 振幅 %
}

// 股票搜索建议（自动补全）
export interface StockSuggest {
  code: string // 6 位代码
  name: string // 股票/基金名称
  pinyin?: string // 拼音首字母
  market: string // SH / SZ / BJ（基金为空）
  type: 'STOCK' | 'FUND' // 区分股票 / 基金
}

export interface ApiErrorShape {
  detail: string
}

// 净值曲线（对齐后端 /api/portfolio/curve）
export interface CurveMetrics {
  return_pct: number // 区间收益%（TWR 终点 − 100）
  max_drawdown_pct: number // 最大回撤%（基于 TWR）
  bench_return_pct?: number | null
  excess_pct?: number | null
  start_date: string
  current_value: number // 当前组合账面价值
  basis: string // 'cost'=成本基线 / 'market'=市值
}

export interface Curve {
  dates: string[]
  value: number[] // 组合账面价值（成本基线口径）
  twr: number[] // 时间加权净值（起点 100）
  bench_name?: string
  bench?: number[] // 基准（起点 100），不可达时为空
  metrics: CurveMetrics
  note?: string
}

// ── 策略栏（诚实版：中性参考 + 账本复盘）──
export interface IndicatorSnapshot {
  ma20: number
  ma60: number
  ma120: number
  ma250: number
  macd: { dif: number; dea: number; hist: number }
  rsi: number
  kdj: { k: number; d: number; j: number }
}

export interface SignalItem {
  name: string
  state: 'above' | 'below' | 'golden' | 'dead' | 'overbought' | 'oversold' | 'neutral'
  text: string
}

export interface DecisionReview {
  first_buy_date: string
  holding_days: number
  cost_price: number
  last_close: number
  pnl_pct: number
  pnl_abs: number
  shares: number
}

export interface StrategyReport {
  code: string
  name: string
  last_close: number
  indicators: IndicatorSnapshot
  signals: SignalItem[]
  trend: 'up' | 'down' | 'sideways'
  decision_review?: DecisionReview
  disclaimer: string
}

export type BacktestStrategy = 'single_ma' | 'ma_cross' | 'consensus'

export interface BacktestParams {
  strategy: BacktestStrategy
  ma_n?: number
  ma_fast?: number
  ma_slow?: number
}

export interface BacktestReport {
  code: string
  name: string
  strategy: string
  total_return: number
  hold_return: number
  excess: number
  max_dd: number
  win_rate: number
  trades: number
  time_in_market: number
  curve_timing: number[]
  curve_hold: number[]
  note: string
}
