// import-debug.mjs — 调试截图导入识别链路
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
  page.on('console', (msg) => console.log(`[console:${msg.type()}]`, msg.text().slice(0, 200)))
  page.on('requestfailed', (r) => console.log('[reqfailed]', r.url(), r.failure()?.errorText))
  page.on('response', (r) => {
    if (r.url().includes('/api/')) console.log('[resp]', r.status(), r.url().slice(0, 80))
  })

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await sleep(1500)

  await page.goto(BASE + '/assets', { waitUntil: 'networkidle2' })
  await sleep(2000)

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((x) => x.textContent.includes('截图导入'))?.click()
  })
  await sleep(800)

  const fileInput = await page.$('input[type="file"]')
  await fileInput.uploadFile('/tmp/fund-screenshot-test.png')
  await sleep(1500)

  const hasBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => x.textContent.includes('开始识别'))
    return b ? 'YES' : 'NO'
  })
  console.log('开始识别按钮存在:', hasBtn)

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((x) => x.textContent.includes('开始识别'))?.click()
  })
  console.log('已点击开始识别，等待 90s…')

  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    const state = await page.evaluate(() => {
      const t = document.body.textContent || ''
      return {
        hasRecognize: t.includes('识别到'),
        hasConfirm: t.includes('确认导入'),
        hasSkeleton: !!document.querySelector('.animate-pulse, [class*="skeleton"]'),
        toasts: [...document.querySelectorAll('[role="status"], .toast, [class*="toast"]')].map((x) => x.textContent?.slice(0, 80)),
      }
    })
    if (i % 15 === 0 || state.hasRecognize) console.log(`t=${i}s`, JSON.stringify(state))
    if (state.hasRecognize) break
  }
  await sleep(1000)
  await browser.close()
}

main().catch((e) => {
  console.error('SCRIPT_ERROR', e)
  process.exit(1)
})
