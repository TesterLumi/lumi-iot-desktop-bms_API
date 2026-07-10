import { request } from '@playwright/test'
import {
  AUTOMATION_ACTION_DEVICE_ID,
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_HC_ID,
} from '@src/config'

export const slotIndexes = (
  spec: Record<string, unknown>,
  key: 'input' | 'output' | 'state',
): number[] =>
  ((spec[key] as { idx: number }[] | undefined) ?? []).map((slot) => slot.idx)

export const controlDevice = (
  context: Awaited<ReturnType<typeof request.newContext>>,
  value: boolean,
) =>
  context.post('/api/devices/control', {
    headers: {
      'x-hc-id': AUTOMATION_HC_ID,
      'x-request-id': `auto-${value ? 'set' : 'cleanup'}-${Date.now()}`,
      'x-user-id': 'automation-test',
      'x-app-id': 'bms-e2e-test',
    },
    data: {
      device_id: Number(AUTOMATION_ACTION_DEVICE_ID),
      states: [
        {
          idx: Number(AUTOMATION_DEVICE_STATE_IDX),
          value,
        },
      ],
    },
  })
