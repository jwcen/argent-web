# Argent Web

Argent 投资组合工具的**前端**，与后端 [`argent-go`](https://github.com/jwcen/argent-go) **彻底前后端分离**。

- 技术栈：**React 18 + TypeScript + Vite + Tailwind CSS v4**
- 动画：**Framer Motion**（滚动淡入、浮层过渡、微交互）
- 图标：**Phosphor Icons**（无 emoji）
- 设计语言：**Apple 官网风**——大量留白、系统字体栈（Apple 设备即 SF Pro）、单一蓝色强调色、大圆角白卡、液态玻璃导航栏。设计为原创，不复制任何现有产品的视觉资产。
- 鉴权：沿用后端的 **HttpOnly 会话 cookie**（`argent_session`），前端不直接接触 token。

---

## 与后端的关系

| 项 | 说明 |
| --- | --- |
| API 基址 | 所有请求走同源 `/api/*`，由开发代理 / 生产反向代理转发到 `argent-go` |
| 鉴权 | 浏览器自动携带会话 cookie；`fetch` 用 `credentials: 'include'` |
| 错误格式 | 后端统一返回 `{ "detail": "..." }`，前端 `ApiError` 直接展示中文文案 |
| 数据流 | 全部 JSON，`snake_case`（与后端约定一致） |

已接入的端点（核心闭环）：

- 认证：`/api/auth/login` `register` `send-code` `logout` `me`
- 持仓：`/api/portfolio`（列表）、`/api/portfolio/:code/actions`（流水增删）
- 券商：`/api/brokers`（增删改）
- 问问市场：`/api/ask/stock/stream`（**SSE 流式**）、`/api/ask/sessions`（历史会话持久化）
- 行情：`/api/market/indices`（依赖外部数据源；未接入时前端优雅降级）

---

## 本地开发

前置：Node ≥ 18（推荐 20+）。

```bash
# 1. 安装依赖（首次）
npm install

# 2. 启动开发服务器（默认 5173）
npm run dev

# 3. 另开一个终端，启动后端（默认 8889）
#    见 argent-go 仓库：go run ./cmd/argent  或编译后运行
```

前端会把 `http://localhost:5173/api/*` 代理到后端 `http://localhost:8889`（见 `vite.config.ts`）。
想指向别的后端地址，设置环境变量即可：

```bash
API_TARGET=http://192.168.1.10:8889 npm run dev
```

> 登录测试账号（来自 argent-go 的黄金向量）：`alice@test.com` / `password123`

常用脚本：

```bash
npm run dev        # 开发服务器
npm run build      # 生产构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # tsc 类型检查
```

---

## 构建与部署（前后端分离形态）

`npm run build` 产出纯静态文件到 `dist/`。部署时：

1. 把 `dist/` 交给任意静态服务器（Nginx / Vercel / Cloudflare Pages / 对象存储…）。
2. 在反向代理层把 `/api` 转发到 `argent-go` 后端，例如 Nginx：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8889;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

这样前端是独立制品，后端是独立服务，互不相扰。

> 注：`argent-go` 仓库里仍保留着旧的嵌入式 `web/static`（作为服务器兜底静态页），
> 但**不再是活跃 UI**；新的 Argent Web 在独立仓库迭代，通过 API 对接。

---

## 目录结构

```
src/
├── lib/            # 与框架无关的逻辑
│   ├── types.ts    # 后端 JSON 形状映射
│   ├── api.ts      # fetch 封装 + 各端点 + SSE 生成器
│   ├── auth.tsx    # 基于 cookie 的鉴权上下文
│   ├── useApi.ts   # 401 自动跳转登录的调用守卫
│   └── format.ts   # 金额 / 百分比 / 日期格式化
├── components/
│   ├── ui/         # Button / Card / Input / Modal / Skeleton / Badge / EmptyState / Spinner
│   ├── layout/     # Navbar（液态玻璃）/ AppShell
│   └── motion/     # Reveal（滚动淡入）
├── pages/          # Login / Dashboard / Portfolio / Brokers / Ask
├── App.tsx         # 路由 + 登录守卫
├── main.tsx        # 入口
└── index.css       # Tailwind + 设计令牌（配色 / 圆角 / 字体）
```

---

## 已知边界

- **行情数据**：需要后端接入外部行情源（如东方财富）。未接入时大盘卡片显示「行情数据暂未连接」，不影响其余功能。
- **问问市场**：后端未配置 LLM key 时走本地演示降级（流式仍可见）；配置 `ARGENT_LLM_API_KEY` 后接入真实模型。
