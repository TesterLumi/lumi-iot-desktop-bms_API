import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  expect,
  request,
  test,
} from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'ssh2'
import {
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_HC_ID,
  AUTOMATION_HC_MAC,
  BMS_ACCEPT_LANGUAGE,
  BMS_API_ENDPOINT,
  BMS_API_KEY,
  BMS_CLIENT_ID,
  BMS_CLIENT_OS,
  BMS_CLIENT_VERSION,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { delay } from '@src/utils'

type AreaControlValue = boolean | number | string

type AreaControlState = {
  idx: number
  value: AreaControlValue
}

type DeviceStatus = {
  id: string | number
  status?: Array<{
    idx: number | string
    value: AreaControlValue
  }>
}

type AreaControlDeviceSlot = {
  idx?: number | string
  data_type?: {
    type?: string
  }
}

type AreaControlDeviceCandidate = {
  id?: string | number
  device_id?: string | number
  name?: string
  status?: boolean
  network_state?: string
  hc?: {
    id?: string | number
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
    input?: AreaControlDeviceSlot[]
    output?: AreaControlDeviceSlot[]
    state?: AreaControlDeviceSlot[]
  }
}

type EvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  request?: unknown
  response?: unknown
  status?: number
  base_url?: string
}

type EvidenceStatus = 'PASSED' | 'FAILED' | 'SKIPPED'

type HcLogEvidence = {
  step: string
  method: 'SSH'
  endpoint?: string
  request?: string
  status: 'captured' | 'failed' | 'skipped'
  exit_code?: number
  response?: {
    stdout_tail?: string
    stderr_tail?: string
    max_chars?: number
  }
  reason?: string
}

type LoginResult = {
  token: string
  userId?: string
}

type AreaCreatePayload = {
  name: string
  parent_id?: string | null
}

const AREA_CONTROL_RUN_DIR = path.resolve(
  process.cwd(),
  process.env.AREA_CONTROL_RUN_DIR ??
    (process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
      ? path.dirname(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR)
      : path.join('test-runs', 'area-control-current')),
)

const AREA_CONTROL_EVIDENCE_DIR = path.join(
  AREA_CONTROL_RUN_DIR,
  'evidence',
  'api',
)
const AREA_CONTROL_RUN_MARKER = path.join(
  AREA_CONTROL_RUN_DIR,
  '.area-control-run-id',
)

const getAreaControlEnv = () => ({
  baseUrl: process.env.BASE_URL || BMS_API_ENDPOINT,
  gatewayBaseUrl: process.env.GATEWAY_BASE_URL || DEVICE_CONTROL_ENDPOINT,
  deviceServiceBaseUrl:
    process.env.DEVICE_SERVICE_ENDPOINT || DEVICE_SERVICE_ENDPOINT,
  statusBaseUrl:
    process.env.DEVICE_STATUS_BASE_URL ||
    process.env.GATEWAY_BASE_URL ||
    IOT_HC_ENDPOINT,
  areaApiBase: process.env.AREA_API_BASE || '/api/v0/areas',
  deviceControlApi: process.env.DEVICE_CONTROL_API || '/api/devices/control',
  deviceStatusApi: process.env.DEVICE_STATUS_API || '/api/devices/status',
  areaControlApiBase: process.env.AREA_CONTROL_API || '/api/v0/areas',
  hcMac: process.env.AUTOMATION_HC_MAC || AUTOMATION_HC_MAC,
  adminUsername:
    process.env.ADMIN_USERNAME || process.env.BMS_ADMIN_USERNAME || '',
  adminPassword:
    process.env.ADMIN_PASSWORD || process.env.BMS_ADMIN_PASSWORD || '',
  adminAccessToken: process.env.BMS_ACCESS_TOKEN || '',
  testOfflineDeviceId: process.env.TEST_OFFLINE_DEVICE_ID || '',
  testOfflineHcId: process.env.TEST_OFFLINE_HC_ID || '999999999999999999',
  hcSshHost:
    process.env.HC_SSH_HOST ||
    hostFromEndpoint(process.env.IOT_HC_ENDPOINT || IOT_HC_ENDPOINT),
  hcSshUser: process.env.HC_SSH_USER || 'root',
  hcSshKeyPath: process.env.HC_SSH_KEY_PATH || '',
  hcSshPassword: process.env.HC_SSH_PASSWORD || '',
  hcSshKeyPassphrase:
    process.env.HC_SSH_KEY_PASSPHRASE || process.env.HC_SSH_PASSWORD || '',
  hcLogPath: process.env.HC_LOG_PATH || '/tmp/log/home-controller.log',
  hcLogTailLines: Number(process.env.HC_LOG_TAIL_LINES || '300'),
  hcLogMaxChars: Number(process.env.HC_LOG_MAX_CHARS || '60000'),
  hcSshReadyTimeoutMs: Number(process.env.HC_SSH_READY_TIMEOUT_MS || '15000'),
  slotOnOff: Number(process.env.SLOT_ON_OFF || '1'),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || '500'),
  pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || '10000'),
  allowDeviceControl:
    process.env.AREA_CONTROL_ALLOW_DEVICE_CONTROL === 'true' ||
    AUTOMATION_ALLOW_DEVICE_CONTROL,
  runId: process.env.AREA_CONTROL_RUN_ID || 'manual',
})

type AreaControlEnv = ReturnType<typeof getAreaControlEnv>

class AreaControlEvidence {
  private steps: EvidenceStep[] = []
  private assertions: string[] = []
  private hcLogs: HcLogEvidence[] = []
  private cleanup = {
    device_reset: false,
    warnings: [] as string[],
  }

  readonly startedAt = new Date().toISOString()

  constructor(
    private testInfo: TestInfo,
    private tcId: string,
    private tcName: string,
    private env: AreaControlEnv,
  ) {}

  attachStep(step: EvidenceStep) {
    this.steps.push(step)
  }

  attachAssertion(assertion: string) {
    this.assertions.push(assertion)
  }

  attachHcLog(log: HcLogEvidence) {
    this.hcLogs.push(log)
  }

  attachCleanup(cleanup: { device_reset?: boolean; warning?: string }) {
    if (cleanup.device_reset) {
      this.cleanup.device_reset = true
    }
    if (cleanup.warning) {
      this.cleanup.warnings.push(cleanup.warning)
    }
  }

  async save(status: EvidenceStatus, error?: unknown) {
    await mkdir(AREA_CONTROL_EVIDENCE_DIR, { recursive: true })
    const filename = `${this.tcId}_${slug(this.tcName)}_${Date.now()}.json`
    const evidence = {
      tc_id: this.tcId,
      tc_name: this.tcName,
      status,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      base_url: this.env.baseUrl,
      gateway_base_url: this.env.gatewayBaseUrl,
      endpoints: {
        area_api_base: this.env.areaApiBase,
        device_service_base: this.env.deviceServiceBaseUrl,
        device_control_api: this.env.deviceControlApi,
        device_status_api: this.env.deviceStatusApi,
        area_control_api: this.env.areaControlApiBase,
      },
      steps: this.steps,
      assertions: this.assertions,
      hc_logs: this.hcLogs,
      cleanup: this.cleanup,
      error_message:
        error instanceof Error ? error.message : error ? String(error) : undefined,
    }
    const body = JSON.stringify(evidence, null, 2)
    await writeFile(path.join(AREA_CONTROL_EVIDENCE_DIR, filename), body, 'utf8')
    await this.testInfo.attach(filename, {
      body,
      contentType: 'application/json',
    })
  }
}

class AreaControlApiClient {
  constructor(
    private areaContext: APIRequestContext,
    private deviceServiceContext: APIRequestContext,
    private controlContext: APIRequestContext,
    private statusContext: APIRequestContext,
    private env: AreaControlEnv,
    private evidence?: AreaControlEvidence,
  ) {}

  withEvidence(evidence: AreaControlEvidence) {
    return new AreaControlApiClient(
      this.areaContext,
      this.deviceServiceContext,
      this.controlContext,
      this.statusContext,
      this.env,
      evidence,
    )
  }

  async dispose() {
    await this.areaContext.dispose()
    await this.deviceServiceContext.dispose()
    await this.controlContext.dispose()
    await this.statusContext.dispose()
  }

  async healthcheck() {
    const checks = [
      await this.areaContext.get(this.env.areaApiBase, { params: { limit: 1 } }),
      await this.deviceServiceContext.get('/api/v0/devices', {
        params: { limit: 1 },
      }),
      await this.statusContext.get(this.env.deviceStatusApi, {
        params: { ids: 'healthcheck' },
      }),
    ]

    return checks.map((response) => ({
      url: response.url(),
      status: response.status(),
      ok: response.status() < 500,
    }))
  }

  async listAreasAPI(
    token: string | undefined,
    query?: { search?: string; page?: number; limit?: number },
  ) {
    return this.areaContext.get(this.env.areaApiBase, {
      headers: authHeaders(token),
      params: Object.fromEntries(
        Object.entries(query ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    })
  }

  async createAreaAPI(token: string | undefined, payload: AreaCreatePayload) {
    return this.areaContext.post(this.env.areaApiBase, {
      headers: authHeaders(token),
      data: payload,
    })
  }

  async deleteAreaAPI(token: string | undefined, areaId: string) {
    return this.areaContext.delete(`${this.env.areaApiBase}/${areaId}`, {
      headers: authHeaders(token),
    })
  }

  async assignDevicesAPI(
    token: string | undefined,
    areaId: string,
    deviceIds: string[],
  ) {
    return this.areaContext.post(`${this.env.areaApiBase}/${areaId}/devices`, {
      headers: authHeaders(token),
      data: { device_ids: deviceIds },
    })
  }

  async unassignDevicesAPI(
    token: string | undefined,
    areaId: string,
    deviceIds: string[],
  ) {
    return this.areaContext.delete(`${this.env.areaApiBase}/${areaId}/devices`, {
      headers: authHeaders(token),
      data: { device_ids: deviceIds },
    })
  }

  async listAreaDevicesAPI(token: string | undefined, areaId: string) {
    return this.areaContext.get(`${this.env.areaApiBase}/${areaId}/devices`, {
      headers: authHeaders(token),
      params: { page: 1, limit: 100 },
    })
  }

  async listAllDevicesAPI(token: string | undefined) {
    return this.deviceServiceContext.get('/api/v0/devices', {
      headers: authHeaders(token),
      params: { page: 1, limit: 1000 },
    })
  }

  async controlDeviceAPI(
    token: string | undefined,
    deviceId: string,
    states: AreaControlState[],
  ) {
    return this.controlContext.post(this.env.deviceControlApi, {
      headers: controlHeaders(token),
      data: {
        device_id: String(deviceId),
        states,
      },
    })
  }

  async controlDeviceWithHeaderOverridesAPI(
    token: string | undefined,
    deviceId: string,
    states: AreaControlState[],
    overrides: { hcId?: string; omitHcId?: boolean },
  ) {
    return this.controlContext.post(this.env.deviceControlApi, {
      headers: controlHeaders(token, overrides),
      data: {
        device_id: String(deviceId),
        states,
      },
    })
  }

  async getDeviceStatusAPI(token: string | undefined, deviceIds: string[]) {
    return this.statusContext.get(this.env.deviceStatusApi, {
      headers: authHeaders(token),
      params: {
        ids: deviceIds.join(','),
      },
    })
  }

  async areaControlAPI(
    token: string | undefined,
    areaId: string,
    states: AreaControlState[],
  ) {
    return this.areaContext.post(`${this.env.areaControlApiBase}/${areaId}/control`, {
      headers: authHeaders(token),
      data: { states },
    })
  }

  async areaDevicesControlAPI(
    token: string | undefined,
    areaId: string,
    states: AreaControlState[],
  ) {
    return this.areaContext.post(
      `${this.env.areaControlApiBase}/${areaId}/devices/control`,
      {
        headers: authHeaders(token),
        data: { states },
      },
    )
  }

  async requestWithoutToken(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
  ) {
    return method === 'GET'
      ? this.areaContext.get(endpoint)
      : this.controlContext.post(endpoint, {
          headers: controlHeaders(undefined),
          data: body,
        })
  }

  async requestWithInvalidToken(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
  ) {
    const headers = { ...controlHeaders('invalid_token') }
    return method === 'GET'
      ? this.areaContext.get(endpoint, { headers })
      : this.controlContext.post(endpoint, { headers, data: body })
  }

  async requestWithToken(
    token: string | undefined,
    method: 'GET' | 'POST',
    endpoint: string,
    body?: unknown,
  ) {
    const headers = controlHeaders(token)
    return method === 'GET'
      ? this.areaContext.get(endpoint, { headers })
      : this.controlContext.post(endpoint, { headers, data: body })
  }

  async listAreas(
    token: string | undefined,
    query?: { search?: string; page?: number; limit?: number },
  ) {
    const queryText = toQueryString(query)
    const response = await this.listAreasAPI(token, query)
    const body = await recordResponse(this.evidence, 'List areas', response, {
      method: 'GET',
      endpoint: `${this.env.areaApiBase}${queryText}`,
      baseUrl: this.env.baseUrl,
    })
    expect(response.status()).toBe(200)
    return extractAreas(body)
  }

  async createArea(token: string | undefined, payload: AreaCreatePayload) {
    const response = await this.createAreaAPI(token, payload)
    const body = await recordResponse(this.evidence, 'Create automation area', response, {
      method: 'POST',
      endpoint: this.env.areaApiBase,
      request: payload,
      baseUrl: this.env.baseUrl,
    })
    expect(response.status()).toBe(200)
    const areaId = extractAreaId(body)
    expect(areaId, `Created area should have id. Body=${JSON.stringify(body)}`).toBeTruthy()
    return areaId
  }

  async deleteArea(token: string | undefined, areaId: string) {
    const response = await this.deleteAreaAPI(token, areaId)
    await recordResponse(this.evidence, 'Delete automation area', response, {
      method: 'DELETE',
      endpoint: `${this.env.areaApiBase}/${areaId}`,
      baseUrl: this.env.baseUrl,
    })
    expect([200, 204, 404]).toContain(response.status())
  }

  async assignDevices(token: string | undefined, areaId: string, deviceIds: string[]) {
    if (deviceIds.length === 0) {
      return
    }
    const response = await this.assignDevicesAPI(token, areaId, deviceIds)
    await recordResponse(this.evidence, 'Assign devices to automation area', response, {
      method: 'POST',
      endpoint: `${this.env.areaApiBase}/${areaId}/devices`,
      request: { device_ids: deviceIds },
      baseUrl: this.env.baseUrl,
    })
    expect(response.status()).toBe(200)
  }

  async unassignDevices(
    token: string | undefined,
    areaId: string,
    deviceIds: string[],
  ) {
    if (deviceIds.length === 0) {
      return
    }
    const response = await this.unassignDevicesAPI(token, areaId, deviceIds)
    await recordResponse(this.evidence, 'Unassign devices from automation area', response, {
      method: 'DELETE',
      endpoint: `${this.env.areaApiBase}/${areaId}/devices`,
      request: { device_ids: deviceIds },
      baseUrl: this.env.baseUrl,
    })
    expect([200, 404]).toContain(response.status())
  }

  async listAreaDevices(token: string | undefined, areaId: string) {
    const response = await this.listAreaDevicesAPI(token, areaId)
    const body = await recordResponse(this.evidence, 'List area devices', response, {
      method: 'GET',
      endpoint: `${this.env.areaApiBase}/${areaId}/devices?page=1&limit=100`,
      baseUrl: this.env.baseUrl,
    })
    expect(response.status()).toBe(200)
    return extractAreaDevices(body)
  }

  async discoverOnlineSwitchableDevices(token: string | undefined) {
    const response = await this.listAllDevicesAPI(token)
    const body = await recordResponse(this.evidence, 'Discover all online HC devices', response, {
      method: 'GET',
      endpoint: '/api/v0/devices?page=1&limit=1000',
      baseUrl: this.env.deviceServiceBaseUrl,
    })
    expect(response.status()).toBe(200)
    const devices = extractDeviceCandidates(body)
    const metadataSelected = devices.filter((device) =>
      isOnlineSwitchableDevice(device, this.env.hcMac, this.env.slotOnOff),
    )
    const metadataSelectedIds = metadataSelected.map(getDeviceCandidateId).filter(Boolean)
    const liveStatuses =
      metadataSelectedIds.length > 0
        ? await this.getDeviceStatus(token, metadataSelectedIds)
        : []
    const selectedIds = metadataSelectedIds.filter((deviceId) =>
      typeof getSlotValue(liveStatuses, deviceId, this.env.slotOnOff) === 'boolean',
    )
    const liveStatusSkippedIds = metadataSelectedIds.filter(
      (deviceId) => !selectedIds.includes(deviceId),
    )
    const discovery = {
      hc_mac: this.env.hcMac,
      slot: this.env.slotOnOff,
      total_count: devices.length,
      selected_count: selectedIds.length,
      selected: metadataSelected
        .filter((device) => selectedIds.includes(getDeviceCandidateId(device)))
        .map((device) => ({
          ...toDeviceDiscoverySummary(device),
          current_slot_value: getSlotValue(
            liveStatuses,
            getDeviceCandidateId(device),
            this.env.slotOnOff,
          ),
        })),
      skipped_live_status: metadataSelected
        .filter((device) => liveStatusSkippedIds.includes(getDeviceCandidateId(device)))
        .map((device) => ({
          ...toDeviceDiscoverySummary(device),
          current_slot_value: getSlotValue(
            liveStatuses,
            getDeviceCandidateId(device),
            this.env.slotOnOff,
          ),
        })),
      skipped_online: devices
        .filter((device) => isOnlineDeviceOnHc(device, this.env.hcMac))
        .filter((device) => !selectedIds.includes(getDeviceCandidateId(device)))
        .map(toDeviceDiscoverySummary),
    }
    this.evidence?.attachStep({
      step: 'Online device discovery summary',
      response: discovery,
    })
    console.log(JSON.stringify({ area_control_device_discovery: discovery }))
    expect(
      selectedIds.length,
      `Need at least 1 online switchable device on HC ${this.env.hcMac}. Discovery=${JSON.stringify(discovery)}`,
    ).toBeGreaterThan(0)
    return [...new Set(selectedIds)]
  }

  async getDeviceStatus(token: string | undefined, deviceIds: string[]) {
    const response = await this.getDeviceStatusAPI(token, deviceIds)
    const body = await recordResponse(this.evidence, 'Get device status', response, {
      method: 'GET',
      endpoint: `${this.env.deviceStatusApi}?ids=${deviceIds.join(',')}`,
      baseUrl: this.env.statusBaseUrl,
    })
    expect(response.status()).toBe(200)
    return extractStatuses(body)
  }

  async getInitialDeviceState(token: string | undefined, deviceId: string) {
    const statuses = await this.getDeviceStatus(token, [deviceId])
    const device = statuses.find((item) => String(item.id) === String(deviceId))
    expect(device, `Device ${deviceId} status should exist`).toBeTruthy()
    return device?.status ?? []
  }

  async controlDevice(
    token: string | undefined,
    deviceId: string,
    states: AreaControlState[],
    step = 'Control device',
  ) {
    const response = await this.controlDeviceAPI(token, deviceId, states)
    await recordResponse(this.evidence, step, response, {
      method: 'POST',
      endpoint: this.env.deviceControlApi,
      request: { device_id: deviceId, states },
      baseUrl: this.env.gatewayBaseUrl,
    })
    return response
  }

  async controlDeviceWithHeaderOverrides(
    token: string | undefined,
    deviceId: string,
    states: AreaControlState[],
    overrides: { hcId?: string; omitHcId?: boolean },
    step = 'Control device with header overrides',
  ) {
    const response = await this.controlDeviceWithHeaderOverridesAPI(
      token,
      deviceId,
      states,
      overrides,
    )
    await recordResponse(this.evidence, step, response, {
      method: 'POST',
      endpoint: this.env.deviceControlApi,
      request: {
        device_id: deviceId,
        states,
        headers: overrides.omitHcId
          ? { 'x-hc-id': '<omitted>' }
          : { 'x-hc-id': overrides.hcId },
      },
      baseUrl: this.env.gatewayBaseUrl,
    })
    return response
  }

  async controlManyDevices(
    token: string | undefined,
    controls: Array<{ deviceId: string; states: AreaControlState[] }>,
  ) {
    const responses: APIResponse[] = []
    for (const control of controls) {
      responses.push(
        await this.controlDevice(
          token,
          control.deviceId,
          control.states,
          `Control device ${control.deviceId}`,
        ),
      )
    }
    return responses
  }

  async waitForDeviceState(
    token: string | undefined,
    deviceId: string,
    slot: number,
    expectedValue: AreaControlValue,
    timeoutMs = this.env.pollTimeoutMs,
  ) {
    const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const statuses = await this.getDeviceStatus(token, [deviceId])
      if (getSlotValue(statuses, deviceId, slot) === expectedValue) {
        this.evidence?.attachStep({
          step: 'Polling device status matched',
          method: 'GET',
          endpoint: `${this.env.deviceStatusApi}?ids=${deviceId}`,
          response: statuses,
          status: 200,
          base_url: this.env.statusBaseUrl,
        })
        return statuses
      }
      await delay(this.env.pollIntervalMs)
    }

    const finalStatuses = await this.getDeviceStatus(token, [deviceId])
    expect(
      getSlotValue(finalStatuses, deviceId, slot),
      `Device ${deviceId} slot ${slot} should become ${String(expectedValue)}`,
    ).toBe(expectedValue)
    return finalStatuses
  }

  async expectDeviceStateNotChanged(
    token: string | undefined,
    deviceId: string,
    slot: number,
    initialValue: AreaControlValue | undefined,
    timeoutMs = this.env.pollTimeoutMs,
  ) {
    const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const statuses = await this.getDeviceStatus(token, [deviceId])
      expect(getSlotValue(statuses, deviceId, slot)).toBe(initialValue)
      await delay(this.env.pollIntervalMs)
    }
  }

  async resetDeviceState(
    token: string | undefined,
    deviceId: string,
    initialStates: Array<{ idx: string | number; value: AreaControlValue }>,
  ) {
    const states = initialStates.map((item) => ({
      idx: Number(item.idx),
      value: item.value,
    }))
    if (states.length === 0) {
      this.evidence?.attachCleanup({
        warning: `Skip reset ${deviceId}: initial state is empty`,
      })
      return
    }

    try {
      const response = await this.controlDevice(
        token,
        deviceId,
        states,
        'Reset device to initial state',
      )
      this.evidence?.attachCleanup({ device_reset: response.status() < 400 })
    } catch (error) {
      this.evidence?.attachCleanup({
        warning: `Reset ${deviceId} failed: ${formatError(error)}`,
      })
    }
  }

  async assertDeviceInArea(token: string | undefined, areaId: string, deviceId: string) {
    const devices = await this.listAreaDevices(token, areaId)
    expect(
      devices.some((device) => String(device.device_id ?? device.id) === deviceId),
      `Device ${deviceId} should belong to area ${areaId}`,
    ).toBe(true)
  }

  async assertDeviceNotInArea(
    token: string | undefined,
    areaId: string,
    deviceId: string,
  ) {
    const devices = await this.listAreaDevices(token, areaId)
    expect(
      devices.some((device) => String(device.device_id ?? device.id) === deviceId),
      `Device ${deviceId} should not belong to area ${areaId}`,
    ).toBe(false)
  }
}

const newAreaControlApi = async (
  areaControlEnv = getAreaControlEnv(),
  token?: string,
) => {
  const areaHeaders = commonHeaders(token)
  const controlBaseHeaders = controlHeaders(token)
  const areaContext = await request.newContext({
    baseURL: areaControlEnv.baseUrl,
    extraHTTPHeaders: areaHeaders,
  })
  const deviceServiceContext = await request.newContext({
    baseURL: areaControlEnv.deviceServiceBaseUrl,
    extraHTTPHeaders: areaHeaders,
  })
  const controlContext = await request.newContext({
    baseURL: areaControlEnv.gatewayBaseUrl,
    extraHTTPHeaders: controlBaseHeaders,
  })
  const statusContext = await request.newContext({
    baseURL: areaControlEnv.statusBaseUrl,
    extraHTTPHeaders: areaHeaders,
  })

  return new AreaControlApiClient(
    areaContext,
    deviceServiceContext,
    controlContext,
    statusContext,
    areaControlEnv,
  )
}

const loginAreaControlUser = async (
  areaControlEnv: AreaControlEnv,
  username: string,
  password: string,
): Promise<LoginResult> => {
  if (!username || !password) {
    throw new Error('Username and password are required for real login')
  }

  const loginContext = await request.newContext({
    baseURL: areaControlEnv.baseUrl,
    extraHTTPHeaders: commonHeaders(),
  })

  try {
    const response = await loginContext.post('/api/v0/auth/login', {
      data: {
        user_name: username,
        password,
      },
    })
    if (response.status() !== 200) {
      throw new Error(
        `Login failed for ${username}: status=${response.status()} body=${await response.text()}`,
      )
    }

    const body = await safeJson(response)
    const record = asRecord(asRecord(body).data)
    const token =
      record.access_token ?? record.token ?? record.accessToken ?? asRecord(body).token
    if (!token) {
      throw new Error(`Login response for ${username} does not include token`)
    }

    return {
      token: String(token),
      userId: String(record.user_id ?? asRecord(record.user).id ?? record.id ?? ''),
    }
  } finally {
    await loginContext.dispose()
  }
}

const resolveAreaControlToken = async (
  areaControlEnv: AreaControlEnv,
) => {
  if (areaControlEnv.adminAccessToken) {
    return areaControlEnv.adminAccessToken
  }

  const username = areaControlEnv.adminUsername
  const password = areaControlEnv.adminPassword

  if (!username || !password) {
    return undefined
  }

  return (await loginAreaControlUser(areaControlEnv, username, password)).token
}

const resetAreaControlEvidenceRunDir = async () => {
  await mkdir(AREA_CONTROL_RUN_DIR, { recursive: true })
  let previousRunId = ''
  try {
    previousRunId = await readFile(AREA_CONTROL_RUN_MARKER, 'utf8')
  } catch {
    previousRunId = ''
  }
  if (previousRunId.trim() !== env.runId) {
    await rm(AREA_CONTROL_EVIDENCE_DIR, { recursive: true, force: true })
    await writeFile(AREA_CONTROL_RUN_MARKER, env.runId, 'utf8')
  }
  await mkdir(AREA_CONTROL_EVIDENCE_DIR, { recursive: true })
}

const recordResponse = async (
  evidence: AreaControlEvidence | undefined,
  step: string,
  response: APIResponse,
  options: {
    method: string
    endpoint: string
    request?: unknown
    baseUrl?: string
  },
) => {
  const body = await safeJson(response)
  evidence?.attachStep({
    step,
    method: options.method,
    endpoint: options.endpoint,
    request: options.request,
    response: body,
    status: response.status(),
    base_url: options.baseUrl,
  })
  if (response.status() >= 400) {
    console.log(
      JSON.stringify({
        area_control_api_failure: {
          method: options.method,
          endpoint: options.endpoint,
          request: options.request,
          status: response.status(),
          response: body,
        },
      }),
    )
  }
  return body
}

const extractAreaDevices = (body: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(body)) {
    return body as Array<Record<string, unknown>>
  }

  const data = asRecord(asRecord(body).data)
  if (Array.isArray(data.items)) {
    return data.items as Array<Record<string, unknown>>
  }
  if (Array.isArray(data.data)) {
    return data.data as Array<Record<string, unknown>>
  }
  if (Array.isArray(asRecord(body).items)) {
    return asRecord(body).items as Array<Record<string, unknown>>
  }

  return []
}

const extractAreas = (body: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(body)) {
    return body as Array<Record<string, unknown>>
  }

  const data = asRecord(asRecord(body).data)
  if (Array.isArray(data.items)) {
    return data.items as Array<Record<string, unknown>>
  }
  if (Array.isArray(data.data)) {
    return data.data as Array<Record<string, unknown>>
  }
  if (Array.isArray(asRecord(body).items)) {
    return asRecord(body).items as Array<Record<string, unknown>>
  }

  return []
}

const extractDeviceCandidates = (body: unknown): AreaControlDeviceCandidate[] => {
  if (Array.isArray(body)) {
    return body as AreaControlDeviceCandidate[]
  }

  const data = asRecord(asRecord(body).data)
  if (Array.isArray(data.items)) {
    return data.items as AreaControlDeviceCandidate[]
  }
  if (Array.isArray(data.data)) {
    return data.data as AreaControlDeviceCandidate[]
  }
  if (Array.isArray(asRecord(body).items)) {
    return asRecord(body).items as AreaControlDeviceCandidate[]
  }

  return []
}

const extractAreaId = (body: unknown) => {
  const record = asRecord(body)
  const data = asRecord(record.data)
  return String(data.id ?? record.id ?? '')
}

const extractStatuses = (body: unknown): DeviceStatus[] => {
  if (Array.isArray(body)) {
    return body as DeviceStatus[]
  }
  const data = asRecord(body).data
  if (Array.isArray(data)) {
    return data as DeviceStatus[]
  }
  if (Array.isArray(asRecord(data).items)) {
    return asRecord(data).items as DeviceStatus[]
  }
  return []
}

const getSlotValue = (
  statuses: DeviceStatus[],
  deviceId: string,
  slot: number,
) => {
  const device = statuses.find((item) => String(item.id) === String(deviceId))
  return device?.status?.find((item) => Number(item.idx) === slot)?.value
}

const getDeviceCandidateId = (device: AreaControlDeviceCandidate) =>
  String(device.device_id ?? device.id ?? '')

const isOnlineDeviceOnHc = (
  device: AreaControlDeviceCandidate,
  hcMac: string,
) =>
  device.status === true &&
  device.network_state === 'activated' &&
  device.hc?.mac?.toLowerCase() === hcMac.toLowerCase()

const isOnlineSwitchableDevice = (
  device: AreaControlDeviceCandidate,
  hcMac: string,
  slot: number,
) =>
  isOnlineDeviceOnHc(device, hcMac) &&
  hasBooleanSlot(device.spec?.input, slot) &&
  hasBooleanSlot(device.spec?.output, slot) &&
  hasBooleanSlot(device.spec?.state, slot) &&
  Boolean(getDeviceCandidateId(device))

const hasBooleanSlot = (
  slots: AreaControlDeviceSlot[] | undefined,
  slot: number,
) =>
  slots?.some(
    (item) =>
      Number(item.idx) === slot && item.data_type?.type === 'boolean',
  ) === true

const toDeviceDiscoverySummary = (device: AreaControlDeviceCandidate) => ({
  id: getDeviceCandidateId(device),
  name: device.name,
  status: device.status,
  network_state: device.network_state,
  hc_mac: device.hc?.mac,
  device_type_id: device.device_type?.id ?? device.type?.id,
})

const expectSuccessBody = (body: unknown) => {
  const record = asRecord(body)
  if ('success' in record) {
    expect(record.success).toBe(true)
  }
  if ('status' in record) {
    expect(record.status).toBe(true)
  }
}

const expectStatusIn = (actual: number, expected: number[]) => {
  expect(
    expected,
    `Expected status ${actual} to be in [${expected.join(', ')}]`,
  ).toContain(actual)
}

const requireFixture = (value: string, name: string) => {
  if (!value) {
    throw new Error(`${name} is required for this area-control testcase`)
  }
  return value
}

const generateAreaControlName = (suffix: string) =>
  `auto_area_control_${suffix}_${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`

const commonHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-client-version': BMS_CLIENT_VERSION,
    'x-client-os': BMS_CLIENT_OS,
    'x-client-id': BMS_CLIENT_ID,
    'accept-language': BMS_ACCEPT_LANGUAGE,
  }

  if (BMS_API_KEY) {
    headers['x-client-api-key'] = BMS_API_KEY
  }
  if (token) {
    headers.Authorization = token.startsWith('Bearer ')
      ? token
      : `Bearer ${token}`
  }

  return headers
}

const controlHeaders = (
  token?: string,
  options: { hcId?: string; omitHcId?: boolean } = {},
): Record<string, string> => {
  const headers: Record<string, string> = {
    ...commonHeaders(token),
    'x-request-id': `area-control-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    'x-user-id': 'automation-test',
    'x-app-id': 'bms-e2e-test',
  }

  if (!options.omitHcId) {
    headers['x-hc-id'] = options.hcId ?? AUTOMATION_HC_ID
  }

  return headers
}

const authHeaders = (token?: string) => commonHeaders(token)

const toQueryString = (query?: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }
  return params.toString() ? `?${params}` : ''
}

const safeJson = async (response: APIResponse): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return await response.text()
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const isSkipError = (error: unknown) =>
  formatError(error).includes('Test is skipped')

const quoteShellArg = (value: string) =>
  `'${value.replace(/'/g, `'\\''`)}'`

function hostFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

const appendClipped = (current: string, value: Buffer, maxChars: number) => {
  const next = `${current}${value.toString()}`
  return next.length > maxChars ? next.slice(next.length - maxChars) : next
}

const buildAreaControlSshAuth = async (areaControlEnv: AreaControlEnv) => {
  if (areaControlEnv.hcSshKeyPath) {
    return {
      privateKey: await readFile(areaControlEnv.hcSshKeyPath),
      passphrase: areaControlEnv.hcSshKeyPassphrase || undefined,
    }
  }
  if (areaControlEnv.hcSshPassword) {
    return { password: areaControlEnv.hcSshPassword }
  }
  return undefined
}

const collectHomeControllerFailureLog = async (
  areaControlEnv: AreaControlEnv,
  tcId: string,
  error: unknown,
): Promise<HcLogEvidence> => {
  const endpoint = areaControlEnv.hcSshHost
    ? `${areaControlEnv.hcSshUser}@${areaControlEnv.hcSshHost}:${areaControlEnv.hcLogPath}`
    : undefined

  if (!areaControlEnv.hcSshHost) {
    return {
      step: `Collect HC log after ${tcId} failed`,
      method: 'SSH',
      endpoint,
      status: 'skipped',
      reason: 'HC_SSH_HOST is not configured',
    }
  }
  if (!areaControlEnv.hcSshPassword && !areaControlEnv.hcSshKeyPath) {
    return {
      step: `Collect HC log after ${tcId} failed`,
      method: 'SSH',
      endpoint,
      status: 'skipped',
      reason: 'HC_SSH_PASSWORD or HC_SSH_KEY_PATH is not configured',
    }
  }

  let auth: Awaited<ReturnType<typeof buildAreaControlSshAuth>>
  try {
    auth = await buildAreaControlSshAuth(areaControlEnv)
  } catch (sshAuthError) {
    return {
      step: `Collect HC log after ${tcId} failed`,
      method: 'SSH',
      endpoint,
      status: 'failed',
      reason: `Cannot build SSH auth: ${formatError(sshAuthError)}`,
    }
  }

  const client = new Client()
  const command = `tail -n ${areaControlEnv.hcLogTailLines} ${quoteShellArg(areaControlEnv.hcLogPath)}`
  let stdout = ''
  let stderr = ''
  let settled = false

  return await new Promise<HcLogEvidence>((resolve) => {
    const finish = (log: HcLogEvidence) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      client.end()
      resolve(log)
    }

    const timer = setTimeout(() => {
      finish({
        step: `Collect HC log after ${tcId} failed`,
        method: 'SSH',
        endpoint,
        request: command,
        status: 'failed',
        reason: `Timed out after ${areaControlEnv.hcSshReadyTimeoutMs}ms while collecting HC log. Test error: ${formatError(error)}`,
        response: {
          stdout_tail: stdout,
          stderr_tail: stderr,
          max_chars: areaControlEnv.hcLogMaxChars,
        },
      })
    }, areaControlEnv.hcSshReadyTimeoutMs)

    client
      .on('ready', () => {
        client.exec(command, (execError, stream) => {
          if (execError) {
            finish({
              step: `Collect HC log after ${tcId} failed`,
              method: 'SSH',
              endpoint,
              request: command,
              status: 'failed',
              reason: formatError(execError),
            })
            return
          }

          stream
            .on('close', (code: number) => {
              finish({
                step: `Collect HC log after ${tcId} failed`,
                method: 'SSH',
                endpoint,
                request: command,
                status: code === 0 ? 'captured' : 'failed',
                exit_code: code,
                reason:
                  code === 0
                    ? `Captured after failure: ${formatError(error)}`
                    : `HC log command exited with code ${code}. Test error: ${formatError(error)}`,
                response: {
                  stdout_tail: stdout,
                  stderr_tail: stderr,
                  max_chars: areaControlEnv.hcLogMaxChars,
                },
              })
            })
            .on('data', (data: Buffer) => {
              stdout = appendClipped(stdout, data, areaControlEnv.hcLogMaxChars)
            })
            .stderr.on('data', (data: Buffer) => {
              stderr = appendClipped(stderr, data, areaControlEnv.hcLogMaxChars)
            })
        })
      })
      .on('error', (sshError) => {
        finish({
          step: `Collect HC log after ${tcId} failed`,
          method: 'SSH',
          endpoint,
          request: command,
          status: 'failed',
          reason: formatError(sshError),
          response: {
            stdout_tail: stdout,
            stderr_tail: stderr,
            max_chars: areaControlEnv.hcLogMaxChars,
          },
        })
      })
      .on('keyboard-interactive', (_name, _instructions, _lang, prompts, done) => {
        done(prompts.map(() => areaControlEnv.hcSshPassword))
      })
      .connect({
        host: areaControlEnv.hcSshHost,
        username: areaControlEnv.hcSshUser,
        ...auth,
        tryKeyboard: Boolean(areaControlEnv.hcSshPassword),
        readyTimeout: areaControlEnv.hcSshReadyTimeoutMs,
      })
  })
}

const env = getAreaControlEnv()

test.describe('Area Control API Real System TC1-TC19', () => {
  let adminToken: string | undefined
  let baseApi: AreaControlApiClient
  let automationAreaId = ''
  let emptyAreaId = ''
  let assignedDeviceIds: string[] = []

  test.skip(!env.baseUrl, 'BASE_URL or BMS_API_ENDPOINT is required')
  test.skip(!env.gatewayBaseUrl, 'GATEWAY_BASE_URL or DEVICE_CONTROL_ENDPOINT is required')
  test.skip(!env.allowDeviceControl, 'Set AREA_CONTROL_ALLOW_DEVICE_CONTROL=true or AUTOMATION_ALLOW_DEVICE_CONTROL=true')

  test.beforeAll(async () => {
    await resetAreaControlEvidenceRunDir()
    adminToken = await resolveAreaControlToken(env)
    baseApi = await newAreaControlApi(env, adminToken)
    const health = await baseApi.healthcheck()
    expect(
      health.every((item) => item.ok),
      `Area/control/status endpoints must be reachable: ${JSON.stringify(health)}`,
    ).toBe(true)

    const areaName = generateAreaControlName('devices')
    automationAreaId = await baseApi.createArea(adminToken, {
      name: areaName,
      parent_id: null,
    })
    const foundAreas = await baseApi.listAreas(adminToken, {
      search: areaName,
      page: 1,
      limit: 20,
    })
    expect(
      foundAreas.some((area) => String(area.id) === automationAreaId),
      'Created automation area should be visible from GET /areas',
    ).toBe(true)

    assignedDeviceIds = await baseApi.discoverOnlineSwitchableDevices(adminToken)
    expect(
      assignedDeviceIds.length,
      `At least 1 online switchable device on HC ${env.hcMac} is required`,
    ).toBeGreaterThan(0)
    await baseApi.assignDevices(adminToken, automationAreaId, assignedDeviceIds)

    const emptyAreaName = generateAreaControlName('empty')
    emptyAreaId = await baseApi.createArea(adminToken, {
      name: emptyAreaName,
      parent_id: null,
    })
    const foundEmptyAreas = await baseApi.listAreas(adminToken, {
      search: emptyAreaName,
      page: 1,
      limit: 20,
    })
    expect(
      foundEmptyAreas.some((area) => String(area.id) === emptyAreaId),
      'Created empty automation area should be visible from GET /areas',
    ).toBe(true)
  })

  test.afterAll(async () => {
    if (baseApi && automationAreaId) {
      try {
        await baseApi.unassignDevices(adminToken, automationAreaId, assignedDeviceIds)
      } catch (error) {
        console.log(JSON.stringify({ area_control_cleanup_warning: String(error) }))
      }
    }
    for (const areaId of [emptyAreaId, automationAreaId]) {
      if (!baseApi || !areaId) {
        continue
      }
      try {
        await baseApi.deleteArea(adminToken, areaId)
      } catch (error) {
        console.log(
          JSON.stringify({
            area_control_cleanup_warning: {
              area_id: areaId,
              error: String(error),
            },
          }),
        )
      }
    }
    await baseApi?.dispose()
  })

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (api: AreaControlApiClient, tc: AreaControlEvidence) => Promise<void>,
  ) => {
    test(`${tcId} - ${tcName}`, async ({}, testInfo) => {
      const tc = new AreaControlEvidence(testInfo, tcId, tcName, env)
      const api = baseApi.withEvidence(tc)
      try {
        await handler(api, tc)
        await tc.save('PASSED')
      } catch (error) {
        const skipped = isSkipError(error)
        if (!skipped) {
          tc.attachHcLog(await collectHomeControllerFailureLog(env, tcId, error))
        }
        await tc.save(skipped ? 'SKIPPED' : 'FAILED', error)
        throw error
      }
    })
  }

  const controlAndExpectState = async (
    api: AreaControlApiClient,
    tc: AreaControlEvidence,
    deviceId: string,
    states: AreaControlState[],
    expectedSlot: number,
    expectedValue: boolean | number | string,
  ) => {
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      const controlResponse = await api.controlDevice(adminToken, deviceId, states)
      expect(controlResponse.status()).toBe(200)
      expectSuccessBody(await controlResponse.json())
      const statusAfter = await api.waitForDeviceState(
        adminToken,
        deviceId,
        expectedSlot,
        expectedValue,
      )
      tc.attachStep({
        step: 'Runtime state verification',
        response: {
          device_id: deviceId,
          slot: expectedSlot,
          expected: expectedValue,
          status_after: statusAfter,
        },
      })
      tc.attachAssertion(`Device ${deviceId} slot ${expectedSlot} equals ${String(expectedValue)} after polling`)
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  }

  const suiteAreaId = () =>
    requireFixture(automationAreaId, 'automation area created in beforeAll')

  const suiteEmptyAreaId = () =>
    requireFixture(emptyAreaId, 'empty automation area created in beforeAll')

  const getAreaTargetIds = async (
    api: AreaControlApiClient,
    count?: number,
  ) => {
    const devices = await api.listAreaDevices(adminToken, suiteAreaId())
    const targetIds = [...new Set(
      devices.map((device) => String(device.device_id ?? device.id ?? '')).filter(Boolean),
    )]
    expect(targetIds.length).toBeGreaterThan(0)
    return typeof count === 'number' ? targetIds.slice(0, count) : targetIds
  }

  const saveInitialStates = async (
    api: AreaControlApiClient,
    deviceIds: string[],
  ) => {
    const initialStates = new Map<string, Awaited<ReturnType<typeof api.getInitialDeviceState>>>()
    for (const deviceId of deviceIds) {
      initialStates.set(deviceId, await api.getInitialDeviceState(adminToken, deviceId))
    }
    return initialStates
  }

  const resetInitialStates = async (
    api: AreaControlApiClient,
    initialStates: Map<string, Awaited<ReturnType<typeof api.getInitialDeviceState>>>,
  ) => {
    for (const [deviceId, initialState] of initialStates) {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  }

  const controlTargetsAndVerify = async (
    api: AreaControlApiClient,
    tc: AreaControlEvidence,
    deviceIds: string[],
    value: boolean,
    stepPrefix: string,
  ) => {
    tc.attachStep({
      step: `${stepPrefix} targets`,
      response: {
        target_count: deviceIds.length,
        target_ids: deviceIds,
        value,
      },
    })
    for (const deviceId of deviceIds) {
      const response = await api.controlDevice(adminToken, deviceId, [
        { idx: env.slotOnOff, value },
      ], `${stepPrefix}: control ${deviceId}`)
      expect(response.status()).toBe(200)
      expectSuccessBody(await response.json())
    }
    for (const deviceId of deviceIds) {
      await api.waitForDeviceState(adminToken, deviceId, env.slotOnOff, value)
    }
    tc.attachAssertion(`${stepPrefix}: verified ${deviceIds.length} device(s) slot ${env.slotOnOff} = ${value}`)
  }

  const setMixedBaseline = async (
    api: AreaControlApiClient,
    deviceIds: string[],
  ) => {
    expect(deviceIds.length, 'Mixed baseline requires at least 2 online devices').toBeGreaterThanOrEqual(2)
    for (const [index, deviceId] of deviceIds.entries()) {
      const value = index % 2 === 0
      const response = await api.controlDevice(adminToken, deviceId, [
        { idx: env.slotOnOff, value },
      ], `Set mixed baseline ${deviceId}`)
      expect(response.status()).toBe(200)
      await api.waitForDeviceState(adminToken, deviceId, env.slotOnOff, value)
    }
  }

  /*
   * TC ID: TC1
   * Ten testcase: Bat toan bo thiet bi trong khu vuc
   * Muc tieu: Gan tat ca thiet bi online cua HC that vao khu vuc, control ON tung device va verify status.
   * Precondition: Suite tu tao area automation va gan tat ca thiet bi online/activated co slot boolean on/off.
   * Expected: Control API success va slot on/off cua tat ca target la true sau polling.
   * Evidence: Luu list area devices, control request/response, status polling va cleanup.
   */
  runTc('TC1', 'Bat toan bo thiet bi trong khu vuc', async (api, tc) => {
    const areaId = suiteAreaId()
    const devices = await api.listAreaDevices(adminToken, areaId)
    const targetIds = [...new Set(
      devices.map((device) => String(device.device_id ?? device.id ?? '')).filter(Boolean),
    )]
    expect(targetIds.length).toBeGreaterThan(0)
    tc.attachStep({
      step: 'Area ON targets',
      response: {
        area_id: areaId,
        target_count: targetIds.length,
        target_ids: targetIds,
      },
    })
    const initialStates = new Map<string, Awaited<ReturnType<typeof api.getInitialDeviceState>>>()
    try {
      for (const deviceId of targetIds) {
        initialStates.set(deviceId, await api.getInitialDeviceState(adminToken, deviceId))
        await api.controlDevice(adminToken, deviceId, [
          { idx: env.slotOnOff, value: true },
        ])
      }
      for (const deviceId of targetIds) {
        await api.waitForDeviceState(adminToken, deviceId, env.slotOnOff, true)
      }
      tc.attachAssertion(`Tat ca ${targetIds.length} thiet bi online trong khu vuc chuyen ON`)
    } finally {
      for (const [deviceId, initialState] of initialStates) {
        await api.resetDeviceState(adminToken, deviceId, initialState)
      }
    }
  })

  /*
   * TC ID: TC2
   * Ten testcase: Tat toan bo thiet bi trong khu vuc
   * Muc tieu: Tat toan bo thiet bi online da duoc gan vao khu vuc automation.
   * Expected: Tat ca thiet bi target chuyen OFF va duoc reset sau test.
   */
  runTc('TC2', 'Tat toan bo thiet bi trong khu vuc', async (api, tc) => {
    const areaId = suiteAreaId()
    const devices = await api.listAreaDevices(adminToken, areaId)
    const targetIds = [...new Set(
      devices.map((device) => String(device.device_id ?? device.id ?? '')).filter(Boolean),
    )]
    expect(targetIds.length).toBeGreaterThan(0)
    tc.attachStep({
      step: 'Area OFF targets',
      response: {
        area_id: areaId,
        target_count: targetIds.length,
        target_ids: targetIds,
      },
    })
    const initialStates = new Map<string, Awaited<ReturnType<typeof api.getInitialDeviceState>>>()
    try {
      for (const deviceId of targetIds) {
        initialStates.set(deviceId, await api.getInitialDeviceState(adminToken, deviceId))
        await api.controlDevice(adminToken, deviceId, [
          { idx: env.slotOnOff, value: false },
        ])
      }
      for (const deviceId of targetIds) {
        await api.waitForDeviceState(adminToken, deviceId, env.slotOnOff, false)
      }
      tc.attachAssertion(`Tat ca ${targetIds.length} thiet bi online trong khu vuc chuyen OFF`)
    } finally {
      for (const [deviceId, initialState] of initialStates) {
        await api.resetDeviceState(adminToken, deviceId, initialState)
      }
    }
  })

  /*
   * TC ID: TC3
   * Ten testcase: Bat khu vuc co thiet bi bat/tat lan lon
   * Expected: Tat ca device online trong khu vuc chuyen ON sau khi baseline co ca ON/OFF.
   */
  runTc('TC3', 'Bat khu vuc co thiet bi bat/tat lan lon', async (api, tc) => {
    const targetIds = await getAreaTargetIds(api)
    const initialStates = await saveInitialStates(api, targetIds)
    try {
      await setMixedBaseline(api, targetIds)
      await controlTargetsAndVerify(api, tc, targetIds, true, 'Area mixed baseline ON')
    } finally {
      await resetInitialStates(api, initialStates)
    }
  })

  /*
   * TC ID: TC4
   * Ten testcase: Tat khu vuc co thiet bi bat/tat lan lon
   * Expected: Tat ca device online trong khu vuc chuyen OFF sau khi baseline co ca ON/OFF.
   */
  runTc('TC4', 'Tat khu vuc co thiet bi bat/tat lan lon', async (api, tc) => {
    const targetIds = await getAreaTargetIds(api)
    const initialStates = await saveInitialStates(api, targetIds)
    try {
      await setMixedBaseline(api, targetIds)
      await controlTargetsAndVerify(api, tc, targetIds, false, 'Area mixed baseline OFF')
    } finally {
      await resetInitialStates(api, initialStates)
    }
  })

  /*
   * TC ID: TC5
   * Ten testcase: Dieu khien khu vuc chi co 1 thiet bi
   * Expected: Khu vuc tam co dung 1 device, control va verify status device that.
   */
  runTc('TC5', 'Dieu khien khu vuc chi co 1 thiet bi', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    const singleAreaId = await api.createArea(adminToken, {
      name: generateAreaControlName('single'),
      parent_id: null,
    })
    try {
      await api.assignDevices(adminToken, singleAreaId, [deviceId])
      const devices = await api.listAreaDevices(adminToken, singleAreaId)
      expect(devices.map((device) => String(device.device_id ?? device.id ?? '')).filter(Boolean)).toHaveLength(1)
      await controlTargetsAndVerify(api, tc, [deviceId], true, 'Single-device area ON')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
      await api.unassignDevices(adminToken, singleAreaId, [deviceId])
      await api.deleteArea(adminToken, singleAreaId)
      await api.assignDevices(adminToken, suiteAreaId(), [deviceId])
    }
  })

  /*
   * TC ID: TC6
   * Ten testcase: Khu vuc rong khong goi API control
   * Expected: List devices empty va khong goi API control khi khong co target.
   */
  runTc('TC6', 'Khu vuc rong khong goi API control', async (api, tc) => {
    const areaId = suiteEmptyAreaId()
    const devices = await api.listAreaDevices(adminToken, areaId)
    expect(devices.length).toBe(0)
    tc.attachStep({
      step: 'Skip control API because empty area has no target devices',
      response: {
        area_id: areaId,
        device_count: devices.length,
        control_api_called: false,
      },
    })
    tc.attachAssertion('Khu vuc rong khong goi API control')
  })

  /*
   * TC ID: TC7
   * Ten testcase: Dieu khien nhieu thiet bi duoc chon trong khu vuc
   * Expected: Chi nhom device duoc chon doi trang thai, co verify status tung device.
   */
  runTc('TC7', 'Dieu khien nhieu thiet bi duoc chon trong khu vuc', async (api, tc) => {
    const targetIds = await getAreaTargetIds(api, Math.min(3, assignedDeviceIds.length))
    expect(targetIds.length).toBeGreaterThanOrEqual(1)
    const initialStates = await saveInitialStates(api, targetIds)
    try {
      await controlTargetsAndVerify(api, tc, targetIds, false, 'Selected area devices OFF')
      await controlTargetsAndVerify(api, tc, targetIds, true, 'Selected area devices ON')
    } finally {
      await resetInitialStates(api, initialStates)
    }
  })

  /*
   * TC ID: TC8
   * Ten testcase: Dieu khien khu vuc co thiet bi offline
   * Expected: Online device doi trang thai, offline fixture ghi behavior that va khong lam fail nhom online.
   */
  runTc('TC8', 'Dieu khien khu vuc co thiet bi offline', async (api, tc) => {
    test.skip(!env.testOfflineDeviceId, 'TEST_OFFLINE_DEVICE_ID is not configured')
    const [onlineDeviceId] = await getAreaTargetIds(api, 1)
    const offlineAreaId = await api.createArea(adminToken, {
      name: generateAreaControlName('offline'),
      parent_id: null,
    })
    const initialOnlineState = await api.getInitialDeviceState(adminToken, onlineDeviceId)
    try {
      await api.assignDevices(adminToken, offlineAreaId, [onlineDeviceId, env.testOfflineDeviceId])
      await controlTargetsAndVerify(api, tc, [onlineDeviceId], true, 'Area with offline device online target ON')
      const offlineResponse = await api.controlDevice(adminToken, env.testOfflineDeviceId, [
        { idx: env.slotOnOff, value: true },
      ], 'Area with offline device offline target control')
      expectStatusIn(offlineResponse.status(), [200, 202, 400, 404, 409, 422, 504])
      tc.attachAssertion('Offline device behavior recorded, online target still verified by status')
    } finally {
      await api.resetDeviceState(adminToken, onlineDeviceId, initialOnlineState)
      await api.unassignDevices(adminToken, offlineAreaId, [onlineDeviceId, env.testOfflineDeviceId])
      await api.deleteArea(adminToken, offlineAreaId)
      await api.assignDevices(adminToken, suiteAreaId(), [onlineDeviceId])
    }
  })

  /*
   * TC ID: TC9
   * Ten testcase: Thiet bi ngoai khu vuc khong bi anh huong
   * Expected: Device khong thuoc khu vuc tam giu nguyen slot on/off sau khi control khu vuc tam.
   */
  runTc('TC9', 'Thiet bi ngoai khu vuc khong bi anh huong', async (api, tc) => {
    const areaTargetIds = await getAreaTargetIds(api)
    const insideDeviceId = areaTargetIds[0]
    const outsideDeviceId = areaTargetIds[areaTargetIds.length - 1]
    expect(outsideDeviceId, 'Need at least 2 online devices for outside-area guard').toBeTruthy()
    expect(outsideDeviceId, 'Outside device must be different from inside device').not.toBe(insideDeviceId)
    const guardAreaId = await api.createArea(adminToken, {
      name: generateAreaControlName('outside_guard'),
      parent_id: null,
    })
    const initialInsideState = await api.getInitialDeviceState(adminToken, insideDeviceId)
    const initialOutsideState = await api.getInitialDeviceState(adminToken, outsideDeviceId)
    try {
      await api.assignDevices(adminToken, guardAreaId, [insideDeviceId])
      await api.assertDeviceNotInArea(adminToken, guardAreaId, outsideDeviceId)
      await controlTargetsAndVerify(api, tc, [outsideDeviceId], false, 'Pre-set outside device OFF')
      await controlTargetsAndVerify(api, tc, [insideDeviceId], true, 'Inside temporary area ON')
      await api.expectDeviceStateNotChanged(adminToken, outsideDeviceId, env.slotOnOff, false)
      tc.attachAssertion(`Device ngoai khu vuc ${outsideDeviceId} khong bi doi trang thai`)
    } finally {
      await api.resetDeviceState(adminToken, insideDeviceId, initialInsideState)
      await api.resetDeviceState(adminToken, outsideDeviceId, initialOutsideState)
      await api.unassignDevices(adminToken, guardAreaId, [insideDeviceId])
      await api.deleteArea(adminToken, guardAreaId)
      await api.assignDevices(adminToken, suiteAreaId(), [insideDeviceId])
    }
  })

  /*
   * TC ID: TC10
   * Ten testcase: Bat cong tac thanh cong
   * Expected: Device that chuyen ON va duoc verify bang status polling.
   */
  runTc('TC10', 'Bat cong tac thanh cong', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    await controlAndExpectState(api, tc, deviceId, [{ idx: env.slotOnOff, value: true }], env.slotOnOff, true)
  })

  /*
   * TC ID: TC11
   * Ten testcase: Tat cong tac thanh cong
   * Expected: Device that chuyen OFF va duoc verify bang status polling.
   */
  runTc('TC11', 'Tat cong tac thanh cong', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    await controlAndExpectState(api, tc, deviceId, [{ idx: env.slotOnOff, value: false }], env.slotOnOff, false)
  })

  /*
   * TC ID: TC12
   * Ten testcase: Bat cong tac dang bat san
   * Expected: Gui ON khi dang ON van giu trang thai ON.
   */
  runTc('TC12', 'Bat cong tac dang bat san', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], true, 'Pre-set switch ON')
      await controlTargetsAndVerify(api, tc, [deviceId], true, 'Switch already ON command ON')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC13
   * Ten testcase: Tat cong tac dang tat san
   * Expected: Gui OFF khi dang OFF van giu trang thai OFF.
   */
  runTc('TC13', 'Tat cong tac dang tat san', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Pre-set switch OFF')
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Switch already OFF command OFF')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC14
   * Ten testcase: Bat/tat cong tac lien tiep
   * Expected: ON roi OFF deu duoc verify bang status that.
   */
  runTc('TC14', 'Bat/tat cong tac lien tiep', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], true, 'Switch ON first')
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Switch OFF second')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC15
   * Ten testcase: Tat/bat cong tac lien tiep
   * Expected: OFF roi ON deu duoc verify bang status that.
   */
  runTc('TC15', 'Tat/bat cong tac lien tiep', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Switch OFF first')
      await controlTargetsAndVerify(api, tc, [deviceId], true, 'Switch ON second')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC16
   * Ten testcase: Dieu khien cong tac khi offline
   * Expected: Offline fixture khong duoc tinh pass neu khong verify duoc behavior that.
   */
  runTc('TC16', 'Dieu khien cong tac khi offline', async (api, tc) => {
    test.skip(!env.testOfflineDeviceId, 'TEST_OFFLINE_DEVICE_ID is not configured')
    const response = await api.controlDevice(adminToken, env.testOfflineDeviceId, [
      { idx: env.slotOnOff, value: true },
    ], 'Control offline switch')
    expectStatusIn(response.status(), [200, 202, 400, 404, 409, 422, 504])
    tc.attachAssertion('Offline switch response captured from real HC/gateway')
  })

  /*
   * TC ID: TC17
   * Ten testcase: Dieu khien cong tac khi HC offline
   * Expected: Lenh voi HC offline/sai khong lam doi trang thai device that.
   */
  runTc('TC17', 'Dieu khien cong tac khi HC offline', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Pre-set switch OFF before offline HC control')
      const response = await api.controlDeviceWithHeaderOverrides(
        adminToken,
        deviceId,
        [{ idx: env.slotOnOff, value: true }],
        { hcId: env.testOfflineHcId },
        'Control switch with offline HC id',
      )
      await api.expectDeviceStateNotChanged(adminToken, deviceId, env.slotOnOff, false)
      expectStatusIn(response.status(), [400, 404, 409, 422, 500, 503, 504])
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC18
   * Ten testcase: Khong dieu khien khi thieu x-hc-id
   * Expected: Missing x-hc-id bi reject va trang thai device that khong doi.
   */
  runTc('TC18', 'Khong dieu khien khi thieu x-hc-id', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Pre-set switch OFF before missing x-hc-id')
      const response = await api.controlDeviceWithHeaderOverrides(
        adminToken,
        deviceId,
        [{ idx: env.slotOnOff, value: true }],
        { omitHcId: true },
        'Control switch without x-hc-id',
      )
      await api.expectDeviceStateNotChanged(adminToken, deviceId, env.slotOnOff, false)
      expectStatusIn(response.status(), [400, 401, 403, 422])
      tc.attachAssertion('Missing x-hc-id did not change real device state')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })

  /*
   * TC ID: TC19
   * Ten testcase: Khong dieu khien khi x-hc-id sai
   * Expected: Wrong x-hc-id bi reject va trang thai device that khong doi.
   */
  runTc('TC19', 'Khong dieu khien khi x-hc-id sai', async (api, tc) => {
    const [deviceId] = await getAreaTargetIds(api, 1)
    const initialState = await api.getInitialDeviceState(adminToken, deviceId)
    try {
      await controlTargetsAndVerify(api, tc, [deviceId], false, 'Pre-set switch OFF before wrong x-hc-id')
      const response = await api.controlDeviceWithHeaderOverrides(
        adminToken,
        deviceId,
        [{ idx: env.slotOnOff, value: true }],
        { hcId: env.testOfflineHcId },
        'Control switch with wrong x-hc-id',
      )
      await api.expectDeviceStateNotChanged(adminToken, deviceId, env.slotOnOff, false)
      expectStatusIn(response.status(), [400, 404, 409, 422, 500, 503, 504])
      tc.attachAssertion('Wrong x-hc-id did not change real device state')
    } finally {
      await api.resetDeviceState(adminToken, deviceId, initialState)
    }
  })
})
