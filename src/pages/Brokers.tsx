import { useEffect, useState, type FormEvent } from 'react'
import { Check, PencilSimple, Plus, Storefront, Trash } from '@phosphor-icons/react'
import { brokers as brokerApi, ApiError } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useToasts } from '../lib/toast'
import type { Broker } from '../lib/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Reveal } from '../components/motion/Reveal'
import { PageHeader } from '../components/layout/PageHeader'
import { fmtNum } from '../lib/format'

/** 万分之几：0.00025 → 2.5 */
const toBps = (rate: number) => rate * 10000

export default function Brokers() {
  const api = useApi()
  const toast = useToasts()

  const [list, setList] = useState<Broker[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Broker | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Broker | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    void api(() => brokerApi.list())
      .then(setList)
      .catch(() => setList([]))
  }
  useEffect(load, [api])

  const confirmDelete = () => {
    if (!pendingDelete) return
    setDeleting(true)
    void api(() => brokerApi.remove(pendingDelete.id))
      .then(() => {
        toast.success(`已删除「${pendingDelete.name}」`)
        load()
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : '删除失败'))
      .finally(() => {
        setDeleting(false)
        setPendingDelete(null)
      })
  }

  const openAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="券商"
        description="设置各家券商的佣金费率，记账时的手续费会按这里的规则自动估算。"
        action={
          <Button icon={<Plus size={18} weight="bold" />} onClick={openAdd}>
            添加券商
          </Button>
        }
      />

      {list === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Storefront size={30} weight="duotone" />}
            title="还没有券商"
            description="添加第一家券商，交易成本就能算准 —— 佣金、印花税、过户费都会自动带上。"
            action={
              <Button icon={<Plus size={18} weight="bold" />} onClick={openAdd}>
                添加券商
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((b, i) => (
            <Reveal key={b.id} delay={Math.min(i * 0.05, 0.25)}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-title-3 font-semibold truncate">{b.name}</span>
                    {b.is_default && <Badge tone="accent">默认</Badge>}
                  </div>
                  <div className="flex shrink-0 -mr-2">
                    <button
                      onClick={() => {
                        setEditing(b)
                        setModalOpen(true)
                      }}
                      className="w-11 h-11 grid place-items-center rounded-full text-ink-faint
                                 transition-colors hover:text-ink hover:bg-surface-2"
                      aria-label={`编辑 ${b.name}`}
                    >
                      <PencilSimple size={18} />
                    </button>
                    <button
                      onClick={() => setPendingDelete(b)}
                      className="w-11 h-11 grid place-items-center rounded-full text-ink-faint
                                 transition-colors hover:text-danger hover:bg-danger/10"
                      aria-label={`删除 ${b.name}`}
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <Rate label="股票佣金" rate={b.stock_rate} min={b.stock_min} />
                  <Rate label="ETF 佣金" rate={b.etf_rate} min={b.etf_min} />
                </dl>
              </Card>
            </Reveal>
          ))}
        </div>
      )}

      <BrokerModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false)
          toast.success(editing ? '券商已更新' : '券商已添加')
          load()
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title={`删除「${pendingDelete?.name ?? ''}」？`}
        description="已记录的历史流水不受影响，但之后记账时将不能再选择这家券商。"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

/**
 * 费率展示。原始值 0.00025 这种小数没人读得出量级，
 * 换算成「万 2.5」才是券商行业里真正在用的说法。
 */
function Rate({ label, rate, min }: { label: string; rate: number; min: number }) {
  return (
    <div className="rounded-tile bg-surface-2 px-4 py-3">
      <dt className="text-micro text-ink-faint">{label}</dt>
      <dd className="mt-1">
        <span className="text-title-3 font-semibold tnum">万 {fmtNum(toBps(rate), 2)}</span>
        {min > 0 && (
          <span className="block mt-0.5 text-micro text-ink-faint tnum">
            最低 {fmtNum(min, 2)} 元
          </span>
        )}
      </dd>
    </div>
  )
}

function BrokerModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: Broker | null
  onClose: () => void
  onSaved: () => void
}) {
  const api = useApi()
  const [name, setName] = useState('')
  const [stockRate, setStockRate] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [etfRate, setEtfRate] = useState('')
  const [etfMin, setEtfMin] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setStockRate(editing ? String(editing.stock_rate) : '')
    setStockMin(editing ? String(editing.stock_min) : '5')
    setEtfRate(editing ? String(editing.etf_rate) : '')
    setEtfMin(editing ? String(editing.etf_min) : '0.5')
    setIsDefault(editing?.is_default ?? false)
    setNameError('')
    setFormError('')
  }, [open, editing])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('请填写券商名称')
      return
    }
    setNameError('')
    setFormError('')
    setBusy(true)
    const body = {
      name: name.trim(),
      stock_rate: parseFloat(stockRate) || 0,
      stock_min: parseFloat(stockMin) || 0,
      etf_rate: parseFloat(etfRate) || 0,
      etf_min: parseFloat(etfMin) || 0,
      is_default: isDefault,
    }
    try {
      if (editing) await api(() => brokerApi.update(editing.id, body))
      else await api(() => brokerApi.create(body))
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '保存失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? '编辑券商' : '添加券商'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="名称"
          name="name"
          placeholder="如 华泰证券"
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="股票佣金率"
            name="stock_rate"
            type="number"
            step="0.00001"
            inputMode="decimal"
            placeholder="0.00025"
            value={stockRate}
            onChange={(e) => setStockRate(e.target.value)}
            hint="万 2.5 填 0.00025"
          />
          <Input
            label="股票最低佣金"
            name="stock_min"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="5"
            value={stockMin}
            onChange={(e) => setStockMin(e.target.value)}
            hint="单位：元"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="ETF 佣金率"
            name="etf_rate"
            type="number"
            step="0.00001"
            inputMode="decimal"
            placeholder="0.0001"
            value={etfRate}
            onChange={(e) => setEtfRate(e.target.value)}
          />
          <Input
            label="ETF 最低佣金"
            name="etf_min"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0.5"
            value={etfMin}
            onChange={(e) => setEtfMin(e.target.value)}
          />
        </div>

        {/* 复选框：真正的 input 藏在 sr-only 里保证键盘与读屏可达，
            外面那层 label 才是 44px 的触摸目标 */}
        <label className="flex items-center gap-3 min-h-11 cursor-pointer select-none">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span
            className={`w-6 h-6 rounded-md border grid place-items-center transition-colors
                        peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent
                        peer-focus-visible:outline-offset-2 ${
                          isDefault ? 'bg-accent border-accent text-on-accent' : 'border-line'
                        }`}
          >
            {isDefault && <Check size={15} weight="bold" />}
          </span>
          <span className="text-caption">设为默认券商</span>
        </label>

        {formError && (
          <p className="rounded-field bg-danger/10 px-4 py-3 text-caption text-danger">
            {formError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            取消
          </Button>
          <Button type="submit" loading={busy} className="flex-1">
            保存
          </Button>
        </div>
      </form>
    </Modal>
  )
}
