export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 整屏加载态（用于路由守卫判定登录态期间）
export function FullSpinner() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center text-ink-faint">
      <Spinner size={28} />
    </div>
  )
}
