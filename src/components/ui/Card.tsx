import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  /** 可点击卡片：hover 上浮 + 阴影加深 */
  interactive?: boolean
  children: ReactNode
}

/**
 * 卡片容器。
 * 层级表达同时用了阴影和内描边（ring-card）：浅色下阴影是主角、描边几乎看不见；
 * 深色下阴影天然不可见，描边接管层级 —— 这是深色适配最容易翻车的地方。
 */
export function Card({
  padded = true,
  interactive = false,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <div
      className={[
        'rounded-card bg-surface ring-card shadow-card',
        'transition-[transform,box-shadow] duration-300 ease-out-apple',
        interactive && 'hover:-translate-y-1 hover:shadow-lift cursor-pointer',
        padded && 'p-5 sm:p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
