// 展示层格式化工具。后端时间列为 UTC 的 'YYYY-MM-DD HH:MM:SS'，无时区后缀，
// 这里直接当作字符串处理，避免本地时区错位。

export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function pnlClass(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n) || n === 0) return 'text-ink-soft'
  return n > 0 ? 'text-up' : 'text-down'
}

// 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD'
export function dateOnly(s: string | undefined | null): string {
  if (!s) return '—'
  return s.slice(0, 10)
}

// 'YYYY-MM-DD HH:MM:SS' -> 'MM-DD HH:MM'
export function shortDateTime(s: string | undefined | null): string {
  if (!s) return '—'
  const t = s.slice(11, 16)
  return `${s.slice(5, 10)} ${t}`
}

// 取邮箱前缀作为展示昵称
export function nickname(email: string): string {
  return email.split('@')[0] || email
}
