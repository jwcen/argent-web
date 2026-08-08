import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 前后端分离：开发时前端跑在 5173，所有 /api 请求经代理转发到 argent-go（默认 8889）。
// 这样浏览器侧「同源」，HttpOnly 会话 cookie 自动随请求带上，无需处理 CORS。
// 线上部署时把前端静态产物交任意静态服务器托管，再在反向代理层把 /api 转到后端即可。
const API_TARGET = process.env.API_TARGET || 'http://localhost:8889'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          // 关掉代理层缓冲，保证 /api/ask/stock/stream 的 SSE 实时一字流出。
          proxy.on('proxyRes', (proxyRes) => {
            const ct = proxyRes.headers['content-type'] || ''
            if (ct.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
    },
  },
})
