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
  BMS_ACCESS_TOKEN,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { delay } from '@src/utils'

type DeviceHistoryValue = boolean | number | string

type DeviceHistoryState = {
  idx: number
  value: DeviceHistoryValue
}

type DeviceStatus = {
  id: string | number
  status?: Array<{
    idx: number | string
    value: DeviceHistoryValue
  }>
}

type DeviceSlot = {
  idx?: number | string
  data_type?: {
    type?: string
  }
}

type DeviceCandidate = {
  id?: string | number
  device_id?: string | number
  name?: string
  status?: boolean
  network_state?: string
  hc?: {
    id?: string | number
    mac?: string
  }
  spec?: {
    input?: DeviceSlot[]
    output?: DeviceSlot[]
    state?: DeviceSlot[]
  }
}

type EvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  base_url?: string
  request?: unknown
  response?: unknown
  status?: number
}

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

type EvidenceStatus = 'PASSED' | 'FAILED' | 'SKIPPED'

type LogItem = Record<string, unknown>

const DEVICE_HISTORY_RUN_DIR = path.resolve(
  process.cwd(),
  process.env.DEVICE_HISTORY_RUN_DIR ??
    (process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
      ? path.dirname(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR)
      : path.join('test-runs', 'device-history-current')),
)

const DEVICE_HISTORY_EVIDENCE_DIR = path.join(
  DEVICE_HISTORY_RUN_DIR,
  'evidence',
  'api',
)

const DEVICE_HISTORY_RUN_MARKER = path.join(
  DEVICE_HISTORY_RUN_DIR,
  '.device-history-run-id',
)

const getDeviceHistoryEnv = () => ({
  historyBaseUrl:
    process.env.DEVICE_HISTORY_BASE_URL || 'http://10.10.0.198:4420',
  historyApi: process.env.DEVICE_HISTORY_API || '/api/device_logs',
  historyLimit: Number(process.env.DEVICE_HISTORY_LIMIT || '10'),
  historyDeviceIdParam:
    process.env.DEVICE_HISTORY_DEVICE_ID_PARAM || 'device_id',
  deviceServiceBaseUrl:
    process.env.DEVICE_SERVICE_ENDPOINT || DEVICE_SERVICE_ENDPOINT,
  gatewayBaseUrl:
    process.env.GATEWAY_BASE_URL ||
    process.env.DEVICE_CONTROL_ENDPOINT ||
    DEVICE_CONTROL_ENDPOINT,
  statusBaseUrl:
    process.env.DEVICE_STATUS_BASE_URL ||
    process.env.GATEWAY_BASE_URL ||
    IOT_HC_ENDPOINT,
  deviceControlApi: process.env.DEVICE_CONTROL_API || '/api/devices/control',
  deviceStatusApi: process.env.DEVICE_STATUS_API || '/api/devices/status',
  hcId: process.env.AUTOMATION_HC_ID || AUTOMATION_HC_ID,
  hcMac: process.env.AUTOMATION_HC_MAC || AUTOMATION_HC_MAC,
  adminAccessToken:
    process.env.DEVICE_HISTORY_ACCESS_TOKEN ||
    process.env.BMS_ACCESS_TOKEN ||
    BMS_ACCESS_TOKEN ||
    '',
  slotOnOff: Number(process.env.SLOT_ON_OFF || '1'),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || '500'),
  pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || '10000'),
  allowDeviceControl:
    process.env.DEVICE_HISTORY_ALLOW_DEVICE_CONTROL === 'true' ||
    AUTOMATION_ALLOW_DEVICE_CONTROL,
  runId: process.env.DEVICE_HISTORY_RUN_ID || `manual-${Date.now()}`,
  hcSshHost:
    process.env.HC_SSH_HOST ||
    hostFromEndpoint(process.env.IOT_HC_ENDPOINT || IOT_HC_ENDPOINT),
  hcSshUser: process.env.HC_SSH_USER || 'root',
  hcSshPassword: process.env.HC_SSH_PASSWORD || '',
  hcSshKeyPath: process.env.HC_SSH_KEY_PATH || '',
  hcSshKeyPassphrase:
    process.env.HC_SSH_KEY_PASSPHRASE || process.env.HC_SSH_PASSWORD || '',
  hcLogPath: process.env.HC_LOG_PATH || '/tmp/log/home-controller.log',
  hcLogTailLines: Number(process.env.HC_LOG_TAIL_LINES || '300'),
  hcLogMaxChars: Number(process.env.HC_LOG_MAX_CHARS || '60000'),
  hcSshReadyTimeoutMs: Number(process.env.HC_SSH_READY_TIMEOUT_MS || '15000'),
})

type DeviceHistoryEnv = ReturnType<typeof getDeviceHistoryEnv>

class DeviceHistoryEvidence {
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
    private env: DeviceHistoryEnv,
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
    await mkdir(DEVICE_HISTORY_EVIDENCE_DIR, { recursive: true })
    const finishedAt = new Date().toISOString()
    if (status === 'FAILED') {
      await collectHcLog(this, this.env, this.startedAt, finishedAt)
    }
    const filename = `${this.tcId}_${slug(this.tcName)}_${Date.now()}.json`
    const evidence = {
      tc_id: this.tcId,
      tc_name: this.tcName,
      status,
      started_at: this.startedAt,
      finished_at: finishedAt,
      endpoints: {
        device_history_base_url: this.env.historyBaseUrl,
        device_history_api: this.env.historyApi,
        device_service_base_url: this.env.deviceServiceBaseUrl,
        device_control_base_url: this.env.gatewayBaseUrl,
        device_control_api: this.env.deviceControlApi,
        device_status_base_url: this.env.statusBaseUrl,
        device_status_api: this.env.deviceStatusApi,
      },
      steps: this.steps,
      assertions: this.assertions,
      hc_logs: this.hcLogs,
      cleanup: this.cleanup,
      error_message:
        error instanceof Error
          ? error.message
          : error
            ? String(error)
            : undefined,
    }
    const body = JSON.stringify(evidence, null, 2)
    await writeFile(
      path.join(DEVICE_HISTORY_EVIDENCE_DIR, filename),
      body,
      'utf8',
    )
    await this.testInfo.attach(filename, {
      body,
      contentType: 'application/json',
    })
  }
}

class DeviceHistoryApiClient {
  constructor(
    private historyContext: APIRequestContext,
    private deviceServiceContext: APIRequestContext,
    private controlContext: APIRequestContext,
    private statusContext: APIRequestContext,
    private env: DeviceHistoryEnv,
    private evidence?: DeviceHistoryEvidence,
  ) {}

  withEvidence(evidence: DeviceHistoryEvidence) {
    return new DeviceHistoryApiClient(
      this.historyContext,
      this.deviceServiceContext,
      this.controlContext,
      this.statusContext,
      this.env,
      evidence,
    )
  }

  async dispose() {
    await this.historyContext.dispose()
    await this.deviceServiceContext.dispose()
    await this.controlContext.dispose()
    await this.statusContext.dispose()
  }

  async listDeviceLogsAPI(
    query: Record<string, string | number | boolean | undefined>,
  ) {
    return this.historyContext.get(this.env.historyApi, {
      params: compactQuery(query),
    })
  }

  async listDeviceLogs(
    query: Record<string, string | number | boolean | undefined>,
  ) {
    const response = await this.listDeviceLogsAPI(query)
    const body = await recordResponse(
      this.evidence,
      'List device logs',
      response,
      {
        method: 'GET',
        endpoint: `${this.env.historyApi}${toQueryString(query)}`,
        baseUrl: this.env.historyBaseUrl,
      },
    )
    expect(response.status()).toBe(200)
    return extractLogs(body)
  }

  async listAllDevicesAPI(token: string | undefined) {
    return this.deviceServiceContext.get('/api/v0/devices', {
      headers: authHeaders(token),
      params: { page: 1, limit: 1000 },
    })
  }

  async discoverOnlineSwitchableDevices(token: string | undefined) {
    const response = await this.listAllDevicesAPI(token)
    const body = await recordResponse(
      this.evidence,
      'Discover online devices',
      response,
      {
        method: 'GET',
        endpoint: '/api/v0/devices?page=1&limit=1000',
        baseUrl: this.env.deviceServiceBaseUrl,
      },
    )
    expect(response.status()).toBe(200)

    const candidates = extractItems(body) as DeviceCandidate[]
    const selected: string[] = []
    const rejected: Array<{ id?: string | number; reason: string }> = []
    for (const candidate of candidates) {
      const id = candidate.id ?? candidate.device_id
      if (!id) {
        rejected.push({ reason: 'missing id' })
        continue
      }
      if (
        this.env.hcMac &&
        candidate.hc?.mac &&
        candidate.hc.mac !== this.env.hcMac
      ) {
        rejected.push({
          id,
          reason: `hc mac ${candidate.hc.mac} != ${this.env.hcMac}`,
        })
        continue
      }
      if (!isOnline(candidate)) {
        rejected.push({ id, reason: 'not online/activated' })
        continue
      }
      if (!hasSlot(candidate, this.env.slotOnOff)) {
        rejected.push({ id, reason: `missing slot ${this.env.slotOnOff}` })
        continue
      }
      selected.push(String(id))
    }

    this.evidence?.attachStep({
      step: 'Device history discovery summary',
      response: {
        selected,
        selected_count: selected.length,
        rejected_sample: rejected.slice(0, 20),
      },
    })
    expect(
      selected.length,
      `Need at least 1 online switchable device on HC ${this.env.hcMac}. Rejected sample=${JSON.stringify(rejected.slice(0, 5))}`,
    ).toBeGreaterThanOrEqual(1)
    return selected
  }

  async controlDeviceAPI(
    token: string | undefined,
    deviceId: string,
    states: DeviceHistoryState[],
  ) {
    return this.controlContext.post(this.env.deviceControlApi, {
      headers: controlHeaders(this.env, token),
      data: {
        device_id: String(deviceId),
        states,
      },
    })
  }

  async controlDevice(
    token: string | undefined,
    deviceId: string,
    states: DeviceHistoryState[],
    step: string,
  ) {
    const response = await this.controlDeviceAPI(token, deviceId, states)
    await recordResponse(this.evidence, step, response, {
      method: 'POST',
      endpoint: this.env.deviceControlApi,
      baseUrl: this.env.gatewayBaseUrl,
      request: { device_id: String(deviceId), states },
    })
    expect([200, 202]).toContain(response.status())
    return response
  }

  async getDeviceStatusAPI(token: string | undefined, deviceIds: string[]) {
    return this.statusContext.get(this.env.deviceStatusApi, {
      headers: authHeaders(token),
      params: {
        ids: deviceIds.join(','),
      },
    })
  }

  async getDeviceStatuses(
    token: string | undefined,
    deviceIds: string[],
    step = 'Get device status',
  ) {
    const response = await this.getDeviceStatusAPI(token, deviceIds)
    const body = await recordResponse(this.evidence, step, response, {
      method: 'GET',
      endpoint: `${this.env.deviceStatusApi}?ids=${deviceIds.join(',')}`,
      baseUrl: this.env.statusBaseUrl,
    })
    expect(response.status()).toBe(200)
    return normalizeStatuses(body)
  }

  async waitForDeviceState(
    token: string | undefined,
    deviceId: string,
    slot: number,
    expectedValue: DeviceHistoryValue,
  ) {
    const attempts = Math.max(
      1,
      Math.ceil(this.env.pollTimeoutMs / this.env.pollIntervalMs),
    )
    let lastStatuses: DeviceStatus[] = []
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      lastStatuses = await this.getDeviceStatuses(
        token,
        [deviceId],
        'Poll device status',
      )
      if (slotValue(lastStatuses, deviceId, slot) === expectedValue) {
        this.evidence?.attachAssertion(
          `Device ${deviceId} slot ${slot} reached ${String(expectedValue)}`,
        )
        return lastStatuses
      }
      await delay(this.env.pollIntervalMs)
    }
    expect(slotValue(lastStatuses, deviceId, slot)).toBe(expectedValue)
    return lastStatuses
  }

  async getInitialDeviceState(token: string | undefined, deviceId: string) {
    const statuses = await this.getDeviceStatuses(
      token,
      [deviceId],
      'Capture initial device status',
    )
    return statuses.find((device) => String(device.id) === String(deviceId))
  }

  async resetDeviceState(
    token: string | undefined,
    deviceId: string,
    initial?: DeviceStatus,
  ) {
    const states = (initial?.status ?? [])
      .filter((state) => Number.isFinite(Number(state.idx)))
      .map((state) => ({
        idx: Number(state.idx),
        value: state.value,
      }))
    if (states.length === 0) {
      this.evidence?.attachCleanup({
        warning: `No initial states to reset for device ${deviceId}`,
      })
      return
    }
    try {
      await this.controlDevice(
        token,
        deviceId,
        states,
        'Reset device to initial state',
      )
      this.evidence?.attachCleanup({ device_reset: true })
    } catch (error) {
      this.evidence?.attachCleanup({
        warning: `Reset device ${deviceId} failed: ${String(error)}`,
      })
    }
  }
}

const resetDeviceHistoryEvidenceRunDir = async (env: DeviceHistoryEnv) => {
  let marker = ''
  try {
    marker = await readFile(DEVICE_HISTORY_RUN_MARKER, 'utf8')
  } catch {
    marker = ''
  }
  if (marker.trim() !== env.runId) {
    await rm(DEVICE_HISTORY_RUN_DIR, { recursive: true, force: true })
    await mkdir(DEVICE_HISTORY_EVIDENCE_DIR, { recursive: true })
    await writeFile(DEVICE_HISTORY_RUN_MARKER, env.runId, 'utf8')
    return
  }
  await mkdir(DEVICE_HISTORY_EVIDENCE_DIR, { recursive: true })
}

const createDeviceHistoryApi = async (env: DeviceHistoryEnv) => {
  const historyContext = await request.newContext({
    baseURL: env.historyBaseUrl,
  })
  const deviceServiceContext = await request.newContext({
    baseURL: env.deviceServiceBaseUrl,
  })
  const controlContext = await request.newContext({
    baseURL: env.gatewayBaseUrl,
  })
  const statusContext = await request.newContext({ baseURL: env.statusBaseUrl })
  return new DeviceHistoryApiClient(
    historyContext,
    deviceServiceContext,
    controlContext,
    statusContext,
    env,
  )
}

const recordResponse = async (
  evidence: DeviceHistoryEvidence | undefined,
  step: string,
  response: APIResponse,
  options: {
    method: string
    endpoint: string
    baseUrl?: string
    request?: unknown
  },
) => {
  const body = await safeJson(response)
  evidence?.attachStep({
    step,
    method: options.method,
    endpoint: options.endpoint,
    base_url: options.baseUrl,
    request: options.request,
    response: body,
    status: response.status(),
  })
  return body
}

const controlAndWaitForLog = async ({
  api,
  token,
  evidence,
  env,
  deviceId,
  value,
  step,
}: {
  api: DeviceHistoryApiClient
  token: string
  evidence: DeviceHistoryEvidence
  env: DeviceHistoryEnv
  deviceId: string
  value: boolean
  step: string
}) => {
  const beforeLogs = await api.listDeviceLogs({
    [env.historyDeviceIdParam]: deviceId,
    limit: 1,
  })
  evidence.attachStep({
    step: `${step} - newest log before control`,
    response: {
      newest_log: beforeLogs[0] ?? null,
      newest_cursor: cursorOf(beforeLogs[0]),
    },
  })
  await api.controlDevice(
    token,
    deviceId,
    [{ idx: env.slotOnOff, value }],
    step,
  )
  await api.waitForDeviceState(token, deviceId, env.slotOnOff, value)
  const afterLogs = await waitForNewestLog(api, env, deviceId, beforeLogs[0])
  evidence.attachStep({
    step: `${step} - newest log after control`,
    response: {
      newest_log: afterLogs[0] ?? null,
      previous_newest_log: beforeLogs[0] ?? null,
    },
  })
  expect(afterLogs.length).toBeGreaterThan(0)
  expect(logMatchesDevice(afterLogs[0], deviceId)).toBe(true)
  evidence.attachAssertion(
    `Newest device log belongs to controlled device ${deviceId}`,
  )
  return afterLogs[0]
}

const waitForNewestLog = async (
  api: DeviceHistoryApiClient,
  env: DeviceHistoryEnv,
  deviceId: string,
  previousNewest?: LogItem,
) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const logs = await api.listDeviceLogs({
      [env.historyDeviceIdParam]: deviceId,
      limit: 10,
    })
    if (logs.length > 0 && isNewerLog(logs[0], previousNewest)) {
      return logs
    }
    await delay(1000)
  }
  return api.listDeviceLogs({ [env.historyDeviceIdParam]: deviceId, limit: 10 })
}

const collectHcLog = async (
  evidence: DeviceHistoryEvidence,
  env: DeviceHistoryEnv,
  startedAt: string,
  finishedAt: string,
) => {
  if (!env.hcSshHost) {
    evidence.attachHcLog({
      step: 'Home Controller log on failure',
      method: 'SSH',
      status: 'skipped',
      reason: 'HC_SSH_HOST is not configured',
    })
    return
  }
  if (!env.hcSshPassword && !env.hcSshKeyPath) {
    evidence.attachHcLog({
      step: 'Home Controller log on failure',
      method: 'SSH',
      status: 'skipped',
      reason: 'HC_SSH_PASSWORD or HC_SSH_KEY_PATH is not configured',
    })
    return
  }

  const start = formatHcLogTime(startedAt)
  const end = formatHcLogTime(finishedAt)
  const awk = `$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2} / { ts=substr($0,1,19); if (ts >= "${start}" && ts <= "${end}") print }`
  const command = [
    'awk',
    quoteShellArg(awk),
    quoteShellArg(env.hcLogPath),
    '|',
    'tail',
    '-n',
    String(env.hcLogTailLines),
  ].join(' ')
  const result = await runSshCommand(env, command, 15_000)
  evidence.attachHcLog({
    step: 'Home Controller log on failure',
    method: 'SSH',
    endpoint: `${env.hcSshUser}@${env.hcSshHost}:${env.hcLogPath}`,
    request: command,
    status: result.exitCode === 0 ? 'captured' : 'failed',
    exit_code: result.exitCode,
    response: {
      stdout_tail: result.stdout.slice(-env.hcLogMaxChars),
      stderr_tail: result.stderr.slice(-env.hcLogMaxChars),
      max_chars: env.hcLogMaxChars,
    },
  })
}

const runSshCommand = async (
  env: DeviceHistoryEnv,
  remoteCommand: string,
  timeoutMs: number,
) =>
  new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    async (resolve) => {
      const client = new Client()
      let stdout = ''
      let stderr = ''
      let settled = false
      let auth: { password?: string; privateKey?: Buffer; passphrase?: string }
      try {
        auth = await buildSshAuth(env)
      } catch (error) {
        resolve({ exitCode: 1, stdout, stderr: String(error) })
        return
      }
      const finish = (result: {
        exitCode: number
        stdout: string
        stderr: string
      }) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        client.end()
        resolve(result)
      }
      const timer = setTimeout(() => {
        finish({
          exitCode: 124,
          stdout,
          stderr:
            `${stderr}\nSSH command timed out after ${timeoutMs}ms`.trim(),
        })
      }, timeoutMs)

      client
        .on('ready', () => {
          client.exec(remoteCommand, (error, stream) => {
            if (error) {
              finish({ exitCode: 1, stdout, stderr: String(error) })
              return
            }
            stream
              .on('close', (code: number | null) =>
                finish({ exitCode: code ?? 0, stdout, stderr }),
              )
              .on('data', (data: Buffer) => {
                stdout += data.toString()
              })
              .stderr.on('data', (data: Buffer) => {
                stderr += data.toString()
              })
          })
        })
        .on('error', (error) =>
          finish({ exitCode: 255, stdout, stderr: String(error) }),
        )
        .connect({
          host: env.hcSshHost,
          username: env.hcSshUser,
          ...auth,
          readyTimeout: env.hcSshReadyTimeoutMs,
        })
    },
  )

const buildSshAuth = async (env: DeviceHistoryEnv) => {
  if (env.hcSshKeyPath) {
    return {
      privateKey: await readFile(env.hcSshKeyPath),
      passphrase: env.hcSshKeyPassphrase || undefined,
    }
  }
  return { password: env.hcSshPassword }
}

const extractLogs = (body: unknown): LogItem[] => {
  if (Array.isArray(body)) {
    return body as LogItem[]
  }
  const record = asRecord(body)
  if (Array.isArray(record.data)) {
    return record.data as LogItem[]
  }
  const data = asRecord(record.data)
  if (Array.isArray(data.items)) {
    return data.items as LogItem[]
  }
  if (Array.isArray(data.data)) {
    return data.data as LogItem[]
  }
  return []
}

const extractItems = (body: unknown): Record<string, unknown>[] => {
  if (Array.isArray(body)) {
    return body as Record<string, unknown>[]
  }
  const record = asRecord(body)
  if (Array.isArray(record.data)) {
    return record.data as Record<string, unknown>[]
  }
  const data = asRecord(record.data)
  if (Array.isArray(data.items)) {
    return data.items as Record<string, unknown>[]
  }
  if (Array.isArray(data.data)) {
    return data.data as Record<string, unknown>[]
  }
  return []
}

const normalizeStatuses = (body: unknown): DeviceStatus[] => {
  if (Array.isArray(body)) {
    return body as DeviceStatus[]
  }
  const data = asRecord(body).data
  if (Array.isArray(data)) {
    return data as DeviceStatus[]
  }
  const items = asRecord(data).items
  return Array.isArray(items) ? (items as DeviceStatus[]) : []
}

const slotValue = (statuses: DeviceStatus[], deviceId: string, slot: number) =>
  statuses
    .find((device) => String(device.id) === String(deviceId))
    ?.status?.find((state) => Number(state.idx) === slot)?.value

const logMatchesDevice = (log: LogItem | undefined, deviceId: string) => {
  if (!log) {
    return false
  }
  const candidates = [
    log.device_id,
    log.deviceId,
    log.id,
    asRecord(log.device).id,
    asRecord(log.device).device_id,
    asRecord(log.data).device_id,
    asRecord(log.payload).device_id,
  ]
  if (candidates.some((value) => String(value) === String(deviceId))) {
    return true
  }
  return JSON.stringify(log).includes(String(deviceId))
}

const cursorOf = (log: LogItem | undefined) => {
  if (!log) {
    return ''
  }
  return String(
    log.cursor ??
      log.id ??
      log.created_at ??
      log.createdAt ??
      log.timestamp ??
      log.time ??
      '',
  )
}

const isNewerLog = (
  current: LogItem | undefined,
  previous: LogItem | undefined,
) => {
  if (!current) {
    return false
  }
  if (!previous) {
    return true
  }
  const currentCursor = cursorOf(current)
  const previousCursor = cursorOf(previous)
  if (!currentCursor || !previousCursor) {
    return JSON.stringify(current) !== JSON.stringify(previous)
  }
  return currentCursor !== previousCursor
}

const isOnline = (device: DeviceCandidate) => {
  if (device.status === true) {
    return true
  }
  const state = String(device.network_state ?? '').toLowerCase()
  return ['online', 'activated', 'active'].includes(state)
}

const hasSlot = (device: DeviceCandidate, slot: number) => {
  const slots = [
    ...(device.spec?.output ?? []),
    ...(device.spec?.state ?? []),
    ...(device.spec?.input ?? []),
  ]
  if (slots.length === 0) {
    return true
  }
  return slots.some((item) => Number(item.idx) === slot)
}

const safeJson = async (response: { json: () => Promise<unknown> }) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

const authHeaders = (token?: string) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const controlHeaders = (env: DeviceHistoryEnv, token?: string) => ({
  ...authHeaders(token),
  'x-hc-id': env.hcId,
  'x-request-id': `device-history-${Date.now()}`,
  'x-user-id': 'automation-test',
  'x-app-id': 'bms-e2e-test',
})

const compactQuery = (
  query: Record<string, string | number | boolean | undefined>,
) =>
  Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  ) as Record<string, string | number | boolean>

const toQueryString = (
  query: Record<string, string | number | boolean | undefined>,
) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(compactQuery(query))) {
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)

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
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`
}

const quoteShellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

function hostFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

test.describe('Device History API Real HC TC1-TC4', () => {
  test.describe.configure({ mode: 'serial' })

  const env = getDeviceHistoryEnv()
  let baseApi: DeviceHistoryApiClient
  let adminToken = ''
  let discoveredDeviceIds: string[] = []

  test.beforeAll(async () => {
    await resetDeviceHistoryEvidenceRunDir(env)
    baseApi = await createDeviceHistoryApi(env)
    adminToken = env.adminAccessToken
  })

  test.afterAll(async () => {
    await baseApi?.dispose()
  })

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (
      api: DeviceHistoryApiClient,
      evidence: DeviceHistoryEvidence,
    ) => Promise<void>,
    options: {
      requireControl?: boolean
      minDevices?: number
      timeoutMs?: number
    } = {},
  ) => {
    test(`${tcId} - ${tcName}`, async ({}, testInfo) => {
      if (options.timeoutMs) {
        test.setTimeout(options.timeoutMs)
      }
      const evidence = new DeviceHistoryEvidence(testInfo, tcId, tcName, env)
      const api = baseApi.withEvidence(evidence)
      try {
        test.skip(
          options.requireControl === true && !env.allowDeviceControl,
          'Set DEVICE_HISTORY_ALLOW_DEVICE_CONTROL=true to control real devices',
        )
        if (options.minDevices) {
          if (discoveredDeviceIds.length < options.minDevices) {
            discoveredDeviceIds =
              await api.discoverOnlineSwitchableDevices(adminToken)
          }
          test.skip(
            discoveredDeviceIds.length < options.minDevices,
            `Need at least ${options.minDevices} online switchable devices`,
          )
        }
        await handler(api, evidence)
        await evidence.save('PASSED')
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Test is skipped')
        ) {
          await evidence.save('SKIPPED', error)
          throw error
        }
        await evidence.save('FAILED', error)
        throw error
      }
    })
  }

  /*
   * TC ID: TC1
   * Ten testcase: Lay danh sach lich su thiet bi thanh cong
   * Precondition: Device history service dang online.
   * Steps: Goi GET /api/device_logs voi limit mac dinh, verify response la danh sach log.
   * Expected: HTTP 200, response data la array, so item khong vuot qua limit.
   * Evidence: Luu request/response GET device logs.
   */
  runTc(
    'TC1',
    'Lay danh sach lich su thiet bi thanh cong',
    async (api, evidence) => {
      const logs = await api.listDeviceLogs({ limit: env.historyLimit })
      expect(Array.isArray(logs)).toBe(true)
      expect(logs.length).toBeLessThanOrEqual(env.historyLimit)
      evidence.attachAssertion(
        'GET /api/device_logs returns a device log array',
      )
    },
  )

  /*
   * TC ID: TC2
   * Ten testcase: Dieu khien bat thiet bi sinh log
   * Precondition: Co it nhat 1 device online/activated tren HC that va cho phep control.
   * Steps: Lay status ban dau, GET log moi nhat, POST control ON, poll status, GET log moi nhat sau control.
   * Expected: Control API tra success, device slot on/off=true, log moi nhat dung device va action control.
   * Evidence: Luu discovery, status truoc/sau, request/response control, log truoc/sau.
   */
  runTc(
    'TC2',
    'Dieu khien bat thiet bi sinh log',
    async (api, evidence) => {
      const [deviceId] = discoveredDeviceIds
      const initial = await api.getInitialDeviceState(adminToken, deviceId)
      try {
        await controlAndWaitForLog({
          api,
          token: adminToken,
          evidence,
          env,
          deviceId,
          value: true,
          step: 'Control device ON',
        })
      } finally {
        await api.resetDeviceState(adminToken, deviceId, initial)
      }
    },
    { requireControl: true, minDevices: 1, timeoutMs: 90000 },
  )

  /*
   * TC ID: TC3
   * Ten testcase: Dieu khien tat thiet bi sinh log moi nhat
   * Precondition: Co it nhat 1 device online/activated tren HC that va cho phep control.
   * Steps: Control ON tao log thu nhat, control OFF tao log thu hai, so sanh cursor/timestamp log moi nhat.
   * Expected: Hai lan control deu success, log moi nhat sau lan OFF khac log lan ON va dung device.
   * Evidence: Luu request/response hai lan control va hai lan log moi nhat.
   */
  runTc(
    'TC3',
    'Dieu khien tat thiet bi sinh log moi nhat',
    async (api, evidence) => {
      const [deviceId] = discoveredDeviceIds
      const initial = await api.getInitialDeviceState(adminToken, deviceId)
      try {
        const firstLog = await controlAndWaitForLog({
          api,
          token: adminToken,
          evidence,
          env,
          deviceId,
          value: true,
          step: 'Control device ON before latest check',
        })
        const secondLog = await controlAndWaitForLog({
          api,
          token: adminToken,
          evidence,
          env,
          deviceId,
          value: false,
          step: 'Control device OFF and verify latest log',
        })
        expect(cursorOf(secondLog)).not.toBe(cursorOf(firstLog))
        evidence.attachAssertion(
          'Second control creates a different newest log entry',
        )
      } finally {
        await api.resetDeviceState(adminToken, deviceId, initial)
      }
    },
    { requireControl: true, minDevices: 1, timeoutMs: 120000 },
  )

  /*
   * TC ID: TC4
   * Ten testcase: Dieu khien nhieu thiet bi sinh log
   * Precondition: Co it nhat 2 device online/activated tren HC that va cho phep control.
   * Steps: Control ON lan luot 2 device, poll status tung device, GET log moi nhat tung device.
   * Expected: Moi device control success va co log moi nhat dung device.
   * Evidence: Luu request/response control va log sau control cho tung device.
   */
  runTc(
    'TC4',
    'Dieu khien nhieu thiet bi sinh log',
    async (api, evidence) => {
      const deviceIds = discoveredDeviceIds.slice(0, 2)
      const initialStates = await Promise.all(
        deviceIds.map((deviceId) =>
          api.getInitialDeviceState(adminToken, deviceId),
        ),
      )
      try {
        for (const deviceId of deviceIds) {
          await controlAndWaitForLog({
            api,
            token: adminToken,
            evidence,
            env,
            deviceId,
            value: true,
            step: `Control group-like device ${deviceId} ON`,
          })
        }
        evidence.attachAssertion(
          'Each controlled device has a matching newest history log',
        )
      } finally {
        for (const [index, deviceId] of deviceIds.entries()) {
          await api.resetDeviceState(adminToken, deviceId, initialStates[index])
        }
      }
    },
    { requireControl: true, minDevices: 2, timeoutMs: 120000 },
  )
})
