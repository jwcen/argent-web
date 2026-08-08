import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeSlash, Lightning, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import { auth as authApi, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Glow } from '../components/ui/Glow'
import { ThemeToggle } from '../components/ui/ThemeToggle'

type Mode = 'login' | 'register'

const HIGHLIGHTS = [
  { icon: <Lightning size={18} weight="duotone" />, text: '流水即真相，成本自动重算' },
  { icon: <ShieldCheck size={18} weight="duotone" />, text: '数据只落在你自己的库里' },
  { icon: <Sparkle size={18} weight="duotone" />, text: 'AI 随时陪你复盘一笔交易' },
]

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [sent, setSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(timerRef.current), [])

  const sendCode = async () => {
    if (!email) {
      setError('请先填写邮箱')
      return
    }
    setError('')
    try {
      await authApi.sendCode(email)
      setSent(true)
      setCountdown(60)
      timerRef.current = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            window.clearInterval(timerRef.current)
            return 0
          }
          return c - 1
        })
      }, 1000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '验证码发送失败')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, code)
      navigate('/', { replace: true })
    } catch (e) {
      // 失败时只显示错误，输入内容一律保留 —— 让用户重打一遍邮箱是最糟的设计
      setError(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError('')
    setSent(false)
    setCountdown(0)
    window.clearInterval(timerRef.current)
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-canvas">
      <Glow />

      <div className="absolute top-4 right-4 z-10 pt-safe">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 min-h-[100dvh] grid lg:grid-cols-2 gap-12 items-center py-14">
        {/* ── 左：品牌宣言。这是全站字号最大的地方，也是唯一的「一眼记住」 ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-surface/70 ring-card px-3.5 py-1.5 text-micro font-medium">
            <Sparkle size={14} weight="fill" className="text-accent" />
            Argent
          </div>

          <h1 className="mt-6 text-display font-semibold">
            把每一笔
            <br />
            <span className="text-accent">都记清楚。</span>
          </h1>

          <p className="mt-5 max-w-md text-body text-ink-soft leading-relaxed">
            投资的复利来自纪律，纪律来自记录。Argent 帮你把买卖、成本和想法留在同一个地方。
          </p>

          {/* 移动端隐藏：登录页上再多一屏说明只会挡住输入框 */}
          <ul className="mt-9 hidden lg:flex flex-col gap-3.5">
            {HIGHLIGHTS.map((h, i) => (
              <motion.li
                key={h.text}
                className="flex items-center gap-3 text-caption text-ink-soft"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-surface ring-card text-accent shrink-0">
                  {h.icon}
                </span>
                {h.text}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* ── 右：表单 ── */}
        <motion.div
          className="w-full max-w-[420px] justify-self-center lg:justify-self-end"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-card bg-surface ring-card shadow-lift p-6 sm:p-8">
            <h2 className="text-title-2 font-semibold">
              {mode === 'login' ? '欢迎回来' : '创建账户'}
            </h2>
            <p className="mt-2 text-caption text-ink-soft">
              {mode === 'login' ? '登录以查看你的投资组合' : '几步即可开始记录与复盘'}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              <Input
                label="邮箱"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="密码"
                type={showPwd ? 'text' : 'password'}
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="至少 8 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="w-11 h-11 grid place-items-center rounded-full text-ink-faint
                               transition-colors hover:text-ink"
                    aria-label={showPwd ? '隐藏密码' : '显示密码'}
                  >
                    {showPwd ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {mode === 'register' && (
                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <Input
                      label="验证码"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6 位邮箱验证码"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={sendCode}
                    disabled={sent && countdown > 0}
                    className="shrink-0 mt-[1.65rem] px-4"
                  >
                    {sent ? (countdown > 0 ? `${countdown}s` : '重发') : '获取'}
                  </Button>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-field bg-danger/10 px-4 py-3 text-caption text-danger"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                block
                size="lg"
                loading={busy}
                icon={busy ? undefined : <ArrowRight size={18} weight="bold" />}
              >
                {mode === 'login' ? '登录' : '注册并登录'}
              </Button>
            </form>

            <p className="mt-6 text-center text-caption text-ink-soft">
              {mode === 'login' ? '还没有账户？' : '已经有账户了？'}{' '}
              <button
                onClick={toggleMode}
                className="min-h-11 px-1 text-accent font-medium hover:underline underline-offset-4"
              >
                {mode === 'login' ? '立即注册' : '去登录'}
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
