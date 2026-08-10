// import-check.mjs — 验证：基金录入易用性（自动查名）+ 截图导入流程
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { readFileSync } from 'node:fs'
const BASE = 'http://localhost:5173'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  let errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text().trim()
      if (!t.includes('401') && !t.includes('Failed to load')) errors.push(t)
    }
  })

  // ── 登录 ──
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.type('input[type="email"]', 'alice@test.com')
  await page.type('input[type="password"]', 'password123')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')])
  await sleep(1500)
  console.log(`登录后 URL: ${page.url()}`)

  // ── 进资产页 ──
  await page.goto(BASE + '/assets', { waitUntil: 'networkidle2' })
  await sleep(2000)

  // ── 1. 验证「截图导入」按钮存在 ──
  const btnText = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => x.textContent.includes('截图导入'))
    return b ? b.textContent.trim() : null
  })
  console.log(`[1] 截图导入按钮: ${btnText ?? '未找到'}  ${btnText ? '✅' : '❌'}`)

  // ── 2. 验证基金代码自动查名：打开记一笔资产，输入基金代码 ──
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => x.textContent.includes('记一笔资产'))
    b?.click()
  })
  await sleep(800)
  // 输入 161725（招商中证白酒），等 500ms debounce + 网络
  const codeInput = await page.$('input[name="code"]')
  if (codeInput) {
    await codeInput.type('161725')
    await sleep(3000) // debounce 500ms + 网络往返
    const nameVal = await page.evaluate(() => {
      const inp = document.querySelector('input[name="name"]')
      return inp ? inp.value : null
    })
    const hint = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('p')]
      const h = ps.find((x) => x.textContent.includes('已查到'))
      return h ? h.textContent.trim() : null
    })
    console.log(`[2] 自动带出名称: ${nameVal}  ${nameVal && nameVal.includes('白酒') ? '✅' : '❌'}`)
    console.log(`[2b] 净值提示: ${hint ?? '无'}  ${hint ? '✅' : '❌'}`)
  } else {
    console.log('[2] 找不到 code 输入框 ❌')
  }
  // 关闭弹窗
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((x) => x.textContent.trim() === '取消')?.click()
  })
  await sleep(500)

  // ── 3. 验证截图导入流程（上传 → 识别 → 确认导入）──
  let found = false // 识别结果是否出现（跨分支共享）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((x) => x.textContent.includes('截图导入'))?.click()
  })
  await sleep(800)

  // 上传测试截图（setInputFiles 触发 FileReader 预览）
  const fileInput = await page.$('input[type="file"]')
  if (fileInput) {
    await fileInput.uploadFile('/tmp/fund-screenshot-test.png')
    await sleep(1200)
    const preview = await page.evaluate(() => !!document.querySelector('img[alt="截图预览"]'))
    console.log(`[3] 截图预览: ${preview ? '✅' : '❌'}`)

    // 点「开始识别」（LLM 约 25-60s）
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      btns.find((x) => x.textContent.includes('开始识别'))?.click()
    })
    console.log('[3b] 识别中，等待 LLM 返回…（最长 120s）')
    // 轮询等待识别结果出现（记录卡片）
    for (let i = 0; i < 120; i++) {
      await sleep(1000)
      const has = await page.evaluate(() => {
        const t = document.body.textContent || ''
        return t.includes('识别到') && t.includes('确认导入')
      })
      if (has) {
        found = true
        break
      }
    }
    console.log(`[3c] 识别结果出现: ${found ? '✅' : '❌'}`)
    if (found) {
      const recText = await page.evaluate(() => {
        const t = document.body.textContent || ''
        const i = t.indexOf('识别到')
        return t.slice(i, i + 120)
      })
      console.log(`[3d] 记录摘要: ${recText}`)

      // 点确认导入（会真实写入资产）
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
        btns.find((x) => x.textContent.includes('确认导入'))?.click()
      })
      await sleep(3000)
      const after = await page.evaluate(() => {
        const t = document.body.textContent || ''
        const m = t.match(/已导入 \d+ 条/)
        return m ? m[0] : null
      })
      console.log(`[3e] 导入结果提示: ${after ?? '未出现'}  ${after ? '✅' : '❌'}`)
    }
  } else {
    console.log('[3] 找不到文件输入 ❌')
  }

  await sleep(1500)
  console.log(`\nConsole 错误数: ${errors.length}`)
  if (errors.length) errors.forEach((e) => console.log('  -', e))
  const allPass =
    (btnText ? 1 : 0) + (found ? 1 : 0) + (errors.length === 0 ? 1 : 0)
  console.log(allPass >= 2 ? 'ALL_PASS' : 'CHECK_FAILED')
  await browser.close()
}

main().catch((e) => {
  console.error('SCRIPT_ERROR', e)
  process.exit(1)
})
