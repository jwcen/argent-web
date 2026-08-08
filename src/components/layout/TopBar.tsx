import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SignOut } from '@phosphor-icons/react'
import { useAuth } from '../../lib/auth'
import { nickname } from '../../lib/format'
import { ThemeToggle } from '../ui/ThemeToggle'
import { NAV } from './nav'

/**
 * 顶栏。桌面端承载主导航（胶囊 + 滑动指示器），
 * 移动端只保留品牌与操作 —— 导航下沉到底部 TabBar，符合拇指可达区。
 */
export function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 glass border-b border-glass-line pt-safe">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
        {/* min-h-11：品牌位也是可点链接，同样要满足 44px 触摸目标 */}
        <NavLink
          to="/"
          className="flex items-center gap-2 shrink-0 min-h-11 pr-2 -ml-1 pl-1 rounded-full"
          aria-label="Argent 首页"
        >
          <img src="/favicon.svg" alt="" className="w-7 h-7" />
          <span className="text-[17px] font-semibold tracking-tight">Argent</span>
        </NavLink>

        {/* 桌面导航：激活态用共享 layoutId 做滑块，比逐个高亮更有连贯感 */}
        <nav className="hidden md:flex items-center gap-1">
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

        <div className="flex items-center gap-0.5 shrink-0">
          <span className="hidden lg:block text-caption text-ink-soft mr-2 max-w-[10rem] truncate">
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
