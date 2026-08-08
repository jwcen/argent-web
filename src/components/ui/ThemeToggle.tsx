import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from '@phosphor-icons/react'
import { useTheme } from '../../lib/theme'

/**
 * 主题切换。点击在浅/深之间直接翻转（切换后即固定，不再跟随系统）。
 * 触摸目标 44×44，符合 iOS 人机指南的最小可点击尺寸。
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const isDark = resolved === 'dark'

  return (
    <button
      onClick={toggle}
      className={`relative w-11 h-11 grid place-items-center rounded-full text-ink-soft transition-colors hover:text-ink hover:bg-surface-2 ${className}`}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolved}
          className="absolute grid place-items-center"
          initial={{ opacity: 0, rotate: -75, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 75, scale: 0.6 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {isDark ? <Moon size={20} weight="fill" /> : <Sun size={20} weight="fill" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
