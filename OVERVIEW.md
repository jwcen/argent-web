# Argent Web —— 前后端分离新前端（概览）

## 做了什么
为 `argent-go` 后端从零搭建了一个**独立仓库**的前端 `argent-web`（位于 `/Users/jcen/projects/argent-web`），与原来的嵌入式 `web/static` 彻底解耦。

- **技术栈**：React 18 + TypeScript + Vite 5 + Tailwind CSS v4，Framer Motion 动画，Phosphor 图标。
- **设计**：Apple 官网风——系统字体栈（Apple 设备即 SF Pro）、单一蓝色强调色、大圆角白卡、液态玻璃导航栏；全原创，规避侵权。
- **鉴权**：沿用后端 HttpOnly 会话 cookie，前端不接触 token。
- **核心闭环**：登录/注册、概览仪表盘（Bento 布局）、持仓（流水增删 + 持仓展开）、券商（增删改）、问问市场（SSE 流式对话 + 历史会话持久化）。

## 关键架构决策
- 前端 5173 经 Vite 代理把 `/api` 转到后端 8889，**同源**因此 cookie 自动携带，无需 CORS。
- SSE 代理关闭缓冲，保证「问问市场」逐字流式输出。
- 生产形态：`npm run build` 产出 `dist/`，由静态服务器托管 + 反向代理 `/api`。

## 验证结果
- `npm run typecheck` 通过，`npm run build` 成功（JS 354KB / gzip 113KB，CSS 29KB）。
- 端到端（经代理以 alice 登录）：`/api/auth/*`、`/api/portfolio`、`/api/brokers`、`/api/ask/sessions` 均 200 并返回真实数据。
- `/api/market/indices` 在沙箱中因无外网返回 500——前端已做优雅降级（显示「行情数据暂未连接」）。

## 文件
- 入口与配置：`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/index.css`、`README.md`
- 逻辑层：`src/lib/{types,api,auth,useApi,format}.ts(x)`
- 组件：`src/components/{ui,layout,motion}/`
- 页面：`src/pages/{Login,Dashboard,Portfolio,Brokers,Ask}.tsx`

## 后续可选
- 自选股、数据导入导出、外部资产/DCA、行情 K 线等其余后端能力可分期接入。
- 接真实 LLM（后端配 `ARGENT_LLM_API_KEY`）后「问问市场」即出真实回答。
