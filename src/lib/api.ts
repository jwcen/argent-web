import type {
  Action,
  ActionType,
  AssetType,
  Account,
  AccountSummary,
  BacktestParams,
  BacktestReport,
  Broker,
  Curve,
  DCASchedule,
  DividendEvent,
  ExternalAction,
  ExternalAsset,
  FundEstimate,
  FundQuote,
  Holding,
  ImportRecord,
  MarketIndex,
  Quote,
  Message,
  RealizedResult,
  Session,
  StockAnalysis,
  StockSuggest,
  StrategyReport,
  TechnicalDetail,
  User,
  WatchlistItem,
} from './types'

// ── 错误模型 ──
// 后端统一错误体为 { "detail": "..." }，这里把它包成带状态码的异常，
// 页面层用 try/catch 拿到中文错误文案直接展示。
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// 401 会被上层（auth 上下文 / 路由守卫）统一处理，这里用一个哨兵值标记。
export const UNAUTHORIZED = 'UNAUTHORIZED'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData 时不能手动设 Content-Type：浏览器必须自动生成 multipart boundary，
  // 否则后端收不到 file 字段。其他情况默认 JSON。
  const isForm = init?.body instanceof FormData
  const headers = isForm
    ? { ...(init?.headers || {}) }
    : { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  const res = await fetch(path, {
    credentials: 'include', // 同源代理下自动带上 HttpOnly 会话 cookie
    headers,
    ...init,
  })

  if (res.status === 401) {
    throw new ApiError(401, UNAUTHORIZED)
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const detail = (data && (data as { detail?: string }).detail) || `请求失败 (${res.status})`
    throw new ApiError(res.status, detail)
  }
  return data as T
}

const get = <T>(p: string) => request<T>(p)
const post = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const put = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' })

// ── 认证 ──
export const auth = {
  sendCode: (email: string) => post('/api/auth/send-code', { email }),
  login: (email: string, password: string) =>
    post<User>('/api/auth/login', { email, password }),
  register: (email: string, password: string, code: string) =>
    post<User>('/api/auth/register', { email, password, code }),
  logout: () => post('/api/auth/logout'),
  me: () => get<User>('/api/auth/me'),
}

// ── 持仓 ──
export interface CreateActionInput {
  action_type: ActionType
  price: number
  shares: number
  note?: string
  trade_date?: string
  trade_time?: string
  fee?: number | null
  broker?: string
  account_id?: number | null
}
export const portfolio = {
  listHoldings: (accountId?: number | null) =>
    accountId != null
      ? get<Holding[]>(`/api/portfolio?account_id=${accountId}`)
      : get<Holding[]>('/api/portfolio'),
  realized: () => get<RealizedResult[]>('/api/portfolio/realized'),
  listActions: (code: string) => get<Action[]>(`/api/portfolio/${code}/actions`),
  createAction: (code: string, body: CreateActionInput) =>
    post<{ id: number }>(`/api/portfolio/${code}/actions`, body),
  updateAction: (id: number, body: CreateActionInput) =>
    put<{ ok: boolean }>(`/api/portfolio/actions/${id}`, body),
  deleteAction: (id: number) => del<{ ok: boolean }>(`/api/portfolio/actions/${id}`),
  getThesis: (code: string) =>
    get<{ code: string; name: string; thesis: string }>(`/api/portfolio/thesis/${code}`),
  upsertThesis: (code: string, name: string, thesis: string) =>
    put(`/api/portfolio/thesis/${code}`, { name, thesis }),
  deleteThesis: (code: string) => del(`/api/portfolio/thesis/${code}`),

  // 除权除息事件。按 (code, ex_date) 幂等，重复提交不会重复摊薄。
  listDividends: (code: string) => get<DividendEvent[]>(`/api/portfolio/${code}/dividends`),
  upsertDividend: (code: string, body: DividendInput) =>
    post<{ id: number }>(`/api/portfolio/${code}/dividends`, body),
  deleteDividend: (id: number) => del<{ ok: boolean }>(`/api/portfolio/dividends/${id}`),

  // 净值曲线 TWR（对齐 Python portfolio_curve）。days 为轴长上限，默认 500（全历史抽稀）。
  getCurve: (days = 500) => get<Curve>(`/api/portfolio/curve?days=${days}`),
}

export interface DividendInput {
  ex_date: string
  cash_per_share?: number
  bonus_ratio?: number
  note?: string
}

// ── 自选（股票 / 基金）──
export const watchlist = {
  list: () => get<WatchlistItem[]>('/api/watchlist'),
  add: (item_type: 'STOCK' | 'FUND', code: string, name?: string, added_price?: number | null) =>
    post('/api/watchlist', { item_type, code, name, added_price }),
  remove: (item_type: 'STOCK' | 'FUND', code: string) =>
    del(`/api/watchlist/${item_type}/${code}`),
}

// ── 券商 ──
export interface BrokerInput {
  name: string
  stock_rate: number
  stock_min: number
  etf_rate: number
  etf_min: number
  is_default: boolean
}
export const brokers = {
  list: () => get<Broker[]>('/api/brokers'),
  create: (b: BrokerInput) => post<{ id: number }>('/api/brokers', b),
  update: (id: number, b: BrokerInput) => put<{ ok: boolean }>(`/api/brokers/${id}`, b),
  remove: (id: number) => del<{ ok: boolean }>(`/api/brokers/${id}`),
}

// ── 账户分组 ──
export interface AccountInput {
  name: string
  kind?: string // 'stock' | 'fund' | 'bank' | 'custom'
  color?: string
  sort_order?: number
}
export const accounts = {
  list: () => get<Account[]>('/api/accounts'),
  create: (a: AccountInput) => post<{ id: number }>('/api/accounts', a),
  update: (id: number, a: AccountInput) => put<{ ok: boolean }>(`/api/accounts/${id}`, a),
  remove: (id: number) => del<{ ok: boolean }>(`/api/accounts/${id}`),
  summaries: () => get<AccountSummary[]>('/api/accounts/summaries'),
}

// ── 场外资産 ──
export interface AssetInput {
  asset_type: AssetType
  code: string
  name: string
  platform?: string
  cost_amount?: number
  shares?: number | null
  manual_value?: number | null
  note?: string
  annual_yield_rate?: number | null
  start_date?: string
  purchase_fee_rate?: number | null
}
export interface ExternalActionInput {
  action_type: string
  amount: number
  shares?: number | null
  unit_price?: number | null
  fee?: number
  trade_date: string
  status?: string
  note?: string
}
export interface DCAInput {
  asset_id: number
  mode: string
  value: number
  frequency: string
  day_of_month?: number | null
  day_of_week?: number | null
  status?: string
  note?: string
}
export const assets = {
  list: () => get<ExternalAsset[]>('/api/assets'),
  create: (body: AssetInput) => post<{ id: number }>('/api/assets', body),
  update: (id: number, body: Partial<AssetInput>) =>
    put<{ ok: boolean }>(`/api/assets/${id}`, body),
  remove: (id: number) => del<{ ok: boolean }>(`/api/assets/${id}`),
  listActions: (id: number) => get<ExternalAction[]>(`/api/assets/${id}/actions`),
  addLot: (id: number, body: ExternalActionInput) =>
    post<{ id: number }>(`/api/assets/${id}/add-lot`, body),
  reduceLot: (id: number, body: ExternalActionInput) =>
    post<{ id: number }>(`/api/assets/${id}/reduce-lot`, body),
  confirmAction: (assetId: number, actionId: number) =>
    post<{ ok: boolean }>(`/api/assets/${assetId}/actions/${actionId}/confirm`),
  deleteAction: (assetId: number, actionId: number) =>
    del<{ ok: boolean }>(`/api/assets/${assetId}/actions/${actionId}`),
}

// ── 定投 ──
export const dca = {
  list: () => get<DCASchedule[]>('/api/dca'),
  create: (body: DCAInput) => post<{ id: number }>('/api/dca', body),
  update: (id: number, body: Partial<DCAInput>) =>
    put<{ ok: boolean }>(`/api/dca/${id}`, body),
  remove: (id: number) => del<{ ok: boolean }>(`/api/dca/${id}`),
}

// ── 行情（数据源依赖外部服务，失败/空都按优雅降级处理）──
export const market = {
  indices: () => get<MarketIndex[]>('/api/market/indices'),
  quote: (code: string) => get<Record<string, unknown>>(`/api/market/quote/${code}`),
  batchQuote: (codes: string[]) =>
    get<Quote[]>(`/api/market/quote?codes=${codes.join(',')}`),
  funds: (codes: string[]) =>
    get<FundQuote[]>(`/api/market/funds?codes=${codes.join(',')}`),
  // 基金盘中估值（盘内 estimate_nav>0，盘外回落官方净值）
  fundsEstimate: (codes: string[]) =>
    get<FundEstimate[]>(`/api/market/funds-estimate?codes=${codes.join(',')}`),
  // 股票代码/名称模糊搜索（自动补全）
  stockSearch: (keyword: string, limit = 10) =>
    get<StockSuggest[]>(`/api/market/stock-search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`),
}

// ── 策略栏（诚实版：中性参考 + 账本复盘）+ 回测 + 个股详情 ──
export const strategy = {
  // 所有 A 股持仓的策略报告（策略栏数据源）
  list: () => get<{ items: StrategyReport[] }>('/api/strategy'),
  // 单只报告
  one: (code: string) => get<StrategyReport>(`/api/strategy/${code}`),
  // 技术面明细（K线 + 指标序列 + 支撑压力）
  detail: (code: string) => get<TechnicalDetail>(`/api/strategy/${code}/detail`),
  // 结构化 AI 分析（方向/建议/触发/风险）
  analysis: (code: string) => post<StockAnalysis>(`/api/strategy/${code}/analysis`),
  // 对任意 A 股代码做策略回测
  backtest: (payload: { code: string; name?: string } & BacktestParams) =>
    post<BacktestReport>('/api/strategy/backtest', payload),
}

// ── 截图导入（LLM 识别 → 返回草稿，确认后走 assets/portfolio 创建）──
export const imports = {
  screenshot: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ records: ImportRecord[] }>('/api/import/screenshot', {
      method: 'POST',
      body: form,
    })
  },
}

// ── 问问市场 ──
export const ask = {
  listSessions: () => get<{ sessions: Session[] }>('/api/ask/sessions'),
  getSession: (id: number) =>
    get<{ id: number; title: string; updated_at: string; messages: Message[] }>(
      `/api/ask/sessions/${id}`,
    ),
  deleteSession: (id: number) => del<{ ok: boolean }>(`/api/ask/sessions/${id}`),
  // 持久化一条消息：session_id=0 时新建会话（title 作标题），返回分配到的 session_id
  appendMessage: (input: {
    session_id: number
    role: 'user' | 'assistant'
    content: string
    title?: string
  }) => post<{ session_id: number; id: number }>('/api/ask/messages', input),
}

export interface AskHistoryTurn {
  role: string
  content: string
}

// agent 一次工具调用的前端视图模型，来自后端 SSE 的 {type:'tool'} 事件。
// 后端 ToolEvent 的字段：name / args? / result? / error? / phase("call"|"result"|"error")
export interface ToolEvent {
  name: string
  args?: string
  result?: string
  error?: string
  phase: 'call' | 'result' | 'error'
}

// SSE 流式问答。逐字 yield 文本片段，调用方拼接到界面上即为「打字机」效果。
// 若传入 onTool，每次 agent 调用工具（开始/返回/出错）都会回调，供前端实时展示「正在查什么」。
export async function* streamAsk(
  question: string,
  history: AskHistoryTurn[] = [],
  onTool?: (t: ToolEvent) => void,
): AsyncGenerator<string> {
  const res = await fetch('/api/ask/stock/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  })

  if (!res.ok || !res.body) {
    let msg = `问答服务不可用 (${res.status})`
    try {
      const t = await res.text()
      const d = t ? JSON.parse(t) : null
      if (d && d.detail) msg = d.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分隔事件
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      try {
        const ev = JSON.parse(json)
        if (ev.type === 'answer') yield ev.text as string
        else if (ev.type === 'tool' && onTool) onTool(ev.tool as ToolEvent)
        else if (ev.type === 'error') throw new ApiError(500, ev.error as string)
      } catch (e) {
        if (e instanceof ApiError) throw e
        // 解析非预期行：忽略，不中断流
      }
    }
  }
}
