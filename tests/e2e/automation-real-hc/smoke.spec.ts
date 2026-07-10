import { expect, request, test } from '@playwright/test'
import {
  AUTOMATION_HC_MAC,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { HomeControllerDb } from '@src/core'
import { PostgresClient, expectStatusCode } from '@src/utils'

test.describe('Automation real HC smoke', () => {
  test.skip(!IOT_HC_ENDPOINT, 'IOT_HC_ENDPOINT is required')

  test('HC health check is online', async () => {
    const context = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const response = await context.get('/api/health_check')
    const json = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expect(json.status).toBe(true)
    await context.dispose()
  })

  test('HC exposes device list', async () => {
    const context = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const response = await context.get('/api/devices')
    const json = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expect(Array.isArray(json)).toBe(true)
    await context.dispose()
  })

  test('HC MAC exists in Postgres when DB is configured', async () => {
    test.skip(!process.env.POSTGRES_URI, 'POSTGRES_URI is required')
    test.skip(!AUTOMATION_HC_MAC, 'AUTOMATION_HC_MAC is required')

    await PostgresClient.getInstance().init()
    try {
      const db = new HomeControllerDb(PostgresClient.getInstance())
      const hc = await db.getHomeControllerByMac(AUTOMATION_HC_MAC)
      await expect(hc).not.toBeNull()
    } finally {
      await PostgresClient.getInstance().dispose()
    }
  })
})
