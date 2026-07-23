import { APIRequestContext, APIResponse, expect, request as playwrightRequest } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'ssh2'
import {
  AUTOMATION_ACTION_DEVICE_ID,
  AUTOMATION_CONDITION_DEVICE_ID,
  AUTOMATION_HC_ID,
  GROUP_API_BASE,
  GROUP_AUTH_LOGIN_API,
  GROUP_BASE_URL,
  GROUP_DEVICE_CONTROL_API,
  GROUP_DEVICE_STATUS_API,
  GROUP_HC_API_BASE,
  GROUP_ALLOW_DEVICE_CONTROL,
  GROUP_REQUIRE_AUTH,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { delay } from '@src/utils'

export type GroupType = 'Normal' | 'Lighting'
export type GroupStateValue = boolean | number | string
export type GroupState = { idx: number; value: GroupStateValue }
export type GroupPayload = {
  name?: string
  type?: string
  icon?: string
  area_id?: string
  device_ids?: Array<string | number>
  devices?: Array<string | number>
}
export type DeviceStatus = {
  id: string | number
  status?: Array<{ idx: number | string; value: GroupStateValue }>
}

type EvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  request?: unknown
  response?: unknown
  status?: number
  details?: unknown
}

export type GroupTestContext = {
  tcId: string
  tcName: string
  startedAt: string
  steps: EvidenceStep[]
  assertions: string[]
  cleanup: {
    group_deleted: boolean
    device_reset: boolean
    warnings: string[]
  }
}

export const RUN_DIR = path.resolve(
  process.cwd(),
  process.env.GROUP_MANAGEMENT_RUN_DIR ??
    (process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
      ? path.dirname(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR)
      : path.join('test-runs', 'group-management-current')),
)
export const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence', 'api')
export const GROUP_DEVICE_STATUS_BASE_URL =
  process.env.GROUP_DEVICE_STATUS_BASE_URL ||
  process.env.DEVICE_STATUS_BASE_URL ||
  process.env.HC_BASE_URL ||
  IOT_HC_ENDPOINT
export const GROUP_DEVICE_CONTROL_BASE_URL =
  process.env.GROUP_DEVICE_CONTROL_BASE_URL ||
  process.env.GATEWAY_BASE_URL ||
  process.env.DEVICE_CONTROL_BASE_URL ||
  process.env.DEVICE_CONTROL_ENDPOINT ||
  GROUP_BASE_URL
export const GROUP_HC_BASE_URL =
  process.env.GROUP_HC_BASE_URL || process.env.HC_BASE_URL || IOT_HC_ENDPOINT
export const GROUP_NORMAL_DEVICE_TYPE_ID = Number(
  process.env.GROUP_NORMAL_DEVICE_TYPE_ID || '10001',
)
export const GROUP_LIGHTING_DEVICE_TYPE_ID = Number(
  process.env.GROUP_LIGHTING_DEVICE_TYPE_ID || '10000',
)
export const TEST_AREA_ID = process.env.TEST_AREA_ID || ''
export const TEST_SWITCH_DEVICE_ID_1 =
  process.env.TEST_SWITCH_DEVICE_ID_1 ||
  process.env.TEST_SWITCH_DEVICE_ID ||
  AUTOMATION_ACTION_DEVICE_ID ||
  ''
export const TEST_SWITCH_DEVICE_ID_2 =
  process.env.TEST_SWITCH_DEVICE_ID_2 ||
  process.env.TEST_SWITCH_DEVICE_ID ||
  AUTOMATION_CONDITION_DEVICE_ID ||
  ''
export const TEST_LIGHTING_DEVICE_ID_1 =
  process.env.TEST_LIGHTING_DEVICE_ID_1 ||
  process.env.TEST_LIGHTING_DEVICE_ID ||
  TEST_SWITCH_DEVICE_ID_1
export const TEST_LIGHTING_DEVICE_ID_2 =
  process.env.TEST_LIGHTING_DEVICE_ID_2 ||
  process.env.TEST_LIGHTING_DEVICE_ID ||
  TEST_SWITCH_DEVICE_ID_2
export const TEST_DIMMER_DEVICE_ID =
  process.env.TEST_DIMMER_DEVICE_ID ||
  process.env.TEST_LIGHTING_DEVICE_ID_1 ||
  TEST_LIGHTING_DEVICE_ID_1
export const SLOT_ON_OFF = Number(process.env.SLOT_ON_OFF || '1')
export const SLOT_BRIGHTNESS = Number(process.env.SLOT_BRIGHTNESS || '2')
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || '500')
export const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || '10000')
export const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT_MS || '15000')
export const HC_SSH_HOST =
  process.env.HC_SSH_HOST || hostFromEndpoint(GROUP_HC_BASE_URL)
export const HC_SSH_USER = process.env.HC_SSH_USER || 'root'
export const HC_SSH_PASSWORD = process.env.HC_SSH_PASSWORD || ''
export const HC_SSH_KEY_PATH = process.env.HC_SSH_KEY_PATH || ''
export const HC_SSH_KEY_PASSPHRASE = process.env.HC_SSH_KEY_PASSPHRASE || ''
export const HC_LOG_PATH = process.env.HC_LOG_PATH || '/tmp/log/home-controller.log'
export const HC_LOG_TAIL_LINES = Number(process.env.HC_LOG_TAIL_LINES || '300')
export const HC_LOG_MAX_CHARS = Number(process.env.HC_LOG_MAX_CHARS || '60000')

const execFileAsync = promisify(execFile)

export class GroupApiClient {
  constructor(public context: APIRequestContext, public token = '') {}

  setToken(token: string) {
    this.token = token
  }

  async requestAPI(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>
      body?: unknown
      token?: string
      baseUrl?: string
      headers?: Record<string, string>
    } = {},
  ) {
    const headers = this.buildHeaders(options.token, options.headers)
    const url = absoluteUrl(options.baseUrl ?? GROUP_BASE_URL, endpoint)
    const requestOptions: {
      headers: Record<string, string>
      params?: Record<string, string | number | boolean>
      data?: unknown
    } = {
      headers,
      params: compactQuery(options.query),
      data: options.body,
    }
    if (method === 'GET') {
      return await this.context.get(url, requestOptions)
    }
    if (method === 'POST') {
      return await this.context.post(url, requestOptions)
    }
    if (method === 'PATCH') {
      return await this.context.patch(url, requestOptions)
    }
    return await this.context.delete(url, requestOptions)
  }

  listGroupsAPI(query?: Record<string, string | number | boolean | undefined>) {
    return this.requestAPI('GET', GROUP_API_BASE, { query })
  }

  getGroupAPI(groupId: string | number) {
    return this.requestAPI('GET', `${GROUP_API_BASE}/${groupId}`)
  }

  createGroupAPI(payload: GroupPayload | Record<string, unknown>) {
    return this.requestAPI('POST', GROUP_API_BASE, { body: payload })
  }

  updateGroupAPI(groupId: string | number, payload: Partial<GroupPayload>) {
    return this.requestAPI('PATCH', `${GROUP_API_BASE}/${groupId}`, { body: payload })
  }

  deleteGroupAPI(groupId: string | number) {
    return this.requestAPI('DELETE', `${GROUP_API_BASE}/${groupId}`)
  }

  addDevicesToGroupAPI(groupId: string | number, deviceIds: Array<string | number>) {
    return this.requestAPI('POST', `${GROUP_API_BASE}/${groupId}/members`, {
      body: {
        members: deviceIds.map((deviceId) => ({
          cell_id: String(deviceId),
          state: 'activated',
        })),
        bindings: [],
      },
    })
  }

  removeDevicesFromGroupAPI(groupId: string | number, deviceIds: Array<string | number>) {
    return this.requestAPI('DELETE', `${GROUP_API_BASE}/${groupId}/members`, {
      body: {
        members: deviceIds.map((deviceId) => ({
          cell_id: String(deviceId),
        })),
        bindings: [],
      },
    })
  }

  assignGroupToAreaAPI(groupId: string | number, areaId: string | number) {
    return this.requestAPI('POST', `/api/v0/areas/${areaId}/groups`, {
      body: { group_ids: [groupId] },
    })
  }

  controlGroupAPI(groupId: string | number, states: GroupState[]) {
    return this.requestAPI('POST', `${GROUP_API_BASE}/${groupId}/control`, {
      body: { states },
    })
  }

  controlDeviceAPI(deviceId: string | number, states: GroupState[]) {
    return this.requestAPI('POST', GROUP_DEVICE_CONTROL_API, {
      baseUrl: GROUP_DEVICE_CONTROL_BASE_URL,
      headers: {
        'x-hc-id': AUTOMATION_HC_ID,
        'x-request-id': `group-control-${deviceId}-${Date.now()}`,
        'x-user-id': 'automation-test',
        'x-app-id': 'bms-e2e-test',
      },
      body: {
        device_id: String(deviceId),
        states,
      },
    })
  }

  async controlGroupOrDevicesAPI(groupId: string | number, deviceIds: Array<string | number>, states: GroupState[]) {
    const groupResponse = await this.controlGroupAPI(groupId, states)
    if (![404, 405, 501].includes(groupResponse.status())) {
      return {
        mode: 'group',
        response: groupResponse,
        deviceResponses: [] as APIResponse[],
      }
    }

    const deviceResponses: APIResponse[] = []
    for (const deviceId of deviceIds) {
      deviceResponses.push(await this.controlDeviceAPI(deviceId, states))
    }
    return {
      mode: 'device_fallback',
      response: groupResponse,
      deviceResponses,
    }
  }

  getDeviceStatusAPI(deviceIds: Array<string | number>) {
    return this.requestAPI('GET', GROUP_DEVICE_STATUS_API, {
      baseUrl: GROUP_DEVICE_STATUS_BASE_URL,
      query: { ids: deviceIds.map(String).join(',') },
    })
  }

  getGroupsFromHCAPI() {
    return this.requestAPI('GET', GROUP_HC_API_BASE, {
      baseUrl: GROUP_HC_BASE_URL,
    })
  }

  requestWithoutTokenAPI(method: 'GET' | 'POST', endpoint: string, body?: unknown) {
    return this.requestAPI(method, endpoint, { body, token: '' })
  }

  requestWithInvalidTokenAPI(method: 'GET' | 'POST', endpoint: string, body?: unknown) {
    return this.requestAPI(method, endpoint, { body, token: 'invalid-token-for-group-api' })
  }

  private buildHeaders(token?: string, headers?: Record<string, string>) {
    const selectedToken = token === undefined ? this.token : token
    return {
      ...(selectedToken ? { Authorization: `Bearer ${selectedToken}` } : {}),
      ...headers,
    }
  }
}

export const createGroupTestContext = (
  tcId: string,
  tcName: string,
): GroupTestContext => ({
  tcId,
  tcName,
  startedAt: new Date().toISOString(),
  steps: [],
  assertions: [],
  cleanup: {
    group_deleted: false,
    device_reset: false,
    warnings: [],
  },
})

export const attachGroupStep = (context: GroupTestContext, step: EvidenceStep) => {
  context.steps.push(step)
}

export const attachGroupAssertion = (
  context: GroupTestContext,
  assertion: string,
) => {
  context.assertions.push(assertion)
}

export const resetGroupEvidenceRunDir = async () => {
  const testRunsDir = path.resolve(process.cwd(), 'test-runs')
  const runDirParent = path.dirname(RUN_DIR)
  if (runDirParent === testRunsDir) {
    await mkdir(testRunsDir, { recursive: true })
    const entries = await readdir(testRunsDir, { withFileTypes: true })
    await Promise.all(entries
      .filter((entry) => entry.name.startsWith('group-management'))
      .map((entry) => path.join(testRunsDir, entry.name))
      .filter((entryPath) => entryPath !== RUN_DIR)
      .map((entryPath) => rm(entryPath, { recursive: true, force: true })))
  }
  await rm(RUN_DIR, { recursive: true, force: true })
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

export const saveGroupEvidence = async (
  context: GroupTestContext,
  status: 'PASSED' | 'FAILED' | 'SKIPPED',
  error?: unknown,
) => {
  await mkdir(EVIDENCE_DIR, { recursive: true })
  const finishedAt = new Date().toISOString()
  if (status === 'FAILED') {
    await attachHomeControllerLogOnFailure(context, finishedAt)
  }
  const slug = context.tcName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  const filename = `${context.tcId}_${slug}_${Date.now()}.json`
  const evidence = {
    tc_id: context.tcId,
    tc_name: context.tcName,
    status,
    started_at: context.startedAt,
    finished_at: finishedAt,
    endpoints: {
      group_base_url: GROUP_BASE_URL,
      group_api_base: GROUP_API_BASE,
      hc_base_url: GROUP_HC_BASE_URL,
      hc_group_api_base: GROUP_HC_API_BASE,
      device_control_base_url: GROUP_DEVICE_CONTROL_BASE_URL,
      device_control_api: GROUP_DEVICE_CONTROL_API,
      device_status_base_url: GROUP_DEVICE_STATUS_BASE_URL,
      device_status_api: GROUP_DEVICE_STATUS_API,
    },
    steps: context.steps,
    assertions: context.assertions,
    cleanup: context.cleanup,
    error_message:
      error instanceof Error ? error.message : error ? String(error) : undefined,
  }

  await writeFile(path.join(EVIDENCE_DIR, filename), JSON.stringify(evidence, null, 2), 'utf8')
}

export const recordGroupResponse = async (
  context: GroupTestContext,
  step: string,
  response: APIResponse,
  options: {
    method: string
    endpoint: string
    request?: unknown
  },
) => {
  const body = await safeJson(response)
  attachGroupStep(context, {
    step,
    method: options.method,
    endpoint: options.endpoint,
    request: options.request,
    response: body,
    status: response.status(),
  })

  if (response.status() >= 400) {
    console.log(JSON.stringify({
      group_api_failure: {
        method: options.method,
        endpoint: options.endpoint,
        request: options.request,
        status: response.status(),
        response: body,
      },
    }))
  }

  return body
}

export const loginAs = async (
  userType: 'admin' | 'viewer' | 'no_permission',
) => {
  const token = envTokenFor(userType)
  if (token) {
    return token
  }

  const username = process.env[`${userType.toUpperCase()}_USERNAME`]
  const password = process.env[`${userType.toUpperCase()}_PASSWORD`]
  if (!username || !password) {
    return ''
  }

  const context = await playwrightRequest.newContext()
  try {
    const response = await context.post(
      absoluteUrl(GROUP_BASE_URL, GROUP_AUTH_LOGIN_API),
      { data: { username, password } },
    )
    if (response.status() >= 400) {
      throw new Error(`Login ${userType} failed with status ${response.status()}`)
    }
    const body = asRecord(await safeJson(response))
    return String(
      body.access_token ??
        body.token ??
        asRecord(body.data).access_token ??
        asRecord(body.data).token ??
        '',
    )
  } finally {
    await context.dispose()
  }
}

export const generateGroupName = (tcId: string, type = 'normal') => {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 6)
  return `auto_group_${tcId}_${type}_${timestamp}_${random}`
}

export const createGroupPayload = ({
  tcId,
  type = 'Normal',
  deviceIds = [],
  name = generateGroupName(tcId, type.toLowerCase()),
  icon = 'group-auto',
}: {
  tcId: string
  type?: GroupType | string
  deviceIds?: Array<string | number>
  name?: string
  icon?: string
}) => {
  const deviceType =
    type === 'Lighting' ? GROUP_LIGHTING_DEVICE_TYPE_ID : GROUP_NORMAL_DEVICE_TYPE_ID
  return {
    ...(type === 'Lighting' ? { hc_id: AUTOMATION_HC_ID } : {}),
    device_type: deviceType,
    name,
    icon,
    attr: {
      automation_tc_id: tcId,
      requested_type: type,
      requested_device_ids: deviceIds.map(String),
    },
  }
}

export const createGroupAndExtractId = async (
  client: GroupApiClient,
  context: GroupTestContext,
  payload: GroupPayload,
) => {
  const response = await client.createGroupAPI(payload)
  const body = await recordGroupResponse(context, 'Create group', response, {
    method: 'POST',
    endpoint: GROUP_API_BASE,
    request: payload,
  })
  expect([200, 201]).toContain(response.status())
  expect(extractId(body)).toBeTruthy()
  const groupId = String(extractId(body))
  const requestedDeviceIds = getRequestedDeviceIds(payload)
  if (requestedDeviceIds.length > 0) {
    const addResponse = await client.addDevicesToGroupAPI(groupId, requestedDeviceIds)
    await recordGroupResponse(context, 'Attach requested devices to group', addResponse, {
      method: 'POST',
      endpoint: `${GROUP_API_BASE}/${groupId}/members`,
      request: { device_ids: requestedDeviceIds },
    })
    expect([200, 201, 202, 204]).toContain(addResponse.status())
  }
  return groupId
}

export const cleanupGroup = async (
  client: GroupApiClient,
  context: GroupTestContext,
  groupId?: string | number,
) => {
  if (!groupId) {
    return
  }
  if (process.env.GROUP_KEEP_CREATED_GROUPS === 'true') {
    attachGroupStep(context, {
      step: 'Keep group for manual verification',
      method: 'NO_API',
      endpoint: `${GROUP_API_BASE}/${groupId}`,
    })
    context.cleanup.warnings.push(`Kept group ${groupId} because GROUP_KEEP_CREATED_GROUPS=true`)
    return
  }
  try {
    let response = await client.deleteGroupAPI(groupId)
    attachGroupStep(context, {
      step: 'Cleanup group',
      method: 'DELETE',
      endpoint: `${GROUP_API_BASE}/${groupId}`,
      status: response.status(),
      response: await safeJson(response),
    })
    if (response.status() === 409) {
      const membersResponse = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`)
      const membersBody = await recordGroupResponse(context, 'Get group members before cleanup retry', membersResponse, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members`,
      })
      const memberIds = extractItems(membersBody)
        .map((item) => item.cell_id ?? item.id)
        .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      if (memberIds.length > 0) {
        const removeResponse = await client.requestAPI('POST', `${GROUP_API_BASE}/${groupId}/members`, {
          body: {
            members: memberIds.map((memberId) => ({
              cell_id: String(memberId),
              state: 'removed',
            })),
            bindings: [],
          },
        })
        await recordGroupResponse(context, 'Remove group members before cleanup retry', removeResponse, {
          method: 'POST',
          endpoint: `${GROUP_API_BASE}/${groupId}/members`,
          request: { members: memberIds },
        })
        await waitForGroupMembersInactive(client, groupId)
      }
      response = await retryDeleteGroup(client, groupId)
      attachGroupStep(context, {
        step: 'Cleanup group retry after removing members',
        method: 'DELETE',
        endpoint: `${GROUP_API_BASE}/${groupId}`,
        status: response.status(),
        response: await safeJson(response),
      })
    }
    context.cleanup.group_deleted = [200, 204, 404].includes(response.status())
  } catch (error) {
    context.cleanup.warnings.push(`Cleanup group failed: ${String(error)}`)
  }
}

export const getDeviceStatus = async (
  client: GroupApiClient,
  deviceIds: Array<string | number>,
) => {
  const response = await client.getDeviceStatusAPI(deviceIds)
  expect(response.status()).toBe(200)
  return normalizeStatuses(await safeJson(response))
}

export const getInitialDeviceStates = async (
  client: GroupApiClient,
  deviceIds: Array<string | number>,
) => await getDeviceStatus(client, deviceIds)

export const waitForDeviceState = async (
  client: GroupApiClient,
  deviceId: string | number,
  slot: number,
  expectedValue: GroupStateValue,
  timeoutMs = POLL_TIMEOUT_MS,
) => {
  const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS))
  for (let index = 0; index < attempts; index += 1) {
    const statuses = await getDeviceStatus(client, [deviceId])
    if (getSlotValue(statuses, deviceId, slot) === expectedValue) {
      return statuses
    }
    await delay(POLL_INTERVAL_MS)
  }

  const finalStatuses = await getDeviceStatus(client, [deviceId])
  expect(getSlotValue(finalStatuses, deviceId, slot)).toBe(expectedValue)
  return finalStatuses
}

export const waitForManyDeviceStates = async (
  client: GroupApiClient,
  deviceIds: Array<string | number>,
  slot: number,
  expectedValue: GroupStateValue,
  timeoutMs = POLL_TIMEOUT_MS,
) => {
  const result: DeviceStatus[] = []
  for (const deviceId of deviceIds) {
    result.push(...await waitForDeviceState(client, deviceId, slot, expectedValue, timeoutMs))
  }
  return result
}

export const resetDeviceStates = async (
  client: GroupApiClient,
  context: GroupTestContext,
  initialStates?: DeviceStatus[],
) => {
  if (!initialStates) {
    return
  }
  try {
    for (const device of initialStates) {
      const states = (device.status ?? []).map((slot) => ({
        idx: Number(slot.idx),
        value: slot.value,
      }))
      if (states.length > 0) {
        const response = await client.controlDeviceAPI(device.id, states)
        attachGroupStep(context, {
          step: 'Reset device state',
          method: 'POST',
          endpoint: GROUP_DEVICE_CONTROL_API,
          request: { device_id: device.id, states },
          response: await safeJson(response),
          status: response.status(),
        })
      }
    }
    context.cleanup.device_reset = true
  } catch (error) {
    context.cleanup.warnings.push(`Reset device state failed: ${String(error)}`)
  }
}

export const controlGroupAndExpectDevices = async ({
  client,
  context,
  groupId,
  deviceIds,
  states,
  expectedSlot,
  expectedValue,
}: {
  client: GroupApiClient
  context: GroupTestContext
  groupId: string | number
  deviceIds: Array<string | number>
  states: GroupState[]
  expectedSlot: number
  expectedValue: GroupStateValue
}) => {
  const before = await getDeviceStatus(client, deviceIds)
  attachGroupStep(context, {
    step: 'Get initial device status',
    method: 'GET',
    endpoint: GROUP_DEVICE_STATUS_API,
    response: before,
  })

  const control = await client.controlGroupOrDevicesAPI(groupId, deviceIds, states)
  await recordGroupResponse(context, `Control group mode=${control.mode}`, control.response, {
    method: 'POST',
    endpoint: `${GROUP_API_BASE}/${groupId}/control`,
    request: { states },
  })
  for (const deviceResponse of control.deviceResponses) {
    await recordGroupResponse(context, 'Fallback control device', deviceResponse, {
      method: 'POST',
      endpoint: GROUP_DEVICE_CONTROL_API,
      request: { states },
    })
  }
  if (control.mode === 'group') {
    expect([200, 202]).toContain(control.response.status())
  } else {
    for (const deviceResponse of control.deviceResponses) {
      expect([200, 202]).toContain(deviceResponse.status())
    }
  }

  await waitForManyDeviceStates(client, deviceIds, expectedSlot, expectedValue)
  const after = await getDeviceStatus(client, deviceIds)
  attachGroupStep(context, {
    step: 'Get device status after group control',
    method: 'GET',
    endpoint: GROUP_DEVICE_STATUS_API,
    response: after,
  })
  attachGroupAssertion(
    context,
    `All devices have slot ${expectedSlot}=${String(expectedValue)} after group control`,
  )
  return { before, control, after }
}

export const waitForGroupSyncedToHC = async (
  client: GroupApiClient,
  groupId: string | number,
  timeoutMs = SYNC_TIMEOUT_MS,
) =>
  await pollUntil(async () => {
    const response = await client.getGroupsFromHCAPI()
    if (response.status() !== 200) {
      return null
    }
    const groups = extractItems(await safeJson(response))
    return groups.some((item) => String(extractId(item)) === String(groupId))
      ? groups
      : null
  }, timeoutMs)

export const waitForGroupDeletedFromHC = async (
  client: GroupApiClient,
  groupId: string | number,
  timeoutMs = SYNC_TIMEOUT_MS,
) =>
  await pollUntil(async () => {
    const response = await client.getGroupsFromHCAPI()
    if (response.status() !== 200) {
      return null
    }
    const groups = extractItems(await safeJson(response))
    return groups.some((item) => String(extractId(item)) === String(groupId))
      ? null
      : groups
  }, timeoutMs)

export const probeUrl = async (baseUrl: string) => {
  const context = await playwrightRequest.newContext()
  try {
    const response = await context.get(baseUrl, { timeout: 5000 })
    return { ok: response.status() < 500, status: response.status() }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    await context.dispose()
  }
}

export const expectAllowedStatus = (status: number, accepted: number[]) => {
  expect(accepted, `Expected status ${status} in ${accepted.join(',')}`).toContain(status)
}

export const expectGroupListShape = (body: unknown) => {
  expect(Array.isArray(extractItems(body))).toBe(true)
}

export const expectGroupDetailShape = (body: unknown) => {
  const data = extractData(body)
  expect(extractId(data)).toBeTruthy()
  expect(asRecord(data)).toHaveProperty('name')
}

export const extractId = (body: unknown): string | number | undefined => {
  const record = asRecord(body)
  const data = asRecord(record.data)
  return record.id as string | number | undefined ??
    data.id as string | number | undefined ??
    data.group_id as string | number | undefined
}

export const extractData = (body: unknown) => {
  const record = asRecord(body)
  return record.data ?? body
}

export const extractItems = (body: unknown): Record<string, unknown>[] => {
  if (Array.isArray(body)) {
    return body as Record<string, unknown>[]
  }
  const data = asRecord(body).data
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[]
  }
  const nested = asRecord(data)
  if (Array.isArray(nested.items)) {
    return nested.items as Record<string, unknown>[]
  }
  if (Array.isArray(nested.data)) {
    return nested.data as Record<string, unknown>[]
  }
  return []
}

export const normalizeStatuses = (body: unknown): DeviceStatus[] => {
  if (Array.isArray(body)) {
    return body as DeviceStatus[]
  }
  const data = asRecord(body).data
  if (Array.isArray(data)) {
    return data as DeviceStatus[]
  }
  const items = asRecord(data).items
  return Array.isArray(items) ? items as DeviceStatus[] : []
}

export const getSlotValue = (
  statuses: DeviceStatus[],
  deviceId: string | number,
  slot: string | number,
) => {
  const device = statuses.find((item) => String(item.id) === String(deviceId))
  return device?.status?.find((item) => Number(item.idx) === Number(slot))?.value
}

export const safeJson = async (response: { json: () => Promise<unknown> }) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}

const compactQuery = (query?: Record<string, string | number | boolean | undefined>) =>
  Object.fromEntries(
    Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, string | number | boolean>

const absoluteUrl = (baseUrl: string, endpoint: string) => {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }
  return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`
}

const getRequestedDeviceIds = (payload: unknown): Array<string | number> => {
  const attr = asRecord(asRecord(payload).attr)
  const value = attr.requested_device_ids
  return Array.isArray(value) ? value as Array<string | number> : []
}

const envTokenFor = (userType: 'admin' | 'viewer' | 'no_permission') => {
  if (userType === 'admin') {
    return process.env.GROUP_ADMIN_ACCESS_TOKEN || process.env.BMS_ACCESS_TOKEN || process.env.BMS_ROOT_ACCESS_TOKEN || ''
  }
  if (userType === 'viewer') {
    return process.env.GROUP_VIEWER_ACCESS_TOKEN || process.env.BMS_VIEWER_ACCESS_TOKEN || ''
  }
  return process.env.GROUP_NO_PERMISSION_ACCESS_TOKEN || process.env.BMS_NO_PERMISSION_ACCESS_TOKEN || ''
}

const pollUntil = async <T>(
  action: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs = POLL_INTERVAL_MS,
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await action()
    if (result !== null) {
      return result
    }
    await delay(intervalMs)
  }
  return null
}

const waitForGroupMembersInactive = async (
  client: GroupApiClient,
  groupId: string | number,
) =>
  await pollUntil(async () => {
    const response = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`)
    if (response.status() !== 200) {
      return true
    }
    const items = extractItems(await safeJson(response))
    const hasBlockingMember = items.some((item) =>
      ['activated', 'pending', 'removing'].includes(String(item.state ?? '')),
    )
    return hasBlockingMember ? null : true
  }, 15_000, 1000)

const retryDeleteGroup = async (
  client: GroupApiClient,
  groupId: string | number,
) => {
  let response = await client.deleteGroupAPI(groupId)
  for (let attempt = 0; response.status() === 409 && attempt < 5; attempt += 1) {
    await delay(1000)
    response = await client.deleteGroupAPI(groupId)
  }
  return response
}

const attachHomeControllerLogOnFailure = async (
  context: GroupTestContext,
  finishedAt: string,
) => {
  if (!HC_SSH_HOST || (!HC_SSH_PASSWORD && !HC_SSH_KEY_PATH)) {
    return
  }

  const start = formatHcLogTime(context.startedAt)
  const end = formatHcLogTime(finishedAt)
  const command = [
    'awk',
    quoteShellArg(
      `$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2} / { ts=substr($0,1,19); if (ts >= "${start}" && ts <= "${end}") print }`,
    ),
    quoteShellArg(HC_LOG_PATH),
    '|',
    'tail',
    '-n',
    String(HC_LOG_TAIL_LINES),
  ].join(' ')
  const result = await runSshCommand(command, 15_000)
  attachGroupStep(context, {
    step: 'Home Controller log window on failure',
    method: 'SSH',
    endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}:${HC_LOG_PATH}`,
    request: command,
    status: result.exitCode,
    response: {
      log_window_start: start,
      log_window_end: end,
      testcase_started_at: context.startedAt,
      testcase_finished_at: finishedAt,
      stdout_tail: result.stdout.slice(-HC_LOG_MAX_CHARS),
      stderr_tail: result.stderr.slice(-HC_LOG_MAX_CHARS),
    },
  })
}

const formatHcLogTime = (iso: string) => {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`
}

const quoteShellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

const runSshCommand = async (remoteCommand: string, timeoutMs: number) => {
  if (HC_SSH_KEY_PATH && (HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD)) {
    return runSshCommandWithSsh2(remoteCommand, timeoutMs, {
      privateKeyPath: HC_SSH_KEY_PATH,
      passphrase: HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD,
    })
  }
  if (HC_SSH_PASSWORD) {
    return runSshCommandWithSsh2(remoteCommand, timeoutMs, {
      password: HC_SSH_PASSWORD,
    })
  }

  try {
    const result = await execFileAsync(
      'ssh',
      [
        '-i',
        HC_SSH_KEY_PATH,
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'ConnectTimeout=10',
        `${HC_SSH_USER}@${HC_SSH_HOST}`,
        remoteCommand,
      ],
      { timeout: timeoutMs, windowsHide: true },
    )
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const record = asRecord(error)
    return {
      exitCode: Number(record.code ?? 1),
      stdout: String(record.stdout ?? ''),
      stderr: String(record.stderr ?? record.message ?? ''),
    }
  }
}

const runSshCommandWithSsh2 = async (
  remoteCommand: string,
  timeoutMs: number,
  auth: { password?: string; privateKeyPath?: string; passphrase?: string },
) =>
  new Promise<{ exitCode: number; stdout: string; stderr: string }>(async (resolve) => {
    const client = new Client()
    let stdout = ''
    let stderr = ''
    let settled = false
    let sshAuth: { password?: string; privateKey?: Buffer; passphrase?: string }
    try {
      sshAuth = auth.privateKeyPath
        ? { privateKey: await readFile(auth.privateKeyPath), passphrase: auth.passphrase }
        : { password: auth.password }
    } catch (error) {
      resolve({ exitCode: 1, stdout, stderr: String(error) })
      return
    }
    const timer = setTimeout(() => finish({
      exitCode: 124,
      stdout,
      stderr: `${stderr}\nSSH command timed out after ${timeoutMs}ms`.trim(),
    }), timeoutMs)
    const finish = (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      client.end()
      resolve(result)
    }
    client
      .on('ready', () => {
        client.exec(remoteCommand, (error, stream) => {
          if (error) {
            finish({ exitCode: 1, stdout, stderr: String(error) })
            return
          }
          stream
            .on('close', (code: number | null) => finish({ exitCode: code ?? 0, stdout, stderr }))
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString()
            })
        })
      })
      .on('error', (error) => finish({ exitCode: 255, stdout, stderr: String(error) }))
      .connect({
        host: HC_SSH_HOST,
        username: HC_SSH_USER,
        ...sshAuth,
        readyTimeout: Math.min(timeoutMs, 20_000),
      })
  })

function hostFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

export {
  GROUP_API_BASE,
  GROUP_AUTH_LOGIN_API,
  GROUP_BASE_URL,
  GROUP_DEVICE_CONTROL_API,
  GROUP_DEVICE_STATUS_API,
  GROUP_ALLOW_DEVICE_CONTROL,
  GROUP_REQUIRE_AUTH,
}
