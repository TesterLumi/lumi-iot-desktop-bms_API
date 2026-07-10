import { FullConfig } from '@playwright/test'
import { createAllureEnvironmentFile } from './allure'

async function globalTeardown(_: FullConfig): Promise<void> {
  createAllureEnvironmentFile()
}

export default globalTeardown
