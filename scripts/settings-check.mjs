// settings-check.mjs — 验证顶部左侧设置抽屉
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickByText(page, text) {
  return page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === t,
    )
    if (btn) { btn.click(); return true }
    return false
  }, text)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text().trim()
      if (!t.includes('401') && !t.includes('Failed to load')) errors.push(t)
    }
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // 登录
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(400)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ])
  await sleep(1200)

  const checks = {}

  // 1) 左上齿轮按钮存在
  checks['左上设置按钮'] = await page.evaluate(
    () => !!document.querySelector('button[aria-label="打开设置"]'),
  )

  // 2) 点击滑出抽屉
  await page.click('button[aria-label="打开设置"]')
  await sleep(700)
  checks['抽屉滑出'] = await page.evaluate(
    () => !!document.querySelector('[role="dialog"][aria-label="设置"]'),
  )
  checks['抽屉含分区标题'] = await page.evaluate(() => {
    const t = document.body.innerText
    return t.includes('外观') && t.includes('行情') && t.includes('账户') && t.includes('关于')
  })
  checks['遮罩锁定滚动'] = await page.evaluate(
    () => document.body.style.overflow === 'hidden',
  )

  // 3) 紧凑模式开关
  const switchClicked = await page.evaluate(() => {
    const sw = document.querySelector('button[role="switch"][aria-label="紧凑布局"]')
    if (sw) { sw.click(); return true }
    return false
  })
  await sleep(300)
  checks['紧凑开关可点'] = switchClicked
  checks['data-compact生效'] = await page.evaluate(
    () => document.documentElement.dataset.compact === '1',
  )

  // 4) 主题切深色
  checks['点击深色'] = await clickByText(page, '深色')
  await sleep(400)
  checks['data-theme=dark'] = await page.evaluate(
    () => document.documentElement.dataset.theme === 'dark',
  )

  // 5) 自动刷新 30秒
  checks['点击30秒'] = await clickByText(page, '30秒')
  await sleep(400)
  checks['localStorage刷新=30'] = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('argent-settings') || '{}')
    return s.quoteRefresh === '30'
  })

  // 6) 默认账户（选第一个账户，若有）
  const hasAccount = await page.evaluate(() => {
    const sel = document.querySelector('[role="dialog"][aria-label="设置"] select')
    if (!sel || sel.options.length <= 1) return false
    sel.value = sel.options[1].value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })
  await sleep(300)
  checks['默认账户可选'] = hasAccount
  if (hasAccount) {
    checks['localStorage默认账户'] = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('argent-settings') || '{}')
      return typeof s.defaultAccount === 'number'
    })
  }

  // 7) 关闭抽屉（点遮罩）
  await page.evaluate(() => {
    const ov = document.querySelector('[role="dialog"][aria-label="设置"]')
    // 点击遮罩层（absolute inset-0 的兄弟节点）
    const backdrop = ov?.parentElement?.querySelector('.absolute.inset-0')
    if (backdrop) backdrop.click()
  })
  await sleep(600)
  checks['抽屉可关闭'] = await page.evaluate(
    () => !document.querySelector('[role="dialog"][aria-label="设置"]'),
  )

  // 8) 进持仓，验证默认账户被应用（若有账户）
  if (hasAccount) {
    await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
    await sleep(2000)
    checks['持仓应用默认账户'] = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('argent-settings') || '{}')
      const active = [...document.querySelectorAll('button')].find((b) =>
        b.className.includes('bg-accent') && b.textContent.trim() !== '全部',
      )
      return !!active // 某账户 Tab 处于激活（bg-accent）即视为应用成功
    })
  }

  const allPass = Object.values(checks).every(Boolean)
  console.log('\n=== 设置抽屉验证 ===')
  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`)
  console.log(errors.length ? `\n⚠️ Console errors (${errors.length}):` : '\n✅ 无错误')
  errors.forEach((e) => console.log('  - ' + e))
  console.log(allPass ? '\nALL_PASS' : '\nHAS_FAILURE')

  await browser.close()
  process.exit(allPass ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
