import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'

/**
 * 移动端底部 Tab Bar。
 *
 * 三个移动端要点：
 * 1. pb-safe —— 全面屏 iPhone 底部有 Home Indicator，不留安全区会被压住；
 * 2. 每个 Tab 高度 64px、平分宽度，远超 44×44 的最小触摸目标；
 * 3. fixed 定位，所以 AppShell 必须给内容区补 pb-tabbar，否则最后一屏被遮。
 */
export function TabBar() {
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 glass border-t border-glass-line pb-safe"
      aria-label="主导航"
    >
      <ul className="flex items-stretch">
        {NAV.map((l) => (
          <li key={l.to} className="flex-1">
            <NavLink
              to={l.to}
              end={l.end}
              className="relative h-16 flex flex-col items-center justify-center gap-1 select-none"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <motion.span
                    animate={{ scale: isActive ? 1.06 : 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                    className={isActive ? 'text-accent' : 'text-ink-faint'}
                  >
                    <l.icon size={23} weight={isActive ? 'fill' : 'regular'} />
                  </motion.span>
                  <span
                    className={`text-[11px] leading-none font-medium ${
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
    </nav>
  )
}
