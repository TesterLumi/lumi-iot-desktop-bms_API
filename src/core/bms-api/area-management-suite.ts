import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  request,
} from '@playwright/test'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

type StepEvidence = {
  step: string
  method?: string
  endpoint?: string
  status?: number
  request?: unknown
  response?: unknown
}

type CleanupEvidence = {
  area_deleted: boolean
  users_deleted: number
  roles_deleted: number
  warnings: string[]
}

type EvidenceStatus = 'PASSED' | 'FAILED'

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
  error_message?: string
}

type LoginResult = {
  token: string
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

type AreaPayload = {
  name?: string
  parent_id?: string | null
  floor_plan_url?: string | null
}

type AreaQuery = {
  search?: string
  page?: number
  limit?: number
  parent_id?: string
}

type RawAreaQuery = Record<string, string | number | undefined>

type PositionPayload = {
  pos_x: number | null
  pos_y: number | null
}

type RolePayload = {
  name?: string
  description?: string | null
  status?: 'Active' | 'Disabled' | string
}

type PolicyPayload = {
  role_id: string
  service_code: string
  resource_scope: 'all' | 'specific' | string
  actions: number
  effect: 'allow' | 'deny' | string
}

type AutomationUserPayload = {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
}

type AreaSuiteEnv = {
  baseUrl: string
  apiKey: string
  clientVersion: string
  clientOs: string
  clientId: string
  language: string
  adminUsername: string
  adminPassword: string
  evidenceDir: string
  testDeviceId1: string
  testDeviceId2: string
  testLightingGroupId: string
  testNonLightingGroupId: string
  testHcId1: string
  testHcId2: string
}

export class AreaEvidence {
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
        area_deleted: false,
        users_deleted: 0,
        roles_deleted: 0,
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

  markAreaDeleted() {
    this.evidence.cleanup.area_deleted = true
  }

  markUserDeleted() {
    this.evidence.cleanup.users_deleted += 1
  }

  markRoleDeleted() {
    this.evidence.cleanup.roles_deleted += 1
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
      request: requestBody,
      response: result.body,
    })
  }

  async attachStep(step: StepEvidence) {
    this.evidence.steps.push(step)
  }

  async write(status: EvidenceStatus, error?: unknown) {
    this.evidence.status = status
    this.evidence.finished_at = new Date().toISOString()
    if (error) {
      this.evidence.error_message =
        error instanceof Error ? error.message : String(error)
    }

    const fileName = `${this.evidence.tc_id}_${slug(this.evidence.tc_name)}.json`
    const body = JSON.stringify(this.evidence, null, 2)
    const evidenceDir = getAreaSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)

    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class AreaSuiteApi {
  constructor(
    public context: APIRequestContext,
    private evidence?: AreaEvidence,
  ) {}

  withEvidence(evidence: AreaEvidence) {
    return new AreaSuiteApi(this.context, evidence)
  }

  async listAreas(query?: AreaQuery) {
    return this.listAreasRaw(query)
  }

  async listAreasRaw(query?: RawAreaQuery) {
    const endpoint = `/api/v0/areas${toQueryString(query)}`
    return this.call('List areas', 'GET', endpoint)
  }

  async createArea(payload: AreaPayload) {
    return this.call('Create area', 'POST', '/api/v0/areas', payload)
  }

  async getArea(areaId: string) {
    return this.call('Get area', 'GET', `/api/v0/areas/${areaId}`)
  }

  async updateArea(areaId: string, payload: AreaPayload) {
    return this.call('Update area', 'PATCH', `/api/v0/areas/${areaId}`, payload)
  }

  async deleteArea(areaId: string) {
    return this.call('Delete area', 'DELETE', `/api/v0/areas/${areaId}`)
  }

  async batchAreas(ids: string[]) {
    return this.call('Batch areas', 'POST', '/api/v0/areas/batch', { ids })
  }

  async getAreaTree(query?: { parent_id?: string }) {
    const endpoint = `/api/v0/areas/tree${toQueryString(query)}`
    return this.call('Get area tree', 'GET', endpoint)
  }

  async assignDevices(areaId: string, deviceIds: string[]) {
    return this.call(
      'Assign devices',
      'POST',
      `/api/v0/areas/${areaId}/devices`,
      { device_ids: deviceIds },
    )
  }

  async unassignDevices(areaId: string, deviceIds: string[]) {
    return this.call(
      'Unassign devices',
      'DELETE',
      `/api/v0/areas/${areaId}/devices`,
      { device_ids: deviceIds },
    )
  }

  async listAreaDevices(
    areaId: string,
    query?: { page?: number; limit?: number },
  ) {
    const endpoint = `/api/v0/areas/${areaId}/devices${toQueryString(query)}`
    return this.call('List area devices', 'GET', endpoint)
  }

  async updateDevicePosition(
    areaId: string,
    deviceId: string,
    payload: PositionPayload,
  ) {
    return this.call(
      'Update device position',
      'PATCH',
      `/api/v0/areas/${areaId}/devices/${deviceId}/position`,
      payload,
    )
  }

  async getAreaDeviceSummary(areaId: string) {
    return this.call(
      'Get area device summary',
      'GET',
      `/api/v0/areas/${areaId}/devices/summary`,
    )
  }

  async assignGroups(areaId: string, groupIds: string[]) {
    return this.call(
      'Assign groups',
      'POST',
      `/api/v0/areas/${areaId}/groups`,
      { group_ids: groupIds },
    )
  }

  async unassignGroups(areaId: string, groupIds: string[]) {
    return this.call(
      'Unassign groups',
      'DELETE',
      `/api/v0/areas/${areaId}/groups`,
      { group_ids: groupIds },
    )
  }

  async assignHomeControllers(areaId: string, hcIds: string[]) {
    return this.call(
      'Assign home controllers',
      'POST',
      `/api/v0/areas/${areaId}/home-controllers`,
      { hc_ids: hcIds },
    )
  }

  async unassignHomeControllers(areaId: string, hcIds: string[]) {
    return this.call(
      'Unassign home controllers',
      'DELETE',
      `/api/v0/areas/${areaId}/home-controllers`,
      { hc_ids: hcIds },
    )
  }

  async createRole(payload: RolePayload) {
    return this.call('Create role', 'POST', '/api/v0/roles/', {
      description: '',
      permissions: [],
      status: 'Active',
      ...payload,
    })
  }

  async updateRole(roleId: string, payload: RolePayload) {
    return this.call('Update role', 'PATCH', `/api/v0/roles/${roleId}`, payload)
  }

  async deleteRole(roleId: string) {
    return this.call('Delete role', 'DELETE', `/api/v0/roles/${roleId}`)
  }

  async assignRole(roleId: string, userId: string) {
    return this.call(
      'Assign role',
      'POST',
      `/api/v0/roles/${roleId}/assignments`,
      { userId },
    )
  }

  async registerUser(payload: AutomationUserPayload) {
    return this.call('Register user', 'POST', '/api/v0/auth/register', {
      ...payload,
      password: payload.password,
    })
  }

  async deleteUser(userId: string) {
    return this.call('Delete user', 'POST', '/api/v0/auth/delete', {
      user_id: userId,
    })
  }

  async createPolicy(payload: PolicyPayload) {
    return this.call('Create policy', 'POST', '/api/v0/policies', payload)
  }

  async deletePolicy(policyId: number | string) {
    return this.call('Delete policy', 'DELETE', `/api/v0/policies/${policyId}`)
  }

  createAutomationUserPayload(tcId: string): AutomationUserPayload {
    const timestamp = timestampToken()
    const random = Math.random().toString(36).slice(2, 8)
    const userName = `auto_area_user_${tcId}_${timestamp}_${random}`
    const phoneSuffix = `${Date.now()}`.slice(-8)

    return {
      user_name: userName,
      email: `${userName}@auto-test.local`,
      password: 'Auto@456',
      display_name: 'Auto Area User',
      phone: `+849${phoneSuffix}`,
    }
  }

  async cleanupRole(evidence: AreaEvidence, roleId?: string) {
    if (!roleId) return

    try {
      const deleteResponse = await this.deleteRole(roleId)
      if ([200, 404].includes(deleteResponse.status())) {
        evidence.markRoleDeleted()
        return
      }

      const disableResponse = await this.updateRole(roleId, {
        status: 'Disabled',
      })
      const retryDeleteResponse = await this.deleteRole(roleId)
      if ([200, 404].includes(retryDeleteResponse.status())) {
        evidence.markRoleDeleted()
        return
      }

      evidence.addCleanupWarning(
        `Role ${roleId} was not deleted. deleteStatus=${deleteResponse.status()} disableStatus=${disableResponse.status()} retryDeleteStatus=${retryDeleteResponse.status()}`,
      )
    } catch (error) {
      evidence.addCleanupWarning(
        `Cleanup role ${roleId} failed: ${formatError(error)}`,
      )
    }
  }

  async cleanupUser(evidence: AreaEvidence, userId?: string) {
    if (!userId) return

    try {
      const deleteResponse = await this.deleteUser(userId)
      if ([200, 404].includes(deleteResponse.status())) {
        evidence.markUserDeleted()
        return
      }

      evidence.addCleanupWarning(
        `User ${userId} was not deleted. deleteStatus=${deleteResponse.status()} body=${await deleteResponse.text()}`,
      )
    } catch (error) {
      evidence.addCleanupWarning(
        `Cleanup user ${userId} failed: ${formatError(error)}`,
      )
    }
  }

  async cleanupPolicy(evidence: AreaEvidence, policyId?: number | string) {
    if (policyId === undefined || policyId === null || policyId === '') return

    try {
      const deleteResponse = await this.deletePolicy(policyId)
      if ([200, 404].includes(deleteResponse.status())) {
        return
      }

      evidence.addCleanupWarning(
        `Policy ${policyId} was not deleted. deleteStatus=${deleteResponse.status()} body=${await deleteResponse.text()}`,
      )
    } catch (error) {
      evidence.addCleanupWarning(
        `Cleanup policy ${policyId} failed: ${formatError(error)}`,
      )
    }
  }

  private async call(
    step: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    payload?: unknown,
  ) {
    await waitForApiThrottle()
    const response =
      method === 'GET'
        ? await this.context.get(endpoint)
        : method === 'POST'
          ? await this.context.post(endpoint, { data: payload })
          : method === 'PATCH'
            ? await this.context.patch(endpoint, { data: payload })
            : await this.context.delete(endpoint, { data: payload })

    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(step, method, endpoint, result, payload)
    return result
  }
}

export const getAreaSuiteEnv = (): AreaSuiteEnv => ({
  baseUrl:
    process.env.BASE_URL ||
    process.env.BMS_API_ENDPOINT ||
    'http://10.10.0.198:3332/api',
  apiKey: process.env.BMS_API_KEY || process.env.API_KEY || '',
  clientVersion: process.env.BMS_CLIENT_VERSION || '1.0.0',
  clientOs: process.env.BMS_CLIENT_OS || 'windows',
  clientId: process.env.BMS_CLIENT_ID || 'client-001',
  language: process.env.BMS_ACCEPT_LANGUAGE || 'vi',
  adminUsername:
    process.env.ADMIN_USERNAME || process.env.BMS_ADMIN_USERNAME || '',
  adminPassword:
    process.env.ADMIN_PASSWORD || process.env.BMS_ADMIN_PASSWORD || '',
  evidenceDir:
    process.env.AREA_EVIDENCE_DIR ||
    join(process.cwd(), 'test-runs', 'area-management-current', 'evidence'),
  testDeviceId1: process.env.TEST_DEVICE_ID_1 || '',
  testDeviceId2: process.env.TEST_DEVICE_ID_2 || '',
  testLightingGroupId: process.env.TEST_LIGHTING_GROUP_ID || '',
  testNonLightingGroupId: process.env.TEST_NON_LIGHTING_GROUP_ID || '',
  testHcId1: process.env.TEST_HC_ID_1 || '',
  testHcId2: process.env.TEST_HC_ID_2 || '',
})

export const loginAreaSuiteUser = async (
  env: AreaSuiteEnv,
  userName: string,
  password: string,
): Promise<LoginResult> => {
  const loginContext = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: commonHeaders(env),
  })

  try {
    await waitForApiThrottle()
    const response = await loginContext.post('/api/v0/auth/login', {
      data: {
        user_name: userName,
        password,
      },
    })
    if (response.status() !== 200) {
      throw new Error(
        `Login failed for ${userName}: status=${response.status()} body=${await response.text()}`,
      )
    }

    const body = (await response.json()) as any
    const token =
      body?.data?.access_token || body?.data?.token || body?.data?.accessToken
    if (!token) {
      throw new Error(`Login response for ${userName} does not include token`)
    }

    return {
      token,
      userId: body?.data?.user?.id || body?.data?.user_id || body?.data?.id,
    }
  } finally {
    await loginContext.dispose()
  }
}

export const newAreaSuiteApi = async (
  env: AreaSuiteEnv,
  token?: string,
): Promise<AreaSuiteApi> => {
  const headers = commonHeaders(env)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })

  return new AreaSuiteApi(context)
}

export const cleanupArea = async (
  api: AreaSuiteApi,
  evidence: AreaEvidence,
  areaId?: string,
) => {
  if (!areaId) return

  try {
    const deleteResponse = await api.deleteArea(areaId)
    if ([200, 404].includes(deleteResponse.status())) {
      evidence.markAreaDeleted()
      return
    }

    evidence.addCleanupWarning(
      `Area ${areaId} was not deleted. deleteStatus=${deleteResponse.status()} body=${await deleteResponse.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Cleanup area ${areaId} failed: ${formatError(error)}`,
    )
  }
}

export const generateTcAreaName = (tcId: string, suffix?: string) => {
  const cleanSuffix = suffix ? `_${suffix}` : ''
  const random = Math.random().toString(36).slice(2, 6)
  return `auto_area_${tcId}${cleanSuffix}_${timestampToken()}_${random}`
}

export const requireAreaFixture = (value: string, name: string) => {
  if (!value) {
    throw new Error(`${name} is required for this area-management testcase`)
  }

  return value
}

export const fakeAreaId = '00000000-0000-4000-8000-000000000000'
export const fakeDeviceId = '999999999999999998'
export const fakeGroupId = '999999999999999999'

const commonHeaders = (env: AreaSuiteEnv): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-client-version': env.clientVersion,
    'x-client-os': env.clientOs,
    'x-client-id': env.clientId,
    'accept-language': env.language,
  }

  if (env.apiKey) {
    headers['x-client-api-key'] = env.apiKey
  }

  return headers
}

const toQueryString = (query?: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined) {
      params.set(key, String(value))
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

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}

const timestampToken = () => {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
