import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  request,
} from '@playwright/test'
import { exec } from 'child_process'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { getSharedBmsEnv, normalizeBmsBaseUrl } from './env'

type EvidenceStatus = 'PASSED' | 'FAILED'
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT'

type StepEvidence = {
  step: string
  method?: string
  endpoint?: string
  status?: number
  request?: unknown
  response?: unknown
}

type EvidenceFile = {
  tc_id: string
  tc_name: string
  status: EvidenceStatus
  started_at: string
  finished_at?: string
  base_url: string
  steps: StepEvidence[]
  assertions: string[]
  cleanup: {
    config_restored: boolean
    thresholds_restored: number
    users_deleted: number
    warnings: string[]
  }
  system_logs?: unknown
  error_message?: string
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export type MaintenanceConfig = {
  alertModule?: string
  alertType?: string
  nearThresholdPercentage?: number
  overThresholdPercentage?: number
  repeatMaintenanceAlert?: boolean
  updatedAt?: string
}

export type MaintenanceSuiteEnv = {
  baseUrl: string
  apiPrefix: string
  healthEndpoint: string
  evidenceDir: string
  apiKey: string
  clientVersion: string
  clientOs: string
  clientId: string
  language: string
  adminUsername: string
  adminPassword: string
  adminAccessToken: string
  rootAccessToken: string
  noPermissionUsername: string
  noPermissionPassword: string
  testUserPassword: string
  testDeviceId: string
  allowDoneWrites: boolean
  collectSystemLogOnFail: boolean
  systemLogCommand: string
  systemLogMaxChars: number
}

export type MaintenanceUserPayload = {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
}

export class MaintenanceEvidence {
  private evidence: EvidenceFile

  constructor(
    private testInfo: TestInfo,
    tcId: string,
    tcName: string,
    baseUrl: string,
  ) {
    this.evidence = {
      tc_id: tcId,
      tc_name: tcName,
      status: 'FAILED',
      started_at: new Date().toISOString(),
      base_url: baseUrl,
      steps: [],
      assertions: [],
      cleanup: {
        config_restored: false,
        thresholds_restored: 0,
        users_deleted: 0,
        warnings: [],
      },
    }
  }

  addAssertion(assertion: string) {
    this.evidence.assertions.push(assertion)
  }

  addCleanupWarning(warning: string) {
    this.evidence.cleanup.warnings.push(warning)
  }

  markConfigRestored() {
    this.evidence.cleanup.config_restored = true
  }

  markThresholdRestored() {
    this.evidence.cleanup.thresholds_restored += 1
  }

  markUserDeleted() {
    this.evidence.cleanup.users_deleted += 1
  }

  async attachResponse(
    step: string,
    method: string,
    endpoint: string,
    result: ApiCallResult,
    requestBody?: unknown,
  ) {
    this.evidence.steps.push({
      step,
      method,
      endpoint,
      status: result.status(),
      request: redactSecrets(requestBody),
      response: redactSecrets(result.body),
    })
  }

  async attachStep(step: StepEvidence) {
    this.evidence.steps.push(redactSecrets(step) as StepEvidence)
  }

  async collectSystemLog(error: unknown) {
    const env = getMaintenanceSuiteEnv()
    this.evidence.system_logs = await collectSystemLog(env, error)
  }

  async write(status: EvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) this.evidence.error_message = formatError(error)

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}_${Date.now()}.json`
    const body = JSON.stringify(this.evidence, null, 2)
    const evidenceDir = getMaintenanceSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)
    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class MaintenanceSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: MaintenanceSuiteEnv,
    private evidence?: MaintenanceEvidence,
  ) {}

  withEvidence(evidence: MaintenanceEvidence) {
    return new MaintenanceSuiteApi(this.context, this.env, evidence)
  }

  async healthCheck() {
    return this.call('Health check', 'GET', this.env.healthEndpoint)
  }

  async login(payload: { user_name?: string; password?: string }) {
    return this.call('Login', 'POST', `${this.env.apiPrefix}/auth/login`, payload)
  }

  async registerUser(payload: MaintenanceUserPayload) {
    return this.call('Register user', 'POST', `${this.env.apiPrefix}/auth/register`, payload)
  }

  async deleteUser(userId?: string) {
    return this.call('Delete user', 'POST', `${this.env.apiPrefix}/auth/delete`, {
      user_id: userId,
    })
  }

  async getConfig() {
    return this.call('Get maintenance config', 'GET', this.maintenanceEndpoint('/config'))
  }

  async updateConfig(payload: Record<string, unknown>) {
    return this.call(
      'Update maintenance config',
      'PATCH',
      this.maintenanceEndpoint('/config'),
      payload,
    )
  }

  async listDevices(query?: Record<string, string | number | boolean | Array<string | number>>) {
    return this.call('List maintenance devices', 'GET', this.maintenanceEndpoint(`/devices${toQuery(query)}`))
  }

  async getSummary(query?: Record<string, string | number | boolean | Array<string | number>>) {
    return this.call('Get maintenance summary', 'GET', this.maintenanceEndpoint(`/devices/summary${toQuery(query)}`))
  }

  async markDone(deviceId: string, payload: Record<string, unknown> = {}) {
    return this.call(
      'Record maintenance done',
      'PATCH',
      this.maintenanceEndpoint(`/devices/${deviceId}/done`),
      payload,
    )
  }

  async listLogs(deviceId: string, query?: Record<string, string | number>) {
    return this.call(
      'List maintenance logs',
      'GET',
      this.maintenanceEndpoint(`/devices/${deviceId}/logs${toQuery(query)}`),
    )
  }

  async updateThresholds(deviceId: string, payload: Record<string, unknown>) {
    return this.call(
      'Update maintenance thresholds',
      'PUT',
      this.maintenanceEndpoint(`/devices/${deviceId}/thresholds`),
      payload,
    )
  }

  async bulkDone(payload: Record<string, unknown>) {
    return this.call(
      'Bulk maintenance done',
      'PATCH',
      this.maintenanceEndpoint('/devices/bulk-done'),
      payload,
    )
  }

  async bulkThresholds(payload: Record<string, unknown>) {
    return this.call(
      'Bulk update thresholds',
      'PUT',
      this.maintenanceEndpoint('/devices/bulk-thresholds'),
      payload,
    )
  }

  async exportDevices(query?: Record<string, string | number | boolean | Array<string | number>>) {
    return this.call(
      'Export maintenance devices',
      'GET',
      this.maintenanceEndpoint(`/devices/export${toQuery(query)}`),
    )
  }

  async requestInvalidToken(
    method: 'GET' | 'PATCH' | 'PUT',
    endpoint: string,
    payload?: unknown,
  ) {
    const api = await newMaintenanceSuiteApi(this.env, 'invalid_token')
    try {
      return await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Invalid token request', method, endpoint, payload)
    } finally {
      await api.context.dispose()
    }
  }

  maintenanceEndpoint(path = '') {
    return `${this.env.apiPrefix}/maintenance${path}`
  }

  private async call(
    step: string,
    method: Method,
    endpoint: string,
    payload?: unknown,
  ) {
    let response: APIResponse
    const maxAttempts = Number(process.env.BMS_API_429_RETRY_ATTEMPTS || 3)
    for (let attempt = 1; ; attempt += 1) {
      await waitForApiThrottle()
      response =
        method === 'GET'
          ? await this.context.get(endpoint)
          : method === 'POST'
            ? await this.context.post(endpoint, { data: payload })
            : method === 'PATCH'
              ? await this.context.patch(endpoint, { data: payload })
              : await this.context.put(endpoint, { data: payload })

      if (response.status() !== 429 || attempt >= maxAttempts) break
      const retryDelayMs = await retryAfter429Ms(response)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }

    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(step, method, endpoint, result, payload)
    return result
  }
}

export const getMaintenanceSuiteEnv = (): MaintenanceSuiteEnv => {
  const shared = getSharedBmsEnv(
    'MAINTENANCE_EVIDENCE_DIR',
    'maintenance-current',
  )
  const rawBaseUrl =
    process.env.MAINTENANCE_BASE_URL ||
    process.env.BASE_URL ||
    process.env.BMS_API_ENDPOINT ||
    shared.baseUrl
  const base = normalizeBmsBaseUrl(rawBaseUrl)

  return {
    baseUrl: base.baseUrl,
    apiPrefix: base.apiPrefix,
    healthEndpoint: base.healthEndpoint,
    evidenceDir:
      process.env.MAINTENANCE_EVIDENCE_DIR ||
      join(process.cwd(), 'test-runs', 'maintenance-current', 'evidence'),
    apiKey: shared.apiKey,
    clientVersion: shared.clientVersion,
    clientOs: shared.clientOs,
    clientId: shared.clientId,
    language: shared.language,
    adminUsername: shared.adminUsername,
    adminPassword: shared.adminPassword,
    adminAccessToken:
      process.env.MAINTENANCE_ADMIN_ACCESS_TOKEN ||
      process.env.DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN ||
      process.env.HOME_CONTROLLER_ADMIN_ACCESS_TOKEN ||
      process.env.GROUP_ADMIN_ACCESS_TOKEN ||
      process.env.BMS_ACCESS_TOKEN ||
      '',
    rootAccessToken: process.env.BMS_ROOT_ACCESS_TOKEN || '',
    noPermissionUsername:
      process.env.NO_PERMISSION_USERNAME ||
      process.env.BMS_NO_PERMISSION_USERNAME ||
      '',
    noPermissionPassword:
      process.env.NO_PERMISSION_PASSWORD ||
      process.env.BMS_NO_PERMISSION_PASSWORD ||
      '',
    testUserPassword: process.env.TEST_USER_PASSWORD || 'Auto@456',
    testDeviceId: process.env.MAINTENANCE_TEST_DEVICE_ID || '',
    allowDoneWrites: process.env.MAINTENANCE_ALLOW_DONE_WRITES === 'true',
    collectSystemLogOnFail:
      process.env.MAINTENANCE_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.MAINTENANCE_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 bms-api alert-manager-api iot-console',
    systemLogMaxChars: Number(
      process.env.MAINTENANCE_SYSTEM_LOG_MAX_CHARS || 25000,
    ),
  }
}

export const clearMaintenanceEvidenceDir = async (env: MaintenanceSuiteEnv) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const writeMaintenancePrecheckEvidence = async (
  env: MaintenanceSuiteEnv,
  name: string,
  body: unknown,
) => {
  await mkdir(env.evidenceDir, { recursive: true })
  await writeFile(
    join(env.evidenceDir, `${name}_${Date.now()}.json`),
    JSON.stringify(redactSecrets(body), null, 2),
  )
}

export const newMaintenanceSuiteApi = async (
  env: MaintenanceSuiteEnv,
  token?: string,
  omitApiKey = false,
) => {
  const headers = commonHeaders(env, omitApiKey)
  if (token) headers.Authorization = `Bearer ${token}`
  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })
  return new MaintenanceSuiteApi(context, env)
}

export const loginMaintenanceSuiteUser = async (
  env: MaintenanceSuiteEnv,
  userName: string,
  password: string,
) => {
  const api = await newMaintenanceSuiteApi(env)
  try {
    const response = await api.login({ user_name: userName, password })
    if (response.status() !== 200) {
      throw new Error(
        `Login failed for ${userName}: status=${response.status()} body=${await response.text()}`,
      )
    }
    const body = (await response.json()) as any
    const token =
      body?.data?.access_token || body?.data?.token || body?.data?.accessToken
    const refreshToken =
      body?.data?.refresh_token ||
      body?.data?.refreshToken ||
      body?.data?.refresh
    if (!token) throw new Error(`Login response for ${userName} has no token`)
    return { token, refreshToken, userId: userIdFromBody(body) }
  } finally {
    await api.context.dispose()
  }
}

export const maintenanceItems = (body: any): any[] =>
  Array.isArray(body?.data?.items)
    ? body.data.items
    : Array.isArray(body?.data)
      ? body.data
      : []

export const paginationMeta = (body: any) => ({
  total: body?.data?.meta?.total ?? body?.data?.total,
  page: body?.data?.meta?.page ?? body?.data?.page,
  limit: body?.data?.meta?.limit ?? body?.data?.limit,
})

export const configFromBody = (body: any): MaintenanceConfig =>
  (body?.data || {}) as MaintenanceConfig

export const deviceIdOf = (item: any): string | undefined =>
  item?.id === undefined || item?.id === null ? undefined : String(item.id)

export const thresholdPayloadFromDevice = (device: any) => ({
  thresholds: (Array.isArray(device?.thresholds) ? device.thresholds : []).map(
    (threshold: any) => ({
      threshold_type: threshold.threshold_type || 'RUNTIME',
      threshold_value: Number(threshold.threshold_value ?? 1000),
      description: threshold.description || 'Restore threshold by automation',
    }),
  ),
})

export const generatedMaintenanceUserPayload = (
  env: MaintenanceSuiteEnv,
  tcId: string,
): MaintenanceUserPayload => {
  const token = timestampToken()
  const random = Math.random().toString(36).slice(2, 8)
  const userName = `auto_maint_${tcId}_${token}_${random}`
  return {
    user_name: userName,
    email: `${userName}@auto-test.local`,
    password: env.testUserPassword,
    display_name: 'Auto Maintenance User',
    phone: `+849${Date.now().toString().slice(-8)}`,
  }
}

export const userIdFromBody = (body: any): string | undefined =>
  body?.data?.user_id ||
  body?.data?.id ||
  body?.data?.user?.id ||
  body?.data?.user?.user_id ||
  body?.user_id ||
  body?.id

export const cleanupUser = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  userId?: string,
) => {
  if (!userId) return
  try {
    const response = await api.deleteUser(userId)
    if ([200, 404].includes(response.status())) {
      evidence.markUserDeleted()
      return
    }
    evidence.addCleanupWarning(
      `User ${userId} cleanup returned status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(`Cleanup user failed: ${formatError(error)}`)
  }
}

export const restoreConfig = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  config?: MaintenanceConfig,
) => {
  if (
    config?.nearThresholdPercentage === undefined ||
    config?.overThresholdPercentage === undefined ||
    config?.repeatMaintenanceAlert === undefined
  ) {
    return
  }
  try {
    const response = await api.updateConfig({
      nearThresholdPercentage: config.nearThresholdPercentage,
      overThresholdPercentage: config.overThresholdPercentage,
      repeatMaintenanceAlert: config.repeatMaintenanceAlert,
    })
    if (response.status() === 200) {
      evidence.markConfigRestored()
      return
    }
    evidence.addCleanupWarning(`Config restore status=${response.status()}`)
  } catch (error) {
    evidence.addCleanupWarning(`Config restore failed: ${formatError(error)}`)
  }
}

export const restoreThresholds = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  deviceId?: string,
  payload?: Record<string, unknown>,
) => {
  if (!deviceId || !payload) return
  try {
    const response = await api.updateThresholds(deviceId, payload)
    if (response.status() === 200) {
      evidence.markThresholdRestored()
      return
    }
    evidence.addCleanupWarning(`Threshold restore status=${response.status()}`)
  } catch (error) {
    evidence.addCleanupWarning(`Threshold restore failed: ${formatError(error)}`)
  }
}

const execAsync = promisify(exec)

const collectSystemLog = async (env: MaintenanceSuiteEnv, error: unknown) => {
  if (!env.collectSystemLogOnFail) {
    return {
      collected: false,
      reason: `Disabled. Test error: ${formatError(error)}`,
    }
  }
  try {
    const { stdout, stderr } = await execAsync(env.systemLogCommand, {
      cwd: process.cwd(),
      timeout: 15_000,
      maxBuffer: Math.max(env.systemLogMaxChars * 2, 1024 * 1024),
    })
    return {
      collected: true,
      command: env.systemLogCommand,
      stdout: truncate(stdout, env.systemLogMaxChars),
      stderr: truncate(stderr, env.systemLogMaxChars),
    }
  } catch (logError: any) {
    return {
      collected: false,
      command: env.systemLogCommand,
      stdout: truncate(logError?.stdout || '', env.systemLogMaxChars),
      stderr: truncate(logError?.stderr || '', env.systemLogMaxChars),
      reason: `Collect system log failed: ${formatError(logError)}. Test error: ${formatError(error)}`,
    }
  }
}

const commonHeaders = (
  env: MaintenanceSuiteEnv,
  omitApiKey = false,
): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-client-version': env.clientVersion,
    'x-client-os': env.clientOs,
    'x-client-id': env.clientId,
    'accept-language': env.language,
  }
  if (env.apiKey && !omitApiKey) headers['x-client-api-key'] = env.apiKey
  return headers
}

const toQuery = (
  query?: Record<string, string | number | boolean | Array<string | number>>,
) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (item !== undefined && item !== '') params.append(key, String(item))
    }
  }
  return params.toString() ? `?${params}` : ''
}

const toApiCallResult = async (
  response: APIResponse,
): Promise<ApiCallResult> => {
  const body = await safeJson(response)
  return {
    response,
    body,
    status: () => response.status(),
    url: () => response.url(),
    json: async () => body,
    text: async () =>
      typeof body === 'string' ? body : JSON.stringify(body, null, 2),
  }
}

const safeJson = async (response: APIResponse): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return await response.text()
  }
}

let nextApiRequestAt = 0

const waitForApiThrottle = async () => {
  const throttleMs = Number(process.env.BMS_API_THROTTLE_MS || 0)
  if (!Number.isFinite(throttleMs) || throttleMs <= 0) return
  const now = Date.now()
  const waitMs = Math.max(0, nextApiRequestAt - now)
  nextApiRequestAt = Math.max(now, nextApiRequestAt) + throttleMs
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
}

const retryAfter429Ms = async (response: APIResponse) => {
  const fallbackMs = Number(process.env.BMS_API_429_RETRY_MS || 1000)
  const body = await safeJson(response)
  const resetAt = Number((body as { reset_at?: unknown })?.reset_at)
  if (!Number.isFinite(resetAt) || resetAt <= 0) return fallbackMs
  const waitMs = resetAt * 1000 - Date.now() + 1000
  return Math.max(fallbackMs, Math.min(waitMs, 65_000))
}

const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lower = key.toLowerCase()
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower === 'authorization' ||
        lower.includes('api_key')
      ) {
        return [key, maskSecret(String(item || ''))]
      }
      return [key, redactSecrets(item)]
    }),
  )
}

const emptyEvidence = () => undefined as unknown as MaintenanceEvidence

const timestampToken = () => {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const maskSecret = (value: string) =>
  value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`

const truncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : value.slice(-maxChars)

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
