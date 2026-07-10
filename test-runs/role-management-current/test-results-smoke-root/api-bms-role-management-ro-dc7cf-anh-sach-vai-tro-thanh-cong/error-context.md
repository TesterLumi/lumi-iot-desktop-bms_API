# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\bms\role-management\role-management.api.spec.ts >> Role Management API suite TC1-TC45 >> TC1 - Lay danh sach vai tro thanh cong
- Location: tests\api\bms\role-management\role-management.api.spec.ts:187:3

# Error details

```
Error: Login failed for root: status=400 body=failed to parse parameter `x-client-api-key`: Type "string" expects an input value.
```

# Test source

```ts
  325 |     const endpoint = '/api/v0/policies'
  326 |     await waitForApiThrottle()
  327 |     const response = await this.context.post(endpoint, { data: payload })
  328 |     const result = await toApiCallResult(response)
  329 |     await this.evidence?.attachResponse(
  330 |       'Create policy',
  331 |       'POST',
  332 |       endpoint,
  333 |       result,
  334 |       payload,
  335 |     )
  336 |     return result
  337 |   }
  338 | 
  339 |   async listPolicies(query: { roleId: string; page?: number; limit?: number }) {
  340 |     const params = new URLSearchParams()
  341 |     params.set('role_id', query.roleId)
  342 |     if (query.page !== undefined) params.set('page', String(query.page))
  343 |     if (query.limit !== undefined) params.set('limit', String(query.limit))
  344 |     const endpoint = `/api/v0/policies?${params}`
  345 |     await waitForApiThrottle()
  346 |     const response = await this.context.get(endpoint)
  347 |     const result = await toApiCallResult(response)
  348 |     await this.evidence?.attachResponse(
  349 |       'List policies',
  350 |       'GET',
  351 |       endpoint,
  352 |       result,
  353 |     )
  354 |     return result
  355 |   }
  356 | 
  357 |   async updatePolicy(policyId: number | string, payload: PolicyUpdatePayload) {
  358 |     const endpoint = `/api/v0/policies/${policyId}`
  359 |     await waitForApiThrottle()
  360 |     const response = await this.context.patch(endpoint, { data: payload })
  361 |     const result = await toApiCallResult(response)
  362 |     await this.evidence?.attachResponse(
  363 |       'Update policy',
  364 |       'PATCH',
  365 |       endpoint,
  366 |       result,
  367 |       payload,
  368 |     )
  369 |     return result
  370 |   }
  371 | 
  372 |   async deletePolicy(policyId: number | string) {
  373 |     const endpoint = `/api/v0/policies/${policyId}`
  374 |     await waitForApiThrottle()
  375 |     const response = await this.context.delete(endpoint)
  376 |     const result = await toApiCallResult(response)
  377 |     await this.evidence?.attachResponse(
  378 |       'Delete policy',
  379 |       'DELETE',
  380 |       endpoint,
  381 |       result,
  382 |     )
  383 |     return result
  384 |   }
  385 | }
  386 | 
  387 | export const getRoleSuiteEnv = (): RoleSuiteEnv => ({
  388 |   baseUrl:
  389 |     process.env.BASE_URL ||
  390 |     process.env.BMS_API_ENDPOINT ||
  391 |     'http://10.10.0.198:3332/api',
  392 |   apiKey: process.env.BMS_API_KEY || process.env.API_KEY || '',
  393 |   clientVersion: process.env.BMS_CLIENT_VERSION || '1.0.0',
  394 |   clientOs: process.env.BMS_CLIENT_OS || 'windows',
  395 |   clientId: process.env.BMS_CLIENT_ID || 'client-001',
  396 |   language: process.env.BMS_ACCEPT_LANGUAGE || 'vi',
  397 |   adminUsername:
  398 |     process.env.ADMIN_USERNAME || process.env.BMS_ADMIN_USERNAME || '',
  399 |   adminPassword:
  400 |     process.env.ADMIN_PASSWORD || process.env.BMS_ADMIN_PASSWORD || '',
  401 |   evidenceDir:
  402 |     process.env.ROLE_EVIDENCE_DIR ||
  403 |     join(process.cwd(), 'test-runs', 'role-management-current', 'evidence'),
  404 | })
  405 | 
  406 | export const loginRoleSuiteUser = async (
  407 |   env: RoleSuiteEnv,
  408 |   userName: string,
  409 |   password: string,
  410 | ): Promise<LoginResult> => {
  411 |   const loginContext = await request.newContext({
  412 |     baseURL: env.baseUrl,
  413 |     extraHTTPHeaders: commonHeaders(env),
  414 |   })
  415 | 
  416 |   try {
  417 |     await waitForApiThrottle()
  418 |     const response = await loginContext.post('/api/v0/auth/login', {
  419 |       data: {
  420 |         user_name: userName,
  421 |         password,
  422 |       },
  423 |     })
  424 |     if (response.status() !== 200) {
> 425 |       throw new Error(
      |             ^ Error: Login failed for root: status=400 body=failed to parse parameter `x-client-api-key`: Type "string" expects an input value.
  426 |         `Login failed for ${userName}: status=${response.status()} body=${await response.text()}`,
  427 |       )
  428 |     }
  429 | 
  430 |     const body = (await response.json()) as any
  431 |     const token =
  432 |       body?.data?.access_token || body?.data?.token || body?.data?.accessToken
  433 |     if (!token) {
  434 |       throw new Error(`Login response for ${userName} does not include token`)
  435 |     }
  436 | 
  437 |     return {
  438 |       token,
  439 |       userId: body?.data?.user?.id || body?.data?.user_id || body?.data?.id,
  440 |     }
  441 |   } finally {
  442 |     await loginContext.dispose()
  443 |   }
  444 | }
  445 | 
  446 | export const newRoleSuiteApi = async (
  447 |   env: RoleSuiteEnv,
  448 |   token?: string,
  449 | ): Promise<RoleSuiteApi> => {
  450 |   const headers = commonHeaders(env)
  451 |   if (token) {
  452 |     headers.Authorization = `Bearer ${token}`
  453 |   }
  454 | 
  455 |   const context = await request.newContext({
  456 |     baseURL: env.baseUrl,
  457 |     extraHTTPHeaders: headers,
  458 |   })
  459 | 
  460 |   return new RoleSuiteApi(context)
  461 | }
  462 | 
  463 | export const generateTcRoleName = (tcId: string) => {
  464 |   const now = new Date()
  465 |   const pad = (value: number) => value.toString().padStart(2, '0')
  466 |   const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
  467 |     now.getDate(),
  468 |   )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  469 |   const random = Math.random().toString(36).slice(2, 6)
  470 | 
  471 |   return `auto_role_${tcId}_${timestamp}_${random}`
  472 | }
  473 | 
  474 | export const createAutomationUserPayload = (
  475 |   tcId: string,
  476 | ): AutomationUserPayload => {
  477 |   const now = new Date()
  478 |   const pad = (value: number) => value.toString().padStart(2, '0')
  479 |   const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
  480 |     now.getDate(),
  481 |   )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  482 |   const random = Math.random().toString(36).slice(2, 8)
  483 |   const userName = `auto_user_${tcId}_${timestamp}_${random}`
  484 |   const phoneSuffix = `${Date.now()}`.slice(-8)
  485 | 
  486 |   return {
  487 |     user_name: userName,
  488 |     email: `${userName}@auto-test.local`,
  489 |     password: 'Auto@456',
  490 |     display_name: 'Auto User Role',
  491 |     phone: `+849${phoneSuffix}`,
  492 |   }
  493 | }
  494 | 
  495 | export const cleanupRole = async (
  496 |   api: RoleSuiteApi,
  497 |   evidence: RoleEvidence,
  498 |   roleId?: string,
  499 | ) => {
  500 |   if (!roleId) return
  501 | 
  502 |   try {
  503 |     const deleteResponse = await api.deleteRole(roleId)
  504 |     if ([200, 404].includes(deleteResponse.status())) {
  505 |       evidence.markRoleDeleted()
  506 |       return
  507 |     }
  508 | 
  509 |     const disableResponse = await api.updateRole(roleId, { status: 'Disabled' })
  510 |     const retryDeleteResponse = await api.deleteRole(roleId)
  511 |     if ([200, 404].includes(retryDeleteResponse.status())) {
  512 |       evidence.markRoleDeleted()
  513 |       return
  514 |     }
  515 | 
  516 |     evidence.addCleanupWarning(
  517 |       `Role ${roleId} was not deleted after disable. deleteStatus=${deleteResponse.status()} disableStatus=${disableResponse.status()} retryDeleteStatus=${retryDeleteResponse.status()}`,
  518 |     )
  519 |   } catch (error) {
  520 |     evidence.addCleanupWarning(
  521 |       `Cleanup role ${roleId} failed: ${error instanceof Error ? error.message : String(error)}`,
  522 |     )
  523 |   }
  524 | }
  525 | 
```