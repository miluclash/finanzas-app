import { _electron as electron } from 'playwright-core'
const exe = process.argv[2]
const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'], env: { ...process.env } })
const win = await app.firstWindow()
await win.waitForTimeout(2500)
console.log('TITLE', await win.title())
console.log('TEXT', (await win.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | '))
await win.screenshot({ path: process.argv[3] })
await app.close()
