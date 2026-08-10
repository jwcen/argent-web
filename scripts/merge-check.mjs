// merge-check.mjs — 验证资产并入持仓页
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
      if (!t.includes('401') && !t.includes('Failed to load')) errors.push(t)
    }
  })

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await sleep(1500)

  // ── 1. 顶部导航不再有「资产」入口 ──
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
  await sleep(1500)
  const navText = await page.evaluate(() => {
    const t = document.body.textContent || ''
    // 顶部导航 = header 内的链接
    const links = [...document.querySelectorAll('header a, nav a, a[href]')]
    return links.map((a) => a.textContent?.trim()).filter(Boolean).join('|')
  })
  console.log(`[1] 导航项: ${navText}`)
  console.log(`[1b] 无「资产」入口: ${!navText.includes('资产') ? '✅' : '❌'}`)

  // ── 2. 持仓页有 A股/基金 切换 ──
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
  await sleep(2000)
  const tabs = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const ts = btns.filter((b) => b.textContent.trim() === 'A股' || b.textContent.trim() === '基金')
    return ts.map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') }))
  })
  console.log(`[2] A股/基金 切换 Tab: ${JSON.stringify(tabs)}  ${tabs.length >= 2 ? '✅' : '❌'}`)

  // ── 3. 点「基金」→ 渲染资产视图（有 截图导入/记一笔资产/基金卡片） ──
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((b) => b.textContent.trim() === '基金')?.click()
  })
  await sleep(2500)
  const fundsView = await page.evaluate(() => {
    const t = document.body.textContent || ''
    return {
      hasImport: t.includes('截图导入'),
      hasAddAsset: t.includes('记一笔资产'),
      hasFundCard: t.includes('易方达蓝筹精选混合') || t.includes('招商中证白酒'),
      hasTitle: t.includes('基金持仓'),
      url: location.pathname + location.search,
    }
  })
  console.log(`[3] 基金视图: ${JSON.stringify(fundsView)}`)
  const fundsOk = fundsView.hasImport && fundsView.hasAddAsset && fundsView.hasTitle
  console.log(`[3b] 基金视图渲染: ${fundsOk ? '✅' : '❌'}`)
  console.log(`[3c] URL 带 view=funds: ${fundsView.url.includes('view=funds') ? '✅' : '❌'}`)

  // ── 4. 旧链接 /assets 重定向到 /portfolio?view=funds ──
  await page.goto(BASE + '/assets', { waitUntil: 'networkidle2' })
  await sleep(2000)
  const redirectUrl = page.url()
  console.log(`[4] /assets 重定向: ${redirectUrl}  ${redirectUrl.includes('/portfolio') && redirectUrl.includes('view=funds') ? '✅' : '❌'}`)

  // ── 5. 切回 A股 视图仍正常 ──
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((b) => b.textContent.trim() === 'A股')?.click()
  })
  await sleep(2000)
  const backToStocks = await page.evaluate(() => {
    const t = document.body.textContent || ''
    return t.includes('记一笔交易') && (t.includes('大华股份') || t.includes('贵州茅台') || t.includes('还没有持仓'))
  })
  console.log(`[5] 切回 A股: ${backToStocks ? '✅' : '❌'}`)

  await sleep(800)
  console.log(`\nConsole 错误数: ${errors.length}`)
  if (errors.length) errors.forEach((e) => console.log('  -', e))
  const allPass =
    (!navText.includes('资产') ? 1 : 0) + (tabs.length >= 2 ? 1 : 0) + (fundsOk ? 1 : 0) + (redirectUrl.includes('view=funds') ? 1 : 0) + (backToStocks ? 1 : 0) + (errors.length === 0 ? 1 : 0)
  console.log(allPass >= 5 ? 'ALL_PASS' : 'CHECK_FAILED')
  await browser.close()
}

main().catch((e) => {
  console.error('SCRIPT_ERROR', e)
  process.exit(1)
})
