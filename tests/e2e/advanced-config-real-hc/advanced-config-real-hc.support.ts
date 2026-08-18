import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  expect,
  request,
} from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'ssh2'
import {
  ADVANCED_CONFIG_ACK_TIMEOUT_MS,
  ADVANCED_CONFIG_BASE_URL,
  ADVANCED_CONFIG_GROUP_ID,
  ADVANCED_CONFIG_HC_ID,
  ADVANCED_CONFIG_MSB_DEVICE_ID,
  ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID,
  ADVANCED_CONFIG_POLL_INTERVAL_MS,
  ADVANCED_CONFIG_PRESENCE_DEVICE_ID,
  ADVANCED_CONFIG_RUN_DIR,
  ADVANCED_CONFIG_TARGET_DEVICE_ID,
  BMS_ACCESS_TOKEN,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { delay } from '@src/utils'

export type JsonRecord = Record<string, unknown>

export type AdvancedConfigEnv = ReturnType<typeof getAdvancedConfigEnv>

export type AdvancedConfigEvidenceStatus = 'PASSED' | 'FAILED' | 'SKIPPED'

type EvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  base_url?: string
  request?: unknown
  response?: unknown
  status?: number
  details?: unknown
}

type HcLogEvidence = {
  step: string
  method: 'SSH'
  endpoint?: string
  request?: string
  status: 'captured' | 'failed' | 'skipped'
  exit_code?: number
  window?: {
    started_at_iso: string
    finished_at_iso: string
    start_bangkok: string
    end_bangkok: string
  }
  response?: {
    stdout_tail?: string
    stderr_tail?: string
    max_chars?: number
  }
  reason?: string
}

const RUN_DIR = path.resolve(process.cwd(), ADVANCED_CONFIG_RUN_DIR)
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence', 'api')
const RUN_MARKER = path.join(RUN_DIR, '.advanced-config-run-id')

export const getAdvancedConfigEnv = () => ({
  baseUrl: ADVANCED_CONFIG_BASE_URL,
  hcId: ADVANCED_CONFIG_HC_ID,
  msbDeviceId: ADVANCED_CONFIG_MSB_DEVICE_ID,
  msbSceneDeviceId: ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID,
  presenceDeviceId: ADVANCED_CONFIG_PRESENCE_DEVICE_ID,
  targetDeviceId: ADVANCED_CONFIG_TARGET_DEVICE_ID,
  groupId: ADVANCED_CONFIG_GROUP_ID,
  allowDeviceControl:
    process.env.ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL === 'true',
  ackTimeoutMs: ADVANCED_CONFIG_ACK_TIMEOUT_MS,
  pollIntervalMs: ADVANCED_CONFIG_POLL_INTERVAL_MS,
  runId: process.env.ADVANCED_CONFIG_RUN_ID || `manual-${Date.now()}`,
  accessToken:
    process.env.ADVANCED_CONFIG_ACCESS_TOKEN ||
    process.env.BMS_ACCESS_TOKEN ||
    BMS_ACCESS_TOKEN ||
    '',
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

export class AdvancedConfigEvidence {
  private steps: EvidenceStep[] = []
  private assertions: string[] = []
  private hcLogs: HcLogEvidence[] = []
  private cleanup = {
    restored_keys: [] as string[],
    warnings: [] as string[],
  }

  readonly startedAt = new Date().toISOString()

  constructor(
    private testInfo: TestInfo,
    private tcId: string,
    private tcName: string,
    private env: AdvancedConfigEnv,
  ) {}

  attachStep(step: EvidenceStep) {
    this.steps.push(redactSecrets(step) as EvidenceStep)
  }

  attachAssertion(assertion: string) {
    this.assertions.push(assertion)
  }

  attachRestoredKey(key: string) {
    this.cleanup.restored_keys.push(key)
  }

  attachCleanupWarning(warning: string) {
    this.cleanup.warnings.push(warning)
  }

  attachHcLog(log: HcLogEvidence) {
    this.hcLogs.push(log)
  }

  async save(status: AdvancedConfigEvidenceStatus, error?: unknown) {
    await mkdir(EVIDENCE_DIR, { recursive: true })
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
        base_url: this.env.baseUrl,
        config_api: '/api/devices/config',
        cmd_api: '/api/devices/cmd',
        devices_api: '/api/devices',
      },
      steps: this.steps,
      assertions: this.assertions,
      cleanup: this.cleanup,
      hc_logs: this.hcLogs,
      error_message:
        error instanceof Error
          ? error.message
          : error
            ? String(error)
            : undefined,
    }
    const body = JSON.stringify(redactSecrets(evidence), null, 2)
    await writeFile(path.join(EVIDENCE_DIR, filename), body, 'utf8')
    await this.testInfo.attach(filename, {
      body,
      contentType: 'application/json',
    })
  }
}

export class AdvancedConfigApiClient {
  constructor(
    private context: APIRequestContext,
    private env: AdvancedConfigEnv,
    private evidence?: AdvancedConfigEvidence,
  ) {}

  withEvidence(evidence: AdvancedConfigEvidence) {
    return new AdvancedConfigApiClient(this.context, this.env, evidence)
  }

  async dispose() {
    await this.context.dispose()
  }

  async listDevicesAPI() {
    return this.context.get('/api/devices', {
      headers: requestHeaders(this.env),
      timeout: 10_000,
    })
  }

  async getDeviceConfigAPI(deviceId: string | number) {
    return this.context.get(`/api/devices/${deviceId}/config`, {
      headers: requestHeaders(this.env),
      timeout: 10_000,
    })
  }

  async getDeviceDetailAPI(deviceId: string | number) {
    return this.context.get(`/api/devices/${deviceId}`, {
      headers: requestHeaders(this.env),
      timeout: 10_000,
    })
  }

  async setConfigAPI(
    deviceId: string | number,
    config: Record<string, unknown>,
  ) {
    return this.context.post('/api/devices/config', {
      headers: requestHeaders(this.env),
      timeout: 20_000,
      data: {
        device_id: String(deviceId),
        config,
      },
    })
  }

  async commandAPI(
    deviceId: string | number,
    cmd: string,
    params: Record<string, unknown> = {},
  ) {
    return this.context.post('/api/devices/cmd', {
      headers: requestHeaders(this.env),
      timeout: 20_000,
      data: {
        device_id: String(deviceId),
        cmd,
        params,
      },
    })
  }

  async listDevices(step = 'List devices') {
    const response = await this.listDevicesAPI()
    const body = await recordResponse(this.evidence, step, response, {
      method: 'GET',
      endpoint: '/api/devices',
      baseUrl: this.env.baseUrl,
    })
    expect(response.status()).toBe(200)
    return extractItems(body)
  }

  async readDeviceConfig(
    deviceId: string | number,
    step = 'Read device config',
  ) {
    const response = await this.getDeviceConfigAPI(deviceId)
    const body = await safeJson(response)
    if (response.status() === 200) {
      this.evidence?.attachStep({
        step,
        method: 'GET',
        endpoint: `/api/devices/${deviceId}/config`,
        base_url: this.env.baseUrl,
        response: body,
        status: response.status(),
      })
      return extractConfig(body)
    }

    const detailResponse = await this.getDeviceDetailAPI(deviceId)
    const detailBody = await recordResponse(
      this.evidence,
      `${step} fallback detail`,
      detailResponse,
      {
        method: 'GET',
        endpoint: `/api/devices/${deviceId}`,
        baseUrl: this.env.baseUrl,
      },
    )
    if (detailResponse.status() === 200) {
      return extractConfig(detailBody)
    }

    const devices = await this.listDevices(`${step} fallback list devices`)
    const device = devices.find((item) => String(item.id) === String(deviceId))
    expect(
      device,
      `Device ${String(deviceId)} must exist in /api/devices`,
    ).toBeTruthy()
    return extractConfig(device)
  }

  async setConfigAndWait(
    deviceId: string | number,
    config: Record<string, unknown>,
    expectedConfig: Record<string, unknown> = config,
  ) {
    const response = await this.setConfigAPI(deviceId, config)
    const body = await recordResponse(
      this.evidence,
      'Set device config',
      response,
      {
        method: 'POST',
        endpoint: '/api/devices/config',
        baseUrl: this.env.baseUrl,
        request: {
          device_id: String(deviceId),
          config,
        },
      },
    )
    expect([200, 202]).toContain(response.status())
    this.evidence?.attachAssertion('Config API accepted request')
    await expectAcceptedBody(body)

    const finalConfig = await this.waitForConfig(deviceId, expectedConfig)
    for (const [key, value] of Object.entries(expectedConfig)) {
      expectConfigValue(finalConfig, key, value)
      this.evidence?.attachAssertion(`Config key ${key} reached expected value`)
    }
    return finalConfig
  }

  async waitForConfig(
    deviceId: string | number,
    expectedConfig: Record<string, unknown>,
    timeoutMs = this.env.ackTimeoutMs,
  ) {
    const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
    const attemptSummaries: Array<{
      attempt: number
      matched: boolean
      keys: Record<string, unknown>
    }> = []
    let finalConfig: JsonRecord = {}

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      finalConfig = await this.readDeviceConfigWithoutEvidence(deviceId)
      const matched = configMatches(finalConfig, expectedConfig)
      attemptSummaries.push({
        attempt,
        matched,
        keys: pickKeys(finalConfig, Object.keys(expectedConfig)),
      })
      if (matched) {
        this.evidence?.attachStep({
          step: 'Poll config until ACK/config visible',
          details: {
            timeout_ms: timeoutMs,
            poll_interval_ms: this.env.pollIntervalMs,
            attempts: attemptSummaries,
          },
        })
        return finalConfig
      }
      await delay(this.env.pollIntervalMs)
    }

    this.evidence?.attachStep({
      step: 'Poll config until ACK/config visible',
      details: {
        timeout_ms: timeoutMs,
        poll_interval_ms: this.env.pollIntervalMs,
        attempts: attemptSummaries,
        final_config_sample: pickKeys(finalConfig, Object.keys(expectedConfig)),
      },
    })
    expect(configMatches(finalConfig, expectedConfig)).toBe(true)
    return finalConfig
  }

  async command(deviceId: string | number, cmd: string, params = {}) {
    const response = await this.commandAPI(deviceId, cmd, params)
    const body = await recordResponse(
      this.evidence,
      `Run command ${cmd}`,
      response,
      {
        method: 'POST',
        endpoint: '/api/devices/cmd',
        baseUrl: this.env.baseUrl,
        request: {
          device_id: String(deviceId),
          cmd,
          params,
        },
      },
    )
    expect([200, 202]).toContain(response.status())
    await expectAcceptedBody(body)
    this.evidence?.attachAssertion(`Command ${cmd} accepted by gateway/HC`)
    return body
  }

  async expectConfigMisuseRejectedOrNotPersisted(
    deviceId: string | number,
    config: Record<string, unknown>,
  ) {
    const response = await this.setConfigAPI(deviceId, config)
    const body = await recordResponse(
      this.evidence,
      'Send invalid config payload',
      response,
      {
        method: 'POST',
        endpoint: '/api/devices/config',
        baseUrl: this.env.baseUrl,
        request: {
          device_id: String(deviceId),
          config,
        },
      },
    )
    if (![200, 202].includes(response.status())) {
      this.evidence?.attachAssertion('Invalid config was rejected by API')
      return body
    }

    await delay(Math.min(3000, this.env.ackTimeoutMs))
    const current = await this.readDeviceConfig(
      deviceId,
      'Verify invalid config not persisted',
    )
    for (const [key, value] of Object.entries(config)) {
      expect(configValueMatches(current, key, value)).toBe(false)
    }
    this.evidence?.attachAssertion(
      'Invalid config was accepted by HTTP but not persisted on device config',
    )
    return body
  }

  private async readDeviceConfigWithoutEvidence(deviceId: string | number) {
    const response = await this.getDeviceConfigAPI(deviceId)
    if (response.status() === 200) {
      return extractConfig(await safeJson(response))
    }
    const detailResponse = await this.getDeviceDetailAPI(deviceId)
    if (detailResponse.status() === 200) {
      return extractConfig(await safeJson(detailResponse))
    }
    const listResponse = await this.listDevicesAPI()
    if (listResponse.status() === 200) {
      const devices = extractItems(await safeJson(listResponse))
      const device = devices.find(
        (item) => String(item.id) === String(deviceId),
      )
      return device ? extractConfig(device) : {}
    }
    return {}
  }
}

export const createAdvancedConfigApi = async (env: AdvancedConfigEnv) => {
  const context = await request.newContext({ baseURL: env.baseUrl })
  return new AdvancedConfigApiClient(context, env)
}

export const resetAdvancedConfigEvidenceRunDir = async (
  env: AdvancedConfigEnv,
) => {
  let marker = ''
  try {
    marker = await readFile(RUN_MARKER, 'utf8')
  } catch {
    marker = ''
  }

  if (marker.trim() !== env.runId) {
    await rm(EVIDENCE_DIR, { recursive: true, force: true })
    await mkdir(EVIDENCE_DIR, { recursive: true })
    await writeFile(RUN_MARKER, env.runId, 'utf8')
    return
  }
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

export const requireEnvValue = (
  value: string | number | undefined,
  name: string,
) => {
  expect(String(value ?? ''), `${name} is required`).not.toBe('')
}

export const withRestoredConfig = async (
  api: AdvancedConfigApiClient,
  evidence: AdvancedConfigEvidence,
  deviceId: string | number,
  keys: string[],
  work: () => Promise<void>,
) => {
  const original = await api.readDeviceConfig(
    deviceId,
    'Capture original config',
  )
  try {
    await work()
  } finally {
    const restorePayload = Object.fromEntries(
      keys.map((key) => [
        key,
        Object.prototype.hasOwnProperty.call(original, key)
          ? original[key]
          : null,
      ]),
    )
    try {
      await api.setConfigAndWait(deviceId, restorePayload, restorePayload)
      for (const key of keys) {
        evidence.attachRestoredKey(key)
      }
    } catch (error) {
      evidence.attachCleanupWarning(
        `Restore config failed for ${String(deviceId)} keys ${keys.join(',')}: ${String(error)}`,
      )
    }
  }
}

export const targetOutConfig = (env: AdvancedConfigEnv, value: 0 | 1) => {
  const targetId = env.groupId || env.targetDeviceId
  requireEnvValue(
    targetId,
    'ADVANCED_CONFIG_TARGET_DEVICE_ID or ADVANCED_CONFIG_GROUP_ID',
  )
  return {
    out: {
      [targetId]: {
        'input[1]': value,
      },
    },
  }
}

export const targetInOutConfig = (env: AdvancedConfigEnv, value: 0 | 1) => {
  const targetId = env.groupId || env.targetDeviceId
  requireEnvValue(
    targetId,
    'ADVANCED_CONFIG_TARGET_DEVICE_ID or ADVANCED_CONFIG_GROUP_ID',
  )
  return {
    in: {
      [env.targetDeviceId]: {
        'output[1]': '< 100',
      },
    },
    out: {
      [targetId]: {
        'input[1]': value,
      },
    },
  }
}

const recordResponse = async (
  evidence: AdvancedConfigEvidence | undefined,
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

const expectAcceptedBody = async (body: unknown) => {
  const record = asRecord(body)
  if ('status' in record) {
    expect(record.status).toBeTruthy()
  }
  if ('success' in record) {
    expect(record.success).toBeTruthy()
  }
}

const extractConfig = (body: unknown): JsonRecord => {
  const record = asRecord(body)
  if (isRecord(record.config)) {
    return record.config
  }
  const data = asRecord(record.data)
  if (isRecord(data.config)) {
    return data.config
  }
  if (isRecord(data.device) && isRecord(asRecord(data.device).config)) {
    return asRecord(asRecord(data.device).config)
  }
  if (isRecord(record.device) && isRecord(asRecord(record.device).config)) {
    return asRecord(asRecord(record.device).config)
  }
  return data
}

const extractItems = (body: unknown): JsonRecord[] => {
  if (Array.isArray(body)) {
    return body as JsonRecord[]
  }
  const record = asRecord(body)
  if (Array.isArray(record.data)) {
    return record.data as JsonRecord[]
  }
  const data = asRecord(record.data)
  if (Array.isArray(data.items)) {
    return data.items as JsonRecord[]
  }
  if (Array.isArray(data.data)) {
    return data.data as JsonRecord[]
  }
  return []
}

const configMatches = (
  actualConfig: JsonRecord,
  expectedConfig: Record<string, unknown>,
) =>
  Object.entries(expectedConfig).every(([key, expected]) =>
    configValueMatches(actualConfig, key, expected),
  )

const expectConfigValue = (
  actualConfig: JsonRecord,
  key: string,
  expected: unknown,
) => {
  if (expected === null) {
    expect(
      !Object.prototype.hasOwnProperty.call(actualConfig, key) ||
        actualConfig[key] === null,
    ).toBe(true)
    return
  }
  expect(configValueMatches(actualConfig, key, expected)).toBe(true)
}

const configValueMatches = (
  actualConfig: JsonRecord,
  key: string,
  expected: unknown,
) => {
  if (expected === null) {
    return (
      !Object.prototype.hasOwnProperty.call(actualConfig, key) ||
      actualConfig[key] === null
    )
  }
  return valueMatches(actualConfig[key], expected)
}

const pickKeys = (record: JsonRecord, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, record[key]]))

const requestHeaders = (env: AdvancedConfigEnv) => ({
  ...(env.accessToken ? { Authorization: `Bearer ${env.accessToken}` } : {}),
  'x-hc-id': env.hcId,
  'x-request-id': `advanced-config-${Date.now()}`,
  'x-user-id': 'automation-test',
  'x-app-id': 'bms-e2e-test',
})

const collectHcLog = async (
  evidence: AdvancedConfigEvidence,
  env: AdvancedConfigEnv,
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
    window: {
      started_at_iso: startedAt,
      finished_at_iso: finishedAt,
      start_bangkok: start,
      end_bangkok: end,
    },
    response: {
      stdout_tail: result.stdout.slice(-env.hcLogMaxChars),
      stderr_tail: result.stderr.slice(-env.hcLogMaxChars),
      max_chars: env.hcLogMaxChars,
    },
  })
}

const runSshCommand = async (
  env: AdvancedConfigEnv,
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

const buildSshAuth = async (env: AdvancedConfigEnv) => {
  if (env.hcSshKeyPath) {
    return {
      privateKey: await readFile(env.hcSshKeyPath),
      passphrase: env.hcSshKeyPassphrase || undefined,
    }
  }
  return { password: env.hcSshPassword }
}

const safeJson = async (response: { json: () => Promise<unknown> }) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const asRecord = (value: unknown): JsonRecord =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : {}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const valueMatches = (actual: unknown, expected: unknown): boolean => {
  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      return false
    }
    return Object.entries(expected).every(([key, value]) =>
      valueMatches(actual[key], value),
    )
  }
  return stableStringify(actual) === stableStringify(expected)
}

const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactSecrets)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|token|authorization|api.?key|passphrase/i.test(key)
        ? '<redacted>'
        : redactSecrets(item),
    ]),
  )
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
