import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  request,
} from '@playwright/test'
import { exec } from 'child_process'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { Client } from 'ssh2'
import { getSharedBmsEnv, normalizeBmsBaseUrl } from './env'

export type HcEvidenceStatus = 'PASSED' | 'FAILED' | 'SKIPPED'

export type HcStepEvidence = {
  step: string
  method?: string
  endpoint?: string
  status?: number
  request?: unknown
  response?: unknown
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

type HcEvidenceFile = {
  tc_id: string
  tc_name: string
  status: HcEvidenceStatus
  started_at: string
  finished_at?: string
  base_url: string
  steps: HcStepEvidence[]
  assertions: string[]
  cleanup: {
    hc_deleted: number
    ble_gateways_deleted: number
    warnings: string[]
  }
  system_logs?: unknown
  hc_logs: HcLogEvidence[]
  error_message?: string
}

export type HcSuiteEnv = {
  baseUrl: string
  apiPrefix: string
  healthEndpoint: string
  evidenceDir: string
  runDir: string
  runId: string
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
  adminAccessToken: string
  viewerAccessToken: string
  noPermissionAccessToken: string
  requireAuth: boolean
  testHcId: string
  testHcMac: string
  testHcType: string
  testHcVersion: string
  testAreaId: string
  iotLogUploadApiKey: string
  iotLogObjectKey: string
  collectSystemLogOnFail: boolean
  systemLogCommand: string
  systemLogMaxChars: number
  hcSshHost: string
  hcSshUser: string
  hcSshPassword: string
  hcSshKeyPath: string
  hcSshKeyPassphrase: string
  hcLogPath: string
  hcLogTailLines: number
  hcLogMaxChars: number
  hcSshReadyTimeoutMs: number
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export type HcCreatePayload = {
  mac?: string
  name?: string | null
  hc_type?: string | null
  version?: string | null
  ip?: string | null
  device_time?: number | null
  time_zone?: string | null
  network_interface?: string | null
  network_mode?: number | null
  notes?: string | null
  [key: string]: unknown
}

export const getHomeControllerSuiteEnv = (): HcSuiteEnv => {
  const shared = getSharedBmsEnv(
    'HOME_CONTROLLER_EVIDENCE_DIR',
    'home-controller-management-current',
  )
  const rawBaseUrl =
    process.env.HOME_CONTROLLER_BASE_URL ||
    process.env.BASE_URL ||
    process.env.BMS_API_ENDPOINT ||
    process.env.GROUP_BASE_URL ||
    shared.baseUrl
  const base = normalizeBmsBaseUrl(rawBaseUrl)
  const runDir =
    process.env.HOME_CONTROLLER_RUN_DIR ||
    join(process.cwd(), 'test-runs', 'home-controller-management-current')

  return {
    baseUrl: base.baseUrl,
    apiPrefix: base.apiPrefix,
    healthEndpoint: base.healthEndpoint,
    evidenceDir:
      process.env.HOME_CONTROLLER_EVIDENCE_DIR || join(runDir, 'evidence'),
    runDir,
    runId: process.env.HOME_CONTROLLER_RUN_ID || `manual-${Date.now()}`,
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
    adminAccessToken:
      process.env.HOME_CONTROLLER_ADMIN_ACCESS_TOKEN ||
      process.env.GROUP_ADMIN_ACCESS_TOKEN ||
      process.env.BMS_ACCESS_TOKEN ||
      process.env.BMS_ROOT_ACCESS_TOKEN ||
      '',
    viewerAccessToken:
      process.env.HOME_CONTROLLER_VIEWER_ACCESS_TOKEN ||
      process.env.GROUP_VIEWER_ACCESS_TOKEN ||
      process.env.BMS_VIEWER_ACCESS_TOKEN ||
      '',
    noPermissionAccessToken:
      process.env.HOME_CONTROLLER_NO_PERMISSION_ACCESS_TOKEN ||
      process.env.GROUP_NO_PERMISSION_ACCESS_TOKEN ||
      process.env.BMS_NO_PERMISSION_ACCESS_TOKEN ||
      '',
    requireAuth:
      process.env.HOME_CONTROLLER_REQUIRE_AUTH === 'true' ||
      process.env.GROUP_REQUIRE_AUTH === 'true',
    testHcId: process.env.TEST_HC_ID || '',
    testHcMac: process.env.TEST_HC_MAC || '',
    testHcType: process.env.TEST_HC_TYPE || 'mt7688',
    testHcVersion: process.env.TEST_HC_VERSION || '1.0.0',
    testAreaId: process.env.TEST_AREA_ID || '',
    iotLogUploadApiKey: process.env.IOT_HC_LOG_UPLOAD_API_KEY || '',
    iotLogObjectKey:
      process.env.IOT_LOG_OBJECT_KEY ||
      `automation/${process.env.TEST_HC_MAC || 'unknown'}/logs/test.tar.gz`,
    collectSystemLogOnFail:
      process.env.HOME_CONTROLLER_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.HOME_CONTROLLER_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 iot-console bms-api',
    systemLogMaxChars: Number(
      process.env.HOME_CONTROLLER_SYSTEM_LOG_MAX_CHARS || '30000',
    ),
    hcSshHost: process.env.HC_SSH_HOST || '',
    hcSshUser: process.env.HC_SSH_USER || 'root',
    hcSshPassword: process.env.HC_SSH_PASSWORD || '',
    hcSshKeyPath: process.env.HC_SSH_KEY_PATH || '',
    hcSshKeyPassphrase:
      process.env.HC_SSH_KEY_PASSPHRASE || process.env.HC_SSH_PASSWORD || '',
    hcLogPath: process.env.HC_LOG_PATH || '/tmp/log/home-controller.log',
    hcLogTailLines: Number(process.env.HC_LOG_TAIL_LINES || '300'),
    hcLogMaxChars: Number(process.env.HC_LOG_MAX_CHARS || '60000'),
    hcSshReadyTimeoutMs: Number(process.env.HC_SSH_READY_TIMEOUT_MS || '15000'),
  }
}

export class HomeControllerEvidence {
  private evidence: HcEvidenceFile

  constructor(
    private testInfo: TestInfo,
    tcId: string,
    tcName: string,
    private env: HcSuiteEnv,
  ) {
    this.evidence = {
      tc_id: tcId,
      tc_name: tcName,
      status: 'FAILED',
      started_at: new Date().toISOString(),
      base_url: env.baseUrl,
      steps: [],
      assertions: [],
      cleanup: {
        hc_deleted: 0,
        ble_gateways_deleted: 0,
        warnings: [],
      },
      hc_logs: [],
    }
  }

  get startedAt() {
    return this.evidence.started_at
  }

  addAssertion(assertion: string) {
    this.evidence.assertions.push(assertion)
  }

  addCleanupWarning(warning: string) {
    this.evidence.cleanup.warnings.push(warning)
  }

  markHcDeleted() {
    this.evidence.cleanup.hc_deleted += 1
  }

  markBleGatewayDeleted() {
    this.evidence.cleanup.ble_gateways_deleted += 1
  }

  attachStep(step: HcStepEvidence) {
    this.evidence.steps.push(redactSecrets(step) as HcStepEvidence)
  }

  attachHcLog(log: HcLogEvidence) {
    this.evidence.hc_logs.push(log)
  }

  async collectFailureLogs(error: unknown) {
    this.evidence.system_logs = await collectSystemLog(this.env, error)
    await collectHcLog(this, this.env, this.startedAt, new Date().toISOString())
  }

  async write(status: HcEvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) this.evidence.error_message = formatError(error)

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}_${Date.now()}.json`
    const body = JSON.stringify(redactSecrets(this.evidence), null, 2)
    await mkdir(this.env.evidenceDir, { recursive: true })
    await writeFile(join(this.env.evidenceDir, fileName), body, 'utf8')
    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class HomeControllerSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: HcSuiteEnv,
    private evidence?: HomeControllerEvidence,
  ) {}

  withEvidence(evidence: HomeControllerEvidence) {
    return new HomeControllerSuiteApi(this.context, this.env, evidence)
  }

  async healthCheck() {
    return this.call('Health check', 'GET', this.env.healthEndpoint)
  }

  async login(payload: { user_name?: string; password?: string }) {
    return this.call(
      'Login',
      'POST',
      `${this.env.apiPrefix}/auth/login`,
      payload,
    )
  }

  async logout(refreshToken: string) {
    return this.call('Logout', 'POST', `${this.env.apiPrefix}/auth/logout`, {
      refresh_token: refreshToken,
    })
  }

  async listHomeControllers(query?: Record<string, string | number | boolean>) {
    return this.call(
      'List home controllers',
      'GET',
      `${this.env.apiPrefix}/home-controllers${toQuery(query)}`,
    )
  }

  async getHomeController(hcId: string) {
    return this.call(
      'Get home controller',
      'GET',
      `${this.env.apiPrefix}/home-controllers/${hcId}`,
    )
  }

  async getConnectionEvents(
    hcId: string,
    query?: Record<string, string | number | boolean>,
  ) {
    return this.call(
      'Get connection events',
      'GET',
      `${this.env.apiPrefix}/home-controllers/${hcId}/connection-events${toQuery(query)}`,
    )
  }

  async createHomeController(payload: HcCreatePayload) {
    return this.call(
      'Create home controller',
      'POST',
      `${this.env.apiPrefix}/home-controllers`,
      payload,
    )
  }

  async updateHomeController(hcId: string, payload: Record<string, unknown>) {
    return this.call(
      'Update home controller',
      'PATCH',
      `${this.env.apiPrefix}/home-controllers/${hcId}`,
      payload,
    )
  }

  async deleteHomeController(hcId: string) {
    return this.call(
      'Delete home controller',
      'DELETE',
      `${this.env.apiPrefix}/home-controllers/${hcId}`,
    )
  }

  async deleteBatchHomeControllers(hcIds: string[]) {
    return this.call(
      'Delete batch home controllers',
      'POST',
      `${this.env.apiPrefix}/home-controllers/delete-batch`,
      { hc_ids: hcIds },
    )
  }

  async createArea(payload: Record<string, unknown>) {
    return this.call('Create area', 'POST', `${this.env.apiPrefix}/areas`, payload)
  }

  async deleteArea(areaId: string) {
    return this.call(
      'Delete area',
      'DELETE',
      `${this.env.apiPrefix}/areas/${areaId}`,
    )
  }

  async assignHomeControllersToArea(areaId: string, hcIds: string[]) {
    return this.call(
      'Assign home controllers to area',
      'POST',
      `${this.env.apiPrefix}/areas/${areaId}/home-controllers`,
      { hc_ids: hcIds },
    )
  }

  async unassignHomeControllersFromArea(areaId: string, hcIds: string[]) {
    return this.call(
      'Unassign home controllers from area',
      'DELETE',
      `${this.env.apiPrefix}/areas/${areaId}/home-controllers`,
      { hc_ids: hcIds },
    )
  }

  async iotListHomeControllers(
    query?: Record<string, string | number | boolean>,
  ) {
    return this.call(
      'IoT list home controllers',
      'GET',
      `${this.env.apiPrefix}/iot/home-controllers${toQuery(query)}`,
    )
  }

  async iotGetHomeController(hcId: string) {
    return this.call(
      'IoT get home controller',
      'GET',
      `${this.env.apiPrefix}/iot/home-controllers/${hcId}`,
    )
  }

  async syncTime(mac: string) {
    return this.call(
      'Sync time',
      'GET',
      `${this.env.apiPrefix}/iot/home-controllers/${encodeURIComponent(mac)}/sync-time`,
    )
  }

  async getLinkUpload(mac: string, objectKey: string, apiKey?: string) {
    return this.call(
      'Get link upload',
      'GET',
      `${this.env.apiPrefix}/iot/home-controllers/${encodeURIComponent(mac)}/get-link-upload${toQuery({ object_key: objectKey })}`,
      undefined,
      apiKey ? { 'x-api-key': apiKey } : undefined,
    )
  }

  async getLinkUploadWithHeaders(
    mac: string,
    objectKey: string,
    headers: Record<string, string>,
  ) {
    return this.call(
      'Get link upload with custom headers',
      'GET',
      `${this.env.apiPrefix}/iot/home-controllers/${encodeURIComponent(mac)}/get-link-upload${toQuery({ object_key: objectKey })}`,
      undefined,
      headers,
    )
  }

  async updateVersionInfo(mac: string, payload: Record<string, unknown>) {
    return this.call(
      'Update version info',
      'PATCH',
      `${this.env.apiPrefix}/iot/home-controllers/${encodeURIComponent(mac)}/version-info`,
      payload,
    )
  }

  async listBleGateways(query?: Record<string, string | number | boolean>) {
    return this.call(
      'List BLE gateways',
      'GET',
      `${this.env.apiPrefix}/iot/ble-gateways${toQuery(query)}`,
    )
  }

  async getBleGateway(hcId: string) {
    return this.call(
      'Get BLE gateway',
      'GET',
      `${this.env.apiPrefix}/iot/ble-gateways/${hcId}`,
    )
  }

  async createBleGateway(payload: Record<string, unknown>) {
    return this.call(
      'Create BLE gateway',
      'POST',
      `${this.env.apiPrefix}/iot/ble-gateways`,
      payload,
    )
  }

  async updateBleGateway(hcId: string, payload: Record<string, unknown>) {
    return this.call(
      'Update BLE gateway',
      'PATCH',
      `${this.env.apiPrefix}/iot/ble-gateways/${hcId}`,
      payload,
    )
  }

  async deleteBleGateway(hcId: string) {
    return this.call(
      'Delete BLE gateway',
      'DELETE',
      `${this.env.apiPrefix}/iot/ble-gateways/${hcId}`,
    )
  }

  async requestInvalidToken(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    payload?: unknown,
  ) {
    const api = await newHomeControllerSuiteApi(this.env, 'invalid_token')
    try {
      const result = await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Invalid token request', method, endpoint, payload)
      return result
    } finally {
      await api.context.dispose()
    }
  }

  private async call(
    step: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ) {
    await waitForApiThrottle()
    const response =
      method === 'GET'
        ? await this.context.get(endpoint, { headers })
        : method === 'POST'
          ? await this.context.post(endpoint, { data: payload, headers })
          : method === 'PATCH'
            ? await this.context.patch(endpoint, { data: payload, headers })
            : await this.context.delete(endpoint, { data: payload, headers })
    const result = await toApiCallResult(response)
    this.evidence?.attachStep({
      step,
      method,
      endpoint,
      status: result.status(),
      request: payload,
      response: result.body,
    })
    return result
  }
}

export const clearHomeControllerEvidenceDir = async (env: HcSuiteEnv) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const writeHomeControllerPrecheckEvidence = async (
  env: HcSuiteEnv,
  name: string,
  body: unknown,
) => {
  await mkdir(env.evidenceDir, { recursive: true })
  await writeFile(
    join(env.evidenceDir, `${name}_${Date.now()}.json`),
    JSON.stringify(redactSecrets(body), null, 2),
    'utf8',
  )
}

export const newHomeControllerSuiteApi = async (
  env: HcSuiteEnv,
  token?: string,
  omitApiKey = false,
) => {
  const headers = commonHeaders(env, omitApiKey)
  if (token) headers.Authorization = `Bearer ${token}`
  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })
  return new HomeControllerSuiteApi(context, env)
}

export const loginHomeControllerSuiteUser = async (
  env: HcSuiteEnv,
  userName: string,
  password: string,
) => {
  const api = await newHomeControllerSuiteApi(env)
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
      body?.data?.refresh ||
      ''
    if (!token) throw new Error(`Login response for ${userName} has no token`)
    return {
      token,
      refreshToken,
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

export const generateUniqueHcMac = (tcId: string) => {
  const clean = tcId.replace(/[^0-9A-Fa-f]/g, '').padEnd(2, '0').slice(0, 2)
  const n = Date.now().toString(16).toUpperCase().slice(-8).padStart(8, '0')
  const random = Math.floor(Math.random() * 256)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')
  return `AA:BB:${clean}:${n.slice(0, 2)}:${n.slice(2, 4)}:${random}`
}

export const generateHomeControllerPayload = (
  env: HcSuiteEnv,
  tcId: string,
  overrides: HcCreatePayload = {},
): HcCreatePayload => {
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  return {
    mac: generateUniqueHcMac(tcId),
    name: `auto_hc_${tcId}_${token}`,
    hc_type: env.testHcType,
    version: env.testHcVersion,
    ip: '10.8.0.10',
    notes: `auto_notes_${tcId}_${token}`,
    ...overrides,
  }
}

export const cleanupHomeController = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  hcId?: string,
) => {
  if (!hcId) return
  try {
    const response = await api.deleteHomeController(hcId)
    if ([200, 404].includes(response.status())) {
      evidence.markHcDeleted()
      return
    }
    evidence.addCleanupWarning(
      `HC ${hcId} cleanup returned status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `HC ${hcId} cleanup failed: ${formatError(error)}`,
    )
  }
}

export const cleanupBleGateway = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  hcId?: string,
) => {
  if (!hcId) return
  try {
    const response = await api.deleteBleGateway(hcId)
    if ([200, 204, 404].includes(response.status())) {
      evidence.markBleGatewayDeleted()
      return
    }
    evidence.addCleanupWarning(
      `BLE gateway ${hcId} cleanup returned status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `BLE gateway ${hcId} cleanup failed: ${formatError(error)}`,
    )
  }
}

export const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lower = key.toLowerCase()
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('authorization') ||
        lower.includes('api_key') ||
        lower.includes('apikey')
      ) {
        return [key, maskSecret(String(item || ''))]
      }

      return [key, redactSecrets(item)]
    }),
  )
}

export const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

export const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const execAsync = promisify(exec)

const collectSystemLog = async (env: HcSuiteEnv, error: unknown) => {
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

const collectHcLog = async (
  evidence: HomeControllerEvidence,
  env: HcSuiteEnv,
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
  env: HcSuiteEnv,
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
        if (settled) return
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

const buildSshAuth = async (env: HcSuiteEnv) => {
  if (env.hcSshKeyPath) {
    return {
      privateKey: await readFile(env.hcSshKeyPath),
      passphrase: env.hcSshKeyPassphrase || undefined,
    }
  }
  return { password: env.hcSshPassword }
}

const commonHeaders = (
  env: HcSuiteEnv,
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

const toQuery = (query?: Record<string, string | number | boolean>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params.toString() ? `?${params}` : ''
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

const emptyEvidence = () => undefined as unknown as HomeControllerEvidence

const maskSecret = (value: string) =>
  value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`

const truncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : value.slice(-maxChars)
