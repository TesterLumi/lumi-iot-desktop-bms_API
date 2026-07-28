# Device Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full safe Device Management API-real automation suite aligned with the 54-row manual sheet, excluding only the user-deferred destructive flows.

**Architecture:** Use one compact helper file for env, API wrappers, evidence, cleanup, and failure logs, plus one serial Playwright spec that owns the testcase matrix. The suite calls the real BMS/iot-console endpoints, creates unique automation devices/areas for write cases, and writes fresh evidence under `test-runs/device-management-current`.

**Tech Stack:** Playwright Test, TypeScript, Node `fs/promises`, `ssh2`, existing BMS env helpers, real BMS/iot-console APIs from the Postman collection.

---

## File Structure

- Create `src/core/bms-api/device-management-suite.ts`
  - Responsibility: parse env, create API context, wrap Device/Area/Auth endpoints, record evidence, redact secrets, cleanup owned devices/areas, collect system and HC SSH logs on failure.
- Create `tests/api/bms/device-management/device-management.api.spec.ts`
  - Responsibility: define TC1-TC54 testcase matrix, precheck health/admin login, run cases serially, assert business behavior, and call helper cleanup.
- Create `tests/api/bms/device-management/README.md`
  - Responsibility: document env variables, run command, evidence paths, implemented/deferred case groups, and safety rules.
- Modify `.env.template`
  - Responsibility: add only missing `DEVICE_MANAGEMENT_*` and test-device fixture variables.

Forbidden paths:

- Do not modify product code.
- Do not modify `docs/orchestrator.md`, `docs/worker.md`, or `docs/reviewer.md`.
- Do not add bulk delete, network config, or factory reset implementation.

## Testcase Coverage Matrix

Implemented now:

| TC | Sheet case | Automation strategy |
| --- | --- | --- |
| TC1 | Xem danh sách thiết bị thành công | `GET /api/v0/devices?page=1&limit=20`, assert paginated array |
| TC2 | Danh sách thiết bị rỗng | search with unique no-match keyword, assert empty array |
| TC3 | Phân trang danh sách thiết bị | page 2 limit 20, assert page shape and no duplicate from page 1 when possible |
| TC4 | Thay đổi số bản ghi mỗi trang | limit 5, assert item count <= 5 |
| TC5 | Tìm kiếm thiết bị có kết quả | create device, search by name/mac, assert found |
| TC6 | Tìm kiếm không có kết quả | unique keyword, assert empty |
| TC7 | Xóa keyword tìm kiếm | search no-match then search empty, assert list array |
| TC8 | Lọc theo Home Controller | create under `TEST_HC_ID`, filter `hc_id`, assert found |
| TC9 | Lọc theo protocol | create protocol `ble`, filter protocol, assert protocol |
| TC10 | Lọc theo network state | create `activated`, filter network_state, assert field |
| TC11 | Lọc thiết bị online | `status=online`, assert HTTP 200 and array |
| TC12 | Lọc theo 1 khu vực | create area/device, assign, filter one area |
| TC13 | Lọc theo nhiều khu vực | create area A/B, assign A, filter A+B |
| TC14 | Lọc thiết bị chưa gán khu vực | create unassigned device, `areas=null`, assert found |
| TC15 | Lọc khu vực hoặc chưa gán | create area/device plus unassigned, filter area + null |
| TC16 | Lọc theo loại thiết bị | use `TEST_DEVICE_TYPE_ID` if configured; otherwise skip with evidence |
| TC17 | Lọc thiết bị input | `io_capability=input`, assert contract |
| TC18 | Lọc thiết bị output | `io_capability=output`, assert contract |
| TC19 | Lọc thiết bị input/output | `io_capability=both`, assert contract |
| TC20 | Kết hợp nhiều filter | create device and filter hc/protocol/network/search |
| TC21 | Xem chi tiết thiết bị thành công | create device, `GET /devices/{id}`, assert id/mac |
| TC22 | Xem chi tiết thiết bị không tồn tại | fake id, assert 404 or explicit validation |
| TC23 | Lookup nhiều thiết bị thành công | create two devices, lookup ids, assert both returned |
| TC24 | Lookup có ID không tồn tại | lookup valid + fake, assert valid only or explicit empty for fake |
| TC25 | Thêm thiết bị vào HC thành công | `POST /api/v0/iot/home-controllers/{hc_id}/devices`, assert returned object |
| TC26 | Thêm thiết bị thiếu ID | omit id, assert validation 400 |
| TC27 | Thêm thiết bị thiếu MAC | omit mac, assert validation 400 |
| TC28 | Thêm thiết bị MAC sai định dạng | invalid mac, assert validation 400 |
| TC29 | Thêm thiết bị trùng ID | create then create same id with different mac, assert 400/409 |
| TC30 | Thêm thiết bị trùng MAC | create then create different id same mac, assert 400/409 |
| TC31 | Bind batch thiết bị thành công | conditional safe implementation only for automation-created devices; otherwise skip with explicit `DEFERRED_SAFE_FIXTURE` |
| TC32 | Bind batch có thiết bị lỗi | conditional safe implementation only if cleanup confirmed; otherwise skip with explicit `DEFERRED_SAFE_FIXTURE` |
| TC33 | Cập nhật toàn bộ thiết bị thành công | create device, safe BMS `PUT /devices/{id}`, assert changed safe fields |
| TC34 | Cập nhật tên/ghi chú/icon | create device, `PATCH /devices/{id}` safe fields |
| TC35 | Cập nhật trạng thái network | use IoT `PATCH` on automation-created device only; do not touch network configuration |
| TC36 | Cập nhật network data | use IoT `PATCH` on automation-created device only |
| TC37 | Cập nhật scene/config | use IoT `PATCH` on automation-created device only |
| TC38 | Cập nhật thiết bị không tồn tại | fake id, assert 404/400 |
| TC39 | Xóa thiết bị thành công | delete automation-created device and verify detail absent |
| TC40 | Hủy xóa thiết bị | API suite records as non-applicable UI-only; no DELETE call |
| TC41 | Xóa thiết bị không tồn tại | fake id, assert 404/204 explicit backend result |
| TC42 | Xóa thiết bị đang thuộc khu vực | create + assign area, delete owned device, assert explicit backend rule |
| TC43 | Xóa thiết bị đang thuộc group | skip with `DEFERRED_GROUP_FIXTURE` unless safe automation group fixture exists |
| TC45 | Gắn 1 thiết bị vào khu vực | create area/device, assign, list area devices |
| TC46 | Bỏ gán thiết bị khỏi khu vực | assign then unassign, assert absent |
| TC47 | Cập nhật vị trí thiết bị trên mặt bằng | assign area, update position x/y, assert list/detail |
| TC48 | Cập nhật vị trí ngoài khoảng hợp lệ | invalid x/y, assert 400 |
| TC49 | Xem summary thiết bị theo khu vực | area summary API, assert summary fields |
| TC50 | User không có quyền xem thiết bị | no-permission token, assert 403 or skip missing fixture |
| TC51 | User không có quyền thêm thiết bị | viewer/no-permission token, assert 403 and cleanup accidental create |
| TC52 | User không có quyền sửa thiết bị | viewer/no-permission token, assert 403 |
| TC53 | User không có quyền xóa thiết bị | viewer/no-permission token, assert 403 and admin cleanup |
| TC54 | Thiếu token khi xem danh sách | anonymous request, assert 401/400 or auth-disabled evidence |

Explicitly deferred:

- TC44: Xóa nhiều thiết bị thành công, because user asked to leave bulk delete for later.
- Network configuration flows beyond safe `network_state`/`network_data` fields on automation-created records.
- Factory reset flows.

## Task 1: Add Device Management Env And Evidence Helper Skeleton

**Files:**
- Create: `src/core/bms-api/device-management-suite.ts`

- [ ] **Step 1: Add types, env parser, run-dir reset, and evidence writer**

Create `src/core/bms-api/device-management-suite.ts` with this starting content:

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

export type DeviceEvidenceStatus = 'PASSED' | 'FAILED' | 'SKIPPED'

export type DeviceStepEvidence = {
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

type DeviceEvidenceFile = {
  tc_id: string
  tc_name: string
  status: DeviceEvidenceStatus
  started_at: string
  finished_at?: string
  base_url: string
  steps: DeviceStepEvidence[]
  assertions: string[]
  cleanup: {
    devices_deleted: number
    areas_deleted: number
    warnings: string[]
  }
  system_logs?: unknown
  hc_logs: HcLogEvidence[]
  error_message?: string
}

export type DeviceSuiteEnv = {
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
  testCellModelId: number
  testPid: number
  testProtocol: string
  testCellIdx: number
  testDeviceTypeId: string
  testAreaId: string
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

export type DeviceCreatePayload = {
  id?: string | number
  hc_id?: string | number
  cell_model_id?: number
  mac?: string
  pid?: number
  protocol?: string
  network_state?: string
  cell_idx?: number
  spec?: Record<string, unknown>
  profile?: Record<string, unknown>
  network_data?: Record<string, unknown> | null
  config?: Record<string, unknown> | null
  scene?: Record<string, unknown> | null
  name?: string | null
  notes?: string | null
  icon_key?: string | null
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export const getDeviceSuiteEnv = (): DeviceSuiteEnv => {
  const shared = getSharedBmsEnv(
    'DEVICE_MANAGEMENT_EVIDENCE_DIR',
    'device-management-current',
  )
  const rawBaseUrl =
    process.env.DEVICE_MANAGEMENT_BASE_URL ||
    process.env.BASE_URL ||
    process.env.BMS_API_ENDPOINT ||
    shared.baseUrl
  const base = normalizeBmsBaseUrl(rawBaseUrl)
  const runDir =
    process.env.DEVICE_MANAGEMENT_RUN_DIR ||
    join(process.cwd(), 'test-runs', 'device-management-current')

  return {
    baseUrl: base.baseUrl,
    apiPrefix: base.apiPrefix,
    healthEndpoint: base.healthEndpoint,
    evidenceDir:
      process.env.DEVICE_MANAGEMENT_EVIDENCE_DIR ||
      join(runDir, 'evidence'),
    runDir,
    runId: process.env.DEVICE_MANAGEMENT_RUN_ID || `manual-${Date.now()}`,
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
      process.env.DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN ||
      process.env.BMS_ACCESS_TOKEN ||
      process.env.BMS_ROOT_ACCESS_TOKEN ||
      '',
    viewerAccessToken:
      process.env.DEVICE_MANAGEMENT_VIEWER_ACCESS_TOKEN ||
      process.env.BMS_VIEWER_ACCESS_TOKEN ||
      '',
    noPermissionAccessToken:
      process.env.DEVICE_MANAGEMENT_NO_PERMISSION_ACCESS_TOKEN ||
      process.env.BMS_NO_PERMISSION_ACCESS_TOKEN ||
      '',
    requireAuth: process.env.DEVICE_MANAGEMENT_REQUIRE_AUTH === 'true',
    testHcId: process.env.TEST_HC_ID || '',
    testHcMac: process.env.TEST_HC_MAC || '',
    testCellModelId: Number(process.env.TEST_DEVICE_CELL_MODEL_ID || '501'),
    testPid: Number(process.env.TEST_DEVICE_PID || '1234'),
    testProtocol: process.env.TEST_DEVICE_PROTOCOL || 'ble',
    testCellIdx: Number(process.env.TEST_DEVICE_CELL_IDX || '1'),
    testDeviceTypeId: process.env.TEST_DEVICE_TYPE_ID || '',
    testAreaId: process.env.TEST_AREA_ID || '',
    collectSystemLogOnFail:
      process.env.DEVICE_MANAGEMENT_COLLECT_SYSTEM_LOG_ON_FAIL !== 'false',
    systemLogCommand:
      process.env.DEVICE_MANAGEMENT_SYSTEM_LOG_COMMAND ||
      'docker compose logs --no-color --tail 300 iot-console bms-api',
    systemLogMaxChars: Number(
      process.env.DEVICE_MANAGEMENT_SYSTEM_LOG_MAX_CHARS || '30000',
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
```

- [ ] **Step 2: Append evidence, redaction, run-dir, and log helpers**

Append these helpers to the same file:

```ts
export class DeviceManagementEvidence {
  private evidence: DeviceEvidenceFile

  constructor(
    private testInfo: TestInfo,
    tcId: string,
    tcName: string,
    private env: DeviceSuiteEnv,
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
        devices_deleted: 0,
        areas_deleted: 0,
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

  markDeviceDeleted() {
    this.evidence.cleanup.devices_deleted += 1
  }

  markAreaDeleted() {
    this.evidence.cleanup.areas_deleted += 1
  }

  attachStep(step: DeviceStepEvidence) {
    this.evidence.steps.push(redactSecrets(step) as DeviceStepEvidence)
  }

  attachHcLog(log: HcLogEvidence) {
    this.evidence.hc_logs.push(log)
  }

  async collectFailureLogs(error: unknown) {
    this.evidence.system_logs = await collectSystemLog(this.env, error)
    await collectHcLog(this, this.env, this.startedAt, new Date().toISOString())
  }

  async write(status: DeviceEvidenceStatus, error?: unknown) {
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

export const clearDeviceEvidenceDir = async (env: DeviceSuiteEnv) => {
  await rm(env.evidenceDir, { recursive: true, force: true })
  await mkdir(env.evidenceDir, { recursive: true })
}

export const writeDevicePrecheckEvidence = async (
  env: DeviceSuiteEnv,
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

const collectSystemLog = async (env: DeviceSuiteEnv, error: unknown) => {
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
  evidence: DeviceManagementEvidence,
  env: DeviceSuiteEnv,
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
  env: DeviceSuiteEnv,
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

const buildSshAuth = async (env: DeviceSuiteEnv) => {
  if (env.hcSshKeyPath) {
    return {
      privateKey: await readFile(env.hcSshKeyPath),
      passphrase: env.hcSshKeyPassphrase || undefined,
    }
  }
  return { password: env.hcSshPassword }
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
const maskSecret = (value: string) =>
  value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`
const truncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : value.slice(-maxChars)
```

- [ ] **Step 3: Run typecheck on the skeleton**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: it may fail for repo-wide existing issues, but there must be no
syntax error pointing to `device-management-suite.ts`.

- [ ] **Step 4: Commit Task 1**

```powershell
git add src/core/bms-api/device-management-suite.ts
git commit -m "test: add device management evidence skeleton"
```

## Task 2: Add Device Management API Methods And Data Factories

**Files:**
- Modify: `src/core/bms-api/device-management-suite.ts`

- [ ] **Step 1: Add API client, login, request helpers, and cleanup**

Append this code after the helpers in `device-management-suite.ts`:

```ts
export class DeviceManagementSuiteApi {
  constructor(
    public context: APIRequestContext,
    private env: DeviceSuiteEnv,
    private evidence?: DeviceManagementEvidence,
  ) {}

  withEvidence(evidence: DeviceManagementEvidence) {
    return new DeviceManagementSuiteApi(this.context, this.env, evidence)
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

  async listDevices(query?: Record<string, string | number | boolean>) {
    return this.call(
      'List devices',
      'GET',
      `${this.env.apiPrefix}/devices${toQuery(query)}`,
    )
  }

  async getDevice(deviceId: string) {
    return this.call(
      'Get device',
      'GET',
      `${this.env.apiPrefix}/devices/${deviceId}`,
    )
  }

  async lookupDevices(deviceIds: string[]) {
    return this.call(
      'Lookup devices',
      'POST',
      `${this.env.apiPrefix}/devices/lookup`,
      { device_ids: deviceIds },
    )
  }

  async bmsPutDevice(deviceId: string, payload: Record<string, unknown>) {
    return this.call(
      'BMS put device',
      'PUT',
      `${this.env.apiPrefix}/devices/${deviceId}`,
      payload,
    )
  }

  async bmsPatchDevice(deviceId: string, payload: Record<string, unknown>) {
    return this.call(
      'BMS patch device',
      'PATCH',
      `${this.env.apiPrefix}/devices/${deviceId}`,
      payload,
    )
  }

  async bmsDeleteDevice(deviceId: string) {
    return this.call(
      'BMS delete device',
      'DELETE',
      `${this.env.apiPrefix}/devices/${deviceId}`,
    )
  }

  async iotListDevices(query?: Record<string, string | number | boolean>) {
    return this.call(
      'IoT list devices',
      'GET',
      `${this.env.apiPrefix}/iot/devices${toQuery(query)}`,
    )
  }

  async iotGetDevice(deviceId: string) {
    return this.call(
      'IoT get device',
      'GET',
      `${this.env.apiPrefix}/iot/devices/${deviceId}`,
    )
  }

  async iotCreateDevice(hcId: string, payload: DeviceCreatePayload) {
    return this.call(
      'IoT create device under HC',
      'POST',
      `${this.env.apiPrefix}/iot/home-controllers/${hcId}/devices`,
      payload,
    )
  }

  async iotBindBatchDevices(hcId: string, devices: DeviceCreatePayload[]) {
    return this.call(
      'IoT bind batch devices',
      'POST',
      `${this.env.apiPrefix}/iot/home-controllers/${hcId}/devices/bind-batch`,
      { devices },
    )
  }

  async iotPutDevice(deviceId: string, payload: Record<string, unknown>) {
    return this.call(
      'IoT put device',
      'PUT',
      `${this.env.apiPrefix}/iot/devices/${deviceId}`,
      payload,
    )
  }

  async iotPatchDevice(deviceId: string, payload: Record<string, unknown>) {
    return this.call(
      'IoT patch device',
      'PATCH',
      `${this.env.apiPrefix}/iot/devices/${deviceId}`,
      payload,
    )
  }

  async iotDeleteDevice(deviceId: string) {
    return this.call(
      'IoT delete device',
      'DELETE',
      `${this.env.apiPrefix}/iot/devices/${deviceId}`,
    )
  }

  async createArea(payload: Record<string, unknown>) {
    return this.call('Create area', 'POST', `${this.env.apiPrefix}/areas`, payload)
  }

  async deleteArea(areaId: string) {
    return this.call('Delete area', 'DELETE', `${this.env.apiPrefix}/areas/${areaId}`)
  }

  async assignDevicesToArea(areaId: string, deviceIds: string[]) {
    return this.call(
      'Assign devices to area',
      'POST',
      `${this.env.apiPrefix}/areas/${areaId}/devices`,
      { device_ids: deviceIds },
    )
  }

  async unassignDevicesFromArea(areaId: string, deviceIds: string[]) {
    return this.call(
      'Unassign devices from area',
      'DELETE',
      `${this.env.apiPrefix}/areas/${areaId}/devices`,
      { device_ids: deviceIds },
    )
  }

  async listAreaDevices(
    areaId: string,
    query?: Record<string, string | number | boolean>,
  ) {
    return this.call(
      'List area devices',
      'GET',
      `${this.env.apiPrefix}/areas/${areaId}/devices${toQuery(query)}`,
    )
  }

  async updateDevicePosition(
    areaId: string,
    deviceId: string,
    payload: Record<string, unknown>,
  ) {
    return this.call(
      'Update device position',
      'PATCH',
      `${this.env.apiPrefix}/areas/${areaId}/devices/${deviceId}/position`,
      payload,
    )
  }

  async getAreaDeviceSummary(areaId: string) {
    return this.call(
      'Get area device summary',
      'GET',
      `${this.env.apiPrefix}/areas/${areaId}/devices/summary`,
    )
  }

  async requestInvalidToken(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    payload?: unknown,
  ) {
    const api = await newDeviceManagementSuiteApi(this.env, 'invalid_token')
    try {
      return await api
        .withEvidence(this.evidence || emptyEvidence())
        .call('Invalid token request', method, endpoint, payload)
    } finally {
      await api.context.dispose()
    }
  }

  private async call(
    step: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
          : method === 'PUT'
            ? await this.context.put(endpoint, { data: payload, headers })
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

export const newDeviceManagementSuiteApi = async (
  env: DeviceSuiteEnv,
  token?: string,
  omitApiKey = false,
) => {
  const headers = commonHeaders(env, omitApiKey)
  if (token) headers.Authorization = `Bearer ${token}`
  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })
  return new DeviceManagementSuiteApi(context, env)
}

export const loginDeviceSuiteUser = async (
  env: DeviceSuiteEnv,
  userName: string,
  password: string,
) => {
  const api = await newDeviceManagementSuiteApi(env)
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
    return { token, refreshToken }
  } finally {
    await api.context.dispose()
  }
}

export const generateUniqueDeviceId = (tcId: string) => {
  const clean = tcId.replace(/[^0-9]/g, '').padEnd(2, '0').slice(0, 2)
  const suffix = Date.now().toString().slice(-10)
  return Number(`${clean}${suffix}`.slice(0, 15))
}

export const generateUniqueDeviceMac = (tcId: string) => {
  const clean = tcId.replace(/[^0-9A-Fa-f]/g, '').padEnd(2, '0').slice(0, 2)
  const n = Date.now().toString(16).toUpperCase().slice(-8).padStart(8, '0')
  const random = Math.floor(Math.random() * 256)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')
  return `EA:2C:${clean}:${n.slice(0, 2)}:${n.slice(2, 4)}:${random}`
}

export const generateDevicePayload = (
  env: DeviceSuiteEnv,
  tcId: string,
  overrides: DeviceCreatePayload = {},
): DeviceCreatePayload => {
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  return {
    id: generateUniqueDeviceId(tcId),
    hc_id: env.testHcId,
    cell_model_id: env.testCellModelId,
    mac: generateUniqueDeviceMac(tcId),
    pid: env.testPid,
    protocol: env.testProtocol,
    network_state: 'activated',
    cell_idx: env.testCellIdx,
    spec: {
      name: `auto_device_spec_${tcId}`,
      input: [{ idx: 1, data_type: { type: 'boolean' } }],
      output: [{ idx: 1, data_type: { type: 'boolean' } }],
      state: [{ idx: 0, data_type: { type: 'boolean' } }],
    },
    profile: { encoder: [], decoder: [], config: [] },
    network_data: null,
    config: { source: 'bms-e2e-test', tc_id: tcId },
    scene: null,
    name: `auto_device_${tcId}_${token}`,
    notes: `auto_device_notes_${tcId}_${token}`,
    icon_key: 'lightbulb',
    ...overrides,
  }
}

export const cleanupDevice = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  deviceId?: string,
) => {
  if (!deviceId) return
  try {
    const response = await api.iotDeleteDevice(deviceId)
    if ([200, 204, 404].includes(response.status())) {
      evidence.markDeviceDeleted()
      return
    }
    evidence.addCleanupWarning(
      `Device ${deviceId} cleanup returned status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Device ${deviceId} cleanup failed: ${formatError(error)}`,
    )
  }
}

export const cleanupArea = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  areaId?: string,
) => {
  if (!areaId) return
  try {
    const response = await api.deleteArea(areaId)
    if ([200, 202, 204, 404].includes(response.status())) {
      evidence.markAreaDeleted()
      return
    }
    evidence.addCleanupWarning(
      `Area ${areaId} cleanup returned status=${response.status()} body=${await response.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Area ${areaId} cleanup failed: ${formatError(error)}`,
    )
  }
}

const commonHeaders = (
  env: DeviceSuiteEnv,
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
    if (value !== undefined && value !== '') params.append(key, String(value))
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

const emptyEvidence = () => undefined as unknown as DeviceManagementEvidence
```

- [ ] **Step 2: Run targeted TypeScript check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no TypeScript errors from `device-management-suite.ts`.

- [ ] **Step 3: Commit Task 2**

```powershell
git add src/core/bms-api/device-management-suite.ts
git commit -m "test: add device management API helper"
```

## Task 3: Add Device Management Spec Harness And First Read-Only Cases

**Files:**
- Create: `tests/api/bms/device-management/device-management.api.spec.ts`

- [ ] **Step 1: Create spec with imports, env, helpers, and precheck**

Create `tests/api/bms/device-management/device-management.api.spec.ts`:

```ts
import { expect, test, TestInfo } from '@playwright/test'
import {
  DeviceCreatePayload,
  DeviceManagementEvidence,
  DeviceManagementSuiteApi,
  cleanupArea,
  cleanupDevice,
  clearDeviceEvidenceDir,
  generateDevicePayload,
  getDeviceSuiteEnv,
  loginDeviceSuiteUser,
  newDeviceManagementSuiteApi,
  writeDevicePrecheckEvidence,
} from '@src/core/bms-api/device-management-suite'

const env = getDeviceSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminApi: DeviceManagementSuiteApi

type DeviceTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (
    api: DeviceManagementSuiteApi,
    evidence: DeviceManagementEvidence,
  ) => Promise<void>
}

type CreatedDevice = {
  deviceId: string
  payload: DeviceCreatePayload
  body: any
}

const fakeDeviceId = '9223372036854775807'

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

const responseData = (body: any) => body?.data?.device || body?.data || body

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: DeviceManagementEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const requireWriteFixture = () => {
  expect(env.testHcId, 'TEST_HC_ID is required for write cases').toBeTruthy()
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (
    api: DeviceManagementSuiteApi,
    evidence: DeviceManagementEvidence,
  ) => Promise<void>,
) => {
  const evidence = new DeviceManagementEvidence(testInfo, tcId, tcName, env)
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
    if (error instanceof Error && error.message.includes('Test is skipped')) {
      await evidence.write('SKIPPED', error)
      throw error
    }
    await evidence.collectFailureLogs(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const createAutomationDevice = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
  overrides: DeviceCreatePayload = {},
): Promise<CreatedDevice> => {
  requireWriteFixture()
  const payload = generateDevicePayload(env, tcId, overrides)
  const response = await api.iotCreateDevice(String(env.testHcId), payload)
  const body = await responseBody(response)
  expect([200, 201]).toContain(response.status())
  const data = responseData(body)
  const deviceId = String(data?.id || payload.id)
  expect(deviceId).toBeTruthy()
  expect(String(data?.mac || payload.mac).toLowerCase()).toBe(
    String(payload.mac).toLowerCase(),
  )
  evidence.addAssertion('Automation device is created with expected MAC')
  return { deviceId, payload, body }
}

const withAutomationDevice = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
  fn: (device: CreatedDevice) => Promise<void>,
  overrides: DeviceCreatePayload = {},
) => {
  let deviceId: string | undefined
  try {
    const created = await createAutomationDevice(api, evidence, tcId, overrides)
    deviceId = created.deviceId
    await fn(created)
  } finally {
    await cleanupDevice(api, evidence, deviceId)
  }
}

const createAutomationArea = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
) => {
  const name = `auto_device_area_${tcId}_${Date.now()}`
  const response = await api.createArea({ name })
  const body = await responseBody(response)
  expectStatus(response.status(), [200, 201], evidence, 'Automation area is created')
  return String(body?.data?.id || body?.id)
}

const loginOptionalUserApi = async (
  username: string,
  password: string,
  evidence: DeviceManagementEvidence,
  label: string,
  token?: string,
) => {
  if (token) return newDeviceManagementSuiteApi(env, token)
  if (!username || !password) {
    evidence.addAssertion(`SKIPPED_FIXTURE_MISSING: ${label} username/password`)
    return undefined
  }
  const login = await loginDeviceSuiteUser(env, username, password)
  return newDeviceManagementSuiteApi(env, login.token)
}
```

- [ ] **Step 2: Add TC1-TC24 read/list/filter/detail/lookup cases**

Append this `cases` array start:

```ts
const cases: DeviceTc[] = [
  {
    id: 'TC1',
    name: 'Xem danh sach thiet bi thanh cong',
    goal: 'Kiem tra API list devices tra danh sach dang doc duoc',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va data.items la array',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('List devices returns readable collection')
    },
  },
  {
    id: 'TC2',
    name: 'Danh sach thiet bi rong',
    goal: 'Kiem tra search khong match tra collection rong',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va khong co item match keyword automation',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_no_result_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body)).toHaveLength(0)
      evidence.addAssertion('No-result search returns empty device list')
    },
  },
  {
    id: 'TC3',
    name: 'Phan trang danh sach thiet bi',
    goal: 'Kiem tra page=2 limit=20',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va response pagination hop le',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 2, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Pagination page=2 returns readable collection')
    },
  },
  {
    id: 'TC4',
    name: 'Thay doi so ban ghi moi trang',
    goal: 'Kiem tra limit=5',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va so item khong vuot limit',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 5 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBeLessThanOrEqual(5)
      evidence.addAssertion('Device list respects selected page size')
    },
  },
  {
    id: 'TC5',
    name: 'Tim kiem thiet bi co ket qua',
    goal: 'Kiem tra search theo ten/MAC device automation',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va response chua device vua tao',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC5', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          search: String(payload.mac),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(
          String(payload.mac).toLowerCase(),
        )
        evidence.addAssertion('Search by MAC returns automation device')
      })
    },
  },
  {
    id: 'TC6',
    name: 'Tim kiem khong co ket qua',
    goal: 'Kiem tra keyword khong ton tai',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va data rong',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_device_not_found_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body)).toHaveLength(0)
      evidence.addAssertion('Search with nonexistent keyword returns no items')
    },
  },
  {
    id: 'TC7',
    name: 'Xoa keyword tim kiem',
    goal: 'Kiem tra clear search goi lai list khong keyword',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va danh sach quay ve collection doc duoc',
    run: async (api, evidence) => {
      const filtered = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_clear_${Date.now()}`,
      })
      expect(filtered.status()).toBe(200)
      const cleared = await api.listDevices({ page: 1, limit: 20, search: '' })
      const body = await responseBody(cleared)
      expect(cleared.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Clearing search reloads device list')
    },
  },
  {
    id: 'TC8',
    name: 'Loc theo Home Controller',
    goal: 'Kiem tra filter hc_id',
    precondition: 'Co device automation tren TEST_HC_ID',
    expected: 'HTTP 200 va response chua device dung HC',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC8', async ({ deviceId }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          hc_id: env.testHcId,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(deviceId)
        evidence.addAssertion('Filter by HC returns automation device')
      })
    },
  },
  {
    id: 'TC9',
    name: 'Loc theo protocol',
    goal: 'Kiem tra filter protocol',
    precondition: 'Co device automation protocol ble',
    expected: 'HTTP 200 va response chua protocol tuong ung',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC9', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          protocol: String(payload.protocol),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(String(payload.protocol))
        evidence.addAssertion('Filter by protocol returns matching devices')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Loc theo trang thai network',
    goal: 'Kiem tra filter network_state=activated',
    precondition: 'Co device automation activated',
    expected: 'HTTP 200 va response chua network_state activated',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC10', async () => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          network_state: 'activated',
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Filter by network_state returns HTTP 200')
      })
    },
  },
  {
    id: 'TC11',
    name: 'Loc thiet bi online',
    goal: 'Kiem tra filter status=online',
    precondition: 'He thong co the co device online',
    expected: 'HTTP 200 va collection doc duoc',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20, status: 'online' })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Filter status=online returns readable collection')
    },
  },
  {
    id: 'TC12',
    name: 'Loc theo 1 khu vuc',
    goal: 'Kiem tra filter areas voi area automation',
    precondition: 'Co area va device automation',
    expected: 'HTTP 200 va response chua device trong area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC12', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC12')
          const assign = await api.assignDevicesToArea(areaId, [deviceId])
          expectStatus(assign.status(), [200, 201, 202, 204], evidence, 'Device is assigned to area')
          const response = await api.listDevices({ page: 1, limit: 20, areas: areaId })
          const body = await responseBody(response)
          expect(response.status()).toBe(200)
          expect(JSON.stringify(body)).toContain(deviceId)
          evidence.addAssertion('Filter by one area returns assigned device')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC13',
    name: 'Loc theo nhieu khu vuc',
    goal: 'Kiem tra repeated areas filter',
    precondition: 'Co area automation A/B va device gan A',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      let areaA: string | undefined
      let areaB: string | undefined
      await withAutomationDevice(api, evidence, 'TC13', async ({ deviceId }) => {
        try {
          areaA = await createAutomationArea(api, evidence, 'TC13A')
          areaB = await createAutomationArea(api, evidence, 'TC13B')
          const assign = await api.assignDevicesToArea(areaA, [deviceId])
          expectStatus(assign.status(), [200, 201, 202, 204], evidence, 'Device is assigned before multi-area filter')
          const response = await api.listDevices({ page: 1, limit: 20, areas: `${areaA},${areaB}` })
          expect(response.status()).toBe(200)
          evidence.addAssertion('Filter by multiple areas returns HTTP 200')
        } finally {
          if (areaA) await api.unassignDevicesFromArea(areaA, [deviceId])
          await cleanupArea(api, evidence, areaA)
          await cleanupArea(api, evidence, areaB)
        }
      })
    },
  },
  {
    id: 'TC14',
    name: 'Loc thiet bi chua gan khu vuc',
    goal: 'Kiem tra areas=null',
    precondition: 'Co device automation chua gan area',
    expected: 'HTTP 200 va response chua device chua gan',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC14', async ({ deviceId }) => {
        const response = await api.listDevices({ page: 1, limit: 20, areas: 'null' })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(deviceId)
        evidence.addAssertion('areas=null returns unassigned automation device')
      })
    },
  },
  {
    id: 'TC15',
    name: 'Loc khu vuc hoac chua gan',
    goal: 'Kiem tra areas=<id>&areas=null theo source Postman',
    precondition: 'Co device automation chua gan area',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC15', async () => {
        const areaId = env.testAreaId || 'null'
        const response = await api.listDevices({ page: 1, limit: 20, areas: `${areaId},null` })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Area or unassigned filter returns HTTP 200')
      })
    },
  },
  {
    id: 'TC16',
    name: 'Loc theo loai thiet bi',
    goal: 'Kiem tra device_type_id filter',
    precondition: 'TEST_DEVICE_TYPE_ID neu moi truong co catalog',
    expected: 'HTTP 200 hoac skip fixture missing',
    run: async (api, evidence) => {
      test.skip(!env.testDeviceTypeId, 'Set TEST_DEVICE_TYPE_ID to run device type filter')
      const response = await api.listDevices({ page: 1, limit: 20, device_type_id: env.testDeviceTypeId })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by device_type_id returns HTTP 200')
    },
  },
  {
    id: 'TC17',
    name: 'Loc thiet bi input',
    goal: 'Kiem tra io_capability=input',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20, io_capability: 'input' })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=input returns HTTP 200')
    },
  },
  {
    id: 'TC18',
    name: 'Loc thiet bi output',
    goal: 'Kiem tra io_capability=output',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20, io_capability: 'output' })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=output returns HTTP 200')
    },
  },
  {
    id: 'TC19',
    name: 'Loc thiet bi input output',
    goal: 'Kiem tra io_capability=both',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20, io_capability: 'both' })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=both returns HTTP 200')
    },
  },
  {
    id: 'TC20',
    name: 'Ket hop nhieu filter',
    goal: 'Kiem tra ket hop hc/protocol/network/search',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va response chua device automation',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC20', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          hc_id: env.testHcId,
          protocol: String(payload.protocol),
          network_state: 'activated',
          search: String(payload.mac),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(String(payload.mac).toLowerCase())
        evidence.addAssertion('Combined filters return automation device')
      })
    },
  },
  {
    id: 'TC21',
    name: 'Xem chi tiet thiet bi thanh cong',
    goal: 'Kiem tra detail device',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va id/mac dung',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC21', async ({ deviceId, payload }) => {
        const response = await api.getDevice(deviceId)
        const body = await responseBody(response)
        const data = responseData(body)
        expect(response.status()).toBe(200)
        expect(String(data.id)).toBe(deviceId)
        expect(String(data.mac).toLowerCase()).toBe(String(payload.mac).toLowerCase())
        evidence.addAssertion('Device detail returns created id and MAC')
      })
    },
  },
  {
    id: 'TC22',
    name: 'Xem chi tiet thiet bi khong ton tai',
    goal: 'Kiem tra detail fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.getDevice(fakeDeviceId)
      expectStatus(response.status(), [400, 404], evidence, 'Nonexistent device detail is rejected')
    },
  },
  {
    id: 'TC23',
    name: 'Lookup nhieu thiet bi thanh cong',
    goal: 'Kiem tra POST /devices/lookup',
    precondition: 'Co 2 device automation',
    expected: 'HTTP 200 va items chua id da truyen',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC23A', async (a) => {
        await withAutomationDevice(api, evidence, 'TC23B', async (b) => {
          const response = await api.lookupDevices([a.deviceId, b.deviceId])
          const body = await responseBody(response)
          expect(response.status()).toBe(200)
          const text = JSON.stringify(body)
          expect(text).toContain(a.deviceId)
          expect(text).toContain(b.deviceId)
          evidence.addAssertion('Lookup returns both automation devices')
        })
      })
    },
  },
  {
    id: 'TC24',
    name: 'Lookup co ID khong ton tai',
    goal: 'Kiem tra lookup voi fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 khong crash hoac validation ro rang',
    run: async (api, evidence) => {
      const response = await api.lookupDevices([fakeDeviceId])
      expectStatus(response.status(), [200, 400], evidence, 'Lookup fake id returns explicit backend result')
    },
  },
```

- [ ] **Step 3: Add describe block and precheck**

Append this closing harness temporarily after the current `cases` array in the
file:

```ts
]

test.describe('Device Management API suite aligned with manual sheet', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearDeviceEvidenceDir(env)
    if (
      env.requireAuth &&
      !env.adminAccessToken &&
      (!env.adminUsername || !env.adminPassword)
    ) {
      const error =
        'ADMIN_USERNAME/ADMIN_PASSWORD or DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN/BMS_ACCESS_TOKEN are required when DEVICE_MANAGEMENT_REQUIRE_AUTH is true'
      await writeDevicePrecheckEvidence(env, 'PRECHECK_admin_login_env_missing', {
        status: 'FAILED',
        error_message: error,
      })
      throw new Error(error)
    }

    const precheckApi = await newDeviceManagementSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeDevicePrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(`Health check failed before Device suite: ${health.status()}`)
      }
    } finally {
      await precheckApi.context.dispose()
    }

    if (env.adminAccessToken) {
      adminToken = env.adminAccessToken
    } else if (env.adminUsername && env.adminPassword) {
      const adminLogin = await loginDeviceSuiteUser(
        env,
        env.adminUsername,
        env.adminPassword,
      )
      adminToken = adminLogin.token
      adminRefreshToken = adminLogin.refreshToken
    }
    adminApi = await newDeviceManagementSuiteApi(env, adminToken)
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

- [ ] **Step 4: Run the first slice**

Run:

```powershell
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --reporter=line --workers=1 --grep "TC1|TC2|TC3|TC4|TC6|TC7|TC11|TC16|TC17|TC18|TC19|TC22|TC24"
```

Expected: read-only cases pass or fail only due missing real env/credentials.
Evidence files are created under `test-runs/device-management-current/evidence/`.

- [ ] **Step 5: Commit Task 3**

```powershell
git add tests/api/bms/device-management/device-management.api.spec.ts
git commit -m "test: add device management read cases"
```

## Task 4: Add Write, Update, Delete, Area, Permission Cases TC25-TC54

**Files:**
- Modify: `tests/api/bms/device-management/device-management.api.spec.ts`

- [ ] **Step 1: Insert TC25-TC54 before the closing `]` of `cases`**

Insert these case objects after TC24 and before `]`:

```ts
  {
    id: 'TC25',
    name: 'Them thiet bi vao HC thanh cong',
    goal: 'Kiem tra tao device tren HC that',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 200/201 va device duoc tao dung HC',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC25', async ({ deviceId, payload }) => {
        expect(deviceId).toBeTruthy()
        expect(String(payload.hc_id)).toBe(env.testHcId)
        evidence.addAssertion('Device is created under configured HC')
      })
    },
  },
  {
    id: 'TC26',
    name: 'Them thiet bi thieu ID',
    goal: 'Kiem tra validation missing id',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC26')
      delete payload.id
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(response.status(), [400], evidence, 'Missing device id is rejected')
    },
  },
  {
    id: 'TC27',
    name: 'Them thiet bi thieu MAC',
    goal: 'Kiem tra validation missing mac',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC27')
      delete payload.mac
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(response.status(), [400], evidence, 'Missing device MAC is rejected')
    },
  },
  {
    id: 'TC28',
    name: 'Them thiet bi voi MAC sai dinh dang',
    goal: 'Kiem tra validation invalid mac',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC28', { mac: 'bad-mac' })
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(response.status(), [400], evidence, 'Invalid MAC is rejected')
    },
  },
  {
    id: 'TC29',
    name: 'Them thiet bi trung ID',
    goal: 'Kiem tra duplicate id',
    precondition: 'Co device automation',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC29', async ({ payload }) => {
        const duplicate = generateDevicePayload(env, 'TC29_DUP', { id: payload.id })
        const response = await api.iotCreateDevice(env.testHcId, duplicate)
        expectStatus(response.status(), [400, 409], evidence, 'Duplicate id is rejected')
      })
    },
  },
  {
    id: 'TC30',
    name: 'Them thiet bi trung MAC',
    goal: 'Kiem tra duplicate mac',
    precondition: 'Co device automation',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC30', async ({ payload }) => {
        const duplicate = generateDevicePayload(env, 'TC30_DUP', { mac: payload.mac })
        const response = await api.iotCreateDevice(env.testHcId, duplicate)
        expectStatus(response.status(), [400, 409], evidence, 'Duplicate MAC is rejected')
      })
    },
  },
  {
    id: 'TC31',
    name: 'Bind batch thiet bi thanh cong',
    goal: 'Ghi nhan case bind-batch can fixture mesh safe',
    precondition: 'Can xac nhan cleanup bind-batch an toan',
    expected: 'Skipped co evidence cho den khi fixture duoc duyet',
    run: async (_, evidence) => {
      evidence.addAssertion('DEFERRED_SAFE_FIXTURE: bind-batch success waits for explicit safe HC mesh cleanup confirmation')
      test.skip(true, 'DEFERRED_SAFE_FIXTURE: bind-batch safe cleanup not confirmed')
    },
  },
  {
    id: 'TC32',
    name: 'Bind batch co thiet bi loi',
    goal: 'Ghi nhan case bind-batch mixed result can fixture mesh safe',
    precondition: 'Can xac nhan cleanup bind-batch an toan',
    expected: 'Skipped co evidence cho den khi fixture duoc duyet',
    run: async (_, evidence) => {
      evidence.addAssertion('DEFERRED_SAFE_FIXTURE: bind-batch mixed result waits for explicit safe HC mesh cleanup confirmation')
      test.skip(true, 'DEFERRED_SAFE_FIXTURE: bind-batch safe cleanup not confirmed')
    },
  },
  {
    id: 'TC33',
    name: 'Cap nhat toan bo thiet bi thanh cong',
    goal: 'Kiem tra PUT safe fields tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC33', async ({ deviceId, payload }) => {
        const response = await api.bmsPutDevice(deviceId, {
          ...payload,
          name: `auto_device_put_TC33_${Date.now()}`,
          notes: 'put updated by automation',
          icon_key: 'lightbulb',
        })
        expectStatus(response.status(), [200], evidence, 'BMS PUT updates automation device')
      })
    },
  },
  {
    id: 'TC34',
    name: 'Cap nhat ten ghi chu icon thiet bi',
    goal: 'Kiem tra PATCH safe fields',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va field dung',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC34', async ({ deviceId }) => {
        const notes = `auto_patch_notes_TC34_${Date.now()}`
        const response = await api.bmsPatchDevice(deviceId, {
          name: `auto_device_patch_TC34_${Date.now()}`,
          notes,
          icon_key: 'lightbulb',
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(notes)
        evidence.addAssertion('BMS PATCH updates name/notes/icon')
      })
    },
  },
  {
    id: 'TC35',
    name: 'Cap nhat trang thai network',
    goal: 'Kiem tra network_state record update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC35', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, { network_state: 'pending' })
        expectStatus(response.status(), [200], evidence, 'IoT PATCH network_state updates automation record')
      })
    },
  },
  {
    id: 'TC36',
    name: 'Cap nhat network data',
    goal: 'Kiem tra network_data update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC36', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, { network_data: { rssi: -65 } })
        expectStatus(response.status(), [200], evidence, 'IoT PATCH network_data updates automation record')
      })
    },
  },
  {
    id: 'TC37',
    name: 'Cap nhat scene config',
    goal: 'Kiem tra scene/config update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC37', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, {
          scene: { mode: 'night' },
          config: { room: 'automation' },
        })
        expectStatus(response.status(), [200], evidence, 'IoT PATCH scene/config updates automation record')
      })
    },
  },
  {
    id: 'TC38',
    name: 'Cap nhat thiet bi khong ton tai',
    goal: 'Kiem tra update fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.bmsPatchDevice(fakeDeviceId, { notes: 'not found' })
      expectStatus(response.status(), [400, 404], evidence, 'Updating nonexistent device is rejected')
    },
  },
  {
    id: 'TC39',
    name: 'Xoa thiet bi thanh cong',
    goal: 'Kiem tra delete single automation-created device',
    precondition: 'Co device automation',
    expected: 'HTTP 200/204 va detail khong con',
    run: async (api, evidence) => {
      const created = await createAutomationDevice(api, evidence, 'TC39')
      const response = await api.iotDeleteDevice(created.deviceId)
      expectStatus(response.status(), [200, 204], evidence, 'Automation device is deleted')
      const getResponse = await api.iotGetDevice(created.deviceId)
      expectStatus(getResponse.status(), [204, 404], evidence, 'Deleted device is absent from IoT detail')
    },
  },
  {
    id: 'TC40',
    name: 'Huy xoa thiet bi',
    goal: 'Ghi nhan UI-only cancel delete khong goi API',
    precondition: 'Popup xac nhan xoa dang mo trong UI',
    expected: 'Khong goi API delete',
    run: async (_, evidence) => {
      evidence.addAssertion('UI_ONLY_NOT_APPLICABLE: cancel delete does not call API in API suite')
    },
  },
  {
    id: 'TC41',
    name: 'Xoa thiet bi khong ton tai',
    goal: 'Kiem tra delete fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 204 theo backend',
    run: async (api, evidence) => {
      const response = await api.iotDeleteDevice(fakeDeviceId)
      expectStatus(response.status(), [204, 404], evidence, 'Deleting nonexistent device returns explicit backend result')
    },
  },
  {
    id: 'TC42',
    name: 'Xoa thiet bi dang thuoc khu vuc',
    goal: 'Kiem tra backend rule khi delete device assigned area',
    precondition: 'Co automation device assigned area',
    expected: 'HTTP explicit backend result va cleanup sach',
    run: async (api, evidence) => {
      let areaId: string | undefined
      const created = await createAutomationDevice(api, evidence, 'TC42')
      try {
        areaId = await createAutomationArea(api, evidence, 'TC42')
        await api.assignDevicesToArea(areaId, [created.deviceId])
        const response = await api.iotDeleteDevice(created.deviceId)
        expectStatus(response.status(), [200, 204, 400, 409], evidence, 'Deleting area-assigned automation device returns explicit backend rule')
      } finally {
        if (areaId) await api.unassignDevicesFromArea(areaId, [created.deviceId])
        await cleanupArea(api, evidence, areaId)
        await cleanupDevice(api, evidence, created.deviceId)
      }
    },
  },
  {
    id: 'TC43',
    name: 'Xoa thiet bi dang thuoc group',
    goal: 'Ghi nhan case can group fixture an toan',
    precondition: 'Can automation group fixture',
    expected: 'Skipped co evidence neu chua co fixture',
    run: async (_, evidence) => {
      evidence.addAssertion('DEFERRED_GROUP_FIXTURE: group-bound delete waits for safe automation group fixture')
      test.skip(true, 'DEFERRED_GROUP_FIXTURE: safe group fixture not configured')
    },
  },
  {
    id: 'TC45',
    name: 'Gan 1 thiet bi vao khu vuc',
    goal: 'Kiem tra assign device to area',
    precondition: 'Co area va device automation',
    expected: 'Device duoc gan vao area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC45', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC45')
          const response = await api.assignDevicesToArea(areaId, [deviceId])
          expectStatus(response.status(), [200, 201, 202, 204], evidence, 'Device is assigned to area')
          const list = await api.listAreaDevices(areaId, { page: 1, limit: 20 })
          expect(JSON.stringify(await responseBody(list))).toContain(deviceId)
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC46',
    name: 'Bo gan thiet bi khoi khu vuc',
    goal: 'Kiem tra unassign device from area',
    precondition: 'Device da duoc assign area',
    expected: 'Device khong con trong area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC46', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC46')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.unassignDevicesFromArea(areaId, [deviceId])
          expectStatus(response.status(), [200, 202, 204], evidence, 'Device is unassigned from area')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC47',
    name: 'Cap nhat vi tri thiet bi tren mat bang',
    goal: 'Kiem tra update position hop le',
    precondition: 'Device da duoc gan area',
    expected: 'HTTP 200/204',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC47', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC47')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.updateDevicePosition(areaId, deviceId, { pos_x: 0.25, pos_y: 0.75 })
          expectStatus(response.status(), [200, 204], evidence, 'Device position is updated')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC48',
    name: 'Cap nhat vi tri ngoai khoang hop le',
    goal: 'Kiem tra validation position',
    precondition: 'Device da duoc gan area',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC48', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC48')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.updateDevicePosition(areaId, deviceId, { pos_x: -1, pos_y: 2 })
          expectStatus(response.status(), [400], evidence, 'Invalid position is rejected')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC49',
    name: 'Xem summary thiet bi theo khu vuc',
    goal: 'Kiem tra area device summary',
    precondition: 'Co area automation',
    expected: 'HTTP 200 va co summary fields',
    run: async (api, evidence) => {
      let areaId: string | undefined
      try {
        areaId = await createAutomationArea(api, evidence, 'TC49')
        const response = await api.getAreaDeviceSummary(areaId)
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain('total')
        evidence.addAssertion('Area device summary returns summary payload')
      } finally {
        await cleanupArea(api, evidence, areaId)
      }
    },
  },
  {
    id: 'TC50',
    name: 'User khong co quyen xem thiet bi',
    goal: 'Kiem tra permission view devices',
    precondition: 'NO_PERMISSION user neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (_, evidence) => {
      const userApi = await loginOptionalUserApi(env.noPermissionUsername, env.noPermissionPassword, evidence, 'NO_PERMISSION', env.noPermissionAccessToken)
      if (!userApi) return
      try {
        const response = await userApi.withEvidence(evidence).listDevices({ page: 1, limit: 10 })
        expectStatus(response.status(), [403], evidence, 'No-permission user cannot view device list')
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC51',
    name: 'User khong co quyen them thiet bi',
    goal: 'Kiem tra permission create device',
    precondition: 'VIEWER/NO_PERMISSION user neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(env.viewerUsername || env.noPermissionUsername, env.viewerPassword || env.noPermissionPassword, evidence, 'VIEWER_OR_NO_PERMISSION', env.viewerAccessToken || env.noPermissionAccessToken)
      if (!userApi) return
      let createdId: string | undefined
      try {
        const payload = generateDevicePayload(env, 'TC51')
        const response = await userApi.withEvidence(evidence).iotCreateDevice(env.testHcId, payload)
        const body = await responseBody(response)
        createdId = String(body?.data?.id || body?.id || payload.id || '')
        expectStatus(response.status(), [403], evidence, 'Non-admin user cannot create device')
      } finally {
        await cleanupDevice(api, evidence, createdId)
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC52',
    name: 'User khong co quyen sua thiet bi',
    goal: 'Kiem tra permission update device',
    precondition: 'VIEWER/NO_PERMISSION user va automation device',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(env.viewerUsername || env.noPermissionUsername, env.viewerPassword || env.noPermissionPassword, evidence, 'VIEWER_OR_NO_PERMISSION', env.viewerAccessToken || env.noPermissionAccessToken)
      if (!userApi) return
      try {
        await withAutomationDevice(api, evidence, 'TC52', async ({ deviceId }) => {
          const response = await userApi.withEvidence(evidence).bmsPatchDevice(deviceId, { notes: 'blocked' })
          expectStatus(response.status(), [403], evidence, 'Non-admin user cannot update device')
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC53',
    name: 'User khong co quyen xoa thiet bi',
    goal: 'Kiem tra permission delete device',
    precondition: 'VIEWER/NO_PERMISSION user va automation device',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(env.viewerUsername || env.noPermissionUsername, env.viewerPassword || env.noPermissionPassword, evidence, 'VIEWER_OR_NO_PERMISSION', env.viewerAccessToken || env.noPermissionAccessToken)
      if (!userApi) return
      try {
        await withAutomationDevice(api, evidence, 'TC53', async ({ deviceId }) => {
          const response = await userApi.withEvidence(evidence).iotDeleteDevice(deviceId)
          expectStatus(response.status(), [403], evidence, 'Non-admin user cannot delete device')
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC54',
    name: 'Thieu token khi xem danh sach',
    goal: 'Kiem tra auth guard list device',
    precondition: 'Khong truyen Authorization',
    expected: 'HTTP 401/400 hoac auth disabled evidence',
    run: async (_, evidence) => {
      const anonymousApi = await newDeviceManagementSuiteApi(env)
      try {
        const response = await anonymousApi.withEvidence(evidence).listDevices({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          env.requireAuth ? [400, 401] : [200, 400, 401],
          evidence,
          response.status() === 200
            ? 'Auth is disabled in current environment; anonymous list is allowed'
            : 'Anonymous list device is rejected',
        )
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
```

- [ ] **Step 2: Run all implemented cases with safe writes**

Run:

```powershell
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/device-management-current/test-results
```

Expected:

- TC1-TC30, TC33-TC42, TC45-TC54 execute.
- TC31, TC32, TC43 are skipped with evidence until safe fixtures are approved.
- TC44 is absent by explicit user instruction and listed in README as deferred.
- All created automation devices/areas are cleaned up or have cleanup warnings in evidence.

- [ ] **Step 3: Commit Task 4**

```powershell
git add tests/api/bms/device-management/device-management.api.spec.ts
git commit -m "test: cover safe device management cases"
```

## Task 5: Add README And Environment Template

**Files:**
- Create: `tests/api/bms/device-management/README.md`
- Modify: `.env.template`

- [ ] **Step 1: Create README**

Create `tests/api/bms/device-management/README.md`:

```md
# Device Management API Real-System Suite

This suite automates the Device Management manual sheet against the real BMS
system, real Home Controller, and real device records.

## Scope

Implemented:

- TC1-TC30 list/search/filter/detail/lookup/create/validation.
- TC33-TC43 safe update/delete behavior.
- TC45-TC54 area, position, summary, permission, and auth cases.

Deferred:

- TC31-TC32 bind-batch until safe HC mesh cleanup is confirmed.
- TC44 batch delete, by explicit user instruction.
- Network configuration and factory reset flows, by explicit user instruction.

## Safety

- Write cases create automation-owned devices with `auto_device_*` data.
- Delete cases delete only automation-created devices.
- Cleanup runs in `finally`.
- Evidence records cleanup warnings when backend cleanup is not successful.
- The suite does not call batch delete, network configuration, or factory reset.

## Required Env

```env
BASE_URL=http://10.10.0.195:3333
API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
DEVICE_MANAGEMENT_REQUIRE_AUTH=true
TEST_HC_ID=
TEST_HC_MAC=
TEST_DEVICE_CELL_MODEL_ID=501
TEST_DEVICE_PID=1234
TEST_DEVICE_PROTOCOL=ble
TEST_DEVICE_CELL_IDX=1
```

Optional:

```env
DEVICE_MANAGEMENT_RUN_DIR=
DEVICE_MANAGEMENT_EVIDENCE_DIR=
DEVICE_MANAGEMENT_RUN_ID=
DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN=
DEVICE_MANAGEMENT_VIEWER_ACCESS_TOKEN=
DEVICE_MANAGEMENT_NO_PERMISSION_ACCESS_TOKEN=
VIEWER_USERNAME=
VIEWER_PASSWORD=
NO_PERMISSION_USERNAME=
NO_PERMISSION_PASSWORD=
TEST_DEVICE_TYPE_ID=
TEST_AREA_ID=
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
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/device-management-current/test-results
```

Evidence:

```text
test-runs/device-management-current/evidence/
test-runs/device-management-current/test-results/
playwright-report/
```

Failed cases collect redacted request/response evidence, optional system logs,
and HC SSH logs for the testcase time window when `HC_SSH_*` is configured.
```

- [ ] **Step 2: Append missing env variables to `.env.template`**

Add this block below the Home Controller Management section:

```env

# Device Management API suite
DEVICE_MANAGEMENT_BASE_URL=
DEVICE_MANAGEMENT_RUN_DIR=
DEVICE_MANAGEMENT_EVIDENCE_DIR=
DEVICE_MANAGEMENT_RUN_ID=
DEVICE_MANAGEMENT_REQUIRE_AUTH=
DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN=
DEVICE_MANAGEMENT_VIEWER_ACCESS_TOKEN=
DEVICE_MANAGEMENT_NO_PERMISSION_ACCESS_TOKEN=
DEVICE_MANAGEMENT_COLLECT_SYSTEM_LOG_ON_FAIL=true
DEVICE_MANAGEMENT_SYSTEM_LOG_COMMAND=docker compose logs --no-color --tail 300 iot-console bms-api
DEVICE_MANAGEMENT_SYSTEM_LOG_MAX_CHARS=30000
TEST_DEVICE_CELL_MODEL_ID=501
TEST_DEVICE_PID=1234
TEST_DEVICE_PROTOCOL=ble
TEST_DEVICE_CELL_IDX=1
TEST_DEVICE_TYPE_ID=
```

- [ ] **Step 3: Commit Task 5**

```powershell
git add .env.template tests/api/bms/device-management/README.md
git commit -m "docs: document device management suite"
```

## Task 6: Verification, Evidence Review, And Final Cleanup Audit

**Files:**
- Verify: `src/core/bms-api/device-management-suite.ts`
- Verify: `tests/api/bms/device-management/device-management.api.spec.ts`
- Verify: `tests/api/bms/device-management/README.md`
- Verify: `.env.template`

- [ ] **Step 1: Run static check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no errors introduced by Device Management files.

- [ ] **Step 2: Run real suite**

Run:

```powershell
npx.cmd playwright test tests/api/bms/device-management/device-management.api.spec.ts --config=playwright.config.ts --reporter=line,html --workers=1 --output=test-runs/device-management-current/test-results
```

Expected:

- All safe executable cases pass or skip only for documented missing fixtures.
- Failures include evidence JSON with request/response and log capture.
- Evidence folder contains only latest run artifacts.

- [ ] **Step 3: Inspect evidence for completeness**

Run:

```powershell
Get-ChildItem test-runs\device-management-current\evidence | Select-Object Name,Length
```

Expected: one evidence JSON per executed/skipped testcase, plus precheck only if
precheck failed.

- [ ] **Step 4: Check for accidental destructive calls**

Run:

```powershell
rg -n "delete-batch|factory|reset-factory|network-config|network_configuration" src\core\bms-api\device-management-suite.ts tests\api\bms\device-management
```

Expected: no matches except README/deferred wording. If matches appear in code,
remove them before review.

- [ ] **Step 5: Review git diff**

Run:

```powershell
git diff --stat HEAD
git diff -- src/core/bms-api/device-management-suite.ts tests/api/bms/device-management/device-management.api.spec.ts tests/api/bms/device-management/README.md .env.template
```

Expected: only Device Management suite files and `.env.template` changed.

- [ ] **Step 6: Commit final verification notes if code changed during fixes**

If fixes were needed:

```powershell
git add src/core/bms-api/device-management-suite.ts tests/api/bms/device-management/device-management.api.spec.ts tests/api/bms/device-management/README.md .env.template
git commit -m "test: stabilize device management evidence"
```

## Self-Review Checklist

- Spec coverage: Task 1 covers evidence/logging; Task 2 covers API wrappers;
  Task 3 covers TC1-TC24; Task 4 covers TC25-TC54 except explicitly deferred
  TC44 and conditionally deferred TC31-TC32/TC43; Task 5 covers docs/env; Task 6
  covers verification and destructive-call audit.
- Placeholder scan: no step relies on undefined future work.
- Type consistency: helper class is `DeviceManagementSuiteApi`, evidence class
  is `DeviceManagementEvidence`, env type is `DeviceSuiteEnv`, and spec imports
  match Task 1/Task 2 exports.
- Safety: no plan step implements batch delete, network configuration, or
  factory reset.
