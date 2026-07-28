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
