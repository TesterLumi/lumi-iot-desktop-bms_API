import { expect, test } from '@playwright/test'
import { AUTOMATION_SERVICE_ENDPOINT } from '@src/config'
import { AutomationCenterApiClient } from '@src/core'

test.describe('Automation Center API', () => {
  test.skip(
    !AUTOMATION_SERVICE_ENDPOINT,
    'AUTOMATION_SERVICE_ENDPOINT is required',
  )

  test('lists execution templates used by the automation UI', async ({
    request,
  }) => {
    const client = new AutomationCenterApiClient(request)
    const response = await client.listExecutionTemplatesAPI()
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(
      json.data.items.map((template: { type: string }) => template.type),
    ).toEqual(expect.arrayContaining(['And', 'Or']))
  })

  test('lists existing automations from the real automation service', async ({
    request,
  }) => {
    const client = new AutomationCenterApiClient(request)
    const response = await client.listAutomationsAPI({ page: 1, limit: 20 })
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(Array.isArray(json.data.items)).toBe(true)
    await expect(typeof json.data.total).toBe('number')
  })

  test('posts automation detail only when an explicit fixture payload is configured', async ({
    request,
  }) => {
    test.skip(
      !process.env.AUTOMATION_DETAIL_PAYLOAD,
      'AUTOMATION_DETAIL_PAYLOAD is required to create a real automation',
    )

    const client = new AutomationCenterApiClient(request)
    const response = await client.createAutomationDetailAPI(
      JSON.parse(process.env.AUTOMATION_DETAIL_PAYLOAD ?? '{}'),
    )
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
  })
})
