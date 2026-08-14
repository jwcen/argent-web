import { useEffect, useState, type FormEvent } from 'react'
import { Check } from '@phosphor-icons/react'
import { brokers as brokerApi, ApiError } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import type { Broker } from '../../lib/types'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'

/**
 * 券商费率编辑弹窗。券商管理原为独立页面（/brokers），已并入设置抽屉，
 * 弹窗作为共享组件供设置抽屉复用。
 */
export function BrokerModal({
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
