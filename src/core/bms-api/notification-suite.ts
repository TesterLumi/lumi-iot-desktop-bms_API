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

export type NotificationType =
  | 'DEVICE_OFFLINE'
  | 'MAINTENANCE_ALERT'
  | 'RULE_ALERT'

export type NotificationPrefs = {
  userId?: string
  deviceOffline?: boolean
  maintenanceAlert?: boolean
  ruleAlert?: boolean
  updatedAt?: string
}

type EvidenceStatus = 'PASSED' | 'FAILED'

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
    prefs_restored: boolean
    users_deleted: number
    warnings: string[]
  }
  system_logs?: SystemLogEvidence
  error_message?: string
}

type SystemLogEvidence = {
  collected: boolean
  command?: string
  stdout?: string
  stderr?: string
  reason?: string
}

type LoginResult = {
  token: string
  refreshToken?: string
  userId?: string
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export type NotificationSuiteEnv = {
  baseUrl: string
  evidenceDir: string
  apiPrefix: string
  healthEndpoint: string
  apiKey: string
  clientVersion: string
  clientOs: string
  clientId: string
  language: string
  adminUsername: string
  adminPassword: string
  noPermissionUsername: string
  noPermissionPassword: string
  accessToken: string
  rootAccessToken: string
  testUserPassword: string
  collectSystemLogOnFail: boolean
  systemLogCommand: string
  systemLogMaxChars: number
}

export type NotificationUserPayload = {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
}

export class NotificationEvidence {
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
        prefs_restored: false,
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

  markPrefsRestored() {
    this.evidence.cleanup.prefs_restored = true
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
    const env = getNotificationSuiteEnv()
    this.evidence.system_logs = await collectSystemLog(env, error)
  }

  async write(status: EvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) this.evidence.error_message = formatError(error)

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}_${Date.now()}.json`
    const body = JSON.stringify(this.evidence, null, 2)
    const evidenceDir = getNotificationSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)
    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class NotificationSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: NotificationSuiteEnv,
    private evidence?: NotificationEvidence,
  ) {}

  withEvidence(evidence: NotificationEvidence) {
    return new NotificationSuiteApi(this.context, this.env, evidence)
  }

  async healthCheck() {
    return this.call('Health check', 'GET', this.env.healthEndpoint)
  }

  async login(payload: { user_name?: string; password?: string }) {
    return this.call('Login', 'POST', this.authEndpoint('login'), payload)
  }

  async logout(token: string, refreshToken?: string) {
    if (!refreshToken) return undefined
    const api = await newNotificationSuiteApi(this.env, token)
    try {
      return await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Logout', 'POST', this.authEndpoint('logout'), {
          refresh_token: refreshToken,
        })
    } finally {
      await api.context.dispose()
    }
  }

  async registerUser(payload: NotificationUserPayload) {
    return this.call('Register user', 'POST', this.authEndpoint('register'), {
      ...payload,
    })
  }

  async deleteUser(userId?: string) {
    return this.call('Delete user', 'POST', this.authEndpoint('delete'), {
      user_id: userId,
    })
  }

  async listNotifications(query?: {
    page?: number | string
    limit?: number | string
    is_read?: boolean | string
    notification_type?: NotificationType | NotificationType[] | string
  }) {
    return this.call(
      'List notifications',
      'GET',
      this.notificationEndpoint(toNotificationQuery(query)),
    )
  }

  async getUnreadCount() {
    return this.call(
      'Get unread count',
      'GET',
      this.notificationEndpoint('/unread-count'),
    )
  }

  async markAsRead(id: string, payload: Record<string, unknown> = {}) {
    return this.call(
      'Mark notification as read',
      'PATCH',
      this.notificationEndpoint(`/${id}/read`),
      payload,
    )
  }

  async markAllAsRead(payload: Record<string, unknown> = {}) {
    return this.call(
      'Mark all notifications as read',
      'PATCH',
      this.notificationEndpoint('/read-all'),
      payload,
    )
  }

  async getPrefs() {
    return this.call(
      'Get notification prefs',
      'GET',
      this.notificationEndpoint('/prefs'),
    )
  }

  async updatePrefs(payload: Record<string, unknown>) {
    return this.call(
      'Update notification prefs',
      'PATCH',
      this.notificationEndpoint('/prefs'),
      payload,
    )
  }

  async requestInvalidToken(
    method: 'GET' | 'PATCH',
    endpoint: string,
    payload?: unknown,
  ) {
    const api = await newNotificationSuiteApi(this.env, 'invalid_token')
    try {
      return await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Invalid token request', method, endpoint, payload)
    } finally {
      await api.context.dispose()
    }
  }

  notificationEndpoint(path = '') {
    return `${this.env.apiPrefix}/notifications${path}`
  }

  authEndpoint(path: string) {
    return `${this.env.apiPrefix}/auth/${path}`
  }

  private async call(
    step: string,
    method: 'GET' | 'POST' | 'PATCH',
    endpoint: string,
    payload?: unknown,
  ) {
    let response: APIResponse
    const maxAttempts = Number(process.env.BMS_API_429_RETRY_ATTEMPTS || 3)

    for (let attempt = 1; ; attempt += 1) {
      await waitForApiThrottle()
      if (method === 'GET') response = await this.context.get(endpoint)
      else if (method === 'POST') {
        response = await this.context.post(endpoint, { data: payload })
      } else response = await this.context.patch(endpoint, { data: payload })

      if (response.status() !== 429 || attempt >= maxAttempts) break
      const retryDelayMs = await retryAfter429Ms(response)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }

    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(step, method, endpoint, result, payload)
    return result
  }
}

export const getNotificationSuiteEnv = (): NotificationSuiteEnv => {
  const shared = getSharedBmsEnv(
    'NOTIFICATION_EVIDENCE_DIR',
    'notification-current',
  )
  const base = normalizeBmsBaseUrl(shared.baseUrl)

  return {
    baseUrl: base.baseUrl,
    apiPrefix: base.apiPrefix,
    healthEndpoint: base.healthEndpoint,
    evidenceDir: shared.evidenceDir,
    apiKey: shared.apiKey,
    clientVersion: shared.clientVersion,
    clientOs: shared.clientOs,
    clientId: shared.clientId,
    language: shared.language,
    adminUsername: shared.adminUsername,
    adminPassword: shared.adminPassword,
    noPermissionUsername:
      process.env.NO_PERMISSION_USERNAME ||
      process.env.BMS_NO_PERMISSION_USERNAME ||
      '',
    noPermissionPassword:
      process.env.NO_PERMISSION_PASSWORD ||
      process.env.BMS_NO_PERMISSION_PASSWORD ||
      '',
    accessToken:
      process.env.NOTIFICATION_ADMIN_ACCESS_TOKEN ||
      process.env.DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN ||
      process.env.HOME_CONTROLLER_ADMIN_ACCESS_TOKEN ||
      process.env.GROUP_ADMIN_ACCESS_TOKEN ||
      process.env.BMS_ACCESS_TOKEN ||
      '',
    rootAccessToken: process.env.BMS_ROOT_ACCESS_TOKEN || '',
    testUserPassword: process.env.TEST_USER_PASSWORD || 'Auto@456',
    collectSystemLogOnFail:
      process.env.NOTIFICATION_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.NOTIFICATION_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 bms-api alert-manager-api',
    systemLogMaxChars: Number(
      process.env.NOTIFICATION_SYSTEM_LOG_MAX_CHARS || 20000,
    ),
  }
}

export const clearNotificationEvidenceDir = async (
  env: NotificationSuiteEnv,
) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const writeNotificationPrecheckEvidence = async (
  env: NotificationSuiteEnv,
  name: string,
  body: unknown,
) => {
  await mkdir(env.evidenceDir, { recursive: true })
  await writeFile(
    join(env.evidenceDir, `${name}_${Date.now()}.json`),
    JSON.stringify(body, null, 2),
  )
}

export const newNotificationSuiteApi = async (
  env: NotificationSuiteEnv,
  token?: string,
  omitApiKey = false,
): Promise<NotificationSuiteApi> => {
  const headers = commonHeaders(env, omitApiKey)
  if (token) headers.Authorization = `Bearer ${token}`

  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })

  return new NotificationSuiteApi(context, env)
}

export const loginNotificationSuiteUser = async (
  env: NotificationSuiteEnv,
  userName: string,
  password: string,
): Promise<LoginResult> => {
  const api = await newNotificationSuiteApi(env)
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
    if (!token) throw new Error(`Login response for ${userName} has no token`)

    return {
      token,
      refreshToken:
        body?.data?.refresh_token ||
        body?.data?.refreshToken ||
        body?.data?.refresh,
      userId:
        body?.data?.user?.id ||
        body?.data?.user?.user_id ||
        body?.data?.user_id ||
        body?.data?.id,
    }
  } finally {
    await api.context.dispose()
  }
}

export const notificationItems = (body: any): any[] =>
  Array.isArray(body?.data?.items)
    ? body.data.items
    : Array.isArray(body?.data)
      ? body.data
      : []

export const notificationMeta = (body: any) => ({
  total: body?.data?.meta?.total ?? body?.data?.total,
  page: body?.data?.meta?.page ?? body?.data?.page,
  limit: body?.data?.meta?.limit ?? body?.data?.limit,
  hasNext: body?.data?.meta?.has_next ?? body?.data?.has_next,
  hasPrevious: body?.data?.meta?.has_previous ?? body?.data?.has_previous,
})

export const notificationId = (item: any): string | undefined =>
  item?.id || item?.notificationId || item?.notification_id

export const notificationType = (item: any): string | undefined =>
  item?.notification_type || item?.notificationType

export const notificationIsRead = (item: any): boolean | undefined =>
  item?.is_read ?? item?.isRead

export const notificationCreatedAt = (item: any): string | undefined =>
  item?.created_at || item?.createdAt

export const prefsFromBody = (body: any): NotificationPrefs =>
  (body?.data || {}) as NotificationPrefs

export const generatedNotificationUserPayload = (
  env: NotificationSuiteEnv,
  tcId: string,
): NotificationUserPayload => {
  const token = timestampToken()
  const safeTcId = tcId.replace(/[^a-zA-Z0-9]/g, '_')
  const random = Math.random().toString(36).slice(2, 8)
  const userName = `auto_notif_${safeTcId}_${token}_${random}`
  const phoneSuffix = `${Date.now()}`.slice(-8)

  return {
    user_name: userName,
    email: `${userName}@auto-test.local`,
    password: env.testUserPassword,
    display_name: 'Auto Notification User',
    phone: `+849${phoneSuffix}`,
  }
}

export const userIdFromBody = (body: any): string | undefined =>
  body?.data?.user_id ||
  body?.data?.id ||
  body?.data?.user?.id ||
  body?.user_id ||
  body?.id

export const cleanupUser = async (
  api: NotificationSuiteApi,
  evidence: NotificationEvidence,
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
      `User ${userId} was not deleted. status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Cleanup user ${userId} failed: ${formatError(error)}`,
    )
  }
}

export const restorePrefs = async (
  api: NotificationSuiteApi,
  evidence: NotificationEvidence,
  prefs?: NotificationPrefs,
) => {
  if (!prefs) return

  try {
    const response = await api.updatePrefs({
      deviceOffline: prefs.deviceOffline,
      maintenanceAlert: prefs.maintenanceAlert,
      ruleAlert: prefs.ruleAlert,
    })
    if (response.status() === 200) {
      evidence.markPrefsRestored()
      return
    }
    evidence.addCleanupWarning(
      `Notification prefs were not restored. status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(`Restore prefs failed: ${formatError(error)}`)
  }
}

const execAsync = promisify(exec)

const collectSystemLog = async (
  env: NotificationSuiteEnv,
  error: unknown,
): Promise<SystemLogEvidence> => {
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
  env: NotificationSuiteEnv,
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

const toNotificationQuery = (query?: {
  page?: number | string
  limit?: number | string
  is_read?: boolean | string
  notification_type?: NotificationType | NotificationType[] | string
}) => {
  const params = new URLSearchParams()
  if (query?.page !== undefined) params.set('page', String(query.page))
  if (query?.limit !== undefined) params.set('limit', String(query.limit))
  if (query?.is_read !== undefined) {
    params.set('is_read', String(query.is_read))
  }

  const types = Array.isArray(query?.notification_type)
    ? query?.notification_type
    : query?.notification_type !== undefined
      ? [query.notification_type]
      : []
  for (const type of types) params.append('notification_type', String(type))

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

const emptyEvidence = () => undefined as unknown as NotificationEvidence

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
