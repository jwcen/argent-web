import { useState, type ReactNode } from 'react'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'
import { SettingsDrawer } from './SettingsDrawer'

/**
 * 应用外壳。
 * `flush` 用于需要自行接管整屏高度的页面（如 Ask 的对话区），
 * 此时不加最大宽度与纵向内边距，由页面自己控制。
 */
export function AppShell({
  children,
  flush = false,
}: {
  children: ReactNode
  flush?: boolean
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <main
        className={
          flush
            ? 'flex-1 flex flex-col min-h-0'
            : // pb-tabbar：移动端底部 Tab 是 fixed 的，必须补出等高留白，
              // 否则页面滚到底时最后一张卡片会被永久遮住。
              'flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 pb-tabbar md:pb-16'
        }
      >
        {children}
      </main>
      <TabBar />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
