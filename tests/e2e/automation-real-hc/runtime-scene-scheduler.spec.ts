import { expect, request, test } from '@playwright/test'
import {
  AUTOMATION_ACTION_DEVICE_ID,
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_CONDITION_DEVICE_ID,
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_HC_ID,
  AUTOMATION_HC_MAC,
  AUTOMATION_TRIGGER_DEVICE_ID,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
} from '@src/config'
import { controlDevice, slotIndexes } from './automation-real-hc.support'

test.describe('Automation real HC runtime scene scheduler', () => {
  test.skip(!DEVICE_SERVICE_ENDPOINT, 'DEVICE_SERVICE_ENDPOINT is required')

  test('selected A/B/C devices exist on the real HC and expose slot 1', async () => {
    const context = await request.newContext({ baseURL: DEVICE_SERVICE_ENDPOINT })
    const response = await context.get('/api/v0/devices?limit=100')
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)

    const devices = json.data.items.filter(
      (device: {
        hc_id: string
        hc: { mac: string }
      }) =>
        device.hc_id === AUTOMATION_HC_ID &&
        device.hc.mac === AUTOMATION_HC_MAC,
    )
    const selectedIds = [
      AUTOMATION_TRIGGER_DEVICE_ID,
      AUTOMATION_CONDITION_DEVICE_ID,
      AUTOMATION_ACTION_DEVICE_ID,
    ]

    for (const id of selectedIds) {
      const device = devices.find(
        (item: { id: string; status: boolean; spec: Record<string, unknown> }) =>
          item.id === id,
      )

      await expect(device, `Device ${id} should belong to HC`).toBeTruthy()
      await expect(device.status, `Device ${id} should be online`).toBe(true)
      await expect(
        slotIndexes(device.spec, 'input'),
        `Device ${id} input slot`,
      ).toContain(Number(AUTOMATION_DEVICE_STATE_IDX))
      await expect(
        slotIndexes(device.spec, 'output'),
        `Device ${id} output slot`,
      ).toContain(Number(AUTOMATION_DEVICE_STATE_IDX))
      await expect(
        slotIndexes(device.spec, 'state'),
        `Device ${id} state slot`,
      ).toContain(Number(AUTOMATION_DEVICE_STATE_IDX))
    }

    await context.dispose()
  })

  test('device control smoke toggles the configured action device', async () => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to control real devices',
    )
    test.skip(
      !AUTOMATION_ACTION_DEVICE_ID,
      'AUTOMATION_ACTION_DEVICE_ID is required',
    )

    const context = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    try {
      const response = await controlDevice(context, true)

      const json = await response.json()
      await expect(response.status()).toBe(200)
      await expect(json.status).toBe(true)
    } finally {
      await controlDevice(context, false)
      await context.dispose()
    }
  })

  test('scheduler accepts a valid seven-field cron for the configured action device', async () => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to control real devices',
    )
    test.skip(
      !AUTOMATION_ACTION_DEVICE_ID,
      'AUTOMATION_ACTION_DEVICE_ID is required',
    )

    const context = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const response = await context.post(
      `/api/devices/scheduler/${AUTOMATION_ACTION_DEVICE_ID}`,
      {
        headers: {
          'x-hc-id': AUTOMATION_HC_ID,
        },
        data: [
          {
            cron: '0/30 * * * * * *',
            enable: true,
            snapshot: {
              [AUTOMATION_DEVICE_STATE_IDX]: true,
            },
          },
        ],
      },
    )

    const json = await response.json()
    await expect(response.status()).toBe(200)
    await expect(json.status).toBe(true)
    await context.dispose()
  })

  test('runtime rule testcase prerequisites are present', async () => {
    await expect(AUTOMATION_TRIGGER_DEVICE_ID).not.toBe('')
    await expect(AUTOMATION_CONDITION_DEVICE_ID).not.toBe('')
    await expect(AUTOMATION_ACTION_DEVICE_ID).not.toBe('')
  })
})
