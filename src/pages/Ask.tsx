import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Fragment,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChatCircle,
  ClockCounterClockwise,
  NotePencil,
  PaperPlaneRight,
  Trash,
  X,
  Spinner,
  Check,
  Warning,
  MagnifyingGlass,
  ChartLine,
  ChartLineUp,
  Wallet,
  ListBullets,
  Brain,
  Globe,
  Coins,
} from '@phosphor-icons/react'
import { ask, streamAsk, type ToolEvent, ApiError } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useToasts } from '../lib/toast'
import type { Session } from '../lib/types'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { shortDateTime } from '../lib/format'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

// agent 一次工具调用的前端状态（由后端 SSE 的 {type:'tool'} 累积而来）。
type ToolCall = {
  id: number
  name: string
  args: string
  status: 'running' | 'done' | 'error'
  result?: string
  error?: string
}

// 工具名 → 中文标签 + 图标，让「调了什么」一眼可读（对齐老版可视化）。
const TOOL_META: Record<string, { label: string; Icon: typeof MagnifyingGlass }> = {
  resolve_stock: { label: '解析股票代码', Icon: MagnifyingGlass },
  get_quote: { label: '查实时行情', Icon: ChartLine },
  get_trend: { label: '查历史走势', Icon: ChartLineUp },
  get_chain_quote: { label: '批量查行情', Icon: ChartLine },
  get_fund_quote: { label: '查基金净值', Icon: Coins },
  get_holdings: { label: '读取我的持仓', Icon: Wallet },
  get_asset_allocation: { label: '读取资产配置', Icon: Wallet },
  get_trades: { label: '读取成交记录', Icon: ListBullets },
  get_thesis: { label: '读取买入逻辑', Icon: Brain },
}

// 从工具参数 JSON 里抽出关键值做一行预览（query/code/stocks/codes/start/end 等）。
function argPreview(args: string): string {
  if (!args) return ''
  try {
    const o = JSON.parse(args) as Record<string, unknown>
    const vals = Object.entries(o)
      .filter(([, v]) => v !== '' && v != null)
      .map(([, v]) => (Array.isArray(v) ? (v as unknown[]).join('、') : String(v)))
    if (vals.length === 0) return ''
    return vals.join('  ·  ').slice(0, 90)
  } catch {
    return args.slice(0, 90)
  }
}

const EXAMPLES = [
  '帮我分析一下当前持仓的风险敞口',
  '茅台最近走势怎么样？',
  '定投和一次性买入各有什么优劣？',
]

export default function Ask() {
  const api = useApi()
  const toast = useToasts()

  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)
  // agent 本轮调用的工具（来自后端 SSE 的 {type:'tool'} 事件），用于实时展示「正在查什么」。
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const loadSessions = useCallback(() => {
    void api(() => ask.listSessions())
      .then((d) => setSessions(d.sessions))
      .catch(() => setSessions([]))
  }, [api])

  useEffect(loadSessions, [loadSessions])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  // textarea 自适应高度：先归零再按 scrollHeight 撑开，上限 8rem
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  const openSession = async (id: number) => {
    setDrawerOpen(false)
    try {
      const data = await api(() => ask.getSession(id))
      setActiveId(id)
      setMessages(
        data.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      )
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '加载会话失败')
    }
  }

  const newChat = () => {
    setDrawerOpen(false)
    setActiveId(null)
    setMessages([])
    setInput('')
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    await api(() => ask.deleteSession(id)).catch(() => toast.error('删除失败'))
    if (activeId === id) newChat()
    loadSessions()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])
    setToolCalls([])
    setStreaming(true)
    try {
      const persisted = await api(() =>
        ask.appendMessage({
          session_id: activeId ?? 0,
          role: 'user',
          content: text,
          title: activeId ? undefined : text.slice(0, 40),
        }),
      )
      const sid = persisted.session_id
      if (sid !== activeId) {
        setActiveId(sid)
        loadSessions()
      }

      // 后端 SSE 每调一次工具就回调：call 建卡片，result/error 收口对应卡片。
      const onTool = (t: ToolEvent) => {
        if (t.phase === 'call') {
          setToolCalls((prev) => [
            ...prev,
            { id: prev.length + 1, name: t.name, args: t.args ?? '', status: 'running' },
          ])
          return
        }
        setToolCalls((prev) => {
          const revIdx = [...prev]
            .reverse()
            .findIndex((c) => c.name === t.name && c.status === 'running')
          if (revIdx === -1) return prev
          const idx = prev.length - 1 - revIdx
          const next = [...prev]
          next[idx] = {
            ...next[idx],
            status: t.phase === 'error' ? 'error' : 'done',
            result: t.result,
            error: t.error,
          }
          return next
        })
      }

      let acc = ''
      for await (const chunk of streamAsk(text, history, onTool)) {
        acc += chunk
        setMessages((prev) => {
          const c = [...prev]
          c[c.length - 1] = { role: 'assistant', content: acc }
          return c
        })
      }

      await api(() => ask.appendMessage({ session_id: sid, role: 'assistant', content: acc }))
      loadSessions()
    } catch (e) {
      // 失败时把错误写进最后一条气泡，用户已发出的问题保持在原位
      setMessages((prev) => {
        const c = [...prev]
        if (c[c.length - 1]?.content === '') {
          c[c.length - 1] = {
            role: 'assistant',
            content: friendlyAskError(e),
          }
        }
        return c
      })
    } finally {
      setStreaming(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send()
  }

  const sessionList = (
    <SessionList
      sessions={sessions}
      activeId={activeId}
      onOpen={openSession}
      onDelete={(s, e) => {
        e.stopPropagation()
        setPendingDelete(s)
      }}
    />
  )

  return (
    <div className="flex-1 flex min-h-0 mx-auto w-full max-w-6xl">
      {/* ── 桌面侧栏 ── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line-soft px-4 py-5">
        <Button variant="secondary" block icon={<NotePencil size={17} />} onClick={newChat}>
          新建对话
        </Button>
        <div className="mt-4 flex-1 overflow-y-auto -mx-1 px-1">{sessionList}</div>
      </aside>

      {/* ── 对话区 ── */}
      <section className="flex-1 flex flex-col min-w-0">
        {/* 移动端专属工具条：桌面侧栏在这里塌缩成两个按钮，
            历史会话不再是「只有宽屏才存在」的功能 */}
        <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-line-soft">
          <button
            onClick={() => setDrawerOpen(true)}
            className="min-h-11 inline-flex items-center gap-2 px-3 rounded-full text-caption font-medium
                       text-ink-soft transition-colors active:bg-surface-2"
          >
            <ClockCounterClockwise size={18} />
            历史
            {sessions && sessions.length > 0 && (
              <span className="tnum text-micro text-ink-faint">{sessions.length}</span>
            )}
          </button>
          <button
            onClick={newChat}
            className="min-h-11 inline-flex items-center gap-2 px-3 rounded-full text-caption font-medium
                       text-accent transition-colors active:bg-accent-soft"
          >
            <NotePencil size={18} />
            新对话
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 overscroll-contain"
        >
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={<ChatCircle size={30} weight="duotone" />}
                title="问问市场"
                description="关于持仓、行情、投资策略的问题，都可以直接问。"
                action={
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:justify-center w-full">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => {
                          setInput(ex)
                          taRef.current?.focus()
                        }}
                        className="min-h-11 px-4 rounded-full border border-line-soft bg-surface
                                   text-caption text-ink-soft transition-colors
                                   hover:border-accent/40 hover:text-accent active:bg-surface-2"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          ) : (
            messages.map((m, i) => (
              <Fragment key={i}>
                {/* 流式回答前，把本轮 agent 调用的工具实时展示出来（对齐老版「调了好多工具」） */}
                {i === messages.length - 1 && m.role === 'assistant' && toolCalls.length > 0 && (
                  <ToolCalls calls={toolCalls} />
                )}
                <Bubble msg={m} streaming={streaming && i === messages.length - 1} />
              </Fragment>
            ))
          )}
        </div>

        {/* 输入区。pb-tabbar 让开移动端底部 Tab；桌面端回到常规内边距 */}
        <form
          onSubmit={onSubmit}
          className="border-t border-line-soft bg-surface/70 glass px-3 sm:px-5 pt-3 pb-tabbar md:pb-4"
        >
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // 移动端软键盘的 Enter 通常是换行，这里只在有物理键盘的宽屏上拦截
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="输入你的问题…"
              aria-label="问题输入框"
              className="flex-1 resize-none rounded-[1.375rem] border border-line bg-canvas
                         px-4 py-3 text-body min-h-12 max-h-32 outline-none
                         placeholder:text-ink-faint transition-[border-color,box-shadow]
                         focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              aria-label="发送"
              className="shrink-0 w-12 h-12 grid place-items-center rounded-full bg-accent text-on-accent
                         transition-[transform,opacity] duration-200 active:scale-95
                         disabled:opacity-30 disabled:pointer-events-none"
            >
              <PaperPlaneRight size={19} weight="fill" />
            </button>
          </div>
        </form>
      </section>

      {/* ── 移动端历史抽屉 ── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="md:hidden fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="历史对话"
              className="absolute inset-y-0 left-0 w-[82%] max-w-sm bg-surface shadow-pop
                         flex flex-col pt-safe"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line-soft">
                <h2 className="text-title-3 font-semibold">历史对话</h2>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-11 h-11 -mr-2 grid place-items-center rounded-full text-ink-faint active:bg-surface-2"
                  aria-label="关闭"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">{sessionList}</div>
              <div className="p-3 pb-sheet border-t border-line-soft">
                <Button variant="secondary" block icon={<NotePencil size={17} />} onClick={newChat}>
                  新建对话
                </Button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这段对话？"
        description={`「${pendingDelete?.title || '未命名对话'}」下的全部消息都会一并删除，且不可恢复。`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function SessionList({
  sessions,
  activeId,
  onOpen,
  onDelete,
}: {
  sessions: Session[] | null
  activeId: number | null
  onOpen: (id: number) => void
  onDelete: (s: Session, e: MouseEvent) => void
}) {
  if (sessions === null) {
    return <p className="px-3 py-3 text-caption text-ink-faint">加载中…</p>
  }
  if (sessions.length === 0) {
    return <p className="px-3 py-3 text-caption text-ink-faint">还没有历史对话</p>
  }
  return (
    <ul className="space-y-1">
      {sessions.map((s) => (
        <li key={s.id} className="relative">
          <button
            onClick={() => onOpen(s.id)}
            className={`group w-full min-h-12 text-left rounded-tile pl-3 pr-12 py-2.5 transition-colors ${
              activeId === s.id
                ? 'bg-accent-soft text-accent'
                : 'text-ink-soft hover:bg-surface-2 active:bg-surface-2'
            }`}
          >
            <span className="block text-caption font-medium truncate">
              {s.title || '未命名对话'}
            </span>
            <span className="block text-micro text-ink-faint tnum">
              {shortDateTime(s.updated_at)} · {s.msg_count} 条
            </span>
          </button>
          {/* 删除按钮独立于列表项按钮之外，避免嵌套 button（HTML 非法且移动端点击行为不可预期） */}
          <button
            onClick={(e) => onDelete(s, e)}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center
                       rounded-full text-ink-faint transition-colors hover:text-danger hover:bg-danger/10"
            aria-label={`删除对话 ${s.title || '未命名对话'}`}
          >
            <Trash size={16} />
          </button>
        </li>
      ))}
    </ul>
  )
}

// 把后端/流式抛出的原始错误翻译成用户能看懂的中文，避免把
// "agent: stream: error, status code: 403 Forbidden…" 这种技术栈暴露到界面。
// 把后端/流式抛出的原始错误翻译成用户能看懂的中文，并给出可执行指引。
// 注意：原始信息里可能含供应商技术细节，按需归类，避免把
// "agent: stream: error, status code: 403 Forbidden…" 直接暴露到界面。
function friendlyAskError(e: unknown): string {
  const m = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : '')
  const lower = m.toLowerCase()
  // 1) 供应商免费额度耗尽 / 需充值 / 余额不足 —— 重试没用，得动账号
  if (/free quota|free tier|quota|exhausted|add funds|insufficient|余额|额度/i.test(lower))
    return 'AI 服务免费额度已用完。请到阿里云百炼控制台充值，或改用其他供应商的 API key（改 .env 的 ARGENT_LLM_* 后重启后端）。'
  // 2) 密钥无效 / 未授权
  if (/401|unauthorized|invalid api key|invalid key|认证|鉴权/i.test(lower))
    return 'AI 服务密钥无效或未授权，请检查后端 .env 里的 ARGENT_LLM_API_KEY。'
  // 3) 403 但非额度问题（权限/区域/模型不可见等）
  if (/403|forbidden/i.test(lower))
    return 'AI 服务拒绝访问（密钥或权限问题），请检查 ARGENT_LLM_API_KEY / MODEL / BASE_URL 配置。'
  // 4) 网络 / 出口代理连不上
  if (/timeout|deadline|context canceled|dial tcp|connection refused|proxy|no route|network/i.test(lower))
    return 'AI 服务网络连接失败，请确认出口代理（如 Clash，默认 127.0.0.1:7890）正在运行。'
  // 5) 其他：把可读信息原样带上，便于排查
  if (m) return `出错了：${m}`
  return '出错了，请稍后重试。'
}

// 工具调用实时卡片：agent 每调一次工具，这里就多一张卡。
// 运行中显示转圈 + 参数预览；完成后换成对勾并附一行结果摘要。
function ToolCalls({ calls }: { calls: ToolCall[] }) {
  const running = calls.some((c) => c.status === 'running')
  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {running && (
        <p className="text-micro text-ink-faint px-1 pb-0.5">正在调用工具…</p>
      )}
      {calls.map((c) => {
        const meta = TOOL_META[c.name] ?? { label: c.name, Icon: MagnifyingGlass }
        const { Icon } = meta
        return (
          <div
            key={c.id}
            className="flex items-start gap-2 rounded-[0.875rem] bg-surface/70 ring-card px-3 py-2"
          >
            <span className="mt-0.5 grid place-items-center w-5 h-5 shrink-0">
              {c.status === 'running' ? (
                <Spinner size={16} className="animate-spin text-accent" />
              ) : c.status === 'error' ? (
                <Warning size={16} className="text-danger" />
              ) : (
                <Check size={16} className="text-accent" weight="bold" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-caption font-medium text-ink-soft">
                <Icon size={15} className="text-ink-faint" />
                {meta.label}
              </div>
              {c.args && (
                <p className="mt-0.5 text-micro text-ink-faint truncate">{argPreview(c.args)}</p>
              )}
              {c.status === 'done' && c.result && (
                <p className="mt-0.5 text-micro text-ink-faint line-clamp-2 leading-relaxed">
                  {c.result.slice(0, 160)}
                </p>
              )}
              {c.status === 'error' && c.error && (
                <p className="mt-0.5 text-micro text-danger line-clamp-2">{c.error}</p>
              )}
            </div>
          </div>
        )
      })}
    </motion.div>
  )
}

function Bubble({ msg, streaming }: { msg: ChatMsg; streaming: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 text-body leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'rounded-[1.25rem] rounded-br-md bg-accent text-on-accent'
            : 'rounded-[1.25rem] rounded-bl-md bg-surface ring-card text-ink'
        }`}
      >
        {/* 空内容 + 正在流式 = 还没吐第一个字，用光标占位比转圈更贴近对话感 */}
        {!isUser && msg.content === '' && streaming ? (
          <span className="caret text-ink-faint" />
        ) : (
          <>
            {msg.content}
            {!isUser && streaming && <span className="caret" />}
          </>
        )}
      </div>
    </motion.div>
  )
}
