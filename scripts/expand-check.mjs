// 展开区 DividendPanel 渲染验证：登录 → 展开 600519 卡 → 断言除权面板内容
// 改进：点击后检测面板标题是否出现，未出现则再点一次（toggle），最多 3 轮；最终 dump 完整 main 文本
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const EMAIL = 'alice@test.com'
const PASSWORD = 'password123'
const TARGET_CODE = '600519'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))

await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
const hasLogin = await page.$('input[type="email"]')
if (hasLogin) {
  await page.type('input[type="email"]', EMAIL, { delay: 8 })
  await page.type('input[type="password"]', PASSWORD, { delay: 8 })
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  ])
  await sleep(1200)
}

await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
await sleep(2000)

async function clickCard() {
  return page.evaluate((code) => {
    const nodes = Array.from(document.querySelectorAll('button'))
    const btn = nodes.find((b) => b.textContent && b.textContent.includes(code))
    if (!btn) return 'NO_CARD_BUTTON'
    btn.scrollIntoView({ block: 'center' })
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return 'CLICKED'
  }, TARGET_CODE)
}

function mainText() {
  return page.evaluate(() => (document.querySelector('main') || document.body).innerText)
}

let expanded = false
for (let i = 0; i < 3; i++) {
  const r = await clickCard()
  console.log(`ROUND ${i + 1} click:`, r)
  await sleep(1800)
  const t = await mainText()
  if (t.includes('除权除息事件')) {
    expanded = true
    console.log(`ROUND ${i + 1}: panel rendered`)
    break
  } else {
    console.log(`ROUND ${i + 1}: panel NOT yet visible, retrying`)
  }
}

const txt = await mainText()
console.log('=== FULL MAIN TEXT ===')
console.log(txt)
console.log('=== END ===')

const checks = {
  '面板已展开(除权除息事件)': expanded,
  '除权日 2025-06-20': txt.includes('2025-06-20'),
  '每股派息 0.40': txt.includes('0.40') || txt.includes('0.4'),
  '已收分红痕迹(income)': txt.includes('已收分红') || txt.includes('520'),
  'suppressed 提示': txt.includes('已有手工分红流水'),
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
