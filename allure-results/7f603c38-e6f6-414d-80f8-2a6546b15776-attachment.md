# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-scenes\api.spec.ts >> Scene Management API TC1-TC53 without permission cases >> TC1 - Lay danh sach Scene thanh cong
- Location: tests\e2e\automation-scenes\api.spec.ts:50:5

# Error details

```
Error: Need at least 1 online controllable device with matching detail HC MAC 88:e6:28:f8:2e:4d. Discovery: {"selected":[],"online_count":17,"offline":[{"id":"83316584622508291","name":"thiết bị_52C9_3","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508290","name":"thiết bị_52C9_2","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508289","name":"thiết bị_52C9_1","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508288","name":"thiết bị_52C9_0","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0}],"skipped":[{"id":"118431939315341315","name":"thiết bị_F398_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":3},{"id":"118431939315341314","name":"thiết bị_F398_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":3},{"id":"118431939315341313","name":"thiết bị_F398_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"118431939315341312","name":"thiết bị_F398_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"87907690177550336","name":"thiết bị_0ED8_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":3},{"id":"118431937308523268","name":"thiết bị_55FB_4","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523267","name":"thiết bị_55FB_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523266","name":"thiết bị_55FB_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523265","name":"thiết bị_55FB_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"118431937308523264","name":"thiết bị_55FB_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"87903193043180547","name":"thiết bị_F61C_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180546","name":"thiết bị_F61C_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180545","name":"thiết bị_F61C_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180544","name":"thiết bị_F61C_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"120416080507841538","name":"thiết bị_EA2C_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":8,"rules_count":0},{"id":"120416080507841537","name":"thiết bị_EA2C_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":7,"rules_count":0},{"id":"120416080507841536","name":"thiết bị_EA2C_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":6,"rules_count":3}],"wrong_hc_count":22}

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 1
Received:    0
```

# Test source

```ts
  319 |     icon: '-1',
  320 |     enable: true,
  321 |     background: null,
  322 |     background_color: '#ffffff',
  323 |     binding: [],
  324 |     cron: null,
  325 |     cron_enable: false,
  326 |     ...overrides,
  327 |   }) as Record<string, unknown>
  328 | 
  329 | const toSceneBindings = (
  330 |   devices: SceneDeviceCandidate[],
  331 |   slot: string,
  332 |   value: boolean,
  333 | ): ThuySceneBindingInput[] =>
  334 |   devices.map((device) => ({
  335 |     deviceId: device.id,
  336 |     slot,
  337 |     value,
  338 |   }))
  339 | 
  340 | const toMixedSceneBindings = (
  341 |   devices: SceneDeviceCandidate[],
  342 |   slot: string,
  343 |   offset = 0,
  344 | ): ThuySceneBindingInput[] =>
  345 |   devices.map((device, index) => ({
  346 |     deviceId: device.id,
  347 |     slot,
  348 |     value: (index + offset) % 2 === 0,
  349 |   }))
  350 | 
  351 | const invertSceneBindings = (
  352 |   bindings: ThuySceneBindingInput[],
  353 | ): ThuySceneBindingInput[] =>
  354 |   bindings.map((binding) => ({
  355 |     ...binding,
  356 |     value: !binding.value,
  357 |   }))
  358 | 
  359 | const createThuySceneData = ({
  360 |   index,
  361 |   bindings,
  362 | }: {
  363 |   index: number
  364 |   bindings: ThuySceneBindingInput[]
  365 | }): AutomationSceneCreateRequest => ({
  366 |   type: 'Normal',
  367 |   name: `thuy${index}`,
  368 |   icon: '-1',
  369 |   enable: true,
  370 |   background: null,
  371 |   background_color: '#ffffff',
  372 |   binding: createSceneBindings(bindings),
  373 |   cron: null,
  374 |   cron_enable: false,
  375 | })
  376 | 
  377 | const discoverSceneTargets = async (
  378 |   apiRequest: APIRequestContext,
  379 | ): Promise<SceneDeviceCandidate[]> => {
  380 |   const selected = await discoverSceneTargetPool(apiRequest)
  381 |   return selected.slice(0, SCENE_DEVICE_MAX_COUNT)
  382 | }
  383 | 
  384 | const discoverSceneTargetPool = async (
  385 |   apiRequest: APIRequestContext,
  386 | ): Promise<SceneDeviceCandidate[]> => {
  387 |   const response = await apiRequest.get(
  388 |     `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices`,
  389 |     {
  390 |       params: {
  391 |         limit: 100,
  392 |       },
  393 |     },
  394 |   )
  395 |   const json = await response.json()
  396 |   const devices = (json.data?.items ?? []) as SceneDeviceCandidate[]
  397 |   const discovery = selectSceneTargetDevices({
  398 |     devices,
  399 |     hcMac: AUTOMATION_HC_MAC,
  400 |     slot: AUTOMATION_DEVICE_STATE_IDX,
  401 |     count: 100,
  402 |   })
  403 | 
  404 |   console.log(
  405 |     JSON.stringify({
  406 |       scene_device_discovery: formatSceneDeviceDiscovery(discovery),
  407 |     }),
  408 |   )
  409 | 
  410 |   expect(response.status()).toBe(200)
  411 |   expect(json.success).toBe(true)
  412 |   const selected = await filterSceneTargetsByDeviceDetail(
  413 |     apiRequest,
  414 |     discovery.selected,
  415 |   )
  416 |   expect(
  417 |     selected.length,
  418 |     `Need at least ${SCENE_DEVICE_MIN_COUNT} online controllable device with matching detail HC MAC ${AUTOMATION_HC_MAC}. Discovery: ${JSON.stringify(formatSceneDeviceDiscovery(discovery))}`,
> 419 |   ).toBeGreaterThanOrEqual(SCENE_DEVICE_MIN_COUNT)
      |     ^ Error: Need at least 1 online controllable device with matching detail HC MAC 88:e6:28:f8:2e:4d. Discovery: {"selected":[],"online_count":17,"offline":[{"id":"83316584622508291","name":"thiết bị_52C9_3","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508290","name":"thiết bị_52C9_2","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508289","name":"thiết bị_52C9_1","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"83316584622508288","name":"thiết bị_52C9_0","status":false,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0}],"skipped":[{"id":"118431939315341315","name":"thiết bị_F398_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":3},{"id":"118431939315341314","name":"thiết bị_F398_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":3},{"id":"118431939315341313","name":"thiết bị_F398_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"118431939315341312","name":"thiết bị_F398_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"87907690177550336","name":"thiết bị_0ED8_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":3},{"id":"118431937308523268","name":"thiết bị_55FB_4","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523267","name":"thiết bị_55FB_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523266","name":"thiết bị_55FB_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":4,"rules_count":2},{"id":"118431937308523265","name":"thiết bị_55FB_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"118431937308523264","name":"thiết bị_55FB_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":5,"rules_count":0},{"id":"87903193043180547","name":"thiết bị_F61C_3","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180546","name":"thiết bị_F61C_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180545","name":"thiết bị_F61C_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":1},{"id":"87903193043180544","name":"thiết bị_F61C_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":2,"rules_count":0},{"id":"120416080507841538","name":"thiết bị_EA2C_2","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":8,"rules_count":0},{"id":"120416080507841537","name":"thiết bị_EA2C_1","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":7,"rules_count":0},{"id":"120416080507841536","name":"thiết bị_EA2C_0","status":true,"network_state":"activated","hc_mac":"88:e6:28:f8:2e:4d","device_type_id":6,"rules_count":3}],"wrong_hc_count":22}
  420 | 
  421 |   return shuffleSceneTargets(selected)
  422 | }
  423 | 
  424 | const createDistinctSceneTargetGroups = ({
  425 |   targets,
  426 |   groupCount,
  427 |   groupSize = SCENE_DEVICE_MAX_COUNT,
  428 | }: {
  429 |   targets: SceneDeviceCandidate[]
  430 |   groupCount: number
  431 |   groupSize?: number
  432 | }): SceneTargetGroup[] => {
  433 |   const hasEnoughForRequestedSize = targets.length >= groupCount * groupSize
  434 |   const distinctFallbackSize = Math.max(
  435 |     SCENE_DEVICE_MIN_COUNT,
  436 |     Math.floor(targets.length / groupCount),
  437 |   )
  438 |   const effectiveSize = hasEnoughForRequestedSize
  439 |     ? groupSize
  440 |     : Math.min(groupSize, Math.max(distinctFallbackSize, SCENE_DEVICE_MIN_COUNT))
  441 |   const hasEnoughDistinctDevices = targets.length >= groupCount * effectiveSize
  442 |   const groups = Array.from({ length: groupCount }, (_, groupIndex) => {
  443 |     if (hasEnoughDistinctDevices) {
  444 |       return {
  445 |         targets: targets.slice(
  446 |           groupIndex * effectiveSize,
  447 |           groupIndex * effectiveSize + effectiveSize,
  448 |         ),
  449 |         reusedDevices: false,
  450 |       }
  451 |     }
  452 | 
  453 |     return {
  454 |       targets: Array.from(
  455 |         { length: Math.min(effectiveSize, targets.length) },
  456 |         (_, index) => targets[(groupIndex + index) % targets.length],
  457 |       ),
  458 |       reusedDevices: targets.length < groupCount * effectiveSize,
  459 |     }
  460 |   })
  461 | 
  462 |   console.log(
  463 |     JSON.stringify({
  464 |       scene_target_groups: groups.map((group, index) => ({
  465 |         scene_index: index,
  466 |         reused_devices: group.reusedDevices,
  467 |         device_ids: group.targets.map((target) => target.id),
  468 |       })),
  469 |     }),
  470 |   )
  471 | 
  472 |   return groups
  473 | }
  474 | 
  475 | const filterSceneTargetsByDeviceDetail = async (
  476 |   apiRequest: APIRequestContext,
  477 |   targets: SceneDeviceCandidate[],
  478 | ): Promise<SceneDeviceCandidate[]> => {
  479 |   const verified: SceneDeviceCandidate[] = []
  480 |   const rejected: {
  481 |     id: string
  482 |     name: string
  483 |     list_hc_mac?: string
  484 |     detail_hc_mac?: string
  485 |     reason: string
  486 |   }[] = []
  487 | 
  488 |   for (const target of targets) {
  489 |     const response = await apiRequest.get(
  490 |       `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices/${target.id}`,
  491 |     )
  492 |     if (response.status() !== 200) {
  493 |       rejected.push({
  494 |         id: target.id,
  495 |         name: target.name ?? target.id,
  496 |         list_hc_mac: target.hc?.mac,
  497 |         reason: `detail_status_${response.status()}`,
  498 |       })
  499 |       continue
  500 |     }
  501 | 
  502 |     const json = await response.json()
  503 |     const detail = json.data as SceneDeviceCandidate
  504 |     if (detail.hc?.mac !== AUTOMATION_HC_MAC) {
  505 |       rejected.push({
  506 |         id: target.id,
  507 |         name: target.name ?? target.id,
  508 |         list_hc_mac: target.hc?.mac,
  509 |         detail_hc_mac: detail.hc?.mac,
  510 |         reason: 'detail_hc_mac_mismatch',
  511 |       })
  512 |       continue
  513 |     }
  514 | 
  515 |     verified.push({
  516 |       ...target,
  517 |       hc: detail.hc ?? target.hc,
  518 |     })
  519 |   }
```