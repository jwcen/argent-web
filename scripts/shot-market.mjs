// 截图 Task #56 成果：/portfolio 与 / 概览（桌面 + 移动端），存到 .shots/。
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { mkdirSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const EMAIL = 'alice@test.com'
const PASSWORD = 'password123'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync('.shots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 2 })
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

await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
await sleep(2500)
await page.screenshot({ path: '.shots/market-portfolio-desktop.png', fullPage: true })
console.log('saved market-portfolio-desktop.png')

await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await sleep(2500)
await page.screenshot({ path: '.shots/market-dashboard-desktop.png', fullPage: true })
console.log('saved market-dashboard-desktop.png')

// 移动端
await page.setViewport({ width: 390, height: 1900, deviceScaleFactor: 2 })
await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
await sleep(2500)
await page.screenshot({ path: '.shots/market-portfolio-mobile.png', fullPage: true })
console.log('saved market-portfolio-mobile.png')

await browser.close()
