import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { mkdirSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const OUT = '/Users/jcen/projects/argent-web/.shots/assets/'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const errors = []
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 登录 ──
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
await page.goto(BASE + '/login', { waitUntil: 'load' })
await page.waitForSelector('input[name=email]', { timeout: 10000 })
await page.type('input[name=email]', 'alice@test.com')
await page.type('input[name=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForFunction(() => location.pathname === '/', { timeout: 10000 })
await sleep(400)

// ── 浅色桌面：Assets 页 ──
await page.goto(BASE + '/assets', { waitUntil: 'load' })
await sleep(900)
await page.screenshot({ path: OUT + 'desktop-light.png' })

// 展开第一张卡片看流水 + 加/减仓按钮
const card = await page.$('main button[aria-expanded]')
if (card) { await card.click(); await sleep(500) }
await page.screenshot({ path: OUT + 'desktop-light-expanded.png' })

// ── 深色 iPhone ──
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await page.evaluate(() => localStorage.setItem('argent-theme', 'dark'))
await page.goto(BASE + '/assets', { waitUntil: 'load' })
await sleep(900)
await page.screenshot({ path: OUT + 'iphone-dark.png' })

console.log('console errors :', errors.length)
if (errors.length) console.log(errors.join('\n'))
console.log('done')
await browser.close()
