// seed-and-shot.mjs — 种演示账户并截图持仓页
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
  await page.setViewport({ width: 1280, height: 1400, deviceScaleFactor: 2 })

  // 登录
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ])
  await sleep(1500)

  // 去持仓页确保 cookie 生效，再看现有账户
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
  await sleep(2000)

  const existing = await page.evaluate(async () => {
    const res = await fetch('/api/accounts', { credentials: 'include' })
    return res.ok ? await res.json() : []
  })
  console.log('现有账户:', JSON.stringify(existing))

  const want = [
    { name: 'A股证券', kind: 'stock' },
    { name: '基金平台', kind: 'fund' },
    { name: '支付宝', kind: 'bank' },
  ]
  for (const w of want) {
    if (!existing.find((a) => a.name === w.name)) {
      const r = await page.evaluate(async (acc) => {
        const res = await fetch('/api/accounts', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acc),
        })
        return res.status
      }, w)
      console.log(`创建 ${w.name}: ${r}`)
    }
  }

  // 刷新持仓页截图
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.screenshot({ path: '/tmp/portfolio-accounts.png', fullPage: true })
  console.log('截图已保存 /tmp/portfolio-accounts.png')

  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
