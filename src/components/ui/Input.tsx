import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { CaretDown } from '@phosphor-icons/react'

// 表单控件共用的外观。
// 字号必须 ≥16px（这里是 17px 的 text-body）—— iOS Safari 在聚焦
// 小于 16px 的输入框时会强制放大整个页面，是移动端最常见的体验事故。
const fieldBase =
  'w-full rounded-field bg-surface text-body text-ink min-h-12 px-4 py-3 ' +
  'border outline-none transition-[border-color,box-shadow] duration-200 ' +
  'placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent/15'

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-micro font-medium text-ink-soft mb-1.5">
      {children}
    </label>
  )
}

function Helper({ error, hint }: { error?: string; hint?: ReactNode }) {
  if (error) return <p className="mt-1.5 text-micro text-danger">{error}</p>
  if (hint) return <p className="mt-1.5 text-micro text-ink-faint">{hint}</p>
  return null
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: ReactNode
  /** 输入框右侧的操作槽（如密码显隐）。放在包裹层里定位，不受 label/error 高度影响 */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, className = '', id, name, ...rest },
  ref,
) {
  const inputId = id || name
  return (
    <div>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <input
          id={inputId}
          name={name}
          ref={ref}
          aria-invalid={!!error}
          className={`${fieldBase} ${error ? 'border-danger' : 'border-line'} ${
            trailing ? 'pr-13' : ''
          } ${className}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </div>
        )}
      </div>
      <Helper error={error} hint={hint} />
    </div>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className = '', id, name, children, ...rest },
  ref,
) {
  const selectId = id || name
  return (
    <div>
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <div className="relative">
        <select
          id={selectId}
          name={name}
          ref={ref}
          className={`${fieldBase} appearance-none pr-10 ${
            error ? 'border-danger' : 'border-line'
          } ${className}`}
          {...rest}
        >
          {children}
        </select>
        <CaretDown
          size={16}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint"
        />
      </div>
      <Helper error={error} hint={hint} />
    </div>
  )
})
