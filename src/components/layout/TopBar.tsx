import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gear, SignOut } from '@phosphor-icons/react'
import { useAuth } from '../../lib/auth'
import { nickname } from '../../lib/format'
import { ThemeToggle } from '../ui/ThemeToggle'
import { NAV } from './nav'

/**
 * 顶栏 —— 三段式对称布局：
 *   左段：品牌（logo + 名称）
 *   中段：主导航胶囊（桌面端）/ 占位（移动端导航下沉到 TabBar）
 *   右段：操作区（设置 + 用户 + 主题 + 退出）
 *
 * 用 flex-1 + justify-center 让中段导航真正居中，
 * 左右两段宽度自适应内容，天然对称。
 */
export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 glass border-b border-glass-line pt-safe">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2">
        {/* ── 左段：品牌 ── */}
        <NavLink
          to="/"
          className="flex items-center gap-2 shrink-0 min-h-11 pr-2 rounded-full"
          aria-label="Argent 首页"
        >
          <img src="/favicon.svg" alt="" className="w-7 h-7" />
          <span className="text-[17px] font-semibold tracking-tight hidden sm:inline">Argent</span>
        </NavLink>

        {/* ── 中段：导航（桌面端）── */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className="relative min-h-11 px-4 grid place-items-center rounded-full text-caption font-medium transition-colors"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-surface-2"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-1.5 ${
                      isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <l.icon size={17} weight={isActive ? 'fill' : 'regular'} />
                    {l.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── 右段：操作区 ── */}
        <div className="flex items-center gap-0.5 shrink-0 justify-end">
          <button
            onClick={onOpenSettings}
            className="w-11 h-11 grid place-items-center rounded-full text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="打开设置"
            title="设置"
          >
            <Gear size={20} weight="regular" />
          </button>
          <span className="hidden lg:block text-caption text-ink-soft mr-1 max-w-[10rem] truncate">
            {user ? nickname(user.email) : ''}
          </span>
          <ThemeToggle />
          <button
            onClick={onLogout}
            className="w-11 h-11 grid place-items-center rounded-full text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="退出登录"
            title="退出登录"
          >
            <SignOut size={20} />
          </button>
        </div>
      </div>
    </header>
  )
}
