import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { APIRequestContext, expect, request } from '@playwright/test'
import {
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_HC_ID,
  AUTOMATION_HC_MAC,
  AUTOMATION_RULE_POLL_INTERVAL_MS,
  AUTOMATION_RULE_POLL_TIMEOUT_MS,
  AUTOMATION_SERVICE_ENDPOINT,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'

type AutomationRuleDeviceSlot = {
  idx?: number | string
  data_type?: {
    type?: string
  }
}

type RuleEvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  request?: unknown
  response_status?: number
  response?: unknown
  details?: unknown
}

export type RuleTestContext = {
  tcId: string
  tcName: string
  startedAt: string
  evidenceType: 'api' | 'ui'
  steps: RuleEvidenceStep[]
  assertions: string[]
  cleanup: {
    rule_deleted: boolean
    scene_deleted?: boolean
    warnings: string[]
  }
}

export type AutomationRuleDeviceCandidate = {
  id: string
  name?: string
  status?: boolean
  network_state?: string
  rule_count?: number
  rules?: unknown[]
  hc_id?: string
  hc?: {
    id?: string
    mac?: string
    name?: string
  }
  spec?: {
    input?: AutomationRuleDeviceSlot[]
    output?: AutomationRuleDeviceSlot[]
    state?: AutomationRuleDeviceSlot[]
  }
}

export type AutomationRuleDiscoveryResult = {
  selected: AutomationRuleDeviceCandidate[]
  online: AutomationRuleDeviceCandidate[]
  offline: AutomationRuleDeviceCandidate[]
  skipped: AutomationRuleDeviceCandidate[]
  wrongHc: AutomationRuleDeviceCandidate[]
}

export type AutomationRuleIdentity = {
  id?: string
  name?: string
}

export type AutomationRuleRuntimeDevices = {
  trigger: AutomationRuleDeviceCandidate
  condition?: AutomationRuleDeviceCandidate
  action: AutomationRuleDeviceCandidate
  pool: AutomationRuleDeviceCandidate[]
}

type GatewayDeviceStatus = {
  id: string
  status: Array<{
    idx: number
    value: boolean | number | string
  }>
}

export type HomeControllerStatus = {
  id: string
  mac: string
  name?: string | null
  ip?: string | null
  lifecycle_state?: string
  automation_gateway?: boolean
  mqtt_status?: {
    connected?: boolean
    last_event_at?: string | null
    last_connected_at?: string | null
    last_disconnected_at?: string | null
  }
}

export type RuleRuntimeEvidence = {
  inputResetMatched: boolean
  outputResetMatched: boolean
  beforeStatuses: GatewayDeviceStatus[]
  afterStatuses: GatewayDeviceStatus[]
  outputMatched: boolean
}

type AutomationRuleListItem = {
  id?: string | number
  name?: string
  enable?: boolean
}

type DeviceWithRules = {
  rules?: unknown[]
}

const SECRET_KEYS = new Set(['app_key', 'dev_key', 'nwk_key'])
const UNSUPPORTED_RUNTIME_DEVICE_NAME_PARTS = ['_52C9_']
const RUN_DIR =
  process.env.AUTOMATION_RULES_RUN_DIR ??
  (process.env.CI
    ? path.join('test-runs', `automation-rules-${Date.now()}`)
    : path.join('test-runs', 'automation-rules-current'))
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence')

export const createRuleTestContext = (
  tcId: string,
  tcName: string,
  evidenceType: 'api' | 'ui' = 'api',
): RuleTestContext => ({
  tcId,
  tcName,
  evidenceType,
  startedAt: new Date().toISOString(),
  steps: [],
  assertions: [],
  cleanup: {
    rule_deleted: false,
    warnings: [],
  },
})

export const attachRuleStep = (
  context: RuleTestContext,
  step: RuleEvidenceStep,
) => {
  context.steps.push(redactAutomationSecrets(step) as RuleEvidenceStep)
}

export const attachRuleAssertion = (
  context: RuleTestContext,
  assertion: string,
) => {
  context.assertions.push(assertion)
}

export const saveRuleEvidence = async (
  context: RuleTestContext,
  status: 'PASSED' | 'FAILED' | 'SKIPPED',
  error?: unknown,
) => {
  const evidenceDir = path.join(EVIDENCE_DIR, context.evidenceType)
  await mkdir(evidenceDir, { recursive: true })
  const slug = context.tcName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const filename = `${context.tcId}_${slug}_${Date.now()}.json`
  const evidence = redactAutomationSecrets({
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
  })

  await writeFile(
    path.join(evidenceDir, filename),
    JSON.stringify(evidence, null, 2),
    'utf8',
  )
}

export const recordRuleResponse = async (
  context: RuleTestContext,
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

  attachRuleStep(context, {
    step,
    method: options.method,
    endpoint: options.endpoint,
    request: options.request,
    response_status: response.status(),
    response: body,
  })

  return body
}

export const selectAutomationRuleDevices = ({
  devices,
  hcMac,
  slot,
  count = 3,
  disabledRuleIds = new Set<string>(),
}: {
  devices: AutomationRuleDeviceCandidate[]
  hcMac: string
  slot: string
  count?: number
  disabledRuleIds?: Set<string>
}): AutomationRuleDiscoveryResult => {
  const targetHcMac = hcMac.toLowerCase()
  const wrongHc = devices.filter(
    (device) => device.hc?.mac?.toLowerCase() !== targetHcMac,
  )
  const sameHcDevices = devices.filter(
    (device) => device.hc?.mac?.toLowerCase() === targetHcMac,
  )
  const offline = sameHcDevices.filter((device) => !isOnlineDevice(device))
  const online = sameHcDevices
    .filter(isOnlineDevice)
    .filter((device) => !isUnsupportedRuntimeDevice(device))
  const eligible = online.filter((device) =>
    isUsableRuleDevice(device, Number(slot), disabledRuleIds),
  )
  const selected = eligible.slice(0, count)
  const selectedIds = new Set(selected.map((device) => device.id))
  const skipped = online.filter(
    (device) =>
      !selectedIds.has(device.id) ||
      !isUsableRuleDevice(device, Number(slot), disabledRuleIds),
  )

  return {
    selected,
    online,
    offline,
    skipped,
    wrongHc,
  }
}

export const formatRuleDeviceDiscovery = (
  discovery: AutomationRuleDiscoveryResult,
) => ({
  selected: discovery.selected.map(toRuleDeviceSummary),
  online_count: discovery.online.length,
  offline: discovery.offline.map(toRuleDeviceSummary),
  skipped: discovery.skipped.map(toRuleDeviceSummary),
  wrong_hc_count: discovery.wrongHc.length,
})

export const parseAutomationDetailPayload = (
  payloadText: string,
): Record<string, unknown> => {
  try {
    return JSON.parse(payloadText) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `AUTOMATION_DETAIL_PAYLOAD must be valid JSON: ${String(error)}`,
    )
  }
}

export const getAutomationRuleIdentity = (
  createResponseJson: unknown,
  payload: Record<string, unknown>,
): AutomationRuleIdentity => {
  const responseObject = asRecord(createResponseJson)
  const data = asRecord(responseObject.data)

  return {
    id: getString(data.id ?? responseObject.id),
    name: getString(data.name ?? responseObject.name ?? payload.name),
  }
}

export const findAutomationByIdentity = <T extends AutomationRuleListItem>(
  automations: T[],
  identity: AutomationRuleIdentity,
): T | undefined =>
  automations.find((automation) => matchesIdentity(automation, identity))

export const hasRuleMapping = (
  device: DeviceWithRules,
  identity: AutomationRuleIdentity,
) =>
  (device.rules ?? []).some((rule) =>
    matchesIdentity(asRecord(rule), identity),
  )

export const redactAutomationSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactAutomationSecrets)
  }

  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      SECRET_KEYS.has(key) ? '***' : redactAutomationSecrets(entryValue),
    ]),
  )
}

export const discoverAutomationRuleDevices = async (
  apiRequest: APIRequestContext,
): Promise<AutomationRuleRuntimeDevices> => {
  const response = await apiRequest.get(
    `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices`,
    {
      params: {
        limit: 100,
      },
    },
  )
  const json = await response.json()
  const devices = (json.data?.items ?? []) as AutomationRuleDeviceCandidate[]
  const automationsResponse = await apiRequest.get(
    `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/automations`,
    {
      params: {
        page: 1,
        limit: 200,
      },
    },
  )
  const automationsJson = await automationsResponse.json()
  const disabledRuleIds = new Set(
    ((automationsJson.data?.items ?? []) as AutomationRuleListItem[])
      .filter((automation) => automation.enable === false)
      .map((automation) => String(automation.id)),
  )
  const discovery = selectAutomationRuleDevices({
    devices,
    hcMac: AUTOMATION_HC_MAC,
    slot: AUTOMATION_DEVICE_STATE_IDX,
    count: 8,
    disabledRuleIds,
  })

  console.log(
    JSON.stringify({
      rule_device_discovery: redactAutomationSecrets(
        formatRuleDeviceDiscovery(discovery),
      ),
    }),
  )

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(automationsResponse.status()).toBe(200)
  await expect(automationsJson.success).toBe(true)
  await expect(
    discovery.selected.length,
    `Need at least 3 clean online controllable devices on HC ${AUTOMATION_HC_MAC}. Discovery: ${JSON.stringify(formatRuleDeviceDiscovery(discovery))}`,
  ).toBeGreaterThanOrEqual(3)

  return {
    trigger: discovery.selected[0],
    condition: discovery.selected[1],
    action: discovery.selected[2],
    pool: discovery.selected,
  }
}

export const expectAutomationInList = async ({
  apiRequest,
  identity,
}: {
  apiRequest: APIRequestContext
  identity: AutomationRuleIdentity
}) => {
  const response = await apiRequest.get(
    `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/automations`,
    {
      params: {
        page: 1,
        limit: 100,
      },
    },
  )
  const json = await response.json()
  const items = (json.data?.items ?? []) as AutomationRuleListItem[]
  const automation = findAutomationByIdentity(items, identity)

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(automation, `Automation ${JSON.stringify(identity)} in list`).toBeTruthy()

  return automation
}

export const expectRuleMappedToDevices = async ({
  devices,
  identity,
}: {
  devices: AutomationRuleDeviceCandidate[]
  identity: AutomationRuleIdentity
}) => {
  const deviceContext = await request.newContext({
    baseURL: DEVICE_SERVICE_ENDPOINT,
  })
  try {
    for (const device of devices) {
      const mappedDevice = await pollUntil(async () => {
        const response = await deviceContext.get(`/api/v0/devices/${device.id}`)
        if (response.status() !== 200) {
          return null
        }

        const json = await response.json()
        return hasRuleMapping(json.data ?? {}, identity) ? json.data : null
      })

      await expect(
        mappedDevice,
        `Rule ${JSON.stringify(identity)} should map to device ${device.id}`,
      ).not.toBeNull()
    }
  } finally {
    await deviceContext.dispose()
  }
}

export const expectRuleNotMappedToDevices = async ({
  devices,
  identity,
}: {
  devices: AutomationRuleDeviceCandidate[]
  identity: AutomationRuleIdentity
}) => {
  const deviceContext = await request.newContext({
    baseURL: DEVICE_SERVICE_ENDPOINT,
  })
  try {
    for (const device of devices) {
      const unmappedDevice = await pollUntil(async () => {
        const response = await deviceContext.get(`/api/v0/devices/${device.id}`)
        if (response.status() !== 200) {
          return null
        }

        const json = await response.json()
        return hasRuleMapping(json.data ?? {}, identity) ? null : json.data
      })

      await expect(
        unmappedDevice,
        `Rule ${JSON.stringify(identity)} should be removed from device ${device.id}`,
      ).not.toBeNull()
    }
  } finally {
    await deviceContext.dispose()
  }
}

export const setRuleDeviceState = async ({
  deviceId,
  value,
}: {
  deviceId: string
  value: boolean
}) => {
  const controlContext = await request.newContext({
    baseURL: DEVICE_CONTROL_ENDPOINT,
  })
  try {
    const response = await controlContext.post('/api/devices/control', {
      headers: {
        'x-hc-id': AUTOMATION_HC_ID,
        'x-request-id': `rule-e2e-${deviceId}-${Date.now()}`,
        'x-user-id': 'automation-test',
        'x-app-id': 'bms-e2e-test',
      },
      data: {
        device_id: String(deviceId),
        states: [
          {
            idx: Number(AUTOMATION_DEVICE_STATE_IDX),
            value,
          },
        ],
      },
    })
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.status).toBe(true)
  } finally {
    await controlContext.dispose()
  }
}

export const waitForDeviceState = async ({
  deviceId,
  value,
}: {
  deviceId: string
  value: boolean
}) => {
  const deviceContext = await request.newContext({
    baseURL: DEVICE_SERVICE_ENDPOINT,
  })
  try {
    const matchedDevice = await pollUntil(async () => {
      const response = await deviceContext.get(`/api/v0/devices/${deviceId}`)
      if (response.status() !== 200) {
        return null
      }

      const json = await response.json()
      const state = findDeviceSlotValue(json.data, AUTOMATION_DEVICE_STATE_IDX)
      return state === value ? json.data : null
    })

    await expect(
      matchedDevice,
      `Device ${deviceId} state ${AUTOMATION_DEVICE_STATE_IDX} should be ${value}`,
    ).not.toBeNull()
  } finally {
    await deviceContext.dispose()
  }
}

export const controlGatewayDevice = async ({
  deviceId,
  slot,
  value,
}: {
  deviceId: string | number
  slot: number
  value: boolean | number | string
}) => {
  const controlContext = await request.newContext({
    baseURL: DEVICE_CONTROL_ENDPOINT,
  })
  try {
    const response = await controlContext.post('/api/devices/control', {
      headers: {
        'x-hc-id': AUTOMATION_HC_ID,
        'x-request-id': `rule-runtime-${deviceId}-${Date.now()}`,
        'x-user-id': 'automation-test',
        'x-app-id': 'bms-e2e-test',
      },
      data: {
        device_id: String(deviceId),
        states: [
          {
            idx: slot,
            value,
          },
        ],
      },
    })

    await expect(response.status()).toBe(200)
  } finally {
    await controlContext.dispose()
  }
}

export const getGatewayDeviceStatus = async (
  deviceIds: Array<string | number>,
): Promise<GatewayDeviceStatus[]> => {
  const deviceContext = await request.newContext({
    baseURL: IOT_HC_ENDPOINT,
  })
  try {
    const response = await deviceContext.get('/api/devices/status', {
      params: {
        ids: deviceIds.map(String).join(','),
      },
    })

    await expect(response.status()).toBe(200)

    return (await response.json()) as GatewayDeviceStatus[]
  } finally {
    await deviceContext.dispose()
  }
}

export const getGatewaySlotValue = (
  statuses: GatewayDeviceStatus[],
  deviceId: string | number,
  slot: number,
) => {
  const device = statuses.find((item) => String(item.id) === String(deviceId))
  return device?.status.find((item) => Number(item.idx) === slot)?.value
}

export const hasGatewaySlotValue = (
  statuses: GatewayDeviceStatus[],
  deviceId: string | number,
  slot: number,
  value: boolean | number | string,
) => getGatewaySlotValue(statuses, deviceId, slot) === value

export const triggerRuleAndCollectEvidence = async ({
  inputDeviceId,
  inputSlot,
  inputValue,
  outputDeviceId,
  outputSlot,
  initialOutputValue,
  expectedOutputValue,
  timeoutMs = AUTOMATION_RULE_POLL_TIMEOUT_MS,
  intervalMs = AUTOMATION_RULE_POLL_INTERVAL_MS,
}: {
  inputDeviceId: string | number
  inputSlot: number
  inputValue: boolean | number | string
  outputDeviceId: string | number
  outputSlot: number
  initialOutputValue: boolean | number | string
  expectedOutputValue: boolean | number | string
  timeoutMs?: number
  intervalMs?: number
}): Promise<RuleRuntimeEvidence> => {
  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: inputSlot,
    value: initialOutputValue,
  })
  await controlGatewayDevice({
    deviceId: outputDeviceId,
    slot: outputSlot,
    value: initialOutputValue,
  })

  const inputResetMatched = await waitForGatewaySlotSoft({
    deviceId: inputDeviceId,
    slot: inputSlot,
    value: initialOutputValue,
  })
  const outputResetMatched = await waitForGatewaySlotSoft({
    deviceId: outputDeviceId,
    slot: outputSlot,
    value: initialOutputValue,
  })
  const beforeStatuses = await getGatewayDeviceStatus([
    inputDeviceId,
    outputDeviceId,
  ])

  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: inputSlot,
    value: inputValue,
  })
  await waitForGatewaySlotSoft({
    deviceId: inputDeviceId,
    slot: inputSlot,
    value: inputValue,
  })

  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  let afterStatuses = await getGatewayDeviceStatus([inputDeviceId, outputDeviceId])
  let outputMatched = hasGatewaySlotValue(
    afterStatuses,
    outputDeviceId,
    outputSlot,
    expectedOutputValue,
  )

  for (let attempt = 0; attempt < attempts && !outputMatched; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    afterStatuses = await getGatewayDeviceStatus([inputDeviceId, outputDeviceId])
    outputMatched = hasGatewaySlotValue(
      afterStatuses,
      outputDeviceId,
      outputSlot,
      expectedOutputValue,
    )
  }

  return {
    inputResetMatched,
    outputResetMatched,
    beforeStatuses,
    afterStatuses,
    outputMatched,
  }
}

export const listHomeControllers = async (
  apiRequest: APIRequestContext,
): Promise<HomeControllerStatus[]> => {
  const response = await apiRequest.get(
    `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/home-controllers`,
    {
      params: {
        limit: 100,
      },
    },
  )
  const json = await response.json()

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(Array.isArray(json.data?.items)).toBe(true)

  return json.data.items as HomeControllerStatus[]
}

export const expectGatewayDeviceState = async ({
  deviceId,
  slot,
  value,
}: {
  deviceId: string | number
  slot: number
  value: boolean | number | string
}) => {
  const statuses = await getGatewayDeviceStatus([deviceId])
  const device = statuses.find((item) => String(item.id) === String(deviceId))
  const state = device?.status.find((item) => Number(item.idx) === slot)

  await expect(device, `Gateway status for device ${deviceId}`).toBeTruthy()
  await expect(state?.value).toBe(value)
}

export const waitForGatewayDeviceState = async ({
  deviceId,
  slot,
  value,
  timeoutMs = AUTOMATION_RULE_POLL_TIMEOUT_MS,
  intervalMs = AUTOMATION_RULE_POLL_INTERVAL_MS,
}: {
  deviceId: string | number
  slot: number
  value: boolean | number | string
  timeoutMs?: number
  intervalMs?: number
}) => {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  const matched = await pollUntil(async () => {
    const statuses = await getGatewayDeviceStatus([deviceId])
    const device = statuses.find((item) => String(item.id) === String(deviceId))
    const state = device?.status.find((item) => Number(item.idx) === slot)

    return state?.value === value ? device : null
  }, attempts, intervalMs)

  await expect(
    matched,
    `Gateway device ${deviceId} slot ${slot} should become ${String(value)}`,
  ).not.toBeNull()
}

export const triggerInputAndExpectOutput = async ({
  inputDeviceId,
  inputSlot,
  inputValue,
  outputDeviceId,
  outputSlot,
  initialOutputValue,
  expectedOutputValue,
  timeoutMs = AUTOMATION_RULE_POLL_TIMEOUT_MS,
  expectNoChange = false,
}: {
  inputDeviceId: string | number
  inputSlot: number
  inputValue: boolean | number | string
  outputDeviceId: string | number
  outputSlot: number
  initialOutputValue: boolean | number | string
  expectedOutputValue: boolean | number | string
  timeoutMs?: number
  expectNoChange?: boolean
}) => {
  await controlGatewayDevice({
    deviceId: outputDeviceId,
    slot: outputSlot,
    value: initialOutputValue,
  })
  await waitForGatewayDeviceState({
    deviceId: outputDeviceId,
    slot: outputSlot,
    value: initialOutputValue,
  })
  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: inputSlot,
    value: inputValue,
  })

  if (expectNoChange) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    await expectGatewayDeviceState({
      deviceId: outputDeviceId,
      slot: outputSlot,
      value: expectedOutputValue,
    })
    return
  }

  await waitForGatewayDeviceState({
    deviceId: outputDeviceId,
    slot: outputSlot,
    value: expectedOutputValue,
    timeoutMs,
  })
}

export const pollUntil = async <T>(
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

const waitForGatewaySlotSoft = async ({
  deviceId,
  slot,
  value,
  timeoutMs = AUTOMATION_RULE_POLL_TIMEOUT_MS,
  intervalMs = AUTOMATION_RULE_POLL_INTERVAL_MS,
}: {
  deviceId: string | number
  slot: number
  value: boolean | number | string
  timeoutMs?: number
  intervalMs?: number
}) => {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  const matched = await pollUntil(async () => {
    const statuses = await getGatewayDeviceStatus([deviceId])
    return hasGatewaySlotValue(statuses, deviceId, slot, value) ? true : null
  }, attempts, intervalMs)

  return matched === true
}

const isOnlineDevice = (device: AutomationRuleDeviceCandidate) =>
  device.network_state === 'activated'

const isUnsupportedRuntimeDevice = (device: AutomationRuleDeviceCandidate) =>
  UNSUPPORTED_RUNTIME_DEVICE_NAME_PARTS.some((namePart) =>
    device.name?.includes(namePart),
  )

const isUsableRuleDevice = (
  device: AutomationRuleDeviceCandidate,
  slot: number,
  disabledRuleIds: Set<string>,
) =>
  hasNoActiveRule(device, disabledRuleIds) &&
  hasBooleanSlot(device.spec?.input, slot) &&
  hasBooleanSlot(device.spec?.output, slot) &&
  hasBooleanSlot(device.spec?.state, slot)

const hasNoActiveRule = (
  device: AutomationRuleDeviceCandidate,
  disabledRuleIds: Set<string>,
) => {
  if (getRulesCount(device) === 0) {
    return true
  }

  const ruleIds = getDeviceRuleIds(device)
  return (
    ruleIds.length > 0 &&
    ruleIds.every((ruleId) => disabledRuleIds.has(ruleId))
  )
}

const getDeviceRuleIds = (device: AutomationRuleDeviceCandidate) =>
  (device.rules ?? [])
    .map((rule) => asRecord(rule).id)
    .filter((ruleId): ruleId is string | number => ruleId !== undefined)
    .map((ruleId) => String(ruleId))

const hasBooleanSlot = (
  slots: AutomationRuleDeviceSlot[] | undefined,
  slot: number,
) =>
  slots?.some(
    (item) =>
      Number(item.idx) === slot && item.data_type?.type === 'boolean',
  ) === true

const getRulesCount = (device: AutomationRuleDeviceCandidate) =>
  device.rule_count ?? device.rules?.length ?? 0

const toRuleDeviceSummary = (device: AutomationRuleDeviceCandidate) => ({
  id: device.id,
  name: device.name,
  status: device.status,
  network_state: device.network_state,
  hc_id: device.hc_id ?? device.hc?.id,
  hc_mac: device.hc?.mac,
  rules_count: getRulesCount(device),
})

const matchesIdentity = (
  value: AutomationRuleListItem,
  identity: AutomationRuleIdentity,
) =>
  (identity.id !== undefined && String(value.id) === identity.id) ||
  (identity.name !== undefined && value.name === identity.name)

const findDeviceSlotValue = (device: unknown, slot: string) => {
  const state = asRecord(device).state
  if (!Array.isArray(state)) {
    return undefined
  }

  const stateItem = state.find((item) => Number(asRecord(item).idx) === Number(slot))
  return asRecord(stateItem).value
}

const getString = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : String(value)

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
