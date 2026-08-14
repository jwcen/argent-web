// shot-settings.mjs — 截图打开状态的设置抽屉
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
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(400)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ])
  await sleep(1200)
  await page.click('button[aria-label="打开设置"]')
  await sleep(800)
  await page.screenshot({ path: '/tmp/settings-drawer.png' })
  console.log('saved /tmp/settings-drawer.png')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
