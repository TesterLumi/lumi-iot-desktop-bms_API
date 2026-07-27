# Home Controller Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact real-system Playwright API suite for Home Controller Management with fresh evidence, cleanup, and failure logs.

**Architecture:** Use the existing compact BMS suite pattern from account/role management: one reusable suite helper and one executable spec. The helper owns env loading, API calls, evidence, cleanup, log capture, and data generation; the spec owns ordered TC definitions and assertions. Destructive flows for delete-batch, network-config, reset-factory, and reset callback are excluded.

**Tech Stack:** Playwright Test, TypeScript, `ssh2`, Node fs/path APIs, existing BMS env helpers.

---

## File Structure

- Create `src/core/bms-api/home-controller-management-suite.ts`
  - Env loader, evidence writer, API wrapper, data generation, cleanup helpers, SSH HC log collector.
- Create `tests/api/bms/home-controller-management/home-controller-management.api.spec.ts`
  - Ordered API-only testcase list and assertions.
- Create `tests/api/bms/home-controller-management/README.md`
  - Run commands, env variables, safety notes, evidence paths.
- Modify `.env.template`
  - Add only HC management env examples and log options.

No mini-repo, no UI tests, no broad refactor.

## Task 1: Suite Helper Skeleton And Evidence

**Files:**
- Create: `src/core/bms-api/home-controller-management-suite.ts`

- [ ] **Step 1: Create env, evidence types, redaction, run directory reset**

Add the file with:

```ts
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

export const getHomeControllerSuiteEnv = (): HcSuiteEnv => {
  const shared = getSharedBmsEnv(
    'HOME_CONTROLLER_EVIDENCE_DIR',
    'home-controller-management-current',
  )
  const base = normalizeBmsBaseUrl(shared.baseUrl)
  const runDir =
    process.env.HOME_CONTROLLER_RUN_DIR ||
    join(process.cwd(), 'test-runs', 'home-controller-management-current')

  return {
    baseUrl: base.baseUrl,
    apiPrefix: base.apiPrefix,
    healthEndpoint: base.healthEndpoint,
    evidenceDir:
      process.env.HOME_CONTROLLER_EVIDENCE_DIR ||
      join(runDir, 'evidence'),
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

export const clearHomeControllerEvidenceDir = async (env: HcSuiteEnv) => {
  await rm(env.runDir, { recursive: true, force: true })
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
```

- [ ] **Step 2: Add evidence class**

Append:

```ts
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
```

- [ ] **Step 3: Add utility functions and run typecheck**

Append:

```ts
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

const maskSecret = (value: string) =>
  value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`

const truncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : value.slice(-maxChars)
```

Run: `npx.cmd tsc --noEmit`
Expected: if existing repo has type issues, record them; otherwise exit 0.

- [ ] **Step 4: Commit helper skeleton**

Run:

```powershell
git add src\core\bms-api\home-controller-management-suite.ts
git commit -m "feat: add home controller management suite helper"
```

## Task 2: API Client, Login, Cleanup, Logs

**Files:**
- Modify: `src/core/bms-api/home-controller-management-suite.ts`

- [ ] **Step 1: Add API result and request context helpers**

Add after evidence class:

```ts
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
```

- [ ] **Step 2: Add API class methods**

Append:

```ts
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
    return this.call('Login', 'POST', `${this.env.apiPrefix}/auth/login`, payload)
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

  async iotListHomeControllers(query?: Record<string, string | number | boolean>) {
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

  async requestInvalidToken(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', endpoint: string, payload?: unknown) {
    const api = await newHomeControllerSuiteApi(this.env, 'invalid_token')
    try {
      return api.withEvidence(this.evidence || emptyEvidence()).call('Invalid token request', method, endpoint, payload)
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
    const options = {
      data: payload,
      headers,
    }
    const response =
      method === 'GET'
        ? await this.context.get(endpoint, { headers })
        : method === 'POST'
          ? await this.context.post(endpoint, options)
          : method === 'PATCH'
            ? await this.context.patch(endpoint, options)
            : await this.context.delete(endpoint, options)
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
```

- [ ] **Step 3: Add login, data, cleanup helpers**

Append:

```ts
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
  return `AA:BB:${clean}:${n.slice(0, 2)}:${n.slice(2, 4)}:${n.slice(4, 6)}`
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
    evidence.addCleanupWarning(`HC ${hcId} cleanup failed: ${formatError(error)}`)
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
    evidence.addCleanupWarning(`BLE gateway ${hcId} cleanup failed: ${formatError(error)}`)
  }
}
```

- [ ] **Step 4: Add system and HC SSH log helpers**

Append:

```ts
const execAsync = promisify(exec)

const collectSystemLog = async (env: HcSuiteEnv, error: unknown) => {
  if (!env.collectSystemLogOnFail) {
    return { collected: false, reason: `Disabled. Test error: ${formatError(error)}` }
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
    evidence.attachHcLog({ step: 'Home Controller log on failure', method: 'SSH', status: 'skipped', reason: 'HC_SSH_HOST is not configured' })
    return
  }
  if (!env.hcSshPassword && !env.hcSshKeyPath) {
    evidence.attachHcLog({ step: 'Home Controller log on failure', method: 'SSH', status: 'skipped', reason: 'HC_SSH_PASSWORD or HC_SSH_KEY_PATH is not configured' })
    return
  }
  const start = formatHcLogTime(startedAt)
  const end = formatHcLogTime(finishedAt)
  const awk = `$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2} / { ts=substr($0,1,19); if (ts >= "${start}" && ts <= "${end}") print }`
  const command = ['awk', quoteShellArg(awk), quoteShellArg(env.hcLogPath), '|', 'tail', '-n', String(env.hcLogTailLines)].join(' ')
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
      const finish = (result: { exitCode: number; stdout: string; stderr: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        client.end()
        resolve(result)
      }
      const timer = setTimeout(() => {
        finish({ exitCode: 124, stdout, stderr: `${stderr}\nSSH command timed out after ${timeoutMs}ms`.trim() })
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
```

- [ ] **Step 5: Add response/query/time helpers and run typecheck**

Append:

```ts
const toApiCallResult = async (response: APIResponse): Promise<ApiCallResult> => {
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
```

Run: `npx.cmd tsc --noEmit`
Expected: helper compiles, or existing unrelated type errors are recorded.

- [ ] **Step 6: Commit API helper**

Run:

```powershell
git add src\core\bms-api\home-controller-management-suite.ts
git commit -m "feat: add home controller management api client"
```

## Task 3: Spec With Core HC Cases

**Files:**
- Create: `tests/api/bms/home-controller-management/home-controller-management.api.spec.ts`

- [ ] **Step 1: Create spec imports, state, helpers**

Create the spec with:

```ts
import { expect, test, TestInfo } from '@playwright/test'
import {
  HomeControllerEvidence,
  HomeControllerSuiteApi,
  cleanupBleGateway,
  cleanupHomeController,
  clearHomeControllerEvidenceDir,
  generateHomeControllerPayload,
  getHomeControllerSuiteEnv,
  loginHomeControllerSuiteUser,
  newHomeControllerSuiteApi,
  writeHomeControllerPrecheckEvidence,
} from '@src/core/bms-api/home-controller-management-suite'

const env = getHomeControllerSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminApi: HomeControllerSuiteApi

type HcTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (api: HomeControllerSuiteApi, evidence: HomeControllerEvidence) => Promise<void>
}

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const listItems = (body: any): any[] =>
  Array.isArray(body?.data?.items)
    ? body.data.items
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body)
        ? body
        : []

const responseData = (body: any) => body?.data?.home_controller || body?.data || body

const requireId = (value: string | number | undefined, message: string) => {
  expect(value, message).toBeTruthy()
  if (!value) throw new Error(message)
  return String(value)
}

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: HomeControllerEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const fakeHcId = '9223372036854775807'
```

- [ ] **Step 2: Add testcase runner and fixture API helpers**

Append:

```ts
const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: HomeControllerSuiteApi, evidence: HomeControllerEvidence) => Promise<void>,
) => {
  const evidence = new HomeControllerEvidence(testInfo, tcId, tcName, env)
  const api = adminApi.withEvidence(evidence)
  evidence.attachStep({
    step: 'Login admin precondition',
    method: 'POST',
    endpoint: `${env.apiPrefix}/auth/login`,
    status: 200,
    response: {
      token_present: Boolean(adminToken),
      token_length: adminToken.length,
    },
  })
  try {
    await fn(api, evidence)
    await evidence.write('PASSED')
  } catch (error) {
    await evidence.collectFailureLogs(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const createAutomationHc = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  tcId: string,
  overrides: Record<string, unknown> = {},
) => {
  const payload = generateHomeControllerPayload(env, tcId, overrides)
  const response = await api.createHomeController(payload)
  const body = await responseBody(response)
  expect([200, 201]).toContain(response.status())
  const data = responseData(body)
  const hcId = requireId(data?.id || body?.id, 'Created HC id is required')
  expect(String(data?.mac || '').toLowerCase()).toBe(
    String(payload.mac).toLowerCase(),
  )
  evidence.addAssertion('Automation HC is created with expected MAC')
  return { hcId, payload, body }
}

const withAutomationHc = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  tcId: string,
  fn: (hc: { hcId: string; payload: Record<string, unknown>; body: any }) => Promise<void>,
  overrides: Record<string, unknown> = {},
) => {
  let hcId: string | undefined
  try {
    const created = await createAutomationHc(api, evidence, tcId, overrides)
    hcId = created.hcId
    await fn(created)
  } finally {
    await cleanupHomeController(api, evidence, hcId)
  }
}

const loginOptionalUserApi = async (
  username: string,
  password: string,
  evidence: HomeControllerEvidence,
  label: string,
) => {
  if (!username || !password) {
    evidence.addAssertion(`SKIPPED_FIXTURE_MISSING: ${label} username/password`)
    return undefined
  }
  const login = await loginHomeControllerSuiteUser(env, username, password)
  return newHomeControllerSuiteApi(env, login.token)
}
```

- [ ] **Step 3: Add cases TC1-TC38**

Append a `cases` array containing:

```ts
const cases: HcTc[] = [
  {
    id: 'TC1',
    name: 'Health check he thong thanh cong',
    goal: 'Kiem tra API health truoc khi chay suite',
    precondition: 'BASE_URL hop le',
    expected: 'HTTP 200 va response healthy',
    run: async (api, evidence) => {
      const response = await api.healthCheck()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body).toBeTruthy()
      evidence.addAssertion('Health check returns HTTP 200')
    },
  },
  {
    id: 'TC2',
    name: 'Lay danh sach HC thanh cong',
    goal: 'Kiem tra list HC co pagination hoac array data',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va co danh sach HC',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 1, limit: 10 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('List HC returns readable collection')
    },
  },
  {
    id: 'TC3',
    name: 'Loc HC theo MAC chinh xac',
    goal: 'Kiem tra filter mac',
    precondition: 'Co TEST_HC_MAC hoac HC tao moi',
    expected: 'HTTP 200 va items khop MAC',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC3', async ({ payload }) => {
        const response = await api.listHomeControllers({ mac: String(payload.mac), page: 1, limit: 10 })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(String(payload.mac).toLowerCase())
        evidence.addAssertion('Filter by exact MAC returns created HC')
      })
    },
  },
  {
    id: 'TC4',
    name: 'Search HC theo MAC contains',
    goal: 'Kiem tra search partial MAC',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va response chua MAC',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC4', async ({ payload }) => {
        const partial = String(payload.mac).split(':').slice(0, 3).join(':')
        const response = await api.listHomeControllers({ search: partial, page: 1, limit: 10 })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(partial.toLowerCase())
        evidence.addAssertion('Search by partial MAC returns matching HC')
      })
    },
  },
  {
    id: 'TC5',
    name: 'Loc HC theo hc_type',
    goal: 'Kiem tra filter hc_type',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va co hc_type trong response',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC5', async ({ payload }) => {
        const response = await api.listHomeControllers({ hc_type: String(payload.hc_type), page: 1, limit: 10 })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(String(payload.hc_type))
        evidence.addAssertion('Filter by hc_type returns matching HC data')
      })
    },
  },
  {
    id: 'TC6',
    name: 'Loc HC theo version',
    goal: 'Kiem tra filter version',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC6', async ({ payload }) => {
        const response = await api.listHomeControllers({ version: String(payload.version), page: 1, limit: 10 })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Filter by version returns HTTP 200')
      })
    },
  },
  {
    id: 'TC7',
    name: 'Pagination page limit',
    goal: 'Kiem tra pagination list HC',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va limit khong vuot qua request',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 1, limit: 10 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBeLessThanOrEqual(10)
      evidence.addAssertion('List HC respects limit=10 or returns paginated data')
    },
  },
  {
    id: 'TC8',
    name: 'Limit vuot max',
    goal: 'Kiem tra validation/cap limit lon',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 cap ve max hoac 400 validation',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 1, limit: 101 })
      expectStatus(response.status(), [200, 400], evidence, 'Limit greater than max is capped or rejected')
    },
  },
  {
    id: 'TC9',
    name: 'Lay chi tiet HC thanh cong',
    goal: 'Kiem tra get detail HC',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va id/mac dung',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC9', async ({ hcId, payload }) => {
        const response = await api.getHomeController(hcId)
        const body = await responseBody(response)
        const data = responseData(body)
        expect(response.status()).toBe(200)
        expect(String(data.id)).toBe(hcId)
        expect(String(data.mac).toLowerCase()).toBe(String(payload.mac).toLowerCase())
        evidence.addAssertion('Detail returns created HC id and MAC')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Lay detail HC khong ton tai',
    goal: 'Kiem tra get detail fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.getHomeController(fakeHcId)
      expectStatus(response.status(), [400, 404], evidence, 'Nonexistent HC detail is rejected')
    },
  },
  {
    id: 'TC11',
    name: 'Lay detail id sai format',
    goal: 'Kiem tra validation id format',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.getHomeController('abc')
      expectStatus(response.status(), [400, 404], evidence, 'Invalid id format is rejected')
    },
  },
  {
    id: 'TC12',
    name: 'Lay connection events thanh cong',
    goal: 'Kiem tra connection-events API',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va collection',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC12', async ({ hcId }) => {
        const response = await api.getConnectionEvents(hcId, { page: 1, limit: 10 })
        expectStatus(response.status(), [200], evidence, 'Connection events returns HTTP 200')
      })
    },
  },
  {
    id: 'TC13',
    name: 'Connection events id sai format',
    goal: 'Kiem tra validation connection-events id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.getConnectionEvents('abc', { page: 1, limit: 10 })
      expectStatus(response.status(), [400, 404], evidence, 'Invalid HC id for connection events is rejected')
    },
  },
  {
    id: 'TC14',
    name: 'Tao HC thanh cong',
    goal: 'Kiem tra create HC hop le',
    precondition: 'Admin token hop le va MAC unique',
    expected: 'HTTP 200/201 va co id/mac',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC14', async ({ hcId }) => {
        expect(hcId).toBeTruthy()
        evidence.addAssertion('Create HC returns id and cleanup runs after test')
      })
    },
  },
  {
    id: 'TC15',
    name: 'Tao HC voi hc_type ssd202d',
    goal: 'Kiem tra create voi hc_type khac',
    precondition: 'MAC unique',
    expected: 'HTTP 200/201 hoac 400 neu backend khong support',
    run: async (api, evidence) => {
      let hcId: string | undefined
      try {
        const payload = generateHomeControllerPayload(env, 'TC15', { hc_type: 'ssd202d' })
        const response = await api.createHomeController(payload)
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(response.status(), [200, 201, 400], evidence, 'ssd202d is accepted or explicitly rejected by backend')
      } finally {
        await cleanupHomeController(api, evidence, hcId)
      }
    },
  },
  {
    id: 'TC16',
    name: 'Tao HC thieu mac',
    goal: 'Kiem tra validation missing mac',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(generateHomeControllerPayload(env, 'TC16', { mac: undefined }))
      expectStatus(response.status(), [400], evidence, 'Missing mac returns 400')
    },
  },
  {
    id: 'TC17',
    name: 'Tao HC mac sai format',
    goal: 'Kiem tra validation mac format',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(generateHomeControllerPayload(env, 'TC17', { mac: 'invalid-mac' }))
      expectStatus(response.status(), [400], evidence, 'Invalid MAC format returns 400')
    },
  },
  {
    id: 'TC18',
    name: 'Tao HC trung MAC',
    goal: 'Kiem tra duplicate MAC',
    precondition: 'Da tao HC A',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC18', async ({ payload }) => {
        const response = await api.createHomeController(payload)
        expectStatus(response.status(), [400, 409], evidence, 'Duplicate MAC is rejected')
      })
    },
  },
  {
    id: 'TC19',
    name: 'Tao HC hc_type sai enum',
    goal: 'Kiem tra validation hc_type',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(generateHomeControllerPayload(env, 'TC19', { hc_type: 'invalid' }))
      expectStatus(response.status(), [400], evidence, 'Invalid hc_type is rejected')
    },
  },
  {
    id: 'TC20',
    name: 'Tao HC co field la',
    goal: 'Kiem tra unknown field',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac backend ignore an toan',
    run: async (api, evidence) => {
      let hcId: string | undefined
      try {
        const response = await api.createHomeController(generateHomeControllerPayload(env, 'TC20', { unknown_field: 'x' }))
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(response.status(), [200, 201, 400], evidence, response.status() === 400 ? 'Unknown field is rejected' : 'NEED_CONFIRM_VALIDATION backend ignores unknown create field')
      } finally {
        await cleanupHomeController(api, evidence, hcId)
      }
    },
  },
  {
    id: 'TC21',
    name: 'Cap nhat notes HC thanh cong',
    goal: 'Kiem tra update notes an toan',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va notes moi dung',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC21', async ({ hcId }) => {
        const notes = `auto_notes_TC21_${Date.now()}`
        const response = await api.updateHomeController(hcId, { notes })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(notes)
        evidence.addAssertion('Update notes returns updated value')
      })
    },
  },
  {
    id: 'TC22',
    name: 'Update body rong no-op',
    goal: 'Kiem tra PATCH body rong',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 400 theo backend',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC22', async ({ hcId }) => {
        const response = await api.updateHomeController(hcId, {})
        expectStatus(response.status(), [200, 400], evidence, 'Empty update is accepted as no-op or rejected')
      })
    },
  },
  {
    id: 'TC23',
    name: 'Update HC khong ton tai',
    goal: 'Kiem tra update fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.updateHomeController(fakeHcId, { notes: 'x' })
      expectStatus(response.status(), [400, 404], evidence, 'Update nonexistent HC is rejected')
    },
  },
  {
    id: 'TC24',
    name: 'Update id sai format',
    goal: 'Kiem tra validation update id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.updateHomeController('abc', { notes: 'x' })
      expectStatus(response.status(), [400, 404], evidence, 'Invalid update id is rejected')
    },
  },
  {
    id: 'TC25',
    name: 'Update co field la',
    goal: 'Kiem tra unknown update field',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 400 hoac ignore an toan',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC25', async ({ hcId }) => {
        const response = await api.updateHomeController(hcId, { unknown_field: 'x' })
        expectStatus(response.status(), [200, 400], evidence, response.status() === 400 ? 'Unknown update field is rejected' : 'NEED_CONFIRM_VALIDATION backend ignores unknown update field')
      })
    },
  },
  {
    id: 'TC26',
    name: 'Xoa HC automation thanh cong',
    goal: 'Kiem tra delete don voi HC do testcase tao',
    precondition: 'HC automation vua tao',
    expected: 'HTTP 200 va get lai khong active',
    run: async (api, evidence) => {
      const created = await createAutomationHc(api, evidence, 'TC26')
      const response = await api.deleteHomeController(created.hcId)
      expect(response.status()).toBe(200)
      evidence.markHcDeleted()
      const getResponse = await api.getHomeController(created.hcId)
      expect([400, 404]).toContain(getResponse.status())
      evidence.addAssertion('Deleted automation HC is no longer available by detail API')
    },
  },
  {
    id: 'TC27',
    name: 'Xoa HC khong ton tai',
    goal: 'Kiem tra delete fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.deleteHomeController(fakeHcId)
      expectStatus(response.status(), [400, 404], evidence, 'Delete nonexistent HC is rejected')
    },
  },
  {
    id: 'TC28',
    name: 'Xoa HC id sai format',
    goal: 'Kiem tra delete invalid id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.deleteHomeController('abc')
      expectStatus(response.status(), [400, 404], evidence, 'Delete invalid id is rejected')
    },
  },
]
```

- [ ] **Step 4: Run syntax check**

Run: `npx.cmd tsc --noEmit`
Expected: spec imports and helper types compile.

## Task 4: Add IoT, BLE, Auth Cases And Runner

**Files:**
- Modify: `tests/api/bms/home-controller-management/home-controller-management.api.spec.ts`

- [ ] **Step 1: Add IoT/BLE/auth cases TC29-TC45**

Before the closing `]` of `cases`, append:

```ts
  {
    id: 'TC29',
    name: 'IoT list HC thanh cong',
    goal: 'Kiem tra IoT list HC read-only',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.iotListHomeControllers()
      expectStatus(response.status(), [200], evidence, 'IoT list HC returns HTTP 200')
    },
  },
  {
    id: 'TC30',
    name: 'IoT get HC theo id thanh cong',
    goal: 'Kiem tra IoT get HC read-only',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 204 theo backend',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC30', async ({ hcId }) => {
        const response = await api.iotGetHomeController(hcId)
        expectStatus(response.status(), [200, 204], evidence, 'IoT get HC returns 200 or empty 204')
      })
    },
  },
  {
    id: 'TC31',
    name: 'IoT get HC khong ton tai',
    goal: 'Kiem tra IoT get fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 204 hoac 404',
    run: async (api, evidence) => {
      const response = await api.iotGetHomeController(fakeHcId)
      expectStatus(response.status(), [204, 404], evidence, 'IoT get nonexistent HC returns no content or not found')
    },
  },
  {
    id: 'TC32',
    name: 'Sync-time thanh cong',
    goal: 'Kiem tra sync-time voi MAC automation',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC32', async ({ payload }) => {
        const response = await api.syncTime(String(payload.mac))
        expectStatus(response.status(), [200], evidence, 'Sync-time returns HTTP 200')
      })
    },
  },
  {
    id: 'TC33',
    name: 'Sync-time MAC khong ton tai',
    goal: 'Kiem tra sync-time fake MAC',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.syncTime('AA:BB:CC:DD:EE:99')
      expectStatus(response.status(), [400, 404], evidence, 'Sync-time fake MAC is rejected')
    },
  },
  {
    id: 'TC34',
    name: 'Get link upload thanh cong',
    goal: 'Kiem tra get-link-upload voi API key neu co',
    precondition: 'IOT_HC_LOG_UPLOAD_API_KEY cau hinh',
    expected: 'HTTP 200 hoac skip fixture missing',
    run: async (api, evidence) => {
      if (!env.iotLogUploadApiKey) {
        evidence.addAssertion('SKIPPED_FIXTURE_MISSING: IOT_HC_LOG_UPLOAD_API_KEY')
        return
      }
      await withAutomationHc(api, evidence, 'TC34', async ({ payload }) => {
        const response = await api.getLinkUpload(String(payload.mac), env.iotLogObjectKey, env.iotLogUploadApiKey)
        expectStatus(response.status(), [200], evidence, 'Get link upload returns HTTP 200 with upload URL')
      })
    },
  },
  {
    id: 'TC35',
    name: 'Get link upload thieu API key',
    goal: 'Kiem tra guard API key get-link-upload',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 401 hoac 403',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC35', async ({ payload }) => {
        const response = await api.getLinkUpload(String(payload.mac), env.iotLogObjectKey)
        expectStatus(response.status(), [401, 403], evidence, 'Get link upload without API key is rejected')
      })
    },
  },
  {
    id: 'TC36',
    name: 'Version-info update thanh cong',
    goal: 'Kiem tra version-info safe mutation',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 204',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC36', async ({ payload }) => {
        const response = await api.updateVersionInfo(String(payload.mac), {
          components: [{ type: 'firmware', name: 'automation', version: env.testHcVersion }],
        })
        expectStatus(response.status(), [200, 204], evidence, 'Version-info update succeeds for automation HC')
      })
    },
  },
  {
    id: 'TC37',
    name: 'Version-info duplicate component',
    goal: 'Kiem tra validation duplicate component',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC37', async ({ payload }) => {
        const component = { type: 'firmware', name: 'automation', version: env.testHcVersion }
        const response = await api.updateVersionInfo(String(payload.mac), { components: [component, component] })
        expectStatus(response.status(), [400], evidence, 'Duplicate version component is rejected')
      })
    },
  },
  {
    id: 'TC38',
    name: 'List BLE gateway thanh cong',
    goal: 'Kiem tra BLE gateway list read-only',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listBleGateways()
      expectStatus(response.status(), [200], evidence, 'BLE gateway list returns HTTP 200')
    },
  },
  {
    id: 'TC39',
    name: 'Get BLE gateway HC khong ton tai',
    goal: 'Kiem tra get BLE fake hc_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 204 hoac 404',
    run: async (api, evidence) => {
      const response = await api.getBleGateway(fakeHcId)
      expectStatus(response.status(), [204, 404], evidence, 'BLE fake HC returns empty or not found')
    },
  },
  {
    id: 'TC40',
    name: 'Create update delete BLE gateway voi HC automation',
    goal: 'Kiem tra BLE CRUD an toan voi HC do testcase tao',
    precondition: 'HC automation ton tai',
    expected: 'Create/update/delete thanh cong hoac skip neu backend yeu cau fixture khac',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC40', async ({ hcId }) => {
        try {
          const createResponse = await api.createBleGateway({ hc_id: hcId, version: 'auto-1.0.0', public_key: `auto_key_${Date.now()}` })
          expectStatus(createResponse.status(), [200, 201, 400, 404, 409], evidence, 'BLE create returns explicit backend result')
          if (![200, 201].includes(createResponse.status())) return
          const updateResponse = await api.updateBleGateway(hcId, { version: 'auto-1.0.1' })
          expectStatus(updateResponse.status(), [200, 204], evidence, 'BLE update succeeds')
        } finally {
          await cleanupBleGateway(api, evidence, hcId)
        }
      })
    },
  },
  {
    id: 'TC41',
    name: 'Khong token list HC',
    goal: 'Kiem tra auth guard list HC',
    precondition: 'Khong Authorization',
    expected: 'HTTP 401 hoac 400',
    run: async (_, evidence) => {
      const anonymousApi = await newHomeControllerSuiteApi(env)
      try {
        const response = await anonymousApi.withEvidence(evidence).listHomeControllers({ page: 1, limit: 10 })
        expectStatus(response.status(), [400, 401], evidence, 'List HC without token is rejected')
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
  {
    id: 'TC42',
    name: 'Token sai list HC',
    goal: 'Kiem tra invalid bearer token',
    precondition: 'Bearer invalid_token',
    expected: 'HTTP 401',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken('GET', `${env.apiPrefix}/home-controllers?page=1&limit=10`)
      expectStatus(response.status(), [401], evidence, 'Invalid token returns 401')
    },
  },
  {
    id: 'TC43',
    name: 'User khong co quyen view HC',
    goal: 'Kiem tra permission view HC',
    precondition: 'NO_PERMISSION_USERNAME/PASSWORD neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (_, evidence) => {
      const userApi = await loginOptionalUserApi(env.noPermissionUsername, env.noPermissionPassword, evidence, 'NO_PERMISSION')
      if (!userApi) return
      try {
        const response = await userApi.withEvidence(evidence).listHomeControllers({ page: 1, limit: 10 })
        expectStatus(response.status(), [403], evidence, 'No-permission user cannot view HC list')
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC44',
    name: 'User khong co quyen create HC',
    goal: 'Kiem tra permission create HC',
    precondition: 'VIEWER hoac NO_PERMISSION user neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(
        env.viewerUsername || env.noPermissionUsername,
        env.viewerPassword || env.noPermissionPassword,
        evidence,
        'VIEWER_OR_NO_PERMISSION',
      )
      if (!userApi) return
      let hcId: string | undefined
      try {
        const response = await userApi.withEvidence(evidence).createHomeController(generateHomeControllerPayload(env, 'TC44'))
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(response.status(), [403], evidence, 'Non-admin user cannot create HC')
      } finally {
        await cleanupHomeController(api, evidence, hcId)
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC45',
    name: 'User khong co quyen update va delete HC',
    goal: 'Kiem tra permission update/delete HC',
    precondition: 'VIEWER hoac NO_PERMISSION user va HC automation',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(
        env.viewerUsername || env.noPermissionUsername,
        env.viewerPassword || env.noPermissionPassword,
        evidence,
        'VIEWER_OR_NO_PERMISSION',
      )
      if (!userApi) return
      try {
        await withAutomationHc(api, evidence, 'TC45', async ({ hcId }) => {
          const updateResponse = await userApi.withEvidence(evidence).updateHomeController(hcId, { notes: 'blocked' })
          expectStatus(updateResponse.status(), [403], evidence, 'Non-admin user cannot update HC')
          const deleteResponse = await userApi.withEvidence(evidence).deleteHomeController(hcId)
          expectStatus(deleteResponse.status(), [403], evidence, 'Non-admin user cannot delete HC')
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
```

- [ ] **Step 2: Add describe/beforeAll/afterAll/runner**

Append after the `cases` array:

```ts
test.describe('Home Controller Management API suite TC1-TC45', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearHomeControllerEvidenceDir(env)
    if (!env.adminUsername || !env.adminPassword) {
      const error =
        'ADMIN_USERNAME and ADMIN_PASSWORD are required for home-controller-management suite'
      await writeHomeControllerPrecheckEvidence(env, 'PRECHECK_admin_login_env_missing', {
        status: 'FAILED',
        error_message: error,
      })
      throw new Error(error)
    }

    const precheckApi = await newHomeControllerSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeHomeControllerPrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(`Health check failed before HC suite: ${health.status()}`)
      }
    } finally {
      await precheckApi.context.dispose()
    }

    const adminLogin = await loginHomeControllerSuiteUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    adminToken = adminLogin.token
    adminRefreshToken = adminLogin.refreshToken
    adminApi = await newHomeControllerSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    if (adminApi && adminRefreshToken) {
      try {
        await adminApi.logout(adminRefreshToken)
      } catch {
        // Best effort only.
      }
    }
    await adminApi?.context.dispose()
  })

  for (const tc of cases) {
    test(`${tc.id} - ${tc.name}`, async ({}, testInfo) => {
      testInfo.annotations.push({
        type: 'manual-goal',
        description: `${tc.goal}; Precondition: ${tc.precondition}; Expected: ${tc.expected}`,
      })
      await runTc(testInfo, tc.id, tc.name, tc.run)
    })
  }
})
```

- [ ] **Step 3: Verify no destructive endpoints**

Run:

```powershell
rg -n "delete-batch|reset-factory|network-config" src\core\bms-api\home-controller-management-suite.ts tests\api\bms\home-controller-management\home-controller-management.api.spec.ts
```

Expected: no matches.

- [ ] **Step 4: Commit spec**

Run:

```powershell
git add tests\api\bms\home-controller-management\home-controller-management.api.spec.ts
git commit -m "test: add home controller management api suite"
```

## Task 5: README And Env Template

**Files:**
- Create: `tests/api/bms/home-controller-management/README.md`
- Modify: `.env.template`

- [ ] **Step 1: Add README**

Create:

```md
# Home Controller Management API Suite

API-only Playwright suite for real Home Controller Management validation.

## Scope

Included:

- health/list/search/detail/connection-events;
- create/update safe fields/delete single automation-created HC;
- IoT read/safe endpoints;
- BLE gateway safe automation data;
- auth/permission/validation;
- per-test evidence and failure logs.

Deferred:

- delete batch;
- network config;
- reset factory;
- reset factory completed callback;
- UI automation.

## Environment

```env
BASE_URL=
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
TEST_HC_TYPE=mt7688
TEST_HC_VERSION=1.0.0
IOT_HC_LOG_UPLOAD_API_KEY=
IOT_LOG_OBJECT_KEY=automation/{{TEST_HC_MAC}}/logs/test.tar.gz
HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_SSH_KEY_PASSPHRASE=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
```

## Run

```powershell
$runDir='test-runs\home-controller-management-current'
Remove-Item -Recurse -Force $runDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/home-controller-management-current/html-report'
$env:HOME_CONTROLLER_RUN_DIR='test-runs/home-controller-management-current'
$env:HOME_CONTROLLER_EVIDENCE_DIR='test-runs/home-controller-management-current/evidence'
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/home-controller-management-current/test-results *>&1 | Tee-Object -FilePath test-runs\home-controller-management-current\run.log
```

Run one testcase:

```powershell
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts -g "TC14" --config=playwright.config.ts --workers=1
```

## Evidence

Latest run artifacts:

```text
test-runs/home-controller-management-current/run.log
test-runs/home-controller-management-current/html-report/index.html
test-runs/home-controller-management-current/evidence/*.json
```

Each evidence file contains redacted request/response, assertions, cleanup
warnings, and failure logs. If `HC_SSH_*` is missing, HC log collection is
recorded as skipped in evidence.
```

- [ ] **Step 2: Update `.env.template`**

Append:

```env
# Home Controller Management API suite
HOME_CONTROLLER_RUN_DIR=
HOME_CONTROLLER_EVIDENCE_DIR=
HOME_CONTROLLER_RUN_ID=
HOME_CONTROLLER_COLLECT_SYSTEM_LOG_ON_FAIL=true
HOME_CONTROLLER_SYSTEM_LOG_COMMAND=docker compose logs --no-color --tail 300 iot-console bms-api
HOME_CONTROLLER_SYSTEM_LOG_MAX_CHARS=30000
TEST_HC_ID=
TEST_HC_MAC=
TEST_HC_TYPE=mt7688
TEST_HC_VERSION=1.0.0
TEST_AREA_ID=
IOT_HC_LOG_UPLOAD_API_KEY=
IOT_LOG_OBJECT_KEY=automation/{{TEST_HC_MAC}}/logs/test.tar.gz
HC_SSH_HOST=
HC_SSH_USER=root
HC_SSH_PASSWORD=
HC_SSH_KEY_PATH=
HC_SSH_KEY_PASSPHRASE=
HC_LOG_PATH=/tmp/log/home-controller.log
HC_LOG_TAIL_LINES=300
HC_LOG_MAX_CHARS=60000
HC_SSH_READY_TIMEOUT_MS=15000
```

- [ ] **Step 3: Commit docs/env**

Run:

```powershell
git add .env.template tests\api\bms\home-controller-management\README.md
git commit -m "docs: document home controller management suite"
```

## Task 6: Verification And Real Run

**Files:**
- No source edits expected unless verification reveals a test-code bug.

- [ ] **Step 1: Static destructive endpoint check**

Run:

```powershell
rg -n "delete-batch|reset-factory|network-config" src\core\bms-api\home-controller-management-suite.ts tests\api\bms\home-controller-management\home-controller-management.api.spec.ts
```

Expected: no matches.

- [ ] **Step 2: Typecheck**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: exit 0 or document pre-existing unrelated errors.

- [ ] **Step 3: Run real suite**

Run:

```powershell
$runDir='test-runs\home-controller-management-current'
Remove-Item -Recurse -Force $runDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $runDir | Out-Null
$env:PLAYWRIGHT_HTML_OUTPUT_DIR='test-runs/home-controller-management-current/html-report'
$env:HOME_CONTROLLER_RUN_DIR='test-runs/home-controller-management-current'
$env:HOME_CONTROLLER_EVIDENCE_DIR='test-runs/home-controller-management-current/evidence'
npx.cmd playwright test tests/api/bms/home-controller-management/home-controller-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/home-controller-management-current/test-results *>&1 | Tee-Object -FilePath test-runs\home-controller-management-current\run.log
```

Expected:

- Health precheck passes against the configured real system.
- Admin login uses real credentials.
- Evidence files are created under `test-runs/home-controller-management-current/evidence`.
- HC created by tests are deleted by cleanup.
- Any failed case has request/response and failure log evidence.

- [ ] **Step 4: Commit fixes from verification if needed**

If only test-code fixes were required, commit:

```powershell
git add src\core\bms-api\home-controller-management-suite.ts tests\api\bms\home-controller-management\home-controller-management.api.spec.ts tests\api\bms\home-controller-management\README.md .env.template
git commit -m "fix: stabilize home controller management suite"
```

Do not change expected product behavior just to make tests pass. If the run
reveals product behavior differences, preserve evidence and report the failing
TCs.

## Self-Review

Spec coverage:

- API-only evidence is implemented in Tasks 1-4.
- Fresh current run evidence is implemented in Tasks 1 and 6.
- Real health/login is implemented in Tasks 3-4.
- Cleanup for automation-created HC is implemented in Tasks 2-4.
- Failure system log and HC SSH log are implemented in Task 2.
- Delete-batch, network-config, reset-factory, and reset callback are excluded
  and checked in Tasks 4 and 6.
- README and env sample are implemented in Task 5.

Placeholder scan:

- The plan contains no unfinished placeholder markers.
- Deferred destructive flows are intentionally listed as out-of-scope.

Type consistency:

- `HomeControllerEvidence`, `HomeControllerSuiteApi`, `HcSuiteEnv`, and helper
  names are defined before use.
- Spec imports match exports from the helper file.

