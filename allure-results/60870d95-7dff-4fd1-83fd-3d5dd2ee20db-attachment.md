# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-scenes\scene-management.api.spec.ts >> Scene Management API TC1-TC53 without permission cases >> SCN-UI - Tao 2 scene thuy random devices, kich hoat va verify output
- Location: tests\e2e\automation-scenes\scene-management.api.spec.ts:1718:3

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
```

# Test source

```ts
  534 |     const response = await client.getSceneAPI(sceneId)
  535 |     if (response.status() !== 200) {
  536 |       return null
  537 |     }
  538 | 
  539 |     const json = await response.json()
  540 |     return json.data?.id ? json.data : null
  541 |   }, 20)
  542 | 
  543 |   expect(scene).not.toBeNull()
  544 |   return scene
  545 | }
  546 | 
  547 | const expectHcSceneBindingValues = async (
  548 |   sceneId: string,
  549 |   bindings: ThuySceneBindingInput[],
  550 | ) => {
  551 |   const scene = await waitForHcSceneBindingValues(sceneId, bindings)
  552 |   for (const binding of bindings) {
  553 |     expect(scene.binding[binding.deviceId].snapshot).toEqual({
  554 |       [binding.slot]: binding.value,
  555 |     })
  556 |   }
  557 | }
  558 | 
  559 | const waitForHcSceneBindingValues = async (
  560 |   sceneId: string,
  561 |   bindings: ThuySceneBindingInput[],
  562 | ) => {
  563 |   const hcContext = await playwrightRequest.newContext({ baseURL: IOT_HC_ENDPOINT })
  564 |   try {
  565 |     const scene = await pollUntil(async () => {
  566 |       const response = await hcContext.get('/api/scenes')
  567 |       if (response.status() !== 200) {
  568 |         return null
  569 |       }
  570 | 
  571 |       const scenes = await response.json()
  572 |       const foundScene = scenes.find(
  573 |         (item: { id: string }) => item.id === sceneId,
  574 |       )
  575 |       const hasAllBindings = bindings.every(
  576 |         (binding) =>
  577 |           foundScene?.binding?.[binding.deviceId]?.snapshot?.[binding.slot] ===
  578 |           binding.value,
  579 |       )
  580 |       return hasAllBindings ? foundScene : null
  581 |     })
  582 | 
  583 |     expect(scene).not.toBeNull()
  584 |     return scene
  585 |   } finally {
  586 |     await hcContext.dispose()
  587 |   }
  588 | }
  589 | 
  590 | const expectDeviceSceneBindingMappings = async (
  591 |   sceneId: string,
  592 |   targets: SceneDeviceCandidate[],
  593 |   bindings: ThuySceneBindingInput[],
  594 | ) => {
  595 |   for (const binding of bindings) {
  596 |     const target = targets.find((item) => item.id === binding.deviceId)
  597 |     expect(target, `Target ${binding.deviceId} should exist`).toBeTruthy()
  598 | 
  599 |     const device = await waitForDeviceSceneMapping(
  600 |       sceneId,
  601 |       binding.deviceId,
  602 |       binding.value,
  603 |     )
  604 |     expect(device.hc.id).toBeTruthy()
  605 |     expect(device.hc.mac).toBe(AUTOMATION_HC_MAC)
  606 |   }
  607 | }
  608 | 
  609 | const waitForDeviceSceneMapping = async (
  610 |   sceneId: string,
  611 |   deviceId: string,
  612 |   value: boolean,
  613 | ) => {
  614 |   const deviceContext = await playwrightRequest.newContext({
  615 |     baseURL: DEVICE_SERVICE_ENDPOINT,
  616 |   })
  617 |   try {
  618 |     const device = await pollUntil(async () => {
  619 |       const response = await deviceContext.get(`/api/v0/devices/${deviceId}`)
  620 |       if (response.status() !== 200) {
  621 |         return null
  622 |       }
  623 | 
  624 |       const json = await response.json()
  625 |       const sceneMapping = json.data?.scene?.[sceneId]
  626 |       const matched = sceneMapping?.some(
  627 |         ([slot, slotValue]: [number, boolean]) =>
  628 |           slot === Number(AUTOMATION_DEVICE_STATE_IDX) && slotValue === value,
  629 |       )
  630 | 
  631 |       return matched ? json.data : null
  632 |     })
  633 | 
> 634 |     expect(device).not.toBeNull()
      |                        ^ Error: expect(received).not.toBeNull()
  635 |     return device
  636 |   } finally {
  637 |     await deviceContext.dispose()
  638 |   }
  639 | }
  640 | 
  641 | const deleteCreatedScenes = async (
  642 |   client: AutomationCenterApiClient,
  643 |   sceneIds: string[],
  644 | ) => {
  645 |   const ids = [...new Set(sceneIds.filter(Boolean))]
  646 |   if (ids.length === 0) {
  647 |     return
  648 |   }
  649 | 
  650 |   const response = await client.deleteManyScenesAPI(ids)
  651 |   expect([200, 204]).toContain(response.status())
  652 |   console.log(
  653 |     JSON.stringify({
  654 |       scene_cleanup: {
  655 |         deleted_scene_ids: ids,
  656 |       },
  657 |     }),
  658 |   )
  659 | }
  660 | 
  661 | const setSceneBindingsBaseline = async (
  662 |   sceneTargets: SceneDeviceCandidate[],
  663 |   bindings: ThuySceneBindingInput[],
  664 |   sceneHcId?: string,
  665 | ) => {
  666 |   const controlContext = await playwrightRequest.newContext({
  667 |     baseURL: DEVICE_CONTROL_ENDPOINT,
  668 |   })
  669 |   try {
  670 |     for (const binding of bindings) {
  671 |       const target = sceneTargets.find((item) => item.id === binding.deviceId)
  672 |       expect(target, `Target ${binding.deviceId} should exist`).toBeTruthy()
  673 | 
  674 |       const response = await controlContext.post('/api/devices/control', {
  675 |         headers: {
  676 |           'x-hc-id': sceneHcId ?? getSceneHcId(sceneTargets),
  677 |           'x-request-id': `scene-baseline-${binding.deviceId}-${Date.now()}`,
  678 |           'x-user-id': 'automation-test',
  679 |           'x-app-id': 'bms-e2e-test',
  680 |         },
  681 |         data: {
  682 |           device_id: binding.deviceId,
  683 |           states: [
  684 |             {
  685 |               idx: Number(binding.slot),
  686 |               value: !binding.value,
  687 |             },
  688 |           ],
  689 |         },
  690 |       })
  691 | 
  692 |       expect(response.status()).toBe(200)
  693 |       const json = await response.json()
  694 |       expect(json.status).toBe(true)
  695 |     }
  696 |   } finally {
  697 |     await controlContext.dispose()
  698 |   }
  699 | }
  700 | 
  701 | const activateScene = async ({
  702 |   sceneId,
  703 |   sceneTargets,
  704 |   sceneHcId,
  705 |   value = true,
  706 | }: {
  707 |   sceneId: string
  708 |   sceneTargets: SceneDeviceCandidate[]
  709 |   sceneHcId?: string
  710 |   value?: boolean
  711 | }) => {
  712 |   const controlContext = await playwrightRequest.newContext({
  713 |     baseURL: DEVICE_CONTROL_ENDPOINT,
  714 |   })
  715 |   const hcId = sceneHcId ?? getSceneHcId(sceneTargets)
  716 |   try {
  717 |     const response = await controlContext.post('/api/devices/control', {
  718 |       headers: {
  719 |         'x-hc-id': hcId,
  720 |         'x-request-id': `scene-activate-${sceneId}-${Date.now()}`,
  721 |         'x-user-id': 'automation-test',
  722 |         'x-app-id': 'bms-e2e-test',
  723 |       },
  724 |       data: {
  725 |         device_id: sceneId,
  726 |         states: [
  727 |           {
  728 |             idx: Number(AUTOMATION_DEVICE_STATE_IDX),
  729 |             value,
  730 |           },
  731 |         ],
  732 |       },
  733 |     })
  734 | 
```