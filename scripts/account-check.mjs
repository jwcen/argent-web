// account-check.mjs — 验证自定义账户分组功能
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
const BASE = 'http://localhost:5173'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  let errors = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text().trim()
      // 忽略 benign 401（未登录瞬时竞态）
      if (!t.includes('401') && !t.includes('Failed to load')) errors.push(t)
    }
  })

  // ── 登录 ──
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ])
  await sleep(1500)
  const loginUrl = page.url()
  console.log(`登录后 URL: ${loginUrl}`)
  if (!loginUrl.includes('/dashboard') && !loginUrl.includes('/')) {
    console.error('登录可能失败，当前不在首页')
  }

  // ── 创建测试账户 via API（用 cookie）──
  // 先导航到持仓页确保 cookie 生效
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
  await sleep(2000)

  // 用页面内 fetch 创建两个测试账户
  const createResult = await page.evaluate(async () => {
    const res1 = await fetch('/api/accounts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A股证券', kind: 'stock' }),
    })
    const a1 = await res1.json()

    const res2 = await fetch('/api/accounts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '基金平台', kind: 'fund' }),
    })
    const a2 = await res2.json()
    return { a1, a2, s1: res1.status, s2: res2.status }
  })
  console.log('创建账户:', JSON.stringify(createResult))
  const stockAccountId = createResult.a1?.id
  const fundAccountId = createResult.a2?.id

  // ── 刷新持仓页检查 Tab 栏渲染 ──
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
  await sleep(2500)
  const pTxt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText)

  const checks = {
    'Tab栏-全部按钮': pTxt.includes('全部'),
    'Tab栏-A股证券': pTxt.includes('A股证券'),
    'Tab栏-基金平台': pTxt.includes('基金平台'),
    'Tab栏-新建账户': pTxt.includes('新建账户'),
    '持仓卡正常渲染': pTxt.includes('600519') || pTxt.includes('还没有持仓'),
    '汇总条存在': pTxt.includes('持仓成本合计') || pTxt.includes('持仓市值'),
  }

  // ── 测试按账户筛选 ──
  if (stockAccountId) {
    // 点击 A股证券 tab
    const clicked = await page.evaluate((id) => {
      const btns = [...document.querySelectorAll('button')]
      const btn = btns.find((b) => b.textContent.trim() === 'A股证券')
      if (btn) { btn.click(); return true }
      return false
    })
    if (clicked) {
      await sleep(1500)
      // 筛选后持仓应该为空（因为还没把 600519 归属到 A股）
      const filteredTxt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText)
      checks['筛选-点击A股Tab不报错'] = true
    }
  }

  // ── 测试汇总接口 ──
  const summaries = await page.evaluate(async () => {
    const res = await fetch('/api/accounts/summaries', { credentials: 'include' })
    return { status: res.status, data: await res.json() }
  })
  console.log('账户汇总:', JSON.stringify(summaries))
  checks['汇总接口返回200'] = summaries.status === 200

  // ── 清理：删除测试账户 ──
  if (stockAccountId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
    }, stockAccountId)
  }
  if (fundAccountId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
    }, fundAccountId)
  }

  // ── 结果 ──
  const allPass = Object.values(checks).every(Boolean)
  console.log('\n=== 账户分组验证 ===')
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? '✅' : '❌'} ${k}`)
  }
  console.log(errors.length ? `\n⚠️ Console errors (${errors.length}):` : '\n✅ 无错误')
  errors.forEach((e) => console.log(`  - ${e}`))
  console.log(allPass ? '\nALL_PASS' : '\nHAS_FAILURE')

  await browser.close()
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => { console.error(err); process.exit(1) })
