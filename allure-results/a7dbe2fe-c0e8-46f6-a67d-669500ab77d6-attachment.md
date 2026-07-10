# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-rules\rule-ui-evidence.spec.ts >> Automation rules UI evidence data >> RULE-UI-DISABLED edits rule to disabled and verifies output is not activated
- Location: tests\e2e\automation-rules\rule-ui-evidence.spec.ts:274:3

# Error details

```
Error: Rule {"id":"147635102846601373","name":"thuy_rule_9_disabled_edit"} should map to device 118431939276353282

expect(received).not.toBeNull()

Received: null
```

# Test source

```ts
  356 |   const automationsResponse = await apiRequest.get(
  357 |     `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/automations`,
  358 |     {
  359 |       params: {
  360 |         page: 1,
  361 |         limit: 200,
  362 |       },
  363 |     },
  364 |   )
  365 |   const automationsJson = await automationsResponse.json()
  366 |   const disabledRuleIds = new Set(
  367 |     ((automationsJson.data?.items ?? []) as AutomationRuleListItem[])
  368 |       .filter((automation) => automation.enable === false)
  369 |       .map((automation) => String(automation.id)),
  370 |   )
  371 |   const discovery = selectAutomationRuleDevices({
  372 |     devices,
  373 |     hcMac: AUTOMATION_HC_MAC,
  374 |     slot: AUTOMATION_DEVICE_STATE_IDX,
  375 |     count: 8,
  376 |     disabledRuleIds,
  377 |   })
  378 | 
  379 |   console.log(
  380 |     JSON.stringify({
  381 |       rule_device_discovery: redactAutomationSecrets(
  382 |         formatRuleDeviceDiscovery(discovery),
  383 |       ),
  384 |     }),
  385 |   )
  386 | 
  387 |   await expect(response.status()).toBe(200)
  388 |   await expect(json.success).toBe(true)
  389 |   await expect(automationsResponse.status()).toBe(200)
  390 |   await expect(automationsJson.success).toBe(true)
  391 |   await expect(
  392 |     discovery.selected.length,
  393 |     `Need at least 3 clean online controllable devices on HC ${AUTOMATION_HC_MAC}. Discovery: ${JSON.stringify(formatRuleDeviceDiscovery(discovery))}`,
  394 |   ).toBeGreaterThanOrEqual(3)
  395 | 
  396 |   return {
  397 |     trigger: discovery.selected[0],
  398 |     condition: discovery.selected[1],
  399 |     action: discovery.selected[2],
  400 |     pool: discovery.selected,
  401 |   }
  402 | }
  403 | 
  404 | export const expectAutomationInList = async ({
  405 |   apiRequest,
  406 |   identity,
  407 | }: {
  408 |   apiRequest: APIRequestContext
  409 |   identity: AutomationRuleIdentity
  410 | }) => {
  411 |   const response = await apiRequest.get(
  412 |     `${AUTOMATION_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/automations`,
  413 |     {
  414 |       params: {
  415 |         page: 1,
  416 |         limit: 100,
  417 |       },
  418 |     },
  419 |   )
  420 |   const json = await response.json()
  421 |   const items = (json.data?.items ?? []) as AutomationRuleListItem[]
  422 |   const automation = findAutomationByIdentity(items, identity)
  423 | 
  424 |   await expect(response.status()).toBe(200)
  425 |   await expect(json.success).toBe(true)
  426 |   await expect(automation, `Automation ${JSON.stringify(identity)} in list`).toBeTruthy()
  427 | 
  428 |   return automation
  429 | }
  430 | 
  431 | export const expectRuleMappedToDevices = async ({
  432 |   devices,
  433 |   identity,
  434 | }: {
  435 |   devices: AutomationRuleDeviceCandidate[]
  436 |   identity: AutomationRuleIdentity
  437 | }) => {
  438 |   const deviceContext = await request.newContext({
  439 |     baseURL: DEVICE_SERVICE_ENDPOINT,
  440 |   })
  441 |   try {
  442 |     for (const device of devices) {
  443 |       const mappedDevice = await pollUntil(async () => {
  444 |         const response = await deviceContext.get(`/api/v0/devices/${device.id}`)
  445 |         if (response.status() !== 200) {
  446 |           return null
  447 |         }
  448 | 
  449 |         const json = await response.json()
  450 |         return hasRuleMapping(json.data ?? {}, identity) ? json.data : null
  451 |       })
  452 | 
  453 |       await expect(
  454 |         mappedDevice,
  455 |         `Rule ${JSON.stringify(identity)} should map to device ${device.id}`,
> 456 |       ).not.toBeNull()
      |             ^ Error: Rule {"id":"147635102846601373","name":"thuy_rule_9_disabled_edit"} should map to device 118431939276353282
  457 |     }
  458 |   } finally {
  459 |     await deviceContext.dispose()
  460 |   }
  461 | }
  462 | 
  463 | export const expectRuleNotMappedToDevices = async ({
  464 |   devices,
  465 |   identity,
  466 | }: {
  467 |   devices: AutomationRuleDeviceCandidate[]
  468 |   identity: AutomationRuleIdentity
  469 | }) => {
  470 |   const deviceContext = await request.newContext({
  471 |     baseURL: DEVICE_SERVICE_ENDPOINT,
  472 |   })
  473 |   try {
  474 |     for (const device of devices) {
  475 |       const unmappedDevice = await pollUntil(async () => {
  476 |         const response = await deviceContext.get(`/api/v0/devices/${device.id}`)
  477 |         if (response.status() !== 200) {
  478 |           return null
  479 |         }
  480 | 
  481 |         const json = await response.json()
  482 |         return hasRuleMapping(json.data ?? {}, identity) ? null : json.data
  483 |       })
  484 | 
  485 |       await expect(
  486 |         unmappedDevice,
  487 |         `Rule ${JSON.stringify(identity)} should be removed from device ${device.id}`,
  488 |       ).not.toBeNull()
  489 |     }
  490 |   } finally {
  491 |     await deviceContext.dispose()
  492 |   }
  493 | }
  494 | 
  495 | export const setRuleDeviceState = async ({
  496 |   deviceId,
  497 |   value,
  498 | }: {
  499 |   deviceId: string
  500 |   value: boolean
  501 | }) => {
  502 |   const controlContext = await request.newContext({
  503 |     baseURL: DEVICE_CONTROL_ENDPOINT,
  504 |   })
  505 |   try {
  506 |     const response = await controlContext.post('/api/devices/control', {
  507 |       headers: {
  508 |         'x-hc-id': AUTOMATION_HC_ID,
  509 |         'x-request-id': `rule-e2e-${deviceId}-${Date.now()}`,
  510 |         'x-user-id': 'automation-test',
  511 |         'x-app-id': 'bms-e2e-test',
  512 |       },
  513 |       data: {
  514 |         device_id: String(deviceId),
  515 |         states: [
  516 |           {
  517 |             idx: Number(AUTOMATION_DEVICE_STATE_IDX),
  518 |             value,
  519 |           },
  520 |         ],
  521 |       },
  522 |     })
  523 |     const json = await response.json()
  524 | 
  525 |     await expect(response.status()).toBe(200)
  526 |     await expect(json.status).toBe(true)
  527 |   } finally {
  528 |     await controlContext.dispose()
  529 |   }
  530 | }
  531 | 
  532 | export const waitForDeviceState = async ({
  533 |   deviceId,
  534 |   value,
  535 | }: {
  536 |   deviceId: string
  537 |   value: boolean
  538 | }) => {
  539 |   const deviceContext = await request.newContext({
  540 |     baseURL: DEVICE_SERVICE_ENDPOINT,
  541 |   })
  542 |   try {
  543 |     const matchedDevice = await pollUntil(async () => {
  544 |       const response = await deviceContext.get(`/api/v0/devices/${deviceId}`)
  545 |       if (response.status() !== 200) {
  546 |         return null
  547 |       }
  548 | 
  549 |       const json = await response.json()
  550 |       const state = findDeviceSlotValue(json.data, AUTOMATION_DEVICE_STATE_IDX)
  551 |       return state === value ? json.data : null
  552 |     })
  553 | 
  554 |     await expect(
  555 |       matchedDevice,
  556 |       `Device ${deviceId} state ${AUTOMATION_DEVICE_STATE_IDX} should be ${value}`,
```