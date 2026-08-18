# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\advanced-config-real-hc\advanced-config-real-hc.spec.ts >> Advanced config real HC >> TC-AC-058 - Presence lux_threshold ngoai range bi reject hoac khong persist
- Location: tests\e2e\advanced-config-real-hc\advanced-config-real-hc.spec.ts:456:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Test source

```ts
  331 |     deviceId: string | number,
  332 |     expectedConfig: Record<string, unknown>,
  333 |     timeoutMs = this.env.ackTimeoutMs,
  334 |   ) {
  335 |     const attempts = Math.max(1, Math.ceil(timeoutMs / this.env.pollIntervalMs))
  336 |     const attemptSummaries: Array<{
  337 |       attempt: number
  338 |       matched: boolean
  339 |       keys: Record<string, unknown>
  340 |     }> = []
  341 |     let finalConfig: JsonRecord = {}
  342 | 
  343 |     for (let attempt = 1; attempt <= attempts; attempt += 1) {
  344 |       finalConfig = await this.readDeviceConfigWithoutEvidence(deviceId)
  345 |       const matched = configMatches(finalConfig, expectedConfig)
  346 |       attemptSummaries.push({
  347 |         attempt,
  348 |         matched,
  349 |         keys: pickKeys(finalConfig, Object.keys(expectedConfig)),
  350 |       })
  351 |       if (matched) {
  352 |         this.evidence?.attachStep({
  353 |           step: 'Poll config until ACK/config visible',
  354 |           details: {
  355 |             timeout_ms: timeoutMs,
  356 |             poll_interval_ms: this.env.pollIntervalMs,
  357 |             attempts: attemptSummaries,
  358 |           },
  359 |         })
  360 |         return finalConfig
  361 |       }
  362 |       await delay(this.env.pollIntervalMs)
  363 |     }
  364 | 
  365 |     this.evidence?.attachStep({
  366 |       step: 'Poll config until ACK/config visible',
  367 |       details: {
  368 |         timeout_ms: timeoutMs,
  369 |         poll_interval_ms: this.env.pollIntervalMs,
  370 |         attempts: attemptSummaries,
  371 |         final_config_sample: pickKeys(finalConfig, Object.keys(expectedConfig)),
  372 |       },
  373 |     })
  374 |     expect(configMatches(finalConfig, expectedConfig)).toBe(true)
  375 |     return finalConfig
  376 |   }
  377 | 
  378 |   async command(deviceId: string | number, cmd: string, params = {}) {
  379 |     const response = await this.commandAPI(deviceId, cmd, params)
  380 |     const body = await recordResponse(
  381 |       this.evidence,
  382 |       `Run command ${cmd}`,
  383 |       response,
  384 |       {
  385 |         method: 'POST',
  386 |         endpoint: '/api/devices/cmd',
  387 |         baseUrl: this.env.baseUrl,
  388 |         request: {
  389 |           device_id: String(deviceId),
  390 |           cmd,
  391 |           params,
  392 |         },
  393 |       },
  394 |     )
  395 |     expect([200, 202]).toContain(response.status())
  396 |     await expectAcceptedBody(body)
  397 |     this.evidence?.attachAssertion(`Command ${cmd} accepted by gateway/HC`)
  398 |     return body
  399 |   }
  400 | 
  401 |   async expectConfigMisuseRejectedOrNotPersisted(
  402 |     deviceId: string | number,
  403 |     config: Record<string, unknown>,
  404 |   ) {
  405 |     const response = await this.setConfigAPI(deviceId, config)
  406 |     const body = await recordResponse(
  407 |       this.evidence,
  408 |       'Send invalid config payload',
  409 |       response,
  410 |       {
  411 |         method: 'POST',
  412 |         endpoint: '/api/devices/config',
  413 |         baseUrl: this.env.baseUrl,
  414 |         request: {
  415 |           device_id: String(deviceId),
  416 |           config,
  417 |         },
  418 |       },
  419 |     )
  420 |     if (![200, 202].includes(response.status())) {
  421 |       this.evidence?.attachAssertion('Invalid config was rejected by API')
  422 |       return body
  423 |     }
  424 | 
  425 |     await delay(Math.min(3000, this.env.ackTimeoutMs))
  426 |     const current = await this.readDeviceConfig(
  427 |       deviceId,
  428 |       'Verify invalid config not persisted',
  429 |     )
  430 |     for (const [key, value] of Object.entries(config)) {
> 431 |       expect(configValueMatches(current, key, value)).toBe(false)
      |                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  432 |     }
  433 |     this.evidence?.attachAssertion(
  434 |       'Invalid config was accepted by HTTP but not persisted on device config',
  435 |     )
  436 |     return body
  437 |   }
  438 | 
  439 |   private async readDeviceConfigWithoutEvidence(deviceId: string | number) {
  440 |     const response = await this.getDeviceConfigAPI(deviceId)
  441 |     if (response.status() === 200) {
  442 |       return extractConfig(await safeJson(response))
  443 |     }
  444 |     const detailResponse = await this.getDeviceDetailAPI(deviceId)
  445 |     if (detailResponse.status() === 200) {
  446 |       return extractConfig(await safeJson(detailResponse))
  447 |     }
  448 |     const listResponse = await this.listDevicesAPI()
  449 |     if (listResponse.status() === 200) {
  450 |       const devices = extractItems(await safeJson(listResponse))
  451 |       const device = devices.find(
  452 |         (item) => String(item.id) === String(deviceId),
  453 |       )
  454 |       return device ? extractConfig(device) : {}
  455 |     }
  456 |     return {}
  457 |   }
  458 | }
  459 | 
  460 | export const createAdvancedConfigApi = async (env: AdvancedConfigEnv) => {
  461 |   const context = await request.newContext({ baseURL: env.baseUrl })
  462 |   return new AdvancedConfigApiClient(context, env)
  463 | }
  464 | 
  465 | export const resetAdvancedConfigEvidenceRunDir = async (
  466 |   env: AdvancedConfigEnv,
  467 | ) => {
  468 |   let marker = ''
  469 |   try {
  470 |     marker = await readFile(RUN_MARKER, 'utf8')
  471 |   } catch {
  472 |     marker = ''
  473 |   }
  474 | 
  475 |   if (marker.trim() !== env.runId) {
  476 |     await rm(EVIDENCE_DIR, { recursive: true, force: true })
  477 |     await mkdir(EVIDENCE_DIR, { recursive: true })
  478 |     await writeFile(RUN_MARKER, env.runId, 'utf8')
  479 |     return
  480 |   }
  481 |   await mkdir(EVIDENCE_DIR, { recursive: true })
  482 | }
  483 | 
  484 | export const requireEnvValue = (
  485 |   value: string | number | undefined,
  486 |   name: string,
  487 | ) => {
  488 |   expect(String(value ?? ''), `${name} is required`).not.toBe('')
  489 | }
  490 | 
  491 | export const withRestoredConfig = async (
  492 |   api: AdvancedConfigApiClient,
  493 |   evidence: AdvancedConfigEvidence,
  494 |   deviceId: string | number,
  495 |   keys: string[],
  496 |   work: () => Promise<void>,
  497 | ) => {
  498 |   const original = await api.readDeviceConfig(
  499 |     deviceId,
  500 |     'Capture original config',
  501 |   )
  502 |   try {
  503 |     await work()
  504 |   } finally {
  505 |     const restorePayload = Object.fromEntries(
  506 |       keys.map((key) => [
  507 |         key,
  508 |         Object.prototype.hasOwnProperty.call(original, key)
  509 |           ? original[key]
  510 |           : null,
  511 |       ]),
  512 |     )
  513 |     try {
  514 |       await api.setConfigAndWait(deviceId, restorePayload, restorePayload)
  515 |       for (const key of keys) {
  516 |         evidence.attachRestoredKey(key)
  517 |       }
  518 |     } catch (error) {
  519 |       evidence.attachCleanupWarning(
  520 |         `Restore config failed for ${String(deviceId)} keys ${keys.join(',')}: ${String(error)}`,
  521 |       )
  522 |     }
  523 |   }
  524 | }
  525 | 
  526 | export const targetOutConfig = (env: AdvancedConfigEnv, value: 0 | 1) => {
  527 |   const targetId = env.groupId || env.targetDeviceId
  528 |   requireEnvValue(
  529 |     targetId,
  530 |     'ADVANCED_CONFIG_TARGET_DEVICE_ID or ADVANCED_CONFIG_GROUP_ID',
  531 |   )
```