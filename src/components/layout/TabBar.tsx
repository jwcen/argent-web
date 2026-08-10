import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'

/**
 * 移动端底部 Tab Bar —— iOS 悬浮风格。
 *
 * 设计要点：
 * 1. 药丸形悬浮条：左右留边距 + 大圆角 + 阴影，模拟 iOS 浮动 Tab；
 * 2. pb-safe 在悬浮条内部，Home Indicator 区域仍可安全点击；
 * 3. fixed 定位居中，AppShell 用 pb-tabbar 给内容区补出等高留白。
 */
export function TabBar() {
  return (
    <nav
      className="
        md:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none
        pb-[env(safe-area-inset-bottom)]
      "
      aria-label="主导航"
    >
      {/* 药丸形容器 */}
      <div
        className="
          pointer-events-auto mx-[max(12px,env(safe-area-inset-right))]
          mb-[max(8px,env(safe-area-inset-bottom))]
          w-[calc(100%-max(24px,2*env(safe-area-inset-left))-max(24px,2*env(safe-area-inset-right)))]
          max-w-[420px]
          glass rounded-2xl shadow-float border border-glass-line
          overflow-hidden
        "
      >
        <ul className="flex items-stretch">
          {NAV.map((l) => (
            <li key={l.to} className="flex-1">
              <NavLink
                to={l.to}
                end={l.end}
                className="relative h-14 flex flex-col items-center justify-center gap-0.5 select-none"
              >
                {({ isActive }) => (
                  <>
                    <motion.span
                      animate={{ scale: isActive ? 1.08 : 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                      className={isActive ? 'text-accent' : 'text-ink-faint'}
                    >
                      <l.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                    </motion.span>
                    <span
                      className={`text-[10px] leading-none font-medium ${
                        isActive ? 'text-accent' : 'text-ink-faint'
                      }`}
                    >
                      {l.label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
