import { expect, test } from '@playwright/test'
import { selectSceneTargetDevices, type SceneDeviceCandidate } from './scenes.support'

const booleanSlot = [{ idx: 1, data_type: { type: 'boolean' } }]

const makeDevice = (
  overrides: Partial<SceneDeviceCandidate>,
): SceneDeviceCandidate => ({
  id: 'device-1',
  name: 'device-1',
  status: true,
  network_state: 'activated',
  rule_count: 0,
  hc: {
    id: 'hc-1',
    mac: '88:e6:28:f8:2e:4d',
  },
  device_type: {
    id: 4,
    name: 'switch',
  },
  spec: {
    input: booleanSlot,
    output: booleanSlot,
    state: booleanSlot,
  },
  ...overrides,
})

test.describe('scene target device selection', () => {
  test('falls back to online boolean-slot devices when no preferred type-4 idle device exists', () => {
    const fallbackDevice = makeDevice({
      id: 'fallback-online-device',
      device_type: {
        id: 2,
        name: 'non-preferred-switch',
      },
    })
    const busyPreferredDevice = makeDevice({
      id: 'busy-preferred-device',
      rule_count: 3,
    })

    const discovery = selectSceneTargetDevices({
      devices: [fallbackDevice, busyPreferredDevice],
      hcMac: '88:e6:28:f8:2e:4d',
      slot: '1',
      count: 3,
    })

    expect(discovery.selected.map((device) => device.id)).toContain(
      'fallback-online-device',
    )
  })
})
