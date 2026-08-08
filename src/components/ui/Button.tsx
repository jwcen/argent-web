import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    block,
    icon,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  // min-h-11 = 44px：iOS 人机指南的最小触摸目标，移动端必须保证。
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-medium select-none ' +
    'min-h-11 transition-[transform,background-color,color,box-shadow] duration-200 ease-out-apple ' +
    'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none'

  const sizes: Record<Size, string> = {
    sm: 'px-3.5 min-h-11 text-micro',
    md: 'px-5 text-caption',
    lg: 'px-7 min-h-[3.25rem] text-body',
  }

  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-on-accent hover:bg-accent-press shadow-[0_2px_12px_-2px_var(--c-accent)]',
    secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
    ghost: 'text-ink-soft hover:text-ink hover:bg-surface-2',
    danger: 'bg-danger text-white hover:brightness-110',
    inverse: 'bg-inverse text-on-inverse hover:opacity-90',
  }

  return (
    <button
      ref={ref}
      disabled={loading || disabled}
      className={[base, sizes[size], variants[variant], block && 'w-full', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  )
})
