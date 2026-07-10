# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\automation-scenes\scene-management.api.spec.ts >> Scene Management API TC1-TC53 without permission cases >> SCN-UI - Tao 2 scene thuy random devices, kich hoat va verify output
- Location: tests\e2e\automation-scenes\scene-management.api.spec.ts:1747:3

# Error details

```
Error: All target devices should match bindings [{"deviceId":"87903193043180547","slot":"1","value":true},{"deviceId":"118431937308523267","slot":"1","value":false},{"deviceId":"87907690177550336","slot":"1","value":true}]. Last statuses: [{"id":"87907690177550336","status":[{"idx":0,"value":true},{"idx":1,"value":false}]},{"id":"118431937308523267","status":[{"idx":4,"value":0},{"idx":1,"value":true},{"idx":2,"value":218.6},{"idx":3,"value":0},{"idx":5,"value":0},{"idx":0,"value":true},{"idx":6,"value":934997}]},{"id":"87903193043180547","status":[{"idx":1,"value":false},{"idx":0,"value":true}]}]

expect(received).not.toBeNull()

Received: null
```

# Test source

```ts
  801  |     sceneId,
  802  |     sceneTargets,
  803  |     value: true,
  804  |   })
  805  |   const afterStatuses = await activateSceneUntilBindingsMatch({
  806  |     sceneId,
  807  |     sceneHcId,
  808  |     sceneTargets,
  809  |     bindings,
  810  |     initialActivation: activation,
  811  |   })
  812  |   assertSceneOutputMatchesBindings(sceneId, afterStatuses, bindings)
  813  | 
  814  |   const activationEvidence = {
  815  |     scene_id: sceneId,
  816  |     device_ids: bindings.map((binding) => binding.deviceId),
  817  |     bindings,
  818  |     expected_output: bindings,
  819  |     verified_output: toSceneOutputEvidence(afterStatuses, bindings),
  820  |     baseline_before_activation: invertSceneBindings(bindings),
  821  |     before_statuses: beforeStatuses,
  822  |     after_statuses: afterStatuses,
  823  |     response: activation,
  824  |   }
  825  | 
  826  |   console.log(JSON.stringify({ scene_activation: activationEvidence }))
  827  |   return activationEvidence
  828  | }
  829  | 
  830  | const activateSceneUntilBindingsMatch = async ({
  831  |   sceneId,
  832  |   sceneHcId,
  833  |   sceneTargets,
  834  |   bindings,
  835  |   initialActivation,
  836  | }: {
  837  |   sceneId: string
  838  |   sceneHcId?: string
  839  |   sceneTargets: SceneDeviceCandidate[]
  840  |   bindings: ThuySceneBindingInput[]
  841  |   initialActivation?: { status: boolean }
  842  | }) => {
  843  |   let activation = initialActivation
  844  |   for (let attempt = 0; attempt < 3; attempt += 1) {
  845  |     if (!activation) {
  846  |       activation = await activateScene({
  847  |         sceneId,
  848  |         sceneTargets,
  849  |         value: true,
  850  |       })
  851  |     }
  852  | 
  853  |     const matched = await pollForBindingStates(sceneTargets, bindings, 10)
  854  |     if (matched) {
  855  |       return matched
  856  |     }
  857  | 
  858  |     console.log(
  859  |       JSON.stringify({
  860  |         scene_activation_retry: {
  861  |           scene_id: sceneId,
  862  |           attempt: attempt + 1,
  863  |           bindings,
  864  |         },
  865  |       }),
  866  |     )
  867  |     activation = undefined
  868  |   }
  869  | 
  870  |   return await waitForBindingStates(sceneTargets, bindings)
  871  | }
  872  | 
  873  | const waitForBindingStates = async (
  874  |   sceneTargets: SceneDeviceCandidate[],
  875  |   bindings: ThuySceneBindingInput[],
  876  | ) => {
  877  |   let lastStatuses: {
  878  |     id: string
  879  |     status: { idx: number; value: boolean | number | string }[]
  880  |   }[] = []
  881  |   const matched = await pollUntil(async () => {
  882  |     const statuses = await getHcDeviceStatuses(sceneTargets)
  883  |     lastStatuses = statuses
  884  |     const allMatched = bindings.every((binding) =>
  885  |       statuses.some(
  886  |         (item) =>
  887  |           item.id === binding.deviceId &&
  888  |           item.status.some(
  889  |             (slot) =>
  890  |               slot.idx === Number(binding.slot) && slot.value === binding.value,
  891  |           ),
  892  |       ),
  893  |     )
  894  | 
  895  |     return allMatched ? statuses : null
  896  |   }, 30)
  897  | 
  898  |   expect(
  899  |     matched,
  900  |     `All target devices should match bindings ${JSON.stringify(bindings)}. Last statuses: ${JSON.stringify(lastStatuses)}`,
> 901  |   ).not.toBeNull()
       |         ^ Error: All target devices should match bindings [{"deviceId":"87903193043180547","slot":"1","value":true},{"deviceId":"118431937308523267","slot":"1","value":false},{"deviceId":"87907690177550336","slot":"1","value":true}]. Last statuses: [{"id":"87907690177550336","status":[{"idx":0,"value":true},{"idx":1,"value":false}]},{"id":"118431937308523267","status":[{"idx":4,"value":0},{"idx":1,"value":true},{"idx":2,"value":218.6},{"idx":3,"value":0},{"idx":5,"value":0},{"idx":0,"value":true},{"idx":6,"value":934997}]},{"id":"87903193043180547","status":[{"idx":1,"value":false},{"idx":0,"value":true}]}]
  902  | 
  903  |   return matched
  904  | }
  905  | 
  906  | const assertSceneOutputMatchesBindings = (
  907  |   sceneId: string,
  908  |   statuses: {
  909  |     id: string
  910  |     status: { idx: number; value: boolean | number | string }[]
  911  |   }[] | null,
  912  |   bindings: ThuySceneBindingInput[],
  913  | ) => {
  914  |   const evidence = toSceneOutputEvidence(statuses, bindings)
  915  | 
  916  |   for (const output of evidence) {
  917  |     expect(
  918  |       output.actual,
  919  |       `Scene ${sceneId} output mismatch: device ${output.device_id} slot ${output.slot} should be ${output.expected}. Evidence: ${JSON.stringify(evidence)}`,
  920  |     ).toBe(output.expected)
  921  |   }
  922  | }
  923  | 
  924  | const pollForBindingStates = async (
  925  |   sceneTargets: SceneDeviceCandidate[],
  926  |   bindings: ThuySceneBindingInput[],
  927  |   attempts = 30,
  928  | ) =>
  929  |   await pollUntil(async () => {
  930  |     const statuses = await getHcDeviceStatuses(sceneTargets)
  931  |     const allMatched = bindings.every((binding) =>
  932  |       statuses.some(
  933  |         (item) =>
  934  |           item.id === binding.deviceId &&
  935  |           item.status.some(
  936  |             (slot) =>
  937  |               slot.idx === Number(binding.slot) && slot.value === binding.value,
  938  |           ),
  939  |       ),
  940  |     )
  941  | 
  942  |     return allMatched ? statuses : null
  943  |   }, attempts)
  944  | 
  945  | const resolveSceneHcId = async (
  946  |   client: AutomationCenterApiClient,
  947  |   sceneId: string,
  948  | ) => {
  949  |   const response = await client.listScenesAPI({ page: 1, limit: 100 })
  950  |   const json = await response.json()
  951  |   const scene = (json.data?.items ?? []).find(
  952  |     (item: { id: string | number; hcid?: string | null }) =>
  953  |       String(item.id) === String(sceneId),
  954  |   ) as { hcid?: string | null } | undefined
  955  | 
  956  |   expect(
  957  |     scene?.hcid,
  958  |     `Scene ${sceneId} should have hcid in list response before activation`,
  959  |   ).toBeTruthy()
  960  | 
  961  |   return scene?.hcid ?? undefined
  962  | }
  963  | 
  964  | const getHcDeviceStatuses = async (
  965  |   sceneTargets: SceneDeviceCandidate[],
  966  | ): Promise<
  967  |   {
  968  |     id: string
  969  |     status: { idx: number; value: boolean | number | string }[]
  970  |   }[]
  971  | > => {
  972  |   const hcContext = await playwrightRequest.newContext({ baseURL: IOT_HC_ENDPOINT })
  973  |   try {
  974  |     const response = await hcContext.get('/api/devices/status', {
  975  |       params: {
  976  |         ids: sceneTargets.map((device) => device.id).join(','),
  977  |       },
  978  |     })
  979  | 
  980  |     expect(response.status()).toBe(200)
  981  |     return (await response.json()) as {
  982  |       id: string
  983  |       status: { idx: number; value: boolean | number | string }[]
  984  |     }[]
  985  |   } finally {
  986  |     await hcContext.dispose()
  987  |   }
  988  | }
  989  | 
  990  | const toSceneOutputEvidence = (
  991  |   statuses: {
  992  |     id: string
  993  |     status: { idx: number; value: boolean | number | string }[]
  994  |   }[] | null,
  995  |   bindings: ThuySceneBindingInput[],
  996  | ) =>
  997  |   bindings.map((binding) => {
  998  |     const deviceStatus = statuses?.find((item) => item.id === binding.deviceId)
  999  |     const slotStatus = deviceStatus?.status.find(
  1000 |       (slot) => slot.idx === Number(binding.slot),
  1001 |     )
```