import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * 应用级偏好设置。后端当前没有专门的 settings 接口，
 * 所以这些偏好完全落在前端 localStorage，并尽量对界面产生真实可见的影响：
 *  - quoteRefresh 自动刷新行情（被 useQuotes 消费）
 *  - defaultAccount 持仓页默认打开的账户（被 Portfolio 消费）
 *  - compact 紧凑布局（写入 <html data-compact>，由 index.css 接管间距）
 */
export type QuoteRefresh = 'off' | '15' | '30' | '60'

export interface AppSettings {
  quoteRefresh: QuoteRefresh
  /** null = 全部账户 */
  defaultAccount: number | null
  compact: boolean
}

const DEFAULTS: AppSettings = {
  quoteRefresh: 'off',
  defaultAccount: null,
  compact: false,
}

const KEY = 'argent-settings'

interface Ctx {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  reset: () => void
}

const SettingsCtx = createContext<Ctx | null>(null)

function read(): Partial<AppSettings> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const out: Partial<AppSettings> = {}
    if (parsed && typeof parsed === 'object') {
      if (['off', '15', '30', '60'].includes(parsed.quoteRefresh))
        out.quoteRefresh = parsed.quoteRefresh
      if (parsed.defaultAccount === null || typeof parsed.defaultAccount === 'number')
        out.defaultAccount = parsed.defaultAccount
      if (typeof parsed.compact === 'boolean') out.compact = parsed.compact
    }
    return out
  } catch {
    return {}
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULTS,
    ...read(),
  }))

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* 隐私模式等场景写入失败，忽略即可 */
    }
  }, [settings])

  // 紧凑布局：挂到根元素，供 CSS 选择器读取
  useEffect(() => {
    const root = document.documentElement
    if (settings.compact) root.dataset.compact = '1'
    else delete root.dataset.compact
  }, [settings.compact])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const reset = useCallback(() => setSettings(DEFAULTS), [])

  const value = useMemo<Ctx>(
    () => ({ settings, update, reset }),
    [settings, update, reset],
  )

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx)
  if (!c) throw new Error('useSettings 必须在 SettingsProvider 内使用')
  return c
}
