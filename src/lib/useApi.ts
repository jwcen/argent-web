import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from './api'
import { useAuth } from './auth'

// 统一收口 API 调用：任何 401（会话失效）都退出登录并跳回登录页，
// 其余错误原样上抛给页面层展示文案。
export function useApi() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return useCallback(
    async function guard<T>(fn: () => Promise<T>): Promise<T> {
      try {
        return await fn()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await logout()
          navigate('/login', { replace: true })
        }
        throw e
      }
    },
    [logout, navigate],
  )
}
