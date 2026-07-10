import { defineConfig } from '@playwright/test'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

dotenvConfig({ path: resolve(process.cwd(), '.env'), override: true })

export default defineConfig({
  testDir: './tests',
  reporter: [['html'], ['allure-playwright']],
  globalTeardown: './src/utils/reporters/global_teardown',
})
