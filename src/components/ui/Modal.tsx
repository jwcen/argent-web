import { AnimatePresence, motion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * 浮层。移动端是从底部升起的 sheet，桌面端是居中对话框 —— 两种形态
 * 共用同一份内容，靠 CSS 断点切换。
 *
 * 移动端三个细节：
 * - 顶部 grabber 短横：暗示可关闭，是 iOS sheet 的通用语汇；
 * - pb-safe：底部按钮不会被 Home Indicator 压住；
 * - max-h-[88dvh] + 内部滚动：键盘弹出时表单仍可完整滚动到。
 */
export function Modal({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 锁滚动，避免背景跟着一起滑（移动端尤其明显）
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 打开时把焦点移进浮层，键盘用户不会还停在背后的页面上
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full sm:max-w-lg max-h-[88dvh] flex flex-col
                       bg-surface ring-card shadow-pop outline-none
                       rounded-t-[1.75rem] sm:rounded-card"
            initial={{ y: '100%', opacity: 1, scale: 1 }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            {/* 移动端 grabber */}
            <div className="sm:hidden pt-3 pb-1 grid place-items-center shrink-0">
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-6 pb-3 shrink-0">
              <h3 className="text-title-3 font-semibold tracking-tight">{title}</h3>
              <button
                onClick={onClose}
                className="w-11 h-11 -mr-2 grid place-items-center rounded-full text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
                aria-label="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 sm:px-6 pb-sheet sm:pb-6 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
