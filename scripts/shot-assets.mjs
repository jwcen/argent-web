// shot-assets.mjs — 截资产页实图（含截图导入按钮与已导入基金）
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
  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 2 })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await sleep(1500)
  await page.goto(BASE + '/assets', { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.screenshot({ path: '/tmp/assets-funds.png' })
  console.log('saved /tmp/assets-funds.png')
  await browser.close()
}

main().catch((e) => {
  console.error('SCRIPT_ERROR', e)
  process.exit(1)
})
