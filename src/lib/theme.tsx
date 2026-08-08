import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Resolved = 'light' | 'dark'

const KEY = 'argent-theme'

interface Ctx {
  /** 用户的偏好设置（可能是 system） */
  pref: ThemePref
  /** 实际生效的主题（system 已解析成 light/dark） */
  resolved: Resolved
  setPref: (p: ThemePref) => void
  /** 在浅/深之间直接切换，切换后即固定，不再跟随系统 */
  toggle: () => void
}

const ThemeCtx = createContext<Ctx | null>(null)

function readPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function systemIsDark(): boolean {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function apply(resolved: Resolved) {
  const root = document.documentElement
  root.dataset.theme = resolved
  // 让浏览器 UI（iOS Safari 地址栏、Android 状态栏）跟着变色，
  // 否则深色页面顶部会留一条突兀的白边。
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#f5f5f7')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [sysDark, setSysDark] = useState(systemIsDark)

  // 只在偏好为 system 时才需要关心系统变化，但监听始终挂着，
  // 这样用户从 light 切回 system 时能立刻拿到正确的系统值。
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: Resolved =
    pref === 'system' ? (sysDark ? 'dark' : 'light') : pref

  useEffect(() => {
    apply(resolved)
  }, [resolved])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  }, [])

  const toggle = useCallback(() => {
    setPref(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setPref])

  const value = useMemo(
    () => ({ pref, resolved, setPref, toggle }),
    [pref, resolved, setPref, toggle],
  )

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx)
  if (!c) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return c
}
