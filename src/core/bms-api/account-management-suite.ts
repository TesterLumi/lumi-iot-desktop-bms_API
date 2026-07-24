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

type StepEvidence = {
  step: string
  method?: string
  endpoint?: string
  status?: number
  request?: unknown
  response?: unknown
}

type CleanupEvidence = {
  users_deleted: number
  sessions_deleted: number
  warnings: string[]
}

type SystemLogEvidence = {
  collected: boolean
  command?: string
  stdout?: string
  stderr?: string
  reason?: string
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
  cleanup: CleanupEvidence
  system_logs?: SystemLogEvidence
  error_message?: string
}

type LoginResult = {
  token: string
  refreshToken: string
  userId?: string
  user?: any
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export type AccountUserPayload = {
  user_name?: string
  email?: string
  password?: string
  display_name?: string
  phone?: string
  avatar?: string | null
}

export type GeneratedAccountUserPayload = AccountUserPayload & {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
}

export type AccountSuiteEnv = {
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
  viewerUsername: string
  viewerPassword: string
  noPermissionUsername: string
  noPermissionPassword: string
  testUserPassword: string
  testUserNewPassword: string
  systemAdminUserId: string
  rootUserId: string
  collectSystemLogOnFail: boolean
  systemLogCommand: string
  systemLogMaxChars: number
}

export class AccountEvidence {
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
        users_deleted: 0,
        sessions_deleted: 0,
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

  markUserDeleted() {
    this.evidence.cleanup.users_deleted += 1
  }

  markSessionDeleted() {
    this.evidence.cleanup.sessions_deleted += 1
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
    const env = getAccountSuiteEnv()
    this.evidence.system_logs = await collectSystemLog(env, error)
  }

  async write(status: EvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) {
      this.evidence.error_message = formatError(error)
    }

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}_${Date.now()}.json`
    const body = JSON.stringify(this.evidence, null, 2)
    const evidenceDir = getAccountSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)
    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class AccountSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: AccountSuiteEnv,
    private evidence?: AccountEvidence,
  ) {}

  withEvidence(evidence: AccountEvidence) {
    return new AccountSuiteApi(this.context, this.env, evidence)
  }

  async healthCheck() {
    return this.call('Health check', 'GET', this.env.healthEndpoint)
  }

  async login(payload: { user_name?: string; password?: string }) {
    return this.call('Login', 'POST', this.authEndpoint('login'), payload)
  }

  async refreshToken(refreshToken?: string, rotate = true) {
    return this.call('Refresh token', 'POST', this.authEndpoint('refresh'), {
      refresh_token: refreshToken,
      rotate,
    })
  }

  async logout(token: string, refreshToken: string) {
    const api = await newAccountSuiteApi(this.env, token)
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

  async forgotPassword() {
    return this.call(
      'Forgot password',
      'GET',
      this.authEndpoint('forgot-password'),
    )
  }

  async me() {
    return this.call('Me', 'POST', this.authEndpoint('me'), {})
  }

  async registerUser(payload: AccountUserPayload) {
    return this.call('Register user', 'POST', this.authEndpoint('register'), {
      ...payload,
    })
  }

  async listUsers(query?: Record<string, string | number | boolean>) {
    return this.call(
      'List users',
      'GET',
      this.authEndpoint(`list${toQuery(query)}`),
    )
  }

  async updateUser(payload: Record<string, unknown>) {
    return this.call(
      'Update user',
      'POST',
      this.authEndpoint('update'),
      payload,
    )
  }

  async updateUserStatus(payload: Record<string, unknown>) {
    return this.call(
      'Update user status',
      'POST',
      this.authEndpoint('status'),
      payload,
    )
  }

  async resetPassword(payload: Record<string, unknown>) {
    return this.call(
      'Reset password',
      'POST',
      this.authEndpoint('reset_password'),
      payload,
    )
  }

  async deleteUser(userId?: string) {
    return this.call('Delete user', 'POST', this.authEndpoint('delete'), {
      user_id: userId,
    })
  }

  async deleteUserRaw(payload: Record<string, unknown>) {
    return this.call(
      'Delete user',
      'POST',
      this.authEndpoint('delete'),
      payload,
    )
  }

  async listMySessions(query?: Record<string, string | number>) {
    return this.call(
      'List my sessions',
      'GET',
      this.authEndpoint(`sessions${toQuery(query)}`),
    )
  }

  async listUserSessions(
    userId: string,
    query?: Record<string, string | number>,
  ) {
    return this.call(
      'List user sessions',
      'GET',
      this.authEndpoint(`${userId}/sessions${toQuery(query)}`),
    )
  }

  async deleteSession(sessionId: string) {
    return this.call(
      'Delete session',
      'DELETE',
      this.authEndpoint(`sessions/${sessionId}`),
    )
  }

  async deleteAllUserSessions(userId: string) {
    return this.call(
      'Delete all user sessions',
      'DELETE',
      this.authEndpoint(`${userId}/sessions`),
    )
  }

  async requestInvalidToken(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    payload?: unknown,
  ) {
    const api = await newAccountSuiteApi(this.env, 'invalid_token')
    try {
      return await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Invalid token request', method, endpoint, payload)
    } finally {
      await api.context.dispose()
    }
  }

  authEndpoint(path: string) {
    return `${this.env.apiPrefix}/auth/${path}`
  }

  private async call(
    step: string,
    method: 'GET' | 'POST' | 'DELETE',
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
            : await this.context.delete(endpoint, { data: payload })

      if (response.status() !== 429 || attempt >= maxAttempts) break

      const retryDelayMs = await retryAfter429Ms(response)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }

    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(step, method, endpoint, result, payload)
    return result
  }
}

export const getAccountSuiteEnv = (): AccountSuiteEnv => {
  const shared = getSharedBmsEnv(
    'ACCOUNT_EVIDENCE_DIR',
    'account-management-current',
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
    viewerUsername:
      process.env.VIEWER_USERNAME || process.env.BMS_VIEWER_USERNAME || '',
    viewerPassword:
      process.env.VIEWER_PASSWORD || process.env.BMS_VIEWER_PASSWORD || '',
    noPermissionUsername:
      process.env.NO_PERMISSION_USERNAME ||
      process.env.BMS_NO_PERMISSION_USERNAME ||
      '',
    noPermissionPassword:
      process.env.NO_PERMISSION_PASSWORD ||
      process.env.BMS_NO_PERMISSION_PASSWORD ||
      '',
    testUserPassword: process.env.TEST_USER_PASSWORD || 'Auto@456',
    testUserNewPassword: process.env.TEST_USER_NEW_PASSWORD || 'NewPass@123',
    systemAdminUserId:
      process.env.SYSTEM_ADMIN_USER_ID ||
      process.env.BMS_SYS_ADMIN_USER_ID ||
      '',
    rootUserId: process.env.ROOT_USER_ID || process.env.BMS_ROOT_USER_ID || '',
    collectSystemLogOnFail:
      process.env.ACCOUNT_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.ACCOUNT_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 bms-api',
    systemLogMaxChars: Number(
      process.env.ACCOUNT_SYSTEM_LOG_MAX_CHARS || 20000,
    ),
  }
}

export const clearAccountEvidenceDir = async (env: AccountSuiteEnv) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const writePrecheckEvidence = async (
  env: AccountSuiteEnv,
  name: string,
  body: unknown,
) => {
  await mkdir(env.evidenceDir, { recursive: true })
  await writeFile(
    join(env.evidenceDir, `${name}_${Date.now()}.json`),
    JSON.stringify(body, null, 2),
  )
}

export const newAccountSuiteApi = async (
  env: AccountSuiteEnv,
  token?: string,
  omitApiKey = false,
): Promise<AccountSuiteApi> => {
  const headers = commonHeaders(env, omitApiKey)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })

  return new AccountSuiteApi(context, env)
}

export const loginAccountSuiteUser = async (
  env: AccountSuiteEnv,
  userName: string,
  password: string,
): Promise<LoginResult> => {
  const api = await newAccountSuiteApi(env)
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
    if (!refreshToken) {
      throw new Error(`Login response for ${userName} has no refresh token`)
    }

    return {
      token,
      refreshToken,
      user: body?.data?.user,
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

export const generateAccountUserPayload = (
  env: AccountSuiteEnv,
  tcId: string,
  overrides?: AccountUserPayload,
): GeneratedAccountUserPayload => {
  const timestamp = timestampToken()
  const random = Math.random().toString(36).slice(2, 8)
  const safeTcId = tcId.replace(/[^a-zA-Z0-9]/g, '_')
  const userName = `auto_user_${safeTcId}_${timestamp}_${random}`
  const phoneSuffix = `${Date.now()}`.slice(-8)

  return {
    user_name: userName,
    email: `${userName}@auto-test.local`,
    password: env.testUserPassword,
    display_name: 'Auto User Role',
    phone: `+849${phoneSuffix}`,
    ...overrides,
  }
}

export const userIdFromBody = (body: any): string | undefined =>
  body?.data?.user_id ||
  body?.data?.id ||
  body?.data?.user?.id ||
  body?.user_id ||
  body?.id

export const listItems = (body: any): any[] =>
  Array.isArray(body?.data?.items)
    ? body.data.items
    : Array.isArray(body?.data)
      ? body.data
      : []

export const findSessionId = (body: any): string | undefined => {
  const items = listItems(body)
  return items[0]?.id || items[0]?.session_id || body?.data?.id
}

export const cleanupUser = async (
  api: AccountSuiteApi,
  evidence: AccountEvidence,
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

export const verifyUserFoundBySearch = async (
  api: AccountSuiteApi,
  userId: string,
  search: string,
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await api.listUsers({ search, page: 1, limit: 20 })
    const body = await response.json()
    const found = listItems(body).some(
      (item) => item.id === userId || item.user_id === userId,
    )
    if (found) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return false
}

export const fakeUserId = '00000000-0000-4000-8000-000000000001'

const execAsync = promisify(exec)

const collectSystemLog = async (
  env: AccountSuiteEnv,
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
  env: AccountSuiteEnv,
  omitApiKey = false,
): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-client-version': env.clientVersion,
    'x-client-os': env.clientOs,
    'x-client-id': env.clientId,
    'accept-language': env.language,
  }

  if (env.apiKey && !omitApiKey) {
    headers['x-client-api-key'] = env.apiKey
  }

  return headers
}

const toQuery = (query?: Record<string, string | number | boolean>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    params.set(key, String(value))
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

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
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

const emptyEvidence = () => undefined as unknown as AccountEvidence

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
  value.length <= maxChars ? value : `${value.slice(-maxChars)}`

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
