import { ChartPieSlice, ChatCircle, Storefront, Wallet, Coins } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

export interface NavItem {
  to: string
  label: string
  icon: Icon
  end: boolean
}

// 桌面顶栏与移动端底部 Tab 共用同一份配置，避免两处漂移。
export const NAV: NavItem[] = [
  { to: '/', label: '概览', icon: ChartPieSlice, end: true },
  { to: '/portfolio', label: '持仓', icon: Wallet, end: false },
  { to: '/assets', label: '资产', icon: Coins, end: false },
  { to: '/brokers', label: '券商', icon: Storefront, end: false },
  { to: '/ask', label: '问问', icon: ChatCircle, end: false },
]
