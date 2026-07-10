# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-scenes\scene-management.api.spec.ts >> Scene Management API TC1-TC53 without permission cases >> SCN-UI - Tao 2 scene thuy random devices, kich hoat va verify output
- Location: tests\e2e\automation-scenes\scene-management.api.spec.ts:1719:3

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
```

# Test source

```ts
  444 |   console.log(
  445 |     JSON.stringify({
  446 |       scene_target_groups: groups.map((group, index) => ({
  447 |         scene_index: index,
  448 |         reused_devices: group.reusedDevices,
  449 |         device_ids: group.targets.map((target) => target.id),
  450 |       })),
  451 |     }),
  452 |   )
  453 | 
  454 |   return groups
  455 | }
  456 | 
  457 | const filterSceneTargetsByDeviceDetail = async (
  458 |   apiRequest: APIRequestContext,
  459 |   targets: SceneDeviceCandidate[],
  460 | ): Promise<SceneDeviceCandidate[]> => {
  461 |   const verified: SceneDeviceCandidate[] = []
  462 |   const rejected: {
  463 |     id: string
  464 |     name: string
  465 |     list_hc_mac?: string
  466 |     detail_hc_mac?: string
  467 |     reason: string
  468 |   }[] = []
  469 | 
  470 |   for (const target of targets) {
  471 |     const response = await apiRequest.get(
  472 |       `${DEVICE_SERVICE_ENDPOINT.replace(/\/$/, '')}/api/v0/devices/${target.id}`,
  473 |     )
  474 |     if (response.status() !== 200) {
  475 |       rejected.push({
  476 |         id: target.id,
  477 |         name: target.name ?? target.id,
  478 |         list_hc_mac: target.hc?.mac,
  479 |         reason: `detail_status_${response.status()}`,
  480 |       })
  481 |       continue
  482 |     }
  483 | 
  484 |     const json = await response.json()
  485 |     const detail = json.data as SceneDeviceCandidate
  486 |     if (detail.hc?.mac !== AUTOMATION_HC_MAC) {
  487 |       rejected.push({
  488 |         id: target.id,
  489 |         name: target.name ?? target.id,
  490 |         list_hc_mac: target.hc?.mac,
  491 |         detail_hc_mac: detail.hc?.mac,
  492 |         reason: 'detail_hc_mac_mismatch',
  493 |       })
  494 |       continue
  495 |     }
  496 | 
  497 |     verified.push({
  498 |       ...target,
  499 |       hc: detail.hc ?? target.hc,
  500 |     })
  501 |   }
  502 | 
  503 |   console.log(
  504 |     JSON.stringify({
  505 |       scene_device_detail_guard: {
  506 |         verified: verified.map(toSceneDeviceSummary),
  507 |         rejected,
  508 |       },
  509 |     }),
  510 |   )
  511 | 
  512 |   return verified
  513 | }
  514 | 
  515 | const createAndWaitForScene = async (
  516 |   client: AutomationCenterApiClient,
  517 |   payload: Parameters<AutomationCenterApiClient['createSceneAPI']>[0],
  518 | ) => {
  519 |   const createResponse = await client.createSceneAPI(payload)
  520 |   const createJson = await createResponse.json()
  521 | 
  522 |   expect(createResponse.status()).toBe(200)
  523 |   expect(createJson.success).toBe(true)
  524 |   expect(createJson.data.name).toBe(payload.name)
  525 | 
  526 |   return await waitForCloudSceneStatus(client, createJson.data.id, 'Activated')
  527 | }
  528 | 
  529 | const waitForCloudSceneStatus = async (
  530 |   client: AutomationCenterApiClient,
  531 |   sceneId: string,
  532 |   status: string,
  533 | ) => {
  534 |   const scene = await pollUntil(async () => {
  535 |     const response = await client.getSceneAPI(sceneId)
  536 |     if (response.status() !== 200) {
  537 |       return null
  538 |     }
  539 | 
  540 |     const json = await response.json()
  541 |     return json.data?.status === status ? json.data : null
  542 |   })
  543 | 
> 544 |   expect(scene).not.toBeNull()
      |                     ^ Error: expect(received).not.toBeNull()
  545 |   return scene
  546 | }
  547 | 
  548 | const expectHcSceneBindingValues = async (
  549 |   sceneId: string,
  550 |   bindings: ThuySceneBindingInput[],
  551 | ) => {
  552 |   const scene = await waitForHcSceneBindingValues(sceneId, bindings)
  553 |   for (const binding of bindings) {
  554 |     expect(scene.binding[binding.deviceId].snapshot).toEqual({
  555 |       [binding.slot]: binding.value,
  556 |     })
  557 |   }
  558 | }
  559 | 
  560 | const waitForHcSceneBindingValues = async (
  561 |   sceneId: string,
  562 |   bindings: ThuySceneBindingInput[],
  563 | ) => {
  564 |   const hcContext = await playwrightRequest.newContext({ baseURL: IOT_HC_ENDPOINT })
  565 |   try {
  566 |     const scene = await pollUntil(async () => {
  567 |       const response = await hcContext.get('/api/scenes')
  568 |       if (response.status() !== 200) {
  569 |         return null
  570 |       }
  571 | 
  572 |       const scenes = await response.json()
  573 |       const foundScene = scenes.find(
  574 |         (item: { id: string }) => item.id === sceneId,
  575 |       )
  576 |       const hasAllBindings = bindings.every(
  577 |         (binding) =>
  578 |           foundScene?.binding?.[binding.deviceId]?.snapshot?.[binding.slot] ===
  579 |           binding.value,
  580 |       )
  581 |       return hasAllBindings ? foundScene : null
  582 |     })
  583 | 
  584 |     expect(scene).not.toBeNull()
  585 |     return scene
  586 |   } finally {
  587 |     await hcContext.dispose()
  588 |   }
  589 | }
  590 | 
  591 | const expectDeviceSceneBindingMappings = async (
  592 |   sceneId: string,
  593 |   targets: SceneDeviceCandidate[],
  594 |   bindings: ThuySceneBindingInput[],
  595 | ) => {
  596 |   for (const binding of bindings) {
  597 |     const target = targets.find((item) => item.id === binding.deviceId)
  598 |     expect(target, `Target ${binding.deviceId} should exist`).toBeTruthy()
  599 | 
  600 |     const device = await waitForDeviceSceneMapping(
  601 |       sceneId,
  602 |       binding.deviceId,
  603 |       binding.value,
  604 |     )
  605 |     expect(device.hc.id).toBeTruthy()
  606 |     expect(device.hc.mac).toBe(AUTOMATION_HC_MAC)
  607 |   }
  608 | }
  609 | 
  610 | const waitForDeviceSceneMapping = async (
  611 |   sceneId: string,
  612 |   deviceId: string,
  613 |   value: boolean,
  614 | ) => {
  615 |   const deviceContext = await playwrightRequest.newContext({
  616 |     baseURL: DEVICE_SERVICE_ENDPOINT,
  617 |   })
  618 |   try {
  619 |     const device = await pollUntil(async () => {
  620 |       const response = await deviceContext.get(`/api/v0/devices/${deviceId}`)
  621 |       if (response.status() !== 200) {
  622 |         return null
  623 |       }
  624 | 
  625 |       const json = await response.json()
  626 |       const sceneMapping = json.data?.scene?.[sceneId]
  627 |       const matched = sceneMapping?.some(
  628 |         ([slot, slotValue]: [number, boolean]) =>
  629 |           slot === Number(AUTOMATION_DEVICE_STATE_IDX) && slotValue === value,
  630 |       )
  631 | 
  632 |       return matched ? json.data : null
  633 |     })
  634 | 
  635 |     expect(device).not.toBeNull()
  636 |     return device
  637 |   } finally {
  638 |     await deviceContext.dispose()
  639 |   }
  640 | }
  641 | 
  642 | const deleteCreatedScenes = async (
  643 |   client: AutomationCenterApiClient,
  644 |   sceneIds: string[],
```