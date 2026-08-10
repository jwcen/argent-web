// dashboard-funds-check.mjs — 验证概览页把基金统计进来
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

  // 概览页
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
  await sleep(3000)

  const result = await page.evaluate(() => {
    const t = document.body.textContent || ''
    return {
      // 标的数应含基金（之前 4 只 A股 + 3 只场外）
      hasCoverage: /覆盖 \d+ 只标的/.test(t),
      coverageText: (t.match(/覆盖 \d+ 只标的/) || [])[0],
      // 概览「我的持仓」列表应出现基金名
      hasFundInList: t.includes('易方达蓝筹精选混合') || t.includes('招商中证白酒') || t.includes('易方达蓝筹'),
      hasStockInList: t.includes('大华股份') || t.includes('贵州茅台'),
      // 持仓分布应有基金（成本口径）
      hasFundInSlices: t.includes('易方达蓝筹精选混合') || t.includes('招商中证白酒') || t.includes('易方达蓝筹'),
      // 流水笔数/资金流向
      hasFlow: t.includes('资金流向'),
      // 组合市值/浮动盈亏（场外有估值时应显示）
      hasValue: t.includes('组合市值'),
    }
  })
  console.log('概览统计:', JSON.stringify(result, null, 2))
  const pass = result.hasCoverage && result.hasFundInList && result.hasFlow
  console.log(`基金已并入概览: ${pass ? '✅' : '❌'}`)

  // 截图
  await page.screenshot({ path: '/tmp/dashboard-with-funds.png' })
  console.log('saved /tmp/dashboard-with-funds.png')

  await sleep(800)
  console.log(`\nConsole 错误数: ${errors.length}`)
  if (errors.length) errors.forEach((e) => console.log('  -', e))
  console.log(pass && errors.length === 0 ? 'ALL_PASS' : 'CHECK_FAILED')
  await browser.close()
}

main().catch((e) => {
  console.error('SCRIPT_ERROR', e)
  process.exit(1)
})
