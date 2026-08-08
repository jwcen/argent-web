// 多视口 / 双主题自检脚本。
// 用系统装的 Chrome + puppeteer-core，不下载 Chromium。
// 除了截图，还顺带跑三项硬性检查：横向溢出、触摸目标尺寸、底部遮挡。
// ESM 不认 NODE_PATH，所以直接指向隔离工作区里的包入口
import puppeteer from '/Users/jcen/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const OUT = join(process.cwd(), '.shots')
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { id: 'iphone', width: 393, height: 852, dsf: 3, mobile: true },
  { id: 'ipad', width: 834, height: 1112, dsf: 2, mobile: true },
  { id: 'desktop', width: 1440, height: 900, dsf: 2, mobile: false },
]
const THEMES = ['light', 'dark']
const PAGES = [
  { id: 'dashboard', path: '/' },
  { id: 'portfolio', path: '/portfolio' },
  { id: 'brokers', path: '/brokers' },
  { id: 'ask', path: '/ask', clip: true },
]

const problems = []

async function audit(page, tag) {
  const r = await page.evaluate(() => {
    const de = document.documentElement
    const overflow = de.scrollWidth - de.clientWidth
    const small = []
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue // 隐藏元素不计
      if (b.height < 44 || b.width < 24) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
          w: Math.round(b.width),
          h: Math.round(b.height),
        })
      }
    }
    return { overflow, small }
  })
  if (r.overflow > 1) problems.push(`[${tag}] 横向溢出 ${r.overflow}px`)
  for (const s of r.small) {
    problems.push(`[${tag}] 触摸目标偏小 ${s.tag}"${s.label}" ${s.w}×${s.h}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const page = await browser.newPage()
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dsf,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      })

      // 先落地同源页面，才能写 localStorage
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
      await page.evaluate((t) => localStorage.setItem('argent-theme', t), theme)
      await page.reload({ waitUntil: 'networkidle2' })
      await new Promise((r) => setTimeout(r, 700))

      const tagLogin = `${vp.id}/${theme}/login`
      await audit(page, tagLogin)
      await page.screenshot({ path: join(OUT, `${vp.id}-${theme}-login.png`) })

      // 登录
      await page.type('input[name="email"]', 'alice@test.com')
      await page.type('input[name="password"]', 'password123')
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForFunction(() => location.pathname === '/', { timeout: 15000 }),
      ])
      await new Promise((r) => setTimeout(r, 2000))

      for (const p of PAGES) {
        if (p.path !== '/') {
          await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle2' })
        }
        await new Promise((r) => setTimeout(r, 1600))
        const tag = `${vp.id}/${theme}/${p.id}`
        await audit(page, tag)
        await page.screenshot({
          path: join(OUT, `${vp.id}-${theme}-${p.id}.png`),
          fullPage: !p.clip,
        })
      }

      await page.close()
      console.log(`✓ ${vp.id} / ${theme}`)
    }
  }
} finally {
  await browser.close()
}

console.log('\n──── 自检结果 ────')
if (problems.length === 0) {
  console.log('无横向溢出，触摸目标全部达标。')
} else {
  const uniq = [...new Set(problems)]
  uniq.forEach((p) => console.log('• ' + p))
  console.log(`\n共 ${uniq.length} 条（去重后）`)
}
