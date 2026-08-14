import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, Palette, PencilSimple, Plus, Pulse, Storefront, Trash, Wallet, X } from '@phosphor-icons/react'
import { accounts as accountApi, brokers as brokerApi, ApiError } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToasts } from '../../lib/toast'
import { useTheme, type ThemePref } from '../../lib/theme'
import { useSettings, type QuoteRefresh } from '../../lib/settings'
import { Switch, SettingRow } from '../ui/Switch'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { BrokerModal } from '../ui/BrokerModal'
import { Badge } from '../ui/Badge'
import type { Account, Broker } from '../../lib/types'
import pkg from '../../../package.json'

// 万分之几：0.00025 → 2.5
const toBps = (rate: number) => rate * 10000

// 分段控件：用于主题、刷新间隔这类「互斥单选」。
function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-micro font-medium transition-colors ${
            value === o.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="py-5">
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-ink-faint">{icon}</span>
        <h4 className="text-micro font-semibold uppercase tracking-wider text-ink-faint">
          {title}
        </h4>
      </div>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  )
}

/**
 * 左侧滑出的设置抽屉。
 * 从屏幕左侧 translateX(-100%) → 0 滑入，背后一层毛玻璃遮罩。
 * 内容分区：外观 / 行情 / 账户 / 关于，均为真实生效的偏好。
 */
export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pref, setPref } = useTheme()
  const { settings, update } = useSettings()
  const api = useApi()
  const toast = useToasts()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [brokers, setBrokers] = useState<Broker[] | null>(null)
  const [brokerModal, setBrokerModal] = useState<{ open: boolean; editing?: Broker }>({ open: false })
  const [pendingBrokerDelete, setPendingBrokerDelete] = useState<Broker | null>(null)
  const [brokerDeleting, setBrokerDeleting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // 打开时才拉一次账户列表（用于「默认账户」选择）
  useEffect(() => {
    if (!open) return
    let alive = true
    api(() => accountApi.list())
      .then((a) => alive && setAccounts(a))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, api])

  // 券商费率配置（原独立页面已并入设置）
  useEffect(() => {
    if (!open) return
    let alive = true
    api(() => brokerApi.list())
      .then((b) => alive && setBrokers(b))
      .catch(() => alive && setBrokers([]))
    return () => {
      alive = false
    }
  }, [open, api])

  const confirmBrokerDelete = () => {
    if (!pendingBrokerDelete) return
    setBrokerDeleting(true)
    void api(() => brokerApi.remove(pendingBrokerDelete.id))
      .then(() => {
        toast.success(`已删除「${pendingBrokerDelete.name}」`)
        void api(() => brokerApi.list()).then(setBrokers).catch(() => {})
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '删除失败'))
      .finally(() => {
        setBrokerDeleting(false)
        setPendingBrokerDelete(null)
      })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const onConfirmClear = () => {
    try {
      localStorage.removeItem('argent-theme')
      localStorage.removeItem('argent-settings')
    } catch {
      /* ignore */
    }
    setConfirmClear(false)
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
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
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="设置"
            className="absolute left-0 top-0 h-full w-[300px] max-w-[85vw] bg-surface ring-card shadow-pop flex flex-col"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-line-soft">
              <h3 className="text-title-3 font-semibold tracking-tight">设置</h3>
              <button
                onClick={onClose}
                className="w-11 h-11 -mr-2 grid place-items-center rounded-full text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
                aria-label="关闭"
              >
                <X size={20} />
              </button>
            </div>

            {/* 主体可滚动 */}
            <div className="flex-1 overflow-y-auto px-4">
              <Section icon={<Palette size={16} />} title="外观">
                <SettingRow title="主题" desc="跟随系统会随设备深浅自动切换">
                  <Seg<ThemePref>
                    value={pref}
                    onChange={setPref}
                    options={[
                      { value: 'system', label: '跟随系统' },
                      { value: 'light', label: '浅色' },
                      { value: 'dark', label: '深色' },
                    ]}
                  />
                </SettingRow>
                <SettingRow title="紧凑布局" desc="收窄卡片与列表间距，一屏多看几行">
                  <Switch
                    checked={settings.compact}
                    onChange={(v) => update({ compact: v })}
                    label="紧凑布局"
                  />
                </SettingRow>
              </Section>

              <Section icon={<Pulse size={16} />} title="行情">
                <SettingRow title="自动刷新" desc="持仓市值按设定间隔自动拉取最新报价">
                  <Seg<QuoteRefresh>
                    value={settings.quoteRefresh}
                    onChange={(v) => update({ quoteRefresh: v })}
                    options={[
                      { value: 'off', label: '关闭' },
                      { value: '15', label: '15秒' },
                      { value: '30', label: '30秒' },
                      { value: '60', label: '60秒' },
                    ]}
                  />
                </SettingRow>
              </Section>

              <Section icon={<Wallet size={16} />} title="账户">
                <SettingRow title="默认账户" desc="打开持仓时优先展示该账户">
                  <select
                    value={settings.defaultAccount == null ? 'all' : String(settings.defaultAccount)}
                    onChange={(e) =>
                      update({
                        defaultAccount: e.target.value === 'all' ? null : Number(e.target.value),
                      })
                    }
                    className="rounded-field bg-surface-2 text-caption text-ink px-3 py-2 border border-line outline-none focus:border-accent"
                  >
                    <option value="all">全部账户</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </Section>

              <Section icon={<Storefront size={16} />} title="券商">
                <div className="flex items-center justify-between py-2 px-1">
                  <p className="text-caption text-ink-soft">佣金费率，记账时按此自动估算手续费</p>
                  <button
                    onClick={() => setBrokerModal({ open: true })}
                    className="shrink-0 inline-flex items-center gap-1 min-h-11 px-2 text-caption font-medium text-accent"
                  >
                    <Plus size={14} weight="bold" /> 添加
                  </button>
                </div>
                {brokers === null ? (
                  <p className="px-1 py-3 text-micro text-ink-faint">加载中…</p>
                ) : brokers.length === 0 ? (
                  <p className="px-1 py-3 text-micro text-ink-faint">还没有券商，添加一家以启用自动估算。</p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {brokers.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 rounded-tile bg-surface-2/60 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption font-medium truncate">{b.name}</span>
                            {b.is_default && <Badge tone="accent">默认</Badge>}
                          </div>
                          <p className="mt-0.5 text-micro text-ink-faint tnum">
                            股票 万 {fmtBps(b.stock_rate)}
                            {b.stock_min > 0 ? `（${b.stock_min}元）` : ''} · ETF 万 {fmtBps(b.etf_rate)}
                          </p>
                        </div>
                        <button
                          onClick={() => setBrokerModal({ open: true, editing: b })}
                          className="w-9 h-9 grid place-items-center rounded-full text-ink-faint hover:text-ink hover:bg-surface-2"
                          aria-label={`编辑 ${b.name}`}
                        >
                          <PencilSimple size={15} />
                        </button>
                        <button
                          onClick={() => setPendingBrokerDelete(b)}
                          className="w-9 h-9 grid place-items-center rounded-full text-ink-faint hover:text-danger hover:bg-danger/10"
                          aria-label={`删除 ${b.name}`}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={<Info size={16} />} title="关于">
                <SettingRow title="版本" desc="Argent Web 前端">
                  <span className="text-caption text-ink-soft">v{pkg.version}</span>
                </SettingRow>
                <SettingRow title="本地偏好" desc="主题、刷新间隔、默认账户等都存在本机浏览器">
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-caption font-medium text-danger hover:underline"
                  >
                    清除
                  </button>
                </SettingRow>
                <p className="px-1 pt-1 pb-2 text-micro text-ink-faint leading-relaxed">
                  行情数据来自外部服务，无网络时自动降级为空；所有持仓与账户数据均加密存储于你的个人库。
                </p>
              </Section>
            </div>
          </motion.aside>

          <ConfirmDialog
            open={confirmClear}
            title="清除本地偏好"
            description="将移除本机保存的主题、刷新间隔、默认账户等设置并恢复默认。此操作不会影响你的持仓数据。"
            confirmText="清除"
            onCancel={() => setConfirmClear(false)}
            onConfirm={onConfirmClear}
          />

          <ConfirmDialog
            open={!!pendingBrokerDelete}
            busy={brokerDeleting}
            title={`删除「${pendingBrokerDelete?.name ?? ''}」？`}
            description="已记录的历史流水不受影响，但之后记账时将不能再选择这家券商。"
            onCancel={() => setPendingBrokerDelete(null)}
            onConfirm={confirmBrokerDelete}
          />

          <BrokerModal
            open={brokerModal.open}
            editing={brokerModal.editing ?? null}
            onClose={() => setBrokerModal({ open: false })}
            onSaved={() => {
              setBrokerModal({ open: false })
              toast.success(brokerModal.editing ? '券商已更新' : '券商已添加')
              void api(() => brokerApi.list()).then(setBrokers).catch(() => {})
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function fmtBps(rate: number): string {
  return String(toBps(rate || 0).toFixed(2)).replace(/\.?0+$/, '')
}
