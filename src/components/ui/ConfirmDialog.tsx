import { Modal } from './Modal'
import { Button } from './Button'

/**
 * 破坏性操作确认框。
 *
 * 顺序刻意是「取消在左、确认在右」并让取消是 ghost、确认是 danger ——
 * 危险动作要显眼但不能是默认落点。移动端两个按钮各占一半宽度，
 * 保证 44px 触摸目标，避免误触删除。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '删除',
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {description && <p className="text-caption text-ink-soft leading-relaxed">{description}</p>}
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" block onClick={onCancel} className="flex-1">
          取消
        </Button>
        <Button variant="danger" block loading={busy} onClick={onConfirm} className="flex-1">
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}
