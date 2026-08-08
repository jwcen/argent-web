// Dashboard 净值曲线卡片渲染验证：登录 → 概览 → 断言组合净值/TWR/指标
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
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
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await sleep(2200)

const txt = await page.evaluate(() => (document.querySelector('main') || document.body).innerText)
console.log('=== DASHBOARD MAIN TEXT (head) ===')
console.log(txt.slice(0, 1600))
console.log('=== END ===')

const checks = {
  '组合净值卡片': txt.includes('组合净值'),
  'TWR 说明': txt.includes('时间加权收益') || txt.includes('TWR'),
  '区间收益': txt.includes('区间收益'),
  '最大回撤': txt.includes('最大回撤'),
  '净值图例': txt.includes('净值'),
  '成本基线口径提示': txt.includes('成本基线口径'),
}
console.log('ASSERTIONS:')
let allPass = true
for (const [k, v] of Object.entries(checks)) {
  console.log(`  [${v ? 'PASS' : 'FAIL'}] ${k}`)
  if (!v) allPass = false
}
console.log('RESULT:', allPass ? 'ALL_PASS' : 'HAS_FAILURE')
console.log('CONSOLE ERRORS (%d):', errors.length)
errors.forEach((e) => console.log(' -', e))

await browser.close()
process.exit(allPass ? 0 : 2)
