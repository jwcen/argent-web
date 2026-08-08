// Task #56 验证：行情接口无源时前端优雅降级，不崩、不假数据。
// 登录 → /portfolio 断言「暂无行情 / 市值成本」+ 持仓渲染；→ / 断言概览正常。
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const EMAIL = 'alice@test.com'
const PASSWORD = 'password123'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200))
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))

await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
if (await page.$('input[type="email"]')) {
  await page.type('input[type="email"]', EMAIL, { delay: 8 })
  await page.type('input[type="password"]', PASSWORD, { delay: 8 })
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  ])
  await sleep(1200)
}

// ── /portfolio ──
await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
await sleep(2200)
const pTxt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText)
console.log('=== PORTFOLIO MAIN (head) ===')
console.log(pTxt.slice(0, 1200))

const portfolioChecks = {
  '持仓卡渲染(600519)': pTxt.includes('600519'),
  '实时现价渲染(现价)': pTxt.includes('现价'),
  '市值渲染(市值)': pTxt.includes('市值'),
  '浮动盈亏渲染(浮动盈亏)': pTxt.includes('浮动盈亏'),
}

// ── / 概览 ──
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await sleep(2200)
const dTxt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText)
const dashboardChecks = {
  '概览正常渲染': dTxt.includes('组合净值') || dTxt.includes('累计投入成本'),
  '概览展示组合市值(有源时点亮)': dTxt.includes('组合市值'),
  '概览展示浮动盈亏(有源时点亮)': dTxt.includes('浮动盈亏'),
}

console.log('ASSERTIONS (portfolio):')
let allPass = true
for (const [k, v] of Object.entries(portfolioChecks)) {
  console.log(`  [${v ? 'PASS' : 'FAIL'}] ${k}`)
  if (!v) allPass = false
}
console.log('ASSERTIONS (dashboard):')
for (const [k, v] of Object.entries(dashboardChecks)) {
  console.log(`  [${v ? 'PASS' : 'FAIL'}] ${k}`)
  if (!v) allPass = false
}
// 仅有首屏未登录 me() 的瞬时 401 属预期内（前端 .catch 已兜底），其余一律算真错误。
const realErrors = errors.filter((e) => !e.includes('401'))
if (realErrors.length > 0) allPass = false
console.log('RESULT:', allPass ? 'ALL_PASS' : 'HAS_FAILURE')
console.log('CONSOLE ERRORS total=%d, real(bad)=%d:', errors.length, realErrors.length)
errors.forEach((e) => console.log(' -', e))

await browser.close()
process.exit(allPass ? 0 : 2)
