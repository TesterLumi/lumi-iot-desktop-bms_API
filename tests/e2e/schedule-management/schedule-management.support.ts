import { APIRequestContext, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'ssh2'
import {
  AUTOMATION_ACTION_DEVICE_ID,
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_HC_ID,
  DEVICE_CONTROL_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { delay } from '@src/utils'

export type ScheduleSnapshotValue = boolean | number | string

export type DeviceSchedule = {
  cron: string
  enable: boolean
  snapshot: Record<string, ScheduleSnapshotValue>
}

type ScheduleEvidenceStep = {
  step: string
  method?: string
  endpoint?: string
  request?: unknown
  response_status?: number
  response?: unknown
  details?: unknown
}

export type ScheduleTestContext = {
  tcId: string
  tcName: string
  startedAt: string
  steps: ScheduleEvidenceStep[]
  assertions: string[]
  cleanup: {
    scheduler_restored: boolean
    scheduler_cleared: boolean
    device_reset: boolean
    warnings: string[]
  }
}

type GatewayDeviceStatus = {
  id: string | number
  status?: Array<{
    idx: number | string
    value: ScheduleSnapshotValue
  }>
}

const RUN_DIR = path.resolve(
  process.cwd(),
  process.env.SCHEDULE_MANAGEMENT_RUN_DIR ??
    (process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
      ? path.dirname(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR)
      : path.join('test-runs', 'schedule-management-current')),
)
const EVIDENCE_DIR = path.join(RUN_DIR, 'evidence', 'api')
const execFileAsync = promisify(execFile)

export const SCHEDULE_DEVICE_ID =
  process.env.TEST_SWITCH_DEVICE_ID || AUTOMATION_ACTION_DEVICE_ID
export const SCHEDULE_DIMMER_DEVICE_ID =
  process.env.TEST_DIMMER_DEVICE_ID ||
  process.env.TEST_MULTI_SLOT_DEVICE_ID ||
  SCHEDULE_DEVICE_ID
export const SLOT_ON_OFF =
  process.env.SLOT_ON_OFF || AUTOMATION_DEVICE_STATE_IDX || '1'
export const SLOT_BRIGHTNESS = process.env.SLOT_BRIGHTNESS || '2'
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || '500')
export const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || '15000')
export const HC_SSH_HOST =
  process.env.HC_SSH_HOST || hostFromEndpoint(IOT_HC_ENDPOINT)
export const HC_SSH_USER = process.env.HC_SSH_USER || 'root'
export const HC_SSH_KEY_PATH = process.env.HC_SSH_KEY_PATH || ''
export const HC_SSH_PASSWORD = process.env.HC_SSH_PASSWORD || ''
export const HC_SSH_KEY_PASSPHRASE = process.env.HC_SSH_KEY_PASSPHRASE || ''
export const HC_RESTART_COMMAND = process.env.HC_RESTART_COMMAND || ''

export const createScheduleTestContext = (
  tcId: string,
  tcName: string,
): ScheduleTestContext => ({
  tcId,
  tcName,
  startedAt: new Date().toISOString(),
  steps: [],
  assertions: [],
  cleanup: {
    scheduler_restored: false,
    scheduler_cleared: false,
    device_reset: false,
    warnings: [],
  },
})

export const attachScheduleStep = (
  context: ScheduleTestContext,
  step: ScheduleEvidenceStep,
) => {
  context.steps.push(step)
}

export const attachScheduleAssertion = (
  context: ScheduleTestContext,
  assertion: string,
) => {
  context.assertions.push(assertion)
}

export const resetScheduleEvidenceRunDir = async () => {
  await rm(EVIDENCE_DIR, { recursive: true, force: true })
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

export const saveScheduleEvidence = async (
  context: ScheduleTestContext,
  status: 'PASSED' | 'FAILED' | 'SKIPPED',
  error?: unknown,
) => {
  await mkdir(EVIDENCE_DIR, { recursive: true })
  if (status === 'FAILED') {
    await attachHomeControllerLogOnFailure(context)
  }
  const slug = context.tcName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  const filename = `${context.tcId}_${slug}_${Date.now()}.json`
  const evidence = {
    tc_id: context.tcId,
    tc_name: context.tcName,
    status,
    started_at: context.startedAt,
    finished_at: new Date().toISOString(),
    endpoints: {
      device_control: DEVICE_CONTROL_ENDPOINT,
      hc_direct: IOT_HC_ENDPOINT,
      scheduler_base: '/api/devices/scheduler',
      device_status: '/api/devices/status',
    },
    steps: context.steps,
    assertions: context.assertions,
    cleanup: context.cleanup,
    error_message:
      error instanceof Error ? error.message : error ? String(error) : undefined,
  }

  await writeFile(
    path.join(EVIDENCE_DIR, filename),
    JSON.stringify(evidence, null, 2),
    'utf8',
  )
}

export const schedulerEndpoint = (deviceId: string | number) =>
  `/api/devices/scheduler/${deviceId}`

export const setSchedulerAPI = async (
  context: APIRequestContext,
  deviceId: string | number,
  schedules: DeviceSchedule[],
) =>
  context.post(schedulerEndpoint(deviceId), {
    headers: {
      'x-hc-id': AUTOMATION_HC_ID,
      'x-request-id': `schedule-set-${deviceId}-${Date.now()}`,
      'x-user-id': 'automation-test',
      'x-app-id': 'bms-e2e-test',
    },
    data: schedules,
  })

export const getSchedulerAPI = async (
  context: APIRequestContext,
  deviceId: string | number,
) =>
  context.get(schedulerEndpoint(deviceId), {
    headers: {
      'x-hc-id': AUTOMATION_HC_ID,
      'x-request-id': `schedule-get-${deviceId}-${Date.now()}`,
      'x-user-id': 'automation-test',
      'x-app-id': 'bms-e2e-test',
    },
  })

export const recordScheduleResponse = async (
  context: ScheduleTestContext,
  step: string,
  response: { status: () => number; json: () => Promise<unknown> },
  options: {
    method: string
    endpoint: string
    request?: unknown
  },
) => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  attachScheduleStep(context, {
    step,
    method: options.method,
    endpoint: options.endpoint,
    request: options.request,
    response_status: response.status(),
    response: body,
  })

  return body
}

export const expectSchedulerAccepted = async (body: unknown) => {
  const record = asRecord(body)
  if ('status' in record) {
    expect(record.status).toBe(true)
  }
  if ('success' in record) {
    expect(record.success).toBe(true)
  }
}

export const extractSchedules = (body: unknown): DeviceSchedule[] => {
  if (Array.isArray(body)) {
    return body as DeviceSchedule[]
  }

  const record = asRecord(body)
  for (const key of ['data', 'schedules', 'scheduler', 'items']) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value as DeviceSchedule[]
    }
    const nested = asRecord(value)
    for (const nestedKey of ['items', 'schedules', 'scheduler']) {
      if (Array.isArray(nested[nestedKey])) {
        return nested[nestedKey] as DeviceSchedule[]
      }
    }
  }

  return []
}

export const expectSavedSchedules = (
  body: unknown,
  expectedSchedules: DeviceSchedule[],
) => {
  const schedules = extractSchedules(body)
  expect(schedules.length).toBe(expectedSchedules.length)

  for (const expectedSchedule of expectedSchedules) {
    const actual = schedules.find(
      (schedule) => schedule.cron === expectedSchedule.cron,
    )
    expect(actual, `Saved cron ${expectedSchedule.cron}`).toBeTruthy()
    expect(actual!.enable).toBe(expectedSchedule.enable)
    expect(actual!.snapshot).toEqual(expectedSchedule.snapshot)
  }
}

export const expectScheduleAbsent = (body: unknown, cron: string) => {
  const schedules = extractSchedules(body)
  expect(schedules.some((schedule) => schedule.cron === cron)).toBe(false)
}

export const generateDailyCron = (hour: number, minute: number) =>
  `0 ${minute} ${hour} * * 1,2,3,4,5,6,7 *`

export const generateWeekdayCron = (
  hour: number,
  minute: number,
  weekdays: number[],
) => `0 ${minute} ${hour} * * ${weekdays.join(',')} *`

export const generateCronAfterMinutes = (minutes: number) => {
  const due = new Date(Date.now() + minutes * 60_000)
  return `0 ${due.getMinutes()} ${due.getHours()} * * 1,2,3,4,5,6,7 *`
}

export const waitUntilCronDue = async (cron: string, graceMs = 3000) => {
  const [, minuteText, hourText] = cron.split(' ')
  const due = new Date()
  due.setHours(Number(hourText), Number(minuteText), 0, 0)
  if (due.getTime() < Date.now()) {
    due.setDate(due.getDate() + 1)
  }

  await delay(Math.max(0, due.getTime() - Date.now()) + graceMs)
}

export const getDeviceStatus = async (
  context: APIRequestContext,
  deviceIds: Array<string | number>,
): Promise<GatewayDeviceStatus[]> => {
  const response = await context.get('/api/devices/status', {
    params: {
      ids: deviceIds.map(String).join(','),
    },
  })

  expect(response.status()).toBe(200)
  return (await response.json()) as GatewayDeviceStatus[]
}

export const getSlotValue = (
  statuses: GatewayDeviceStatus[],
  deviceId: string | number,
  slot: string | number,
) => {
  const device = statuses.find((item) => String(item.id) === String(deviceId))
  return device?.status?.find((item) => Number(item.idx) === Number(slot))?.value
}

export const controlDevice = async (
  context: APIRequestContext,
  deviceId: string | number,
  states: Record<string, ScheduleSnapshotValue>,
) =>
  context.post('/api/devices/control', {
    headers: {
      'x-hc-id': AUTOMATION_HC_ID,
      'x-request-id': `schedule-control-${deviceId}-${Date.now()}`,
      'x-user-id': 'automation-test',
      'x-app-id': 'bms-e2e-test',
    },
    data: {
      device_id: String(deviceId),
      states: Object.entries(states).map(([idx, value]) => ({
        idx: Number(idx),
        value,
      })),
    },
  })

export const waitForDeviceState = async ({
  context,
  deviceId,
  slot,
  expectedValue,
  timeoutMs = POLL_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
}: {
  context: APIRequestContext
  deviceId: string | number
  slot: string | number
  expectedValue: ScheduleSnapshotValue
  timeoutMs?: number
  intervalMs?: number
}) => {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statuses = await getDeviceStatus(context, [deviceId])
    if (getSlotValue(statuses, deviceId, slot) === expectedValue) {
      return statuses
    }
    await delay(intervalMs)
  }

  const finalStatuses = await getDeviceStatus(context, [deviceId])
  expect(getSlotValue(finalStatuses, deviceId, slot)).toBe(expectedValue)
  return finalStatuses
}

export const expectDeviceStateNotChanged = async ({
  context,
  deviceId,
  slot,
  initialValue,
  timeoutMs = POLL_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
}: {
  context: APIRequestContext
  deviceId: string | number
  slot: string | number
  initialValue: ScheduleSnapshotValue
  timeoutMs?: number
  intervalMs?: number
}) => {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statuses = await getDeviceStatus(context, [deviceId])
    expect(getSlotValue(statuses, deviceId, slot)).toBe(initialValue)
    await delay(intervalMs)
  }
}

export const probeHomeControllerSsh = async () => {
  if (!HC_SSH_HOST) {
    return { ok: false, reason: 'HC_SSH_HOST is required' }
  }
  if (!HC_SSH_PASSWORD && !HC_SSH_KEY_PATH) {
    return { ok: false, reason: 'HC_SSH_PASSWORD or HC_SSH_KEY_PATH is required' }
  }

  const probe = await runSshCommand(
    'echo ok; hostname; if [ -x /etc/init.d/S90process-manager ]; then echo /etc/init.d/S90process-manager; elif [ -x /etc/init.d/S90service-manager ]; then echo /etc/init.d/S90service-manager; else echo no-restart-script; fi',
    15_000,
  )

  if (probe.exitCode !== 0) {
    return {
      ok: false,
      reason: `SSH probe failed: ${summarizeSshError(probe.stderr || probe.stdout)}`,
      details: probe,
    }
  }

  return { ok: true, reason: 'SSH probe succeeded', details: probe }
}

export const restartHomeControllerViaSsh = async (
  context: ScheduleTestContext,
) => {
  const command =
    HC_RESTART_COMMAND ||
    'if [ -x /etc/init.d/S90process-manager ]; then /etc/init.d/S90process-manager restart; elif [ -x /etc/init.d/S90service-manager ]; then /etc/init.d/S90service-manager restart; else echo "No restart script found" >&2; exit 2; fi'
  const dispatchedCommand = `(${command} >/tmp/codex_hc_restart.log 2>&1 &) ; echo restart-dispatched`
  const result = await runSshCommand(dispatchedCommand, 20_000)

  attachScheduleStep(context, {
    step: 'Restart Home Controller via SSH',
    method: 'SSH',
    endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}`,
    request: HC_RESTART_COMMAND || 'auto-detect S90process-manager/S90service-manager',
    response_status: result.exitCode,
    response: {
      stdout: result.stdout,
      stderr: result.stderr,
    },
  })

  expect(result.exitCode).toBe(0)
}

export const startHomeControllerLogTail = async (
  context: ScheduleTestContext,
  options: {
    logPath?: string
    tailLines?: number
    maxChars?: number
  } = {},
) => {
  const logPath = options.logPath ?? '/tmp/log/home-controller.log'
  const tailLines = options.tailLines ?? 200
  const maxChars = options.maxChars ?? 60_000
  const command = `tail -n ${tailLines} -f ${logPath}`
  const client = new Client()
  const auth = await buildSsh2Auth()
  let stdout = ''
  let stderr = ''
  let streamClosed = false

  const append = (target: 'stdout' | 'stderr', data: Buffer) => {
    const current = target === 'stdout' ? stdout : stderr
    const next = `${current}${data.toString()}`
    const clipped = next.length > maxChars ? next.slice(next.length - maxChars) : next
    if (target === 'stdout') {
      stdout = clipped
    } else {
      stderr = clipped
    }
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out starting home-controller log tail')),
      15_000,
    )
    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          clearTimeout(timer)
          if (error) {
            reject(error)
            return
          }

          stream
            .on('close', () => {
              streamClosed = true
            })
            .on('data', (data: Buffer) => append('stdout', data))
            .stderr.on('data', (data: Buffer) => append('stderr', data))
          resolve()
        })
      })
      .on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      .on('keyboard-interactive', (_name, _instructions, _lang, prompts, done) => {
        done(prompts.map(() => HC_SSH_PASSWORD))
      })
      .connect({
        host: HC_SSH_HOST,
        username: HC_SSH_USER,
        ...auth,
        tryKeyboard: Boolean(auth.password),
        readyTimeout: 15_000,
      })
  })

  attachScheduleStep(context, {
    step: 'Start tail home-controller log',
    method: 'SSH',
    endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}:${logPath}`,
    request: command,
    response_status: 0,
    response: { started: true },
  })

  return async () => {
    client.end()
    await delay(500)
    attachScheduleStep(context, {
      step: 'Captured home-controller log during TC17',
      method: 'SSH',
      endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}:${logPath}`,
      response_status: streamClosed ? 0 : undefined,
      response: {
        stdout_tail: stdout,
        stderr_tail: stderr,
        max_chars: maxChars,
      },
    })
    return { stdout, stderr }
  }
}

const attachHomeControllerLogOnFailure = async (
  context: ScheduleTestContext,
) => {
  if (!HC_SSH_HOST || (!HC_SSH_PASSWORD && !HC_SSH_KEY_PATH)) {
    return
  }

  const logPath = '/tmp/log/home-controller.log'
  const result = await runSshCommand(`tail -n 300 ${logPath}`, 15_000)
  attachScheduleStep(context, {
    step: 'Home Controller log tail on failure',
    method: 'SSH',
    endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}:${logPath}`,
    request: `tail -n 300 ${logPath}`,
    response_status: result.exitCode,
    response: {
      stdout_tail: result.stdout,
      stderr_tail: result.stderr,
    },
  })
}

export const waitForHomeControllerOnline = async ({
  context,
  deviceId,
  timeoutMs = 90_000,
  intervalMs = 2000,
}: {
  context: APIRequestContext
  deviceId: string | number
  timeoutMs?: number
  intervalMs?: number
}) => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await context.get('/api/devices/status', {
        params: { ids: String(deviceId) },
        timeout: intervalMs,
      })
      if (response.status() === 200) {
        return
      }
      lastError = `status=${response.status()}`
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }

  throw new Error(`Home Controller did not become online: ${String(lastError)}`)
}

export const restoreScheduler = async ({
  apiContext,
  evidenceContext,
  deviceId,
  originalSchedules,
}: {
  apiContext: APIRequestContext
  evidenceContext: ScheduleTestContext
  deviceId: string | number
  originalSchedules: DeviceSchedule[] | null
}) => {
  try {
    const schedules = originalSchedules ?? []
    const response = await setSchedulerAPI(apiContext, deviceId, schedules)
    attachScheduleStep(evidenceContext, {
      step: originalSchedules ? 'Restore original scheduler' : 'Clear scheduler',
      method: 'POST',
      endpoint: schedulerEndpoint(deviceId),
      request: schedules,
      response_status: response.status(),
      response: await safeJson(response),
    })
    evidenceContext.cleanup.scheduler_restored = originalSchedules !== null
    evidenceContext.cleanup.scheduler_cleared = originalSchedules === null
  } catch (error) {
    evidenceContext.cleanup.warnings.push(
      `Cleanup scheduler failed: ${String(error)}`,
    )
  }
}

export const captureOriginalSchedules = async (
  apiContext: APIRequestContext,
  deviceId: string | number,
) => {
  try {
    const response = await getSchedulerAPI(apiContext, deviceId)
    if (response.status() !== 200) {
      return null
    }
    return extractSchedules(await response.json())
  } catch {
    return null
  }
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

const runSshCommand = async (remoteCommand: string, timeoutMs: number) => {
  if (HC_SSH_KEY_PATH && (HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD)) {
    return runSshCommandWithSsh2(remoteCommand, timeoutMs, {
      privateKeyPath: HC_SSH_KEY_PATH,
      passphrase: HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD,
    })
  }

  if (HC_SSH_PASSWORD) {
    return runSshCommandWithSsh2(remoteCommand, timeoutMs, {
      password: HC_SSH_PASSWORD,
    })
  }

  const args = [
    '-i',
    HC_SSH_KEY_PATH,
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'ConnectTimeout=10',
    `${HC_SSH_USER}@${HC_SSH_HOST}`,
    remoteCommand,
  ]

  try {
    const result = await execFileAsync('ssh', args, {
      timeout: timeoutMs,
      windowsHide: true,
    })
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  } catch (error) {
    const record = asRecord(error)
    return {
      exitCode: Number(record.code ?? 1),
      stdout: String(record.stdout ?? ''),
      stderr: String(record.stderr ?? record.message ?? ''),
    }
  }
}

const runSshCommandWithSsh2 = async (
  remoteCommand: string,
  timeoutMs: number,
  auth: {
    password?: string
    privateKeyPath?: string
    passphrase?: string
  },
) =>
  new Promise<{ exitCode: number; stdout: string; stderr: string }>(async (resolve) => {
    const client = new Client()
    let stdout = ''
    let stderr = ''
    let settled = false
    let sshAuth: Awaited<ReturnType<typeof buildSsh2Auth>>
    try {
      sshAuth = await buildSsh2Auth(auth)
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
        stderr: `${stderr}\nSSH command timed out after ${timeoutMs}ms`.trim(),
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
            .on('close', (code: number | null) => {
              finish({ exitCode: code ?? 0, stdout, stderr })
            })
            .on('data', (data: Buffer) => {
              stdout += data.toString()
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString()
            })
        })
      })
      .on('error', (error) => {
        finish({ exitCode: 255, stdout, stderr: String(error) })
      })
      .on('keyboard-interactive', (_name, _instructions, _lang, prompts, done) => {
        done(prompts.map(() => HC_SSH_PASSWORD))
      })
      .connect({
        host: HC_SSH_HOST,
        username: HC_SSH_USER,
        ...sshAuth,
        tryKeyboard: Boolean(sshAuth.password),
        readyTimeout: Math.min(timeoutMs, 20_000),
      })
  })

const buildSsh2Auth = async (
  auth: {
    password?: string
    privateKeyPath?: string
    passphrase?: string
  } = {},
) => {
  if (auth.privateKeyPath) {
    return {
      privateKey: await readFile(auth.privateKeyPath),
      passphrase: auth.passphrase,
    }
  }
  if (auth.password) {
    return { password: auth.password }
  }
  if (HC_SSH_KEY_PATH && (HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD)) {
    return {
      privateKey: await readFile(HC_SSH_KEY_PATH),
      passphrase: HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD,
    }
  }
  if (HC_SSH_PASSWORD) {
    return { password: HC_SSH_PASSWORD }
  }
  return {}
}

function hostFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

const summarizeSshError = (message: string) => {
  if (message.includes('Permission denied')) {
    return 'permission denied for SSH user/key'
  }
  if (
    message.includes('ENCRYPTED') ||
    message.includes('passphrase') ||
    message.includes('Load key')
  ) {
    return 'private key requires passphrase or cannot be loaded non-interactively'
  }
  if (message.includes('UNPROTECTED PRIVATE KEY FILE')) {
    return 'private key file permissions are too open'
  }
  return message.trim().split(/\r?\n/).slice(-1)[0] || 'unknown SSH error'
}
