import {
  APIRequestContext,
  APIResponse,
  TestInfo,
  request,
} from '@playwright/test'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSharedBmsEnv } from './env'

type StepEvidence = {
  step: string
  method?: string
  endpoint?: string
  status?: number
  request?: unknown
  response?: unknown
}

type CleanupEvidence = {
  role_deleted: boolean
  users_deleted: number
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

type RolePayload = {
  name?: string
  description?: string | null
  status?: 'Active' | 'Disabled' | string
  permissions?: unknown[]
}

type PolicyPayload = {
  role_id: string
  service_code: string
  resource_scope: 'all' | 'specific' | string
  actions: number
  effect: 'allow' | 'deny' | string
}

type PolicyUpdatePayload = {
  actions?: number
  effect?: 'allow' | 'deny' | string
  resource_scope?: 'all' | 'specific' | string
}

type AutomationUserPayload = {
  user_name: string
  email: string
  password: string
  display_name: string
  phone: string
}

type ApiCallResult = {
  response: APIResponse
  body: unknown
  status: () => number
  url: () => string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

type RoleSuiteEnv = {
  baseUrl: string
  apiKey: string
  clientVersion: string
  clientOs: string
  clientId: string
  language: string
  adminUsername: string
  adminPassword: string
  evidenceDir: string
}

export class RoleEvidence {
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
        role_deleted: false,
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

  markRoleDeleted() {
    this.evidence.cleanup.role_deleted = true
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
    const evidenceDir = getRoleSuiteEnv().evidenceDir

    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, fileName), body)

    await this.testInfo.attach(fileName, {
      body,
      contentType: 'application/json',
    })
  }
}

export class RoleSuiteApi {
  constructor(
    public context: APIRequestContext,
    private evidence?: RoleEvidence,
  ) {}

  withEvidence(evidence: RoleEvidence) {
    return new RoleSuiteApi(this.context, evidence)
  }

  async listRoles(query?: { search?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams()
    if (query?.search !== undefined) params.set('search', query.search)
    if (query?.page !== undefined) params.set('page', String(query.page))
    if (query?.limit !== undefined) params.set('limit', String(query.limit))
    const endpoint = `/api/v0/roles/${params.toString() ? `?${params}` : ''}`
    await waitForApiThrottle()
    const response = await this.context.get(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse('List roles', 'GET', endpoint, result)
    return result
  }

  async createRole(payload: RolePayload) {
    const endpoint = '/api/v0/roles/'
    const requestPayload = normalizeRolePayload(payload)
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, { data: requestPayload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Create role',
      'POST',
      endpoint,
      result,
      requestPayload,
    )
    return result
  }

  async updateRole(roleId: string, payload: RolePayload) {
    const endpoint = `/api/v0/roles/${roleId}`
    await waitForApiThrottle()
    const response = await this.context.patch(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Update role',
      'PATCH',
      endpoint,
      result,
      payload,
    )
    return result
  }

  async deleteRole(roleId: string) {
    const endpoint = `/api/v0/roles/${roleId}`
    await waitForApiThrottle()
    const response = await this.context.delete(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Delete role',
      'DELETE',
      endpoint,
      result,
    )
    return result
  }

  async assignRole(roleId: string, userId?: string) {
    const endpoint = `/api/v0/roles/${roleId}/assignments`
    const payload = userId ? { userId } : {}
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Assign role',
      'POST',
      endpoint,
      result,
      payload,
    )
    return result
  }

  async registerUser(payload: AutomationUserPayload) {
    const endpoint = '/api/v0/auth/register'
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Register user',
      'POST',
      endpoint,
      result,
      {
        ...payload,
        password: maskSecret(payload.password),
      },
    )
    return result
  }

  async deleteUser(userId: string) {
    const endpoint = '/api/v0/auth/delete'
    const payload = { user_id: userId }
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Delete user',
      'POST',
      endpoint,
      result,
      payload,
    )
    return result
  }

  async listUsers(query?: { search?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams()
    if (query?.search !== undefined) params.set('search', query.search)
    if (query?.page !== undefined) params.set('page', String(query.page))
    if (query?.limit !== undefined) params.set('limit', String(query.limit))
    const endpoint = `/api/v0/auth/list${params.toString() ? `?${params}` : ''}`
    await waitForApiThrottle()
    const response = await this.context.get(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse('List users', 'GET', endpoint, result)
    return result
  }

  async getPermissionTree() {
    const endpoint = '/api/v0/permissions/tree'
    await waitForApiThrottle()
    const response = await this.context.get(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Get permission tree',
      'GET',
      endpoint,
      result,
    )
    return result
  }

  async createPolicy(payload: PolicyPayload) {
    const endpoint = '/api/v0/policies'
    await waitForApiThrottle()
    const response = await this.context.post(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Create policy',
      'POST',
      endpoint,
      result,
      payload,
    )
    return result
  }

  async listPolicies(query: { roleId: string; page?: number; limit?: number }) {
    const params = new URLSearchParams()
    params.set('role_id', query.roleId)
    if (query.page !== undefined) params.set('page', String(query.page))
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    const endpoint = `/api/v0/policies?${params}`
    await waitForApiThrottle()
    const response = await this.context.get(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'List policies',
      'GET',
      endpoint,
      result,
    )
    return result
  }

  async updatePolicy(policyId: number | string, payload: PolicyUpdatePayload) {
    const endpoint = `/api/v0/policies/${policyId}`
    await waitForApiThrottle()
    const response = await this.context.patch(endpoint, { data: payload })
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Update policy',
      'PATCH',
      endpoint,
      result,
      payload,
    )
    return result
  }

  async deletePolicy(policyId: number | string) {
    const endpoint = `/api/v0/policies/${policyId}`
    await waitForApiThrottle()
    const response = await this.context.delete(endpoint)
    const result = await toApiCallResult(response)
    await this.evidence?.attachResponse(
      'Delete policy',
      'DELETE',
      endpoint,
      result,
    )
    return result
  }
}

export const getRoleSuiteEnv = (): RoleSuiteEnv =>
  getSharedBmsEnv('ROLE_EVIDENCE_DIR', 'role-management-current')

export const loginRoleSuiteUser = async (
  env: RoleSuiteEnv,
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

export const newRoleSuiteApi = async (
  env: RoleSuiteEnv,
  token?: string,
): Promise<RoleSuiteApi> => {
  const headers = commonHeaders(env)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const context = await request.newContext({
    baseURL: env.baseUrl,
    extraHTTPHeaders: headers,
  })

  return new RoleSuiteApi(context)
}

export const generateTcRoleName = (tcId: string) => {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const random = Math.random().toString(36).slice(2, 6)

  return `auto_role_${tcId}_${timestamp}_${random}`
}

export const createAutomationUserPayload = (
  tcId: string,
): AutomationUserPayload => {
  const now = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const random = Math.random().toString(36).slice(2, 8)
  const userName = `auto_user_${tcId}_${timestamp}_${random}`
  const phoneSuffix = `${Date.now()}`.slice(-8)

  return {
    user_name: userName,
    email: `${userName}@auto-test.local`,
    password: 'Auto@456',
    display_name: 'Auto User Role',
    phone: `+849${phoneSuffix}`,
  }
}

export const cleanupRole = async (
  api: RoleSuiteApi,
  evidence: RoleEvidence,
  roleId?: string,
) => {
  if (!roleId) return

  try {
    const deleteResponse = await api.deleteRole(roleId)
    if ([200, 404].includes(deleteResponse.status())) {
      evidence.markRoleDeleted()
      return
    }

    const disableResponse = await api.updateRole(roleId, { status: 'Disabled' })
    const retryDeleteResponse = await api.deleteRole(roleId)
    if ([200, 404].includes(retryDeleteResponse.status())) {
      evidence.markRoleDeleted()
      return
    }

    evidence.addCleanupWarning(
      `Role ${roleId} was not deleted after disable. deleteStatus=${deleteResponse.status()} disableStatus=${disableResponse.status()} retryDeleteStatus=${retryDeleteResponse.status()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Cleanup role ${roleId} failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const cleanupUser = async (
  api: RoleSuiteApi,
  evidence: RoleEvidence,
  userId?: string,
) => {
  if (!userId) return

  try {
    const deleteResponse = await api.deleteUser(userId)
    if ([200, 404].includes(deleteResponse.status())) {
      evidence.markUserDeleted()
      return
    }

    evidence.addCleanupWarning(
      `User ${userId} was not deleted. deleteStatus=${deleteResponse.status()} body=${await deleteResponse.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Cleanup user ${userId} failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const cleanupPolicy = async (
  api: RoleSuiteApi,
  evidence: RoleEvidence,
  policyId?: number | string,
) => {
  if (policyId === undefined || policyId === null || policyId === '') return

  try {
    const deleteResponse = await api.deletePolicy(policyId)
    if ([200, 404].includes(deleteResponse.status())) {
      return
    }

    evidence.addCleanupWarning(
      `Policy ${policyId} was not deleted. deleteStatus=${deleteResponse.status()} body=${await deleteResponse.text()}`,
    )
  } catch (error) {
    evidence.addCleanupWarning(
      `Cleanup policy ${policyId} failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const verifyRoleFoundBySearch = async (
  api: RoleSuiteApi,
  roleId: string,
  roleName: string,
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await api.listRoles({
      search: roleName,
      page: 1,
      limit: 10,
    })
    const body = (await response.json()) as {
      data?: { items?: Array<{ id: string }> }
    }
    const found = body?.data?.items?.some(
      (item: { id: string }) => item.id === roleId,
    )
    if (found) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return false
}

export const findPermissionActions = (
  treeBody: unknown,
  code: string,
): number | undefined => {
  const roots = Array.isArray((treeBody as any)?.data)
    ? (treeBody as any).data
    : Array.isArray(treeBody)
      ? treeBody
      : []

  const visit = (node: any): number | undefined => {
    if (node?.code === code) {
      return typeof node.actions === 'number' ? node.actions : undefined
    }

    if (!Array.isArray(node?.children)) {
      return undefined
    }

    for (const child of node.children) {
      const found = visit(child)
      if (found !== undefined) {
        return found
      }
    }

    return undefined
  }

  for (const root of roots) {
    const found = visit(root)
    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

export const fakeRoleId = '00000000-0000-4000-8000-000000000000'
export const fakeUserId = '00000000-0000-4000-8000-000000000001'

const commonHeaders = (env: RoleSuiteEnv): Record<string, string> => {
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

const normalizeRolePayload = (payload: RolePayload): RolePayload => {
  if (!payload.name) {
    return payload
  }

  return {
    description: '',
    permissions: [],
    status: 'Active',
    ...payload,
  }
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

const maskSecret = (value: string) =>
  value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
