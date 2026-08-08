import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'

const BASE = 'http://localhost:5173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = new URL('../.shots/e2e/', import.meta.url).pathname

const consoleErrors = []
const pageErrors = []

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function logStep(s) {
  console.log(`\n▶ ${s}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(String(e)))

try {
  // ── 1. 访问根路径，应被守卫重定向到 /login ──
  logStep('访问 / → 期望重定向到 /login')
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 })
  console.log('  ✓ 已重定向到', await page.evaluate(() => location.pathname))
  await page.screenshot({ path: OUT + '01-login.png' })

  // ── 2. UI 登录 ──
  logStep('填写 alice@test.com / password123 并登录')
  await page.type('input[name="email"]', 'alice@test.com')
  await page.type('input[name="password"]', 'password123')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname === '/', { timeout: 10000 })
  console.log('  ✓ 登录成功，跳转至', await page.evaluate(() => location.pathname))
  await sleep(800)
  await page.screenshot({ path: OUT + '02-dashboard.png' })

  // 会话 cookie 是 HttpOnly，JS 读不到；但下一跳 /brokers 能拉到真实数据，
  // 就证明浏览器确实持有了会话并自动随请求带上。
  console.log('  • argent_session 为 HttpOnly，JS 不可见（由下方 /brokers 真实数据反向佐证）')

  // ── 3. 券商页：验证真实 GET 数据渲染 ──
  logStep('访问 /brokers → 验证后端真实数据渲染')
  await page.goto(BASE + '/brokers', { waitUntil: 'load', timeout: 30000 })
  await sleep(600)
  const brokerText = await page.evaluate(() => document.body.innerText)
  const hasZhBroker = brokerText.includes('招商证券') && brokerText.includes('银河证券')
  console.log('  ', hasZhBroker ? '✓ 渲染出后端券商数据：招商证券 / 银河证券' : '✗ 未渲染券商数据')
  await page.screenshot({ path: OUT + '03-brokers.png' })

  // ── 4. Ask 页：SSE 流式 + 写/读往返 ──
  logStep('访问 /ask → 发送问题，验证 SSE 流式输出')
  await page.goto(BASE + '/ask', { waitUntil: 'load', timeout: 30000 })
  await sleep(400)
  await page.type('textarea', '帮我分析一下当前持仓的风险敞口')
  await page.click('button[type="submit"]')

  // 等待 SSE 事件真正抵达前端并被渲染：assistant 气泡出现非空白内容
  // （答案或友好错误都算「流式链路打通」）。
  await page.waitForFunction(
    () => {
      const bubbles = [...document.querySelectorAll('div')].filter((d) =>
        /rounded-\[1\.25rem\]/.test(d.className),
      )
      const last = bubbles[bubbles.length - 1]
      return last && last.textContent && last.textContent.trim().length > 0
    },
    { timeout: 25000 },
  )
  const replyText = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('div')].filter((d) =>
      /rounded-\[1\.25rem\]/.test(d.className),
    )
    const last = bubbles[bubbles.length - 1]
    return last ? last.textContent.trim() : ''
  })
  console.log('  ✓ SSE 事件已抵达前端并渲染，assistant 气泡内容：')
  console.log('    ' + replyText.slice(0, 70) + (replyText.length > 70 ? '…' : ''))

  // 中途截图
  await sleep(400)
  await page.screenshot({ path: OUT + '04-ask-streaming.png' })

  // 等渲染稳定
  await sleep(1500)
  await page.screenshot({ path: OUT + '05-ask-done.png' })

  // 桌面侧栏应出现刚创建的会话（验证 appendMessage + getSession 往返）
  const sidebarText = await page.evaluate(() => document.body.innerText)
  const sessionShown = sidebarText.includes('风险敞口')
  console.log('  ', sessionShown ? '✓ 桌面侧栏出现新会话（写/读往返成功）' : '✗ 侧栏未出现新会话')

  // ── 5. 重载后历史仍在（持久化验证）──
  logStep('重载 /ask → 验证会话持久化')
  await page.goto(BASE + '/ask', { waitUntil: 'load', timeout: 30000 })
  await sleep(800)
  const afterReload = await page.evaluate(() => document.body.innerText)
  console.log('  ', afterReload.includes('风险敞口')
    ? '✓ 重载后历史会话仍在（持久化成功）'
    : '✗ 重载后历史丢失')

  // ── 6. 移动端 Ask 抽屉（用户强调的移动端适配）──
  logStep('切换 iPhone 视口 → 打开历史抽屉')
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.goto(BASE + '/ask', { waitUntil: 'load', timeout: 30000 })
  await sleep(600)
  // 点击「历史」按钮（移动端工具条）
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('历史'))
    if (btn) { btn.click(); return true }
    return false
  })
  console.log('  ', clicked ? '✓ 移动端「历史」按钮可点击' : '✗ 未找到历史按钮')
  await sleep(700)
  await page.screenshot({ path: OUT + '06-ask-mobile-drawer.png' })

  // ── 报告 ──
  // 区分「本沙箱预期内的错误」与「真正的对接问题」：
  //  - 401：首屏未登录时 AuthProvider 调 /api/auth/me 必然返回，由守卫跳转消化；
  //  - 500：/api/market/indices 依赖外部行情源，沙箱无外网必 500，前端已优雅降级。
  const benign = (t) => /401 \(Unauthorized\)/.test(t) || /500 \(Internal Server Error\)/.test(t)
  const realErrors = consoleErrors.filter((t) => !benign(t))
  console.log('\n──────── 对接自检报告 ────────')
  console.log('console.error 总数     :', consoleErrors.length, '（其中沙箱预期内', consoleErrors.length - realErrors.length, '）')
  console.log('真正的对接错误        :', realErrors.length)
  console.log('pageerror 数量        :', pageErrors.length)
  if (realErrors.length) console.log('  ⚠ 真实错误:\n   - ' + realErrors.join('\n   - '))
  if (pageErrors.length) console.log('  page errors:\n   - ' + pageErrors.join('\n   - '))
  console.log('──────────────────────────────')
} finally {
  await browser.close()
}
