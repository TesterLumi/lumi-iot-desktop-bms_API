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
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'

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

type LoginResult = {
  token: string
  refreshToken: string
  userId?: string
  user?: any
}

export type SettingsSuiteEnv = {
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
  testUserPassword: string
  testUserNewPassword: string
  allowFileUploads: boolean
  collectSystemLogOnFail: boolean
  systemLogCommand: string
  systemLogMaxChars: number
}

export type SettingsUserPayload = {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
  avatar?: string | null
}

export class SettingsEvidence {
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
    const env = getSettingsSuiteEnv()
    this.evidence.system_logs = await collectSystemLog(env, error)
  }

  async write(status: EvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) this.evidence.error_message = formatError(error)

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}_${Date.now()}.json`
    const body = JSON.stringify(this.evidence, null, 2)
    const evidenceDir = getSettingsSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)
    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class SettingsSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: SettingsSuiteEnv,
    private evidence?: SettingsEvidence,
  ) {}

  withEvidence(evidence: SettingsEvidence) {
    return new SettingsSuiteApi(this.context, this.env, evidence)
  }

  async login(payload: { user_name?: string; password?: string }) {
    return this.call('Login', 'POST', this.authEndpoint('login'), payload)
  }

  async me() {
    return this.call('Me', 'POST', this.authEndpoint('me'), {})
  }

  async updateUser(payload: Record<string, unknown>) {
    return this.call('Update user', 'POST', this.authEndpoint('update'), payload)
  }

  async resetPassword(payload: Record<string, unknown>) {
    return this.call(
      'Reset password',
      'POST',
      this.authEndpoint('reset_password'),
      payload,
    )
  }

  async logout(payload: Record<string, unknown>) {
    return this.call('Logout', 'POST', this.authEndpoint('logout'), payload)
  }

  async registerUser(payload: SettingsUserPayload) {
    return this.call('Register user', 'POST', this.authEndpoint('register'), payload)
  }

  async deleteUser(userId?: string) {
    return this.call('Delete user', 'POST', this.authEndpoint('delete'), {
      user_id: userId,
    })
  }

  async presignedUrl(query: Record<string, string | number>) {
    return this.call(
      'Get presigned URL',
      'GET',
      `${this.env.apiPrefix}/files/presigned-url${toQuery(query)}`,
    )
  }

  async uploadFile(
    query: Record<string, string | number>,
    file: { name: string; mimeType: string; buffer: Buffer },
    timeout?: number,
  ) {
    const endpoint = `${this.env.apiPrefix}/files/upload${toQuery(query)}`
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, {
      multipart: { file },
      timeout,
    })
    const result = await toApiCallResult(response)
    if (this.evidence) {
      await this.evidence.attachResponse('Upload file', 'POST', endpoint, result, {
        query,
        file: {
          name: file.name,
          mimeType: file.mimeType,
          size: file.buffer.length,
        },
      })
    }
    return result
  }

  async requestInvalidToken(
    method: Method,
    endpoint: string,
    payload?: Record<string, unknown>,
  ) {
    const api = await newSettingsSuiteApi(this.env, 'invalid.expired.token')
    try {
      return await api.withEvidence(this.evidence || emptyEvidence()).call(
        'Invalid token request',
        method,
        endpoint,
        payload,
      )
    } finally {
      await api.context.dispose()
    }
  }

  async requestWithoutToken(
    method: Method,
    endpoint: string,
    payload?: Record<string, unknown>,
  ) {
    const api = await newSettingsSuiteApi(this.env)
    try {
      return await api.withEvidence(this.evidence || emptyEvidence()).call(
        'No token request',
        method,
        endpoint,
        payload,
      )
    } finally {
      await api.context.dispose()
    }
  }

  private async call(
    step: string,
    method: Method,
    endpoint: string,
    data?: Record<string, unknown>,
  ) {
    await waitForApiThrottle()

    const options = data === undefined ? undefined : { data }
    const response =
      method === 'GET'
        ? await this.context.get(endpoint)
        : method === 'POST'
          ? await this.context.post(endpoint, options)
          : method === 'PUT'
            ? await this.context.put(endpoint, options)
            : await this.context.patch(endpoint, options)
    const result = await toApiCallResult(response)

    if (this.evidence) {
      await this.evidence.attachResponse(step, method, endpoint, result, data)
    }

    return result
  }

  private authEndpoint(path: string) {
    return `${this.env.apiPrefix}/auth/${path}`
  }
}

export const getSettingsSuiteEnv = (): SettingsSuiteEnv => {
  const shared = getSharedBmsEnv(
    'SETTINGS_EVIDENCE_DIR',
    'settings-current',
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
    adminAccessToken:
      process.env.SETTINGS_ADMIN_ACCESS_TOKEN ||
      process.env.ACCOUNT_ADMIN_ACCESS_TOKEN ||
      process.env.BMS_ACCESS_TOKEN ||
      '',
    rootAccessToken: process.env.BMS_ROOT_ACCESS_TOKEN || '',
    testUserPassword: process.env.TEST_USER_PASSWORD || 'Auto@456',
    testUserNewPassword: process.env.TEST_USER_NEW_PASSWORD || 'NewPass@123',
    allowFileUploads: process.env.SETTINGS_ALLOW_FILE_UPLOADS === 'true',
    collectSystemLogOnFail:
      process.env.SETTINGS_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.SETTINGS_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 bms-api',
    systemLogMaxChars: Number(
      process.env.SETTINGS_SYSTEM_LOG_MAX_CHARS || 20000,
    ),
  }
}

export const clearSettingsEvidenceDir = async (env: SettingsSuiteEnv) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const newSettingsSuiteApi = async (
  env: SettingsSuiteEnv,
  token?: string,
  omitApiKey = false,
) => {
  const headers: Record<string, string> = {
    'x-client-version': env.clientVersion,
    'x-client-os': env.clientOs,
    'x-client-id': env.clientId,
    'accept-language': env.language,
  }
  if (env.apiKey && !omitApiKey) headers['x-client-api-key'] = env.apiKey
  if (token) headers.Authorization = `Bearer ${token}`

  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })

  return new SettingsSuiteApi(context, env)
}

export const loginSettingsUser = async (
  env: SettingsSuiteEnv,
  userName: string,
  password: string,
): Promise<LoginResult> => {
  const api = await newSettingsSuiteApi(env)
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

export const generateSettingsUserPayload = (
  env: SettingsSuiteEnv,
  tcId: string,
  overrides?: Partial<SettingsUserPayload>,
): SettingsUserPayload => {
  const stamp = timestampToken()
  const random = Math.random().toString(36).slice(2, 8)
  const safeTcId = tcId.replace(/[^a-zA-Z0-9]/g, '_')
  const userName = `auto_settings_${safeTcId}_${stamp}_${random}`
  const phoneSuffix = `${Date.now()}`.slice(-8)

  return {
    user_name: userName,
    email: `${userName}@auto-test.local`,
    password: env.testUserPassword,
    display_name: 'Auto Settings User',
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

export const userFromBody = (body: any): any =>
  body?.data?.user || body?.data || body?.user || {}

export const cleanupSettingsUser = async (
  api: SettingsSuiteApi,
  evidence: SettingsEvidence,
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

export const tinyPng = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )

export const largePngLikeBuffer = (bytes: number) =>
  Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(bytes)])

const execAsync = promisify(exec)

const collectSystemLog = async (
  env: SettingsSuiteEnv,
  error: unknown,
) => {
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

const toQuery = (query?: Record<string, string | number>) => {
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

  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
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

const emptyEvidence = () => undefined as unknown as SettingsEvidence

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
