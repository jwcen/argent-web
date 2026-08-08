import { AnimatePresence, motion } from 'framer-motion'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type Tone = 'info' | 'error' | 'success'
interface Item {
  id: number
  text: string
  tone: Tone
}

const Ctx = createContext<((text: string, tone?: Tone) => void) | null>(null)

/**
 * 轻提示。存在的意义是替掉 window.alert —— 原生弹窗会阻塞主线程、
 * 样式无法跟随主题，在移动端还会顶掉页面焦点，是体验上的硬伤。
 *
 * 位置：移动端贴底（在 Tab Bar 之上，用 pb-tabbar 让开），桌面端右下角。
 * role="status" + aria-live="polite"：读屏会播报，但不会打断当前朗读。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const seq = useRef(0)

  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = ++seq.current
    setItems((l) => [...l, { id, text, tone }])
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 3600)
  }, [])

  const tones: Record<Tone, string> = {
    info: 'text-ink',
    error: 'text-danger',
    success: 'text-down',
  }

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2
                   px-4 pb-tabbar md:items-end md:px-6 md:pb-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((i) => (
            <motion.div
              key={i.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`pointer-events-auto max-w-sm rounded-full glass ring-card shadow-pop
                          px-5 py-3 text-caption font-medium ${tones[i.tone]}`}
            >
              {i.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}

/** 便捷封装：拿到统一的三种语气 */
export function useToasts() {
  const push = useToast()
  return useMemo(
    () => ({
      info: (t: string) => push(t, 'info'),
      error: (t: string) => push(t, 'error'),
      success: (t: string) => push(t, 'success'),
    }),
    [push],
  )
}
