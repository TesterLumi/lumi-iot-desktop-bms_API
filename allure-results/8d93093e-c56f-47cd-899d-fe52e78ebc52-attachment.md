# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\group-management\group-management.api.spec.ts >> Group Management API Real HC TC1-TC69 >> TC4 - Tim group theo ten
- Location: tests\e2e\group-management\group-management.api.spec.ts:82:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 201
```

# Test source

```ts
  370 |     response: body,
  371 |     status: response.status(),
  372 |   })
  373 | 
  374 |   if (response.status() >= 400) {
  375 |     console.log(JSON.stringify({
  376 |       group_api_failure: {
  377 |         method: options.method,
  378 |         endpoint: options.endpoint,
  379 |         request: options.request,
  380 |         status: response.status(),
  381 |         response: body,
  382 |       },
  383 |     }))
  384 |   }
  385 | 
  386 |   return body
  387 | }
  388 | 
  389 | export const loginAs = async (
  390 |   userType: 'admin' | 'viewer' | 'no_permission',
  391 | ) => {
  392 |   const token = envTokenFor(userType)
  393 |   if (token) {
  394 |     return token
  395 |   }
  396 | 
  397 |   const username = process.env[`${userType.toUpperCase()}_USERNAME`]
  398 |   const password = process.env[`${userType.toUpperCase()}_PASSWORD`]
  399 |   if (!username || !password) {
  400 |     return ''
  401 |   }
  402 | 
  403 |   const context = await playwrightRequest.newContext()
  404 |   try {
  405 |     const response = await context.post(
  406 |       absoluteUrl(GROUP_BASE_URL, GROUP_AUTH_LOGIN_API),
  407 |       { data: { username, password } },
  408 |     )
  409 |     if (response.status() >= 400) {
  410 |       throw new Error(`Login ${userType} failed with status ${response.status()}`)
  411 |     }
  412 |     const body = asRecord(await safeJson(response))
  413 |     return String(
  414 |       body.access_token ??
  415 |         body.token ??
  416 |         asRecord(body.data).access_token ??
  417 |         asRecord(body.data).token ??
  418 |         '',
  419 |     )
  420 |   } finally {
  421 |     await context.dispose()
  422 |   }
  423 | }
  424 | 
  425 | export const generateGroupName = (tcId: string, type = 'normal') => {
  426 |   const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  427 |   const random = Math.random().toString(36).slice(2, 6)
  428 |   return `auto_group_${tcId}_${type}_${timestamp}_${random}`
  429 | }
  430 | 
  431 | export const createGroupPayload = ({
  432 |   tcId,
  433 |   type = 'Normal',
  434 |   deviceIds = [],
  435 |   name = generateGroupName(tcId, type.toLowerCase()),
  436 |   icon = 'group-auto',
  437 | }: {
  438 |   tcId: string
  439 |   type?: GroupType | string
  440 |   deviceIds?: Array<string | number>
  441 |   name?: string
  442 |   icon?: string
  443 | }) => {
  444 |   const deviceType =
  445 |     type === 'Lighting' ? GROUP_LIGHTING_DEVICE_TYPE_ID : GROUP_NORMAL_DEVICE_TYPE_ID
  446 |   return {
  447 |     ...(type === 'Lighting' ? { hc_id: AUTOMATION_HC_ID } : {}),
  448 |     device_type: deviceType,
  449 |     name,
  450 |     icon,
  451 |     attr: {
  452 |       automation_tc_id: tcId,
  453 |       requested_type: type,
  454 |       requested_device_ids: deviceIds.map(String),
  455 |     },
  456 |   }
  457 | }
  458 | 
  459 | export const createGroupAndExtractId = async (
  460 |   client: GroupApiClient,
  461 |   context: GroupTestContext,
  462 |   payload: GroupPayload,
  463 | ) => {
  464 |   const response = await client.createGroupAPI(payload)
  465 |   const body = await recordGroupResponse(context, 'Create group', response, {
  466 |     method: 'POST',
  467 |     endpoint: GROUP_API_BASE,
  468 |     request: payload,
  469 |   })
> 470 |   expect(response.status()).toBe(200)
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  471 |   expect(extractId(body)).toBeTruthy()
  472 |   return String(extractId(body))
  473 | }
  474 | 
  475 | export const cleanupGroup = async (
  476 |   client: GroupApiClient,
  477 |   context: GroupTestContext,
  478 |   groupId?: string | number,
  479 | ) => {
  480 |   if (!groupId) {
  481 |     return
  482 |   }
  483 |   try {
  484 |     const response = await client.deleteGroupAPI(groupId)
  485 |     attachGroupStep(context, {
  486 |       step: 'Cleanup group',
  487 |       method: 'DELETE',
  488 |       endpoint: `${GROUP_API_BASE}/${groupId}`,
  489 |       status: response.status(),
  490 |       response: await safeJson(response),
  491 |     })
  492 |     context.cleanup.group_deleted = [200, 204, 404].includes(response.status())
  493 |   } catch (error) {
  494 |     context.cleanup.warnings.push(`Cleanup group failed: ${String(error)}`)
  495 |   }
  496 | }
  497 | 
  498 | export const getDeviceStatus = async (
  499 |   client: GroupApiClient,
  500 |   deviceIds: Array<string | number>,
  501 | ) => {
  502 |   const response = await client.getDeviceStatusAPI(deviceIds)
  503 |   expect(response.status()).toBe(200)
  504 |   return normalizeStatuses(await safeJson(response))
  505 | }
  506 | 
  507 | export const getInitialDeviceStates = async (
  508 |   client: GroupApiClient,
  509 |   deviceIds: Array<string | number>,
  510 | ) => await getDeviceStatus(client, deviceIds)
  511 | 
  512 | export const waitForDeviceState = async (
  513 |   client: GroupApiClient,
  514 |   deviceId: string | number,
  515 |   slot: number,
  516 |   expectedValue: GroupStateValue,
  517 |   timeoutMs = POLL_TIMEOUT_MS,
  518 | ) => {
  519 |   const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS))
  520 |   for (let index = 0; index < attempts; index += 1) {
  521 |     const statuses = await getDeviceStatus(client, [deviceId])
  522 |     if (getSlotValue(statuses, deviceId, slot) === expectedValue) {
  523 |       return statuses
  524 |     }
  525 |     await delay(POLL_INTERVAL_MS)
  526 |   }
  527 | 
  528 |   const finalStatuses = await getDeviceStatus(client, [deviceId])
  529 |   expect(getSlotValue(finalStatuses, deviceId, slot)).toBe(expectedValue)
  530 |   return finalStatuses
  531 | }
  532 | 
  533 | export const waitForManyDeviceStates = async (
  534 |   client: GroupApiClient,
  535 |   deviceIds: Array<string | number>,
  536 |   slot: number,
  537 |   expectedValue: GroupStateValue,
  538 |   timeoutMs = POLL_TIMEOUT_MS,
  539 | ) => {
  540 |   const result: DeviceStatus[] = []
  541 |   for (const deviceId of deviceIds) {
  542 |     result.push(...await waitForDeviceState(client, deviceId, slot, expectedValue, timeoutMs))
  543 |   }
  544 |   return result
  545 | }
  546 | 
  547 | export const resetDeviceStates = async (
  548 |   client: GroupApiClient,
  549 |   context: GroupTestContext,
  550 |   initialStates?: DeviceStatus[],
  551 | ) => {
  552 |   if (!initialStates) {
  553 |     return
  554 |   }
  555 |   try {
  556 |     for (const device of initialStates) {
  557 |       const states = (device.status ?? []).map((slot) => ({
  558 |         idx: Number(slot.idx),
  559 |         value: slot.value,
  560 |       }))
  561 |       if (states.length > 0) {
  562 |         const response = await client.controlDeviceAPI(device.id, states)
  563 |         attachGroupStep(context, {
  564 |           step: 'Reset device state',
  565 |           method: 'POST',
  566 |           endpoint: GROUP_DEVICE_CONTROL_API,
  567 |           request: { device_id: device.id, states },
  568 |           response: await safeJson(response),
  569 |           status: response.status(),
  570 |         })
```