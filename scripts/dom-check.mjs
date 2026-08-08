// DOM 文本断言脚本：不依赖截图，直接抓取页面可见文本，用于验证渲染结果
// 用法: node scripts/dom-check.mjs /assets [/portfolio ...]
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const EMAIL = 'alice@test.com'
const PASSWORD = 'password123'

const routes = process.argv.slice(2)
if (routes.length === 0) routes.push('/assets')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200))
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))

// 登录
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

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle2' })
  await sleep(1500)
  const info = await page.evaluate(() => {
    const txt = (document.querySelector('main') || document.body).innerText
    return {
      url: location.pathname,
      textLen: txt.length,
      text: txt.slice(0, 2600),
      buttons: Array.from(document.querySelectorAll('button'))
        .map((b) => b.innerText.trim())
        .filter(Boolean)
        .slice(0, 30),
    }
  })
  console.log('='.repeat(70))
  console.log('ROUTE', route, '->', info.url, '| textLen=', info.textLen)
  console.log('-'.repeat(70))
  console.log(info.text)
  console.log('-'.repeat(70))
  console.log('BUTTONS:', JSON.stringify(info.buttons, null, 0))
}

console.log('='.repeat(70))
console.log('CONSOLE ERRORS (%d):', errors.length)
errors.forEach((e) => console.log(' -', e))

await browser.close()
