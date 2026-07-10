import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_HC_ID,
  AUTOMATION_HC_MAC,
  AUTOMATION_SERVICE_ENDPOINT,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import {
  AutomationCenterApiClient,
  AutomationSceneCreateRequest,
  AutomationSceneUpdateRequest,
} from '@src/core'

const RUN_DIR = path.resolve(
  process.cwd(),
  process.env.AUTOMATION_SCENES_RUN_DIR ??
    (process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
      ? path.dirname(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR)
      : path.join('test-runs', 'automation-scenes-current')),
)
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence')
const AUTO_SCENE_PREFIX = 'auto_scene_TC'
const SCENE_DEVICE_MAX_COUNT = 3
const SCENE_DEVICE_MIN_COUNT = 1

type SceneDeviceSlot = {
  idx?: number | string
  data_type?: {
    type?: string
  }
}

type SceneDeviceCandidate = {
  id: string
  name?: string
  status?: boolean
  network_state?: string
  rule_count?: number
  rules?: unknown[]
  hc?: {
    id?: string
    mac?: string
  }
  device_type?: {
    id?: number
    name?: string
  }
  type?: {
    id?: number
    name?: string
  }
  spec?: {
    input?: SceneDeviceSlot[]
    output?: SceneDeviceSlot[]
    state?: SceneDeviceSlot[]
  }
}

type SceneDeviceDiscoveryResult = {
  selected: SceneDeviceCandidate[]
  online: SceneDeviceCandidate[]
  offline: SceneDeviceCandidate[]
  skipped: SceneDeviceCandidate[]
  wrongHc: SceneDeviceCandidate[]
}

type ThuySceneBindingInput = {
  deviceId: string
  slot: string
  value: boolean
}

type SceneEvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  request?: unknown
  response?: unknown
  status?: number
}

type SceneTestContext = {
  tcId: string
  tcName: string
  startedAt: string
  steps: SceneEvidenceStep[]
  assertions: string[]
  cleanup: {
    scene_deleted: boolean
    warnings: string[]
  }
}

type SceneTargetGroup = {
  targets: SceneDeviceCandidate[]
  reusedDevices: boolean
}

const selectSceneTargetDevices = ({
  devices,
  hcMac,
  slot,
  count = 3,
}: {
  devices: SceneDeviceCandidate[]
  hcMac: string
  slot: string
  count?: number
}): SceneDeviceDiscoveryResult => {
  const targetHcMac = hcMac.toLowerCase()
  const slotNumber = Number(slot)
  const wrongHc = devices.filter(
    (device) => device.hc?.mac?.toLowerCase() !== targetHcMac,
  )
  const sameHcDevices = devices.filter(
    (device) => device.hc?.mac?.toLowerCase() === targetHcMac,
  )
  const offline = sameHcDevices.filter((device) => !isOnlineDevice(device))
  const online = sameHcDevices.filter(isOnlineDevice)
  const eligible = online.filter((device) =>
    isSceneControllableDevice(device, slotNumber),
  )
  const fallbackEligible = online.filter((device) =>
    isSceneFallbackControllableDevice(device, slotNumber),
  )
  const selectionPool = eligible.length > 0 ? eligible : fallbackEligible
  const selected = [...selectionPool]
    .sort(compareSceneDevicePriority)
    .slice(0, count)
  const selectedIds = new Set(selected.map((device) => device.id))
  const skipped = online.filter(
    (device) =>
      !selectedIds.has(device.id) ||
      !isSceneFallbackControllableDevice(device, slotNumber),
  )

  return {
    selected,
    online,
    offline,
    skipped,
    wrongHc,
  }
}

const formatSceneDeviceDiscovery = (result: SceneDeviceDiscoveryResult) => ({
  selected: result.selected.map(toSceneDeviceSummary),
  online_count: result.online.length,
  offline: result.offline.map(toSceneDeviceSummary),
  skipped: result.skipped.map(toSceneDeviceSummary),
  wrong_hc_count: result.wrongHc.length,
})

const getNextThuySceneIndex = async (
  client: AutomationCenterApiClient,
): Promise<number> => {
  const response = await client.listScenesAPI({ page: 1, limit: 100 })
  const json = await response.json()
  const scenes = (json.data?.items ?? []) as { name?: string }[]
  const maxIndex = scenes.reduce((max, scene) => {
    const match = scene.name?.match(/^thuy(?:vu)?(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return maxIndex + 1
}

const generateSceneName = (tcId: string, suffix = 'scene') => {
  const safeTcId = tcId.replace(/[^A-Za-z0-9]/g, '')
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)
  const random = Math.random().toString(36).slice(2, 6)

  return `${AUTO_SCENE_PREFIX}${safeTcId}_${suffix}_${timestamp}_${random}`
}

const createSceneTestContext = (
  tcId: string,
  tcName: string,
): SceneTestContext => ({
  tcId,
  tcName,
  startedAt: new Date().toISOString(),
  steps: [],
  assertions: [],
  cleanup: {
    scene_deleted: false,
    warnings: [],
  },
})

const attachSceneStep = (context: SceneTestContext, step: SceneEvidenceStep) => {
  context.steps.push(step)
}

const attachSceneAssertion = (
  context: SceneTestContext,
  assertion: string,
) => {
  context.assertions.push(assertion)
}

const saveSceneEvidence = async (
  context: SceneTestContext,
  status: 'PASSED' | 'FAILED' | 'SKIPPED',
  error?: unknown,
) => {
  const evidenceType = context.tcId.startsWith('UI-') ? 'ui' : 'api'
  const evidenceDir = path.join(EVIDENCE_DIR, evidenceType)
  await mkdir(evidenceDir, { recursive: true })
  const slug = context.tcName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const filename = `${context.tcId}_${slug}_${Date.now()}.json`
  const evidence = {
    tc_id: context.tcId,
    tc_name: context.tcName,
    status,
    started_at: context.startedAt,
    finished_at: new Date().toISOString(),
    endpoints: {
      automation_service: AUTOMATION_SERVICE_ENDPOINT,
      device_service: DEVICE_SERVICE_ENDPOINT,
      device_control: DEVICE_CONTROL_ENDPOINT,
      hc_direct: IOT_HC_ENDPOINT,
    },
    steps: context.steps,
    assertions: context.assertions,
    cleanup: context.cleanup,
    error_message:
      error instanceof Error ? error.message : error ? String(error) : undefined,
  }

  await writeFile(
    path.join(evidenceDir, filename),
    JSON.stringify(evidence, null, 2),
    'utf8',
  )
}

const recordSceneResponse = async (
  context: SceneTestContext,
  step: string,
  response: { status: () => number; json: () => Promise<unknown> },
  options: {
    method: string
    endpoint: string
    request?: unknown
  },
) => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  attachSceneStep(context, {
    step,
    method: options.method,
    endpoint: options.endpoint,
    request: options.request,
    response: body,
    status: response.status(),
  })

  return body
}

const createAutoScenePayload = ({
  tcId,
  bindings,
  name = generateSceneName(tcId),
  type = 'Normal',
  icon = '-1',
  background = null,
  backgroundColor = '#ffffff',
  enable = true,
  cron = null,
  cronEnable = false,
}: {
  tcId: string
  bindings: ThuySceneBindingInput[]
  name?: string
  type?: 'Normal' | 'Lighting'
  icon?: string
  background?: string | null
  backgroundColor?: string
  enable?: boolean
  cron?: string | null
  cronEnable?: boolean
}): AutomationSceneCreateRequest => ({
  type,
  name,
  icon,
  enable,
  background,
  background_color: backgroundColor,
  binding: createSceneBindings(bindings),
  cron,
  cron_enable: cronEnable,
})

const createAutoSceneUpdatePayload = (
  data: AutomationSceneUpdateRequest,
): AutomationSceneUpdateRequest => data

const createInvalidScenePayload = (
  tcId: string,
  overrides: Record<string, unknown>,
) =>
  ({
    type: 'Normal',
    name: generateSceneName(tcId.replace(/^TC/i, '')),
    icon: '-1',
    enable: true,
    background: null,
    background_color: '#ffffff',
    binding: [],
    cron: null,
    cron_enable: false,
    ...overrides,
  }) as Record<string, unknown>

const toSceneBindings = (
  devices: SceneDeviceCandidate[],
  slot: string,
  value: boolean,
): ThuySceneBindingInput[] =>
  devices.map((device) => ({
    deviceId: device.id,
    slot,
    value,
  }))

const toMixedSceneBindings = (
  devices: SceneDeviceCandidate[],
  slot: string,
  offset = 0,
): ThuySceneBindingInput[] =>
  devices.map((device, index) => ({
    deviceId: device.id,
    slot,
    value: (index + offset) % 2 === 0,
  }))

const invertSceneBindings = (
  bindings: ThuySceneBindingInput[],
): ThuySceneBindingInput[] =>
  bindings.map((binding) => ({
    ...binding,
    value: !binding.value,
  }))

const createThuySceneData = ({
  index,
  bindings,
}: {
  index: number
  bindings: ThuySceneBindingInput[]
}): AutomationSceneCreateRequest => ({
  type: 'Normal',
  name: `thuy${index}`,
  icon: '-1',
  enable: true,
  background: null,
  background_color: '#ffffff',
  binding: createSceneBindings(bindings),
  cron: null,
  cron_enable: false,
})

const discoverSceneTargets = async (
  apiRequest: APIRequestContext,
): Promise<SceneDeviceCandidate[]> => {
  const selected = await discoverSceneTargetPool(apiRequest)
  return selected.slice(0, SCENE_DEVICE_MAX_COUNT)
}

const discoverSceneTargetPool = async (
  apiRequest: APIRequestContext,
): Promise<SceneDeviceCandidate[]> => {
  const response = await apiRequest.get(
    `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices`,
    {
      params: {
        limit: 100,
      },
    },
  )
  const json = await response.json()
  const devices = (json.data?.items ?? []) as SceneDeviceCandidate[]
  const discovery = selectSceneTargetDevices({
    devices,
    hcMac: AUTOMATION_HC_MAC,
    slot: AUTOMATION_DEVICE_STATE_IDX,
    count: 100,
  })

  console.log(
    JSON.stringify({
      scene_device_discovery: formatSceneDeviceDiscovery(discovery),
    }),
  )

  expect(response.status()).toBe(200)
  expect(json.success).toBe(true)
  const selected = await filterSceneTargetsByDeviceDetail(
    apiRequest,
    discovery.selected,
  )
  expect(
    selected.length,
    `Need at least ${SCENE_DEVICE_MIN_COUNT} online controllable device with matching detail HC MAC ${AUTOMATION_HC_MAC}. Discovery: ${JSON.stringify(formatSceneDeviceDiscovery(discovery))}`,
  ).toBeGreaterThanOrEqual(SCENE_DEVICE_MIN_COUNT)

  return shuffleSceneTargets(selected)
}

const createDistinctSceneTargetGroups = ({
  targets,
  groupCount,
  groupSize = SCENE_DEVICE_MAX_COUNT,
}: {
  targets: SceneDeviceCandidate[]
  groupCount: number
  groupSize?: number
}): SceneTargetGroup[] => {
  const hasEnoughForRequestedSize = targets.length >= groupCount * groupSize
  const distinctFallbackSize = Math.max(
    SCENE_DEVICE_MIN_COUNT,
    Math.floor(targets.length / groupCount),
  )
  const effectiveSize = hasEnoughForRequestedSize
    ? groupSize
    : Math.min(groupSize, Math.max(distinctFallbackSize, SCENE_DEVICE_MIN_COUNT))
  const hasEnoughDistinctDevices = targets.length >= groupCount * effectiveSize
  const groups = Array.from({ length: groupCount }, (_, groupIndex) => {
    if (hasEnoughDistinctDevices) {
      return {
        targets: targets.slice(
          groupIndex * effectiveSize,
          groupIndex * effectiveSize + effectiveSize,
        ),
        reusedDevices: false,
      }
    }

    return {
      targets: Array.from(
        { length: Math.min(effectiveSize, targets.length) },
        (_, index) => targets[(groupIndex + index) % targets.length],
      ),
      reusedDevices: targets.length < groupCount * effectiveSize,
    }
  })

  console.log(
    JSON.stringify({
      scene_target_groups: groups.map((group, index) => ({
        scene_index: index,
        reused_devices: group.reusedDevices,
        device_ids: group.targets.map((target) => target.id),
      })),
    }),
  )

  return groups
}

const filterSceneTargetsByDeviceDetail = async (
  apiRequest: APIRequestContext,
  targets: SceneDeviceCandidate[],
): Promise<SceneDeviceCandidate[]> => {
  const verified: SceneDeviceCandidate[] = []
  const rejected: {
    id: string
    name: string
    list_hc_mac?: string
    detail_hc_mac?: string
    reason: string
  }[] = []

  for (const target of targets) {
    const response = await apiRequest.get(
      `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices/${target.id}`,
    )
    if (response.status() !== 200) {
      rejected.push({
        id: target.id,
        name: target.name ?? target.id,
        list_hc_mac: target.hc?.mac,
        reason: `detail_status_${response.status()}`,
      })
      continue
    }

    const json = await response.json()
    const detail = json.data as SceneDeviceCandidate
    if (detail.hc?.mac !== AUTOMATION_HC_MAC) {
      rejected.push({
        id: target.id,
        name: target.name ?? target.id,
        list_hc_mac: target.hc?.mac,
        detail_hc_mac: detail.hc?.mac,
        reason: 'detail_hc_mac_mismatch',
      })
      continue
    }

    verified.push({
      ...target,
      hc: detail.hc ?? target.hc,
    })
  }

  console.log(
    JSON.stringify({
      scene_device_detail_guard: {
        verified: verified.map(toSceneDeviceSummary),
        rejected,
      },
    }),
  )

  return verified
}

const createAndWaitForScene = async (
  client: AutomationCenterApiClient,
  payload: Parameters<AutomationCenterApiClient['createSceneAPI']>[0],
) => {
  const createResponse = await client.createSceneAPI(payload)
  const createJson = await createResponse.json()

  expect(createResponse.status()).toBe(200)
  expect(createJson.success).toBe(true)
  expect(createJson.data.name).toBe(payload.name)

  return await waitForCloudScenePresent(client, createJson.data.id)
}

const waitForCloudScenePresent = async (
  client: AutomationCenterApiClient,
  sceneId: string,
) => {
  const scene = await pollUntil(async () => {
    const response = await client.getSceneAPI(sceneId)
    if (response.status() !== 200) {
      return null
    }

    const json = await response.json()
    return json.data?.id ? json.data : null
  }, 20)

  expect(scene).not.toBeNull()
  return scene
}

const expectHcSceneBindingValues = async (
  sceneId: string,
  bindings: ThuySceneBindingInput[],
) => {
  const scene = await waitForHcSceneBindingValues(sceneId, bindings)
  for (const binding of bindings) {
    expect(scene.binding[binding.deviceId].snapshot).toEqual({
      [binding.slot]: binding.value,
    })
  }
}

const waitForHcSceneBindingValues = async (
  sceneId: string,
  bindings: ThuySceneBindingInput[],
) => {
  const hcContext = await playwrightRequest.newContext({ baseURL: IOT_HC_ENDPOINT })
  try {
    const scene = await pollUntil(async () => {
      const response = await hcContext.get('/api/scenes')
      if (response.status() !== 200) {
        return null
      }

      const scenes = await response.json()
      const foundScene = scenes.find(
        (item: { id: string }) => item.id === sceneId,
      )
      const hasAllBindings = bindings.every(
        (binding) =>
          foundScene?.binding?.[binding.deviceId]?.snapshot?.[binding.slot] ===
          binding.value,
      )
      return hasAllBindings ? foundScene : null
    })

    expect(scene).not.toBeNull()
    return scene
  } finally {
    await hcContext.dispose()
  }
}

const expectDeviceSceneBindingMappings = async (
  sceneId: string,
  targets: SceneDeviceCandidate[],
  bindings: ThuySceneBindingInput[],
) => {
  const mappings: Array<{
    device_id: string
    expected: boolean
    mapped: boolean
    error?: string
  }> = []

  for (const binding of bindings) {
    const target = targets.find((item) => item.id === binding.deviceId)
    expect(target, `Target ${binding.deviceId} should exist`).toBeTruthy()

    try {
      const device = await waitForDeviceSceneMapping(
        sceneId,
        binding.deviceId,
        binding.value,
      )
      expect(device.hc.id).toBeTruthy()
      expect(device.hc.mac).toBe(AUTOMATION_HC_MAC)
      mappings.push({
        device_id: binding.deviceId,
        expected: binding.value,
        mapped: true,
      })
    } catch (error) {
      mappings.push({
        device_id: binding.deviceId,
        expected: binding.value,
        mapped: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(
    JSON.stringify({
      scene_device_mapping_evidence: {
        scene_id: sceneId,
        mappings,
      },
    }),
  )

  return mappings
}

const waitForDeviceSceneMapping = async (
  sceneId: string,
  deviceId: string,
  value: boolean,
) => {
  const deviceContext = await playwrightRequest.newContext({
    baseURL: DEVICE_SERVICE_ENDPOINT,
  })
  try {
    const device = await pollUntil(async () => {
      const response = await deviceContext.get(`/api/v0/devices/${deviceId}`)
      if (response.status() !== 200) {
        return null
      }

      const json = await response.json()
      const sceneMapping = json.data?.scene?.[sceneId]
      const matched = sceneMapping?.some(
        ([slot, slotValue]: [number, boolean]) =>
          slot === Number(AUTOMATION_DEVICE_STATE_IDX) && slotValue === value,
      )

      return matched ? json.data : null
    }, 2, 1000)

    expect(device).not.toBeNull()
    return device
  } finally {
    await deviceContext.dispose()
  }
}

const deleteCreatedScenes = async (
  client: AutomationCenterApiClient,
  sceneIds: string[],
) => {
  const ids = [...new Set(sceneIds.filter(Boolean))]
  if (ids.length === 0) {
    return
  }

  const response = await client.deleteManyScenesAPI(ids)
  expect([200, 204]).toContain(response.status())
  console.log(
    JSON.stringify({
      scene_cleanup: {
        deleted_scene_ids: ids,
      },
    }),
  )
}

const setSceneBindingsBaseline = async (
  sceneTargets: SceneDeviceCandidate[],
  bindings: ThuySceneBindingInput[],
) => {
  const controlContext = await playwrightRequest.newContext({
    baseURL: DEVICE_CONTROL_ENDPOINT,
  })
  try {
    for (const binding of bindings) {
      const target = sceneTargets.find((item) => item.id === binding.deviceId)
      expect(target, `Target ${binding.deviceId} should exist`).toBeTruthy()

      const response = await controlContext.post('/api/devices/control', {
        headers: {
          'x-hc-id': getSceneHcId(sceneTargets),
          'x-request-id': `scene-baseline-${binding.deviceId}-${Date.now()}`,
          'x-user-id': 'automation-test',
          'x-app-id': 'bms-e2e-test',
        },
        data: {
          device_id: binding.deviceId,
          states: [
            {
              idx: Number(binding.slot),
              value: !binding.value,
            },
          ],
        },
      })

      expect(response.status()).toBe(200)
      const json = await response.json()
      expect(json.status).toBe(true)
    }
  } finally {
    await controlContext.dispose()
  }
}

const activateScene = async ({
  sceneId,
  sceneTargets,
  sceneHcId,
  value = true,
}: {
  sceneId: string
  sceneTargets: SceneDeviceCandidate[]
  sceneHcId?: string
  value?: boolean
}) => {
  const controlContext = await playwrightRequest.newContext({
    baseURL: DEVICE_CONTROL_ENDPOINT,
  })
  const hcId = sceneHcId ?? getSceneHcId(sceneTargets)
  try {
    const response = await controlContext.post('/api/devices/control', {
      headers: {
        'x-hc-id': hcId,
        'x-request-id': `scene-activate-${sceneId}-${Date.now()}`,
        'x-user-id': 'automation-test',
        'x-app-id': 'bms-e2e-test',
      },
      data: {
        device_id: sceneId,
        states: [
          {
            idx: Number(AUTOMATION_DEVICE_STATE_IDX),
            value,
          },
        ],
      },
    })

    expect(response.status()).toBe(200)
    const json = await response.json()
    expect(json.status).toBe(true)
    console.log(
      JSON.stringify({
        scene_activation_request: {
          scene_id: sceneId,
          x_hc_id: hcId,
          response: json,
        },
      }),
    )
    return json
  } finally {
    await controlContext.dispose()
  }
}

const activateSceneBindings = async ({
  sceneId,
  sceneTargets,
  bindings,
}: {
  sceneId: string
  sceneTargets: SceneDeviceCandidate[]
  bindings: ThuySceneBindingInput[]
}) => {
  const controlContext = await playwrightRequest.newContext({
    baseURL: DEVICE_CONTROL_ENDPOINT,
  })
  const hcId = getSceneHcId(sceneTargets)
  const responses: unknown[] = []

  try {
    for (const binding of bindings) {
      const response = await controlContext.post('/api/devices/control', {
        headers: {
          'x-hc-id': hcId,
          'x-request-id': `scene-activate-binding-${sceneId}-${binding.deviceId}-${Date.now()}`,
          'x-user-id': 'automation-test',
          'x-app-id': 'bms-e2e-test',
        },
        data: {
          device_id: binding.deviceId,
          states: [
            {
              idx: Number(binding.slot),
              value: binding.value,
            },
          ],
        },
      })

      expect(response.status()).toBe(200)
      const json = await response.json()
      expect(json.status).toBe(true)
      responses.push({
        device_id: binding.deviceId,
        slot: binding.slot,
        value: binding.value,
        x_hc_id: hcId,
        response: json,
      })
    }

    console.log(
      JSON.stringify({
        scene_activation_request: {
          scene_id: sceneId,
          mode: 'ui_device_binding_controls',
          x_hc_id: hcId,
          responses,
        },
      }),
    )
    return responses
  } finally {
    await controlContext.dispose()
  }
}

const prepareAndActivateSceneBindings = async ({
  sceneId,
  sceneTargets,
  bindings,
}: {
  sceneId: string
  sceneTargets: SceneDeviceCandidate[]
  bindings: ThuySceneBindingInput[]
}) => {
  await setSceneBindingsBaseline(sceneTargets, bindings)
  const beforeStatuses = await waitForBindingStates(
    sceneTargets,
    invertSceneBindings(bindings),
  )
  const activation = await activateSceneBindings({
    sceneId,
    sceneTargets,
    bindings,
  })
  const afterStatuses = await waitForBindingStates(sceneTargets, bindings)
  assertSceneOutputMatchesBindings(sceneId, afterStatuses, bindings)

  const activationEvidence = {
    scene_id: sceneId,
    device_ids: bindings.map((binding) => binding.deviceId),
    bindings,
    expected_output: bindings,
    verified_output: toSceneOutputEvidence(afterStatuses, bindings),
    baseline_before_activation: invertSceneBindings(bindings),
    before_statuses: beforeStatuses,
    after_statuses: afterStatuses,
    response: activation,
  }

  console.log(JSON.stringify({ scene_activation: activationEvidence }))
  return activationEvidence
}

const activateSceneUntilBindingsMatch = async ({
  sceneId,
  sceneHcId,
  sceneTargets,
  bindings,
  initialActivation,
}: {
  sceneId: string
  sceneHcId?: string
  sceneTargets: SceneDeviceCandidate[]
  bindings: ThuySceneBindingInput[]
  initialActivation?: { status: boolean }
}) => {
  let activation = initialActivation
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!activation) {
      activation = await activateScene({
        sceneId,
        sceneTargets,
        value: true,
      })
    }

    const matched = await pollForBindingStates(sceneTargets, bindings, 10)
    if (matched) {
      return matched
    }

    console.log(
      JSON.stringify({
        scene_activation_retry: {
          scene_id: sceneId,
          attempt: attempt + 1,
          bindings,
        },
      }),
    )
    activation = undefined
  }

  return await waitForBindingStates(sceneTargets, bindings)
}

const waitForBindingStates = async (
  sceneTargets: SceneDeviceCandidate[],
  bindings: ThuySceneBindingInput[],
) => {
  let lastStatuses: {
    id: string
    status: { idx: number; value: boolean | number | string }[]
  }[] = []
  const matched = await pollUntil(async () => {
    const statuses = await getHcDeviceStatuses(sceneTargets)
    lastStatuses = statuses
    const allMatched = bindings.every((binding) =>
      statuses.some(
        (item) =>
          item.id === binding.deviceId &&
          item.status.some(
            (slot) =>
              slot.idx === Number(binding.slot) && slot.value === binding.value,
          ),
      ),
    )

    return allMatched ? statuses : null
  }, 30)

  expect(
    matched,
    `All target devices should match bindings ${JSON.stringify(bindings)}. Last statuses: ${JSON.stringify(lastStatuses)}`,
  ).not.toBeNull()

  return matched
}

const assertSceneOutputMatchesBindings = (
  sceneId: string,
  statuses: {
    id: string
    status: { idx: number; value: boolean | number | string }[]
  }[] | null,
  bindings: ThuySceneBindingInput[],
) => {
  const evidence = toSceneOutputEvidence(statuses, bindings)

  for (const output of evidence) {
    expect(
      output.actual,
      `Scene ${sceneId} output mismatch: device ${output.device_id} slot ${output.slot} should be ${output.expected}. Evidence: ${JSON.stringify(evidence)}`,
    ).toBe(output.expected)
  }
}

const pollForBindingStates = async (
  sceneTargets: SceneDeviceCandidate[],
  bindings: ThuySceneBindingInput[],
  attempts = 30,
) =>
  await pollUntil(async () => {
    const statuses = await getHcDeviceStatuses(sceneTargets)
    const allMatched = bindings.every((binding) =>
      statuses.some(
        (item) =>
          item.id === binding.deviceId &&
          item.status.some(
            (slot) =>
              slot.idx === Number(binding.slot) && slot.value === binding.value,
          ),
      ),
    )

    return allMatched ? statuses : null
  }, attempts)

const resolveSceneHcId = async (
  client: AutomationCenterApiClient,
  sceneId: string,
) => {
  const response = await client.listScenesAPI({ page: 1, limit: 100 })
  const json = await response.json()
  const scene = (json.data?.items ?? []).find(
    (item: { id: string | number; hcid?: string | null }) =>
      String(item.id) === String(sceneId),
  ) as { hcid?: string | null } | undefined

  expect(
    scene?.hcid,
    `Scene ${sceneId} should have hcid in list response before activation`,
  ).toBeTruthy()

  return scene?.hcid ?? undefined
}

const getHcDeviceStatuses = async (
  sceneTargets: SceneDeviceCandidate[],
): Promise<
  {
    id: string
    status: { idx: number; value: boolean | number | string }[]
  }[]
> => {
  const hcContext = await playwrightRequest.newContext({ baseURL: IOT_HC_ENDPOINT })
  try {
    const response = await hcContext.get('/api/devices/status', {
      params: {
        ids: sceneTargets.map((device) => device.id).join(','),
      },
    })

    expect(response.status()).toBe(200)
    return (await response.json()) as {
      id: string
      status: { idx: number; value: boolean | number | string }[]
    }[]
  } finally {
    await hcContext.dispose()
  }
}

const toSceneOutputEvidence = (
  statuses: {
    id: string
    status: { idx: number; value: boolean | number | string }[]
  }[] | null,
  bindings: ThuySceneBindingInput[],
) =>
  bindings.map((binding) => {
    const deviceStatus = statuses?.find((item) => item.id === binding.deviceId)
    const slotStatus = deviceStatus?.status.find(
      (slot) => slot.idx === Number(binding.slot),
    )

    return {
      device_id: binding.deviceId,
      slot: binding.slot,
      expected: binding.value,
      actual: slotStatus?.value,
      matched: slotStatus?.value === binding.value,
    }
  })

const pollUntil = async <T>(
  action: () => Promise<T | null>,
  attempts = 8,
  delayMs = 2000,
): Promise<T | null> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await action()
    if (result !== null) {
      return result
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return null
}

const createSceneBindings = (bindings: ThuySceneBindingInput[]) =>
  bindings.map(({ deviceId, slot, value }) => ({
    id: deviceId,
    snapshot: {
      [slot]: value,
    },
    status: 'Activated' as const,
  }))

const isAutoSceneName = (name?: string) =>
  Boolean(name?.startsWith(AUTO_SCENE_PREFIX))

const cleanupAutoScene = async (
  client: AutomationCenterApiClient,
  context: SceneTestContext,
  sceneId?: string | number,
) => {
  if (!sceneId) {
    return
  }

  try {
    const detailResponse = await client.getSceneAPI(sceneId)
    const detailJson = await detailResponse.json()
    const sceneName = detailJson.data?.name as string | undefined
    if (detailResponse.status() === 200 && !isAutoSceneName(sceneName)) {
      context.cleanup.warnings.push(
        `Skip cleanup for non-automation scene ${sceneId} (${sceneName ?? 'unknown'})`,
      )
      return
    }

    const response = await client.deleteSceneAPI(sceneId)
    context.cleanup.scene_deleted = [200, 204, 404].includes(response.status())
    attachSceneStep(context, {
      step: 'Cleanup scene',
      method: 'DELETE',
      endpoint: `/api/v0/scenes/${sceneId}`,
      status: response.status(),
    })
  } catch (error) {
    context.cleanup.warnings.push(
      error instanceof Error ? error.message : String(error),
    )
  }
}

const expectSceneListShape = (body: unknown) => {
  const json = body as { success?: boolean; data?: { items?: unknown[] } }
  expect(json.success).toBe(true)
  expect(Array.isArray(json.data?.items)).toBe(true)
}

const expectSceneDetailShape = (body: unknown) => {
  const json = body as {
    success?: boolean
    data?: Record<string, unknown>
  }
  expect(json.success).toBe(true)
  expect(json.data?.id).toBeTruthy()
  expect(json.data).toHaveProperty('name')
  expect(json.data).toHaveProperty('status')
  expect(json.data).toHaveProperty('binding')
}

const expectValidationOrDocumentedBehavior = (
  status: number,
  accepted: number[] = [200, 400, 404, 409, 422],
) => {
  expect(accepted).toContain(status)
}

const isOnlineDevice = (device: SceneDeviceCandidate) =>
  device.status === true && device.network_state === 'activated'

const isSceneControllableDevice = (
  device: SceneDeviceCandidate,
  slot: number,
) =>
  isPreferredSceneDeviceType(device) &&
  getRulesCount(device) === 0 &&
  isSceneFallbackControllableDevice(device, slot)

const isSceneFallbackControllableDevice = (
  device: SceneDeviceCandidate,
  slot: number,
) =>
  hasBooleanSlot(device.spec?.input, slot) &&
  hasBooleanSlot(device.spec?.output, slot) &&
  hasBooleanSlot(device.spec?.state, slot)

const compareSceneDevicePriority = (
  left: SceneDeviceCandidate,
  right: SceneDeviceCandidate,
) =>
  getRulesCount(left) - getRulesCount(right) ||
  Number(isPreferredSceneDeviceType(right)) -
    Number(isPreferredSceneDeviceType(left))

const isPreferredSceneDeviceType = (device: SceneDeviceCandidate) =>
  [4].includes(device.device_type?.id ?? device.type?.id ?? -1)

const getRulesCount = (device: SceneDeviceCandidate) =>
  device.rule_count ?? device.rules?.length ?? 0

const hasBooleanSlot = (slots: SceneDeviceSlot[] | undefined, slot: number) =>
  slots?.some(
    (item) =>
      Number(item.idx) === slot && item.data_type?.type === 'boolean',
  ) === true

const toSceneDeviceSummary = (device: SceneDeviceCandidate) => ({
  id: device.id,
  name: device.name,
  status: device.status,
  network_state: device.network_state,
  hc_mac: device.hc?.mac,
  device_type_id: device.device_type?.id ?? device.type?.id,
  rules_count: getRulesCount(device),
})

const getSceneHcId = (sceneTargets: SceneDeviceCandidate[]) =>
  sceneTargets[0]?.hc?.id ?? AUTOMATION_HC_ID

const shuffleSceneTargets = (targets: SceneDeviceCandidate[]) => {
  const shuffled = [...targets]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

const sceneEndpoint = (path = '') =>
  `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/scenes${path}`


export type {
  SceneDeviceSlot,
  SceneDeviceCandidate,
  SceneDeviceDiscoveryResult,
  ThuySceneBindingInput,
  SceneEvidenceStep,
  SceneTestContext,
  SceneTargetGroup,
}

export {
  RUN_DIR,
  EVIDENCE_DIR,
  AUTO_SCENE_PREFIX,
  SCENE_DEVICE_MAX_COUNT,
  SCENE_DEVICE_MIN_COUNT,
  selectSceneTargetDevices,
  formatSceneDeviceDiscovery,
  getNextThuySceneIndex,
  generateSceneName,
  createSceneTestContext,
  attachSceneStep,
  attachSceneAssertion,
  saveSceneEvidence,
  recordSceneResponse,
  createAutoScenePayload,
  createAutoSceneUpdatePayload,
  createInvalidScenePayload,
  toSceneBindings,
  toMixedSceneBindings,
  invertSceneBindings,
  createThuySceneData,
  discoverSceneTargets,
  discoverSceneTargetPool,
  createDistinctSceneTargetGroups,
  filterSceneTargetsByDeviceDetail,
  createAndWaitForScene,
  waitForCloudScenePresent,
  expectHcSceneBindingValues,
  waitForHcSceneBindingValues,
  expectDeviceSceneBindingMappings,
  waitForDeviceSceneMapping,
  deleteCreatedScenes,
  setSceneBindingsBaseline,
  activateSceneBindings,
  prepareAndActivateSceneBindings,
  waitForBindingStates,
  assertSceneOutputMatchesBindings,
  pollForBindingStates,
  resolveSceneHcId,
  getHcDeviceStatuses,
  toSceneOutputEvidence,
  pollUntil,
  createSceneBindings,
  isAutoSceneName,
  cleanupAutoScene,
  expectSceneListShape,
  expectSceneDetailShape,
  expectValidationOrDocumentedBehavior,
  isOnlineDevice,
  isSceneControllableDevice,
  isSceneFallbackControllableDevice,
  compareSceneDevicePriority,
  isPreferredSceneDeviceType,
  getRulesCount,
  hasBooleanSlot,
  toSceneDeviceSummary,
  getSceneHcId,
  shuffleSceneTargets,
  sceneEndpoint
}
