import type { ReactNode } from 'react'
import { Reveal } from '../motion/Reveal'

/**
 * 页面头部。移动端标题与操作按钮上下堆叠、按钮撑满宽度（拇指最容易够到
 * 的是屏幕下缘和整行宽度的目标）；桌面端才回到「标题在左、按钮在右」。
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Reveal>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-title-1 font-semibold">{title}</h1>
          {description && (
            <p className="mt-2 text-caption text-ink-soft max-w-xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">{action}</div>}
      </div>
    </Reveal>
  )
}
