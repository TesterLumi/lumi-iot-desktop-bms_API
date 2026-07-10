import { expect, test } from '@playwright/test'
import {
  AUTOMATION_DEVICE_STATE_IDX,
  AUTOMATION_SERVICE_ENDPOINT,
} from '@src/config'
import { AutomationCenterApiClient } from '@src/core'
import {
  attachSceneAssertion,
  cleanupAutoScene,
  createAutoScenePayload,
  createAutoSceneUpdatePayload,
  createInvalidScenePayload,
  createSceneTestContext,
  discoverSceneTargets,
  expectSceneDetailShape,
  expectSceneListShape,
  expectValidationOrDocumentedBehavior,
  generateSceneName,
  invertSceneBindings,
  recordSceneResponse,
  saveSceneEvidence,
  toMixedSceneBindings,
  toSceneBindings,
  type ThuySceneBindingInput,
} from './scenes.support'

test.describe('Scene Management API TC1-TC53 without permission cases', () => {
  test.skip(!AUTOMATION_SERVICE_ENDPOINT, 'AUTOMATION_SERVICE_ENDPOINT is required')

  let sceneTargets: Awaited<ReturnType<typeof discoverSceneTargets>>

  test.beforeAll(async ({ playwright }) => {
    const apiRequest = await playwright.request.newContext()
    try {
      sceneTargets = await discoverSceneTargets(apiRequest)
    } finally {
      await apiRequest.dispose()
    }
  })

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (args: {
      client: AutomationCenterApiClient
      context: ReturnType<typeof createSceneTestContext>
      bindings: ThuySceneBindingInput[]
    }) => Promise<void>,
  ) => {
    test(`${tcId} - ${tcName}`, async ({ request }) => {
      const context = createSceneTestContext(tcId, tcName)
      const client = new AutomationCenterApiClient(request)
      const bindings = toSceneBindings(
        sceneTargets,
        AUTOMATION_DEVICE_STATE_IDX,
        true,
      )
      try {
        await handler({ client, context, bindings })
        await saveSceneEvidence(context, 'PASSED')
      } catch (error) {
        await saveSceneEvidence(context, 'FAILED', error)
        throw error
      }
    })
  }

  const createSceneForTc = async ({
    client,
    context,
    tcId,
    bindings,
    overrides = {},
  }: {
    client: AutomationCenterApiClient
    context: ReturnType<typeof createSceneTestContext>
    tcId: string
    bindings: ThuySceneBindingInput[]
    overrides?: Partial<Parameters<typeof createAutoScenePayload>[0]>
  }) => {
    const payload = createAutoScenePayload({
      tcId,
      bindings,
      ...overrides,
    })
    const response = await client.createSceneAPI(payload)
    const body = (await recordSceneResponse(context, 'Create scene', response, {
      method: 'POST',
      endpoint: '/api/v0/scenes',
      request: payload,
    })) as { data?: { id?: string; name?: string } }
    expect(response.status()).toBe(200)
    expect(body.data?.id).toBeTruthy()
    attachSceneAssertion(context, 'Create scene returns id')
    return {
      id: String(body.data?.id),
      name: body.data?.name,
      payload,
    }
  }

  const getSceneDetail = async (
    client: AutomationCenterApiClient,
    context: ReturnType<typeof createSceneTestContext>,
    sceneId: string | number,
  ) => {
    const response = await client.getSceneAPI(sceneId)
    const body = await recordSceneResponse(context, 'Get scene detail', response, {
      method: 'GET',
      endpoint: `/api/v0/scenes/${sceneId}`,
    })
    return { response, body }
  }

  const expectCreateValidation = async (
    client: AutomationCenterApiClient,
    context: ReturnType<typeof createSceneTestContext>,
    payload: Record<string, unknown>,
  ) => {
    const response = await client.createSceneAPI(payload as never)
    const body = await recordSceneResponse(context, 'Create invalid scene', response, {
      method: 'POST',
      endpoint: '/api/v0/scenes',
      request: payload,
    })
    if (response.status() >= 200 && response.status() < 300) {
      const createdSceneId =
        typeof body === 'object' && body !== null
          ? String(
              (body as { data?: { id?: unknown }; id?: unknown }).data?.id ??
                (body as { id?: unknown }).id ??
                '',
            )
          : ''
      let cleanupSceneId = createdSceneId || undefined

      if (!cleanupSceneId && typeof payload.name === 'string') {
        const listResponse = await client.listScenesAPI({
          name: payload.name,
          no_limit: true,
        })
        const listBody = await recordSceneResponse(
          context,
          'Find invalid scene created by backend',
          listResponse,
          {
            method: 'GET',
            endpoint: `/api/v0/scenes?name=${payload.name}`,
          },
        )
        const candidates = extractSceneItems(listBody)
        cleanupSceneId = candidates.find((scene) => scene.name === payload.name)
          ?.id
      }

      await cleanupAutoScene(client, context, cleanupSceneId)
      throw new Error(
        `Invalid scene payload was accepted by backend. Expected 4xx, got ${response.status()}. Payload=${JSON.stringify(payload)} Response=${JSON.stringify(body)} CleanupSceneId=${cleanupSceneId ?? 'not_found'}`,
      )
    }

    expect([400, 409, 422]).toContain(response.status())
  }

  const extractSceneItems = (body: unknown): Array<{ id?: string; name?: string }> => {
    if (!body || typeof body !== 'object') {
      return []
    }
    const data = (body as { data?: unknown }).data
    if (Array.isArray(data)) {
      return data as Array<{ id?: string; name?: string }>
    }
    if (data && typeof data === 'object') {
      const objectData = data as { items?: unknown; data?: unknown }
      if (Array.isArray(objectData.items)) {
        return objectData.items as Array<{ id?: string; name?: string }>
      }
      if (Array.isArray(objectData.data)) {
        return objectData.data as Array<{ id?: string; name?: string }>
      }
    }
    return []
  }

  /*

   * TC1 - Lay danh sach Scene thanh cong

   */

  runTc('TC1', 'Lay danh sach Scene thanh cong', async ({ client, context }) => {
    const response = await client.listScenesAPI({ page: 1, limit: 20 })
    const body = await recordSceneResponse(context, 'List scenes', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes?page=1&limit=20',
    })
    expect(response.status()).toBe(200)
    expectSceneListShape(body)
  })

  /*

   * TC2 - Loc Scene theo id

   */

  runTc('TC2', 'Loc Scene theo id', async ({ client, context, bindings }) => {
    let sceneId: string | undefined
    try {
      const scene = await createSceneForTc({ client, context, tcId: 'TC2', bindings })
      sceneId = scene.id
      const response = await client.listScenesAPI({ page: 1, limit: 20, id: scene.id })
      const body = (await recordSceneResponse(context, 'Filter scenes by id', response, {
        method: 'GET',
        endpoint: `/api/v0/scenes?id=${scene.id}`,
      })) as { data?: { items?: Array<{ id: string | number }> } }
      expect(response.status()).toBe(200)
      expectSceneListShape(body)
      if ((body.data?.items ?? []).length > 0) {
        expect(body.data?.items?.some((item) => String(item.id) === scene.id)).toBe(true)
      }
    } finally {
      await cleanupAutoScene(client, context, sceneId)
    }
  })

  /*

   * TC3 - Loc Scene theo status

   */

  runTc('TC3', 'Loc Scene theo status', async ({ client, context }) => {
    const response = await client.listScenesAPI({ page: 1, limit: 20, status: 'Activated' })
    const body = (await recordSceneResponse(context, 'Filter scenes by status', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes?status=Activated',
    })) as { data?: { items?: Array<{ status?: string }> } }
    expect(response.status()).toBe(200)
    expectSceneListShape(body)
    for (const item of body.data?.items ?? []) {
      expect(['Activated', undefined]).toContain(item.status)
    }
  })

  /*

   * TC4 - Loc Scene theo type

   */

  runTc('TC4', 'Loc Scene theo type', async ({ client, context }) => {
    const response = await client.listScenesAPI({ page: 1, limit: 20, type: 'Normal' })
    const body = await recordSceneResponse(context, 'Filter scenes by type', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes?type=Normal',
    })
    expect(response.status()).toBe(200)
    expectSceneListShape(body)
  })

  /*

   * TC5 - Tim Scene theo name

   */

  runTc('TC5', 'Tim Scene theo name', async ({ client, context, bindings }) => {
    let sceneId: string | undefined
    try {
      const name = generateSceneName('TC5')
      const scene = await createSceneForTc({
        client,
        context,
        tcId: 'TC5',
        bindings,
        overrides: { name },
      })
      sceneId = scene.id
      const response = await client.listScenesAPI({ page: 1, limit: 20, name })
      const body = (await recordSceneResponse(context, 'Search scenes by name', response, {
        method: 'GET',
        endpoint: `/api/v0/scenes?name=${name}`,
      })) as { data?: { items?: Array<{ name?: string }> } }
      expect(response.status()).toBe(200)
      expectSceneListShape(body)
      if ((body.data?.items ?? []).length > 0) {
        expect(body.data?.items?.some((item) => item.name === name)).toBe(true)
      }
    } finally {
      await cleanupAutoScene(client, context, sceneId)
    }
  })

  /*

   * TC6 - Search name khong ton tai

   */

  runTc('TC6', 'Search name khong ton tai', async ({ client, context }) => {
    const name = generateSceneName('TC6_missing')
    const response = await client.listScenesAPI({ page: 1, limit: 20, name })
    const body = await recordSceneResponse(context, 'Search missing scene name', response, {
      method: 'GET',
      endpoint: `/api/v0/scenes?name=${name}`,
    })
    expect(response.status()).toBe(200)
    expectSceneListShape(body)
  })

  /*

   * TC7 - Filter status khong hop le

   */

  runTc('TC7', 'Filter status khong hop le', async ({ client, context }) => {
    const response = await client.listScenesAPI({ page: 1, limit: 20, status: 'Invalid' })
    await recordSceneResponse(context, 'Invalid status filter', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes?status=Invalid',
    })
    expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
  })

  /*

   * TC8 - Filter scene type khong hop le

   */

  runTc('TC8', 'Filter scene type khong hop le', async ({ client, context }) => {
    const response = await client.listScenesAPI({ page: 1, limit: 20, type: 'Invalid' })
    await recordSceneResponse(context, 'Invalid type filter', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes?type=Invalid',
    })
    expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
  })

  const createSuccessCases: Array<[
    string,
    string,
    Partial<Parameters<typeof createAutoScenePayload>[0]>,
  ]> = [
    /* TC9 - Tao Scene Normal thanh cong */
    ['TC9', 'Tao Scene Normal thanh cong', { type: 'Normal' }],
    /* TC10 - Tao Scene Lighting thanh cong */
    ['TC10', 'Tao Scene Lighting thanh cong', { type: 'Lighting' }],
    /* TC11 - Tao Scene voi background preset */
    ['TC11', 'Tao Scene voi background preset', { background: 'bg_living_room_evening' }],
    /* TC12 - Tao Scene voi background URL */
    ['TC12', 'Tao Scene voi background URL', { background: 'https://cdn.example.com/uploads/scenes/auto.jpg' }],
  ]

  for (const [tcId, tcName, overrides] of createSuccessCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      let sceneId: string | undefined
      try {
        const scene = await createSceneForTc({ client, context, tcId, bindings, overrides })
        sceneId = scene.id
        const { response, body } = await getSceneDetail(client, context, scene.id)
        expect(response.status()).toBe(200)
        expectSceneDetailShape(body)
      } finally {
        await cleanupAutoScene(client, context, sceneId)
      }
    })
  }

  const createValidationCases: Array<[string, string, Record<string, unknown>]> = [
    /* TC13 - Tao Scene thieu name */
    ['TC13', 'Tao Scene thieu name', { name: undefined }],
    /* TC14 - Tao Scene thieu type */
    ['TC14', 'Tao Scene thieu type', { type: undefined }],
    /* TC15 - Tao Scene type sai enum */
    ['TC15', 'Tao Scene type sai enum', { type: 'Invalid' }],
    /* TC16 - Tao Scene thieu binding */
    ['TC16', 'Tao Scene thieu binding', { binding: undefined }],
    /* TC17 - Tao Scene binding rong */
    ['TC17', 'Tao Scene binding rong', { binding: [] }],
    /* TC18 - Tao Scene binding device id sai format */
    ['TC18', 'Tao Scene binding device id sai format', { binding: [{ id: 'abc', snapshot: { 1: true }, status: 'Updating' }] }],
    /* TC19 - Tao Scene snapshot sai kieu */
    ['TC19', 'Tao Scene snapshot sai kieu', { binding: [{ id: '1', snapshot: 'bad', status: 'Updating' }] }],
    /* TC20 - Tao Scene binding status sai enum */
    ['TC20', 'Tao Scene binding status sai enum', { binding: [{ id: '1', snapshot: { 1: true }, status: 'Invalid' }] }],
  ]

  for (const [tcId, tcName, overrides] of createValidationCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const payload = createInvalidScenePayload(tcId, overrides)
      await expectCreateValidation(client, context, payload)
    })
  }

  /*

   * TC21 - Lay chi tiet Scene thanh cong

   */

  runTc('TC21', 'Lay chi tiet Scene thanh cong', async ({ client, context, bindings }) => {
    let sceneId: string | undefined
    try {
      const scene = await createSceneForTc({ client, context, tcId: 'TC21', bindings })
      sceneId = scene.id
      const { response, body } = await getSceneDetail(client, context, scene.id)
      expect(response.status()).toBe(200)
      expectSceneDetailShape(body)
    } finally {
      await cleanupAutoScene(client, context, sceneId)
    }
  })

  /*

   * TC22 - Lay chi tiet Scene khong ton tai

   */

  runTc('TC22', 'Lay chi tiet Scene khong ton tai', async ({ client, context }) => {
    const response = await client.getSceneAPI('999999999999999999')
    await recordSceneResponse(context, 'Get fake scene detail', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes/999999999999999999',
    })
    expectValidationOrDocumentedBehavior(response.status(), [200, 400, 404])
  })

  /*

   * TC23 - Lay chi tiet Scene id sai format

   */

  runTc('TC23', 'Lay chi tiet Scene id sai format', async ({ client, context }) => {
    const response = await client.getSceneAPI('abc')
    await recordSceneResponse(context, 'Get invalid scene detail', response, {
      method: 'GET',
      endpoint: '/api/v0/scenes/abc',
    })
    expectValidationOrDocumentedBehavior(response.status(), [400, 404])
  })

  const updateCases: Array<[
    string,
    string,
    (bindings: ThuySceneBindingInput[]) => ReturnType<typeof createAutoSceneUpdatePayload>,
  ]> = [
    /* TC24 - Cap nhat ten Scene */
    ['TC24', 'Cap nhat ten Scene', () => ({ name: generateSceneName('TC24_update') })],
    /* TC25 - Cap nhat icon Scene */
    ['TC25', 'Cap nhat icon Scene', () => ({ icon: 'scene-evening' })],
    /* TC26 - Cap nhat background Scene */
    ['TC26', 'Cap nhat background Scene', () => ({ background: 'color_warm_orange' })],
    /* TC27 - Cap nhat binding Scene */
    ['TC27', 'Cap nhat binding Scene', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC27_tmp', bindings: toSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX, false) }).binding })],
    /* TC28 - Cap nhat nhieu field cung luc */
    ['TC28', 'Cap nhat nhieu field cung luc', (bindings) => ({ name: generateSceneName('TC28_update'), background: 'bg_living_room_evening', binding: createAutoScenePayload({ tcId: 'TC28_tmp', bindings: toMixedSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX) }).binding })],
    /* TC29 - Update Scene voi body rong */
    ['TC29', 'Update Scene voi body rong', () => ({})],
  ]

  for (const [tcId, tcName, updateFactory] of updateCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      let sceneId: string | undefined
      try {
        const scene = await createSceneForTc({ client, context, tcId, bindings })
        sceneId = scene.id
        const payload = updateFactory(bindings)
        const response = await client.updateSceneAPI(scene.id, payload)
        await recordSceneResponse(context, 'Update scene', response, {
          method: 'POST',
          endpoint: `/api/v0/scenes/${scene.id}`,
          request: payload,
        })
        expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
        if (response.status() === 200) {
          const detail = await getSceneDetail(client, context, scene.id)
          expect(detail.response.status()).toBe(200)
        }
      } finally {
        await cleanupAutoScene(client, context, sceneId)
      }
    })
  }

  const updateNegativeCases: Array<[string, string, string, Record<string, unknown>, number[]]> = [
    /* TC30 - Update Scene khong ton tai */
    ['TC30', 'Update Scene khong ton tai', '999999999999999999', { name: generateSceneName('TC30') }, [400, 404]],
    /* TC31 - Update Scene id sai format */
    ['TC31', 'Update Scene id sai format', 'abc', { name: generateSceneName('TC31') }, [400, 404]],
  ]

  for (const [tcId, tcName, sceneId, payload, statuses] of updateNegativeCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const response = await client.updateSceneAPI(sceneId, payload)
      await recordSceneResponse(context, 'Update invalid scene', response, {
        method: 'POST',
        endpoint: `/api/v0/scenes/${sceneId}`,
        request: payload,
      })
      expectValidationOrDocumentedBehavior(response.status(), statuses)
    })
  }

  const updateBindingCases: Array<[
    string,
    string,
    (bindings: ThuySceneBindingInput[]) => ReturnType<typeof createAutoSceneUpdatePayload>,
  ]> = [
    /* TC32 - Update binding status Deleting */
    ['TC32', 'Update binding status Deleting', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC32_tmp', bindings }).binding.map((item) => ({ ...item, status: 'Deleting' })) })],
    /* TC33 - Update binding status Activated */
    ['TC33', 'Update binding status Activated', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC33_tmp', bindings }).binding.map((item) => ({ ...item, status: 'Activated' })) })],
    /* TC34 - Update binding status Failed */
    ['TC34', 'Update binding status Failed', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC34_tmp', bindings }).binding.map((item) => ({ ...item, status: 'Failed' })) })],
    /* TC35 - Update binding snapshot tu ON sang OFF */
    ['TC35', 'Update binding snapshot tu ON sang OFF', () => ({ binding: createAutoScenePayload({ tcId: 'TC35_tmp', bindings: toSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX, false) }).binding })],
    /* TC36 - Update brightness snapshot */
    ['TC36', 'Update brightness snapshot', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC36_tmp', bindings }).binding.map((item) => ({ ...item, snapshot: { ...item.snapshot, [AUTOMATION_DEVICE_STATE_IDX]: 20 } })) })],
  ]

  for (const [tcId, tcName, updateFactory] of updateBindingCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      let sceneId: string | undefined
      try {
        const scene = await createSceneForTc({ client, context, tcId, bindings })
        sceneId = scene.id
        const payload = updateFactory(bindings)
        const response = await client.updateSceneAPI(scene.id, payload)
        await recordSceneResponse(context, 'Update scene binding', response, {
          method: 'POST',
          endpoint: `/api/v0/scenes/${scene.id}`,
          request: payload,
        })
        expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
      } finally {
        await cleanupAutoScene(client, context, sceneId)
      }
    })
  }

  const syncCases: Array<[string, string, (bindings: ThuySceneBindingInput[]) => Record<string, unknown>]> = [
    /* TC37 - Gateway sync binding thanh cong */
    ['TC37', 'Gateway sync binding thanh cong', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC37_tmp', bindings: toSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX, false) }).binding })],
    /* TC38 - Gateway sync status Provision */
    ['TC38', 'Gateway sync status Provision', () => ({ status: 'Provision' })],
    /* TC39 - Gateway sync binding nhieu device */
    ['TC39', 'Gateway sync binding nhieu device', (bindings) => ({ binding: createAutoScenePayload({ tcId: 'TC39_tmp', bindings: toMixedSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX) }).binding })],
  ]

  for (const [tcId, tcName, syncFactory] of syncCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      let sceneId: string | undefined
      try {
        const scene = await createSceneForTc({ client, context, tcId, bindings })
        sceneId = scene.id
        const payload = syncFactory(bindings)
        const response = await client.syncSceneFromGatewayAPI(scene.id, payload)
        await recordSceneResponse(context, 'Sync scene from gateway', response, {
          method: 'POST',
          endpoint: `/api/v0/scenes/${scene.id}/sync-from-gateway`,
          request: payload,
        })
        expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
      } finally {
        await cleanupAutoScene(client, context, sceneId)
      }
    })
  }

  /*

   * TC40 - Gateway sync scene khong ton tai

   */

  runTc('TC40', 'Gateway sync scene khong ton tai', async ({ client, context }) => {
    const response = await client.syncSceneFromGatewayAPI('999999999999999999', {
      status: 'Provision',
    })
    await recordSceneResponse(context, 'Sync fake scene', response, {
      method: 'POST',
      endpoint: '/api/v0/scenes/999999999999999999/sync-from-gateway',
      request: { status: 'Provision' },
    })
    expectValidationOrDocumentedBehavior(response.status(), [400, 404])
  })

  /*

   * TC41 - Gateway sync id sai format

   */

  runTc('TC41', 'Gateway sync id sai format', async ({ client, context }) => {
    const response = await client.syncSceneFromGatewayAPI('abc', { status: 'Provision' })
    await recordSceneResponse(context, 'Sync invalid id scene', response, {
      method: 'POST',
      endpoint: '/api/v0/scenes/abc/sync-from-gateway',
      request: { status: 'Provision' },
    })
    expectValidationOrDocumentedBehavior(response.status(), [400, 404])
  })

  /*

   * TC42 - Gateway sync body rong

   */

  runTc('TC42', 'Gateway sync body rong', async ({ client, context, bindings }) => {
    let sceneId: string | undefined
    try {
      const scene = await createSceneForTc({ client, context, tcId: 'TC42', bindings })
      sceneId = scene.id
      const response = await client.syncSceneFromGatewayAPI(scene.id, {})
      await recordSceneResponse(context, 'Sync empty body', response, {
        method: 'POST',
        endpoint: `/api/v0/scenes/${scene.id}/sync-from-gateway`,
        request: {},
      })
      expectValidationOrDocumentedBehavior(response.status(), [200, 400, 422])
    } finally {
      await cleanupAutoScene(client, context, sceneId)
    }
  })

  const deleteCases: Array<[string, string]> = [
    /* TC44 - Xoa Scene thanh cong */
    ['TC44', 'Xoa Scene thanh cong'],
  ]

  for (const [tcId, tcName] of deleteCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      const scene = await createSceneForTc({ client, context, tcId, bindings })
      const response = await client.deleteSceneAPI(scene.id)
      await recordSceneResponse(context, 'Delete scene', response, {
        method: 'DELETE',
        endpoint: `/api/v0/scenes/${scene.id}`,
      })
      expectValidationOrDocumentedBehavior(response.status(), [200, 204])
      context.cleanup.scene_deleted = true
      if (tcId === 'TC47') {
        const detail = await client.getSceneAPI(scene.id)
        await recordSceneResponse(context, 'Get deleted scene detail', detail, {
          method: 'GET',
          endpoint: `/api/v0/scenes/${scene.id}`,
        })
        expectValidationOrDocumentedBehavior(detail.status(), [200, 404])
      }
    })
  }

  /*

   * TC45 - Xoa Scene khong ton tai

   */

  runTc('TC45', 'Xoa Scene khong ton tai', async ({ client, context }) => {
    const response = await client.deleteSceneAPI('999999999999999999')
    await recordSceneResponse(context, 'Delete fake scene', response, {
      method: 'DELETE',
      endpoint: '/api/v0/scenes/999999999999999999',
    })
    expectValidationOrDocumentedBehavior(response.status(), [200, 400, 404])
  })

  /*

   * TC46 - Xoa Scene id sai format

   */

  runTc('TC46', 'Xoa Scene id sai format', async ({ client, context }) => {
    const response = await client.deleteSceneAPI('abc')
    await recordSceneResponse(context, 'Delete invalid scene id', response, {
      method: 'DELETE',
      endpoint: '/api/v0/scenes/abc',
    })
    expectValidationOrDocumentedBehavior(response.status(), [400, 404])
  })

  const deleteVerifyCases: Array<[string, string]> = [
    /* TC47 - Xoa Scene sau do GET lai */
    ['TC47', 'Xoa Scene sau do GET lai'],
    /* TC48 - Xoa Scene dang Activated */
    ['TC48', 'Xoa Scene dang Activated'],
  ]

  for (const [tcId, tcName] of deleteVerifyCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      const scene = await createSceneForTc({ client, context, tcId, bindings })
      const response = await client.deleteSceneAPI(scene.id)
      await recordSceneResponse(context, 'Delete scene', response, {
        method: 'DELETE',
        endpoint: `/api/v0/scenes/${scene.id}`,
      })
      expectValidationOrDocumentedBehavior(response.status(), [200, 204])
      context.cleanup.scene_deleted = true
      if (tcId === 'TC47') {
        const detail = await client.getSceneAPI(scene.id)
        await recordSceneResponse(context, 'Get deleted scene detail', detail, {
          method: 'GET',
          endpoint: `/api/v0/scenes/${scene.id}`,
        })
        expectValidationOrDocumentedBehavior(detail.status(), [200, 404])
      }
    })
  }

  const flowCases: Array<[string, string]> = [
    /* TC49 - Flow tao get update get delete */
    ['TC49', 'Flow tao get update get delete'],
    /* TC50 - Flow Lighting Scene voi dim brightness */
    ['TC50', 'Flow Lighting Scene voi dim brightness'],
    /* TC51 - Flow Scene nhieu thiet bi */
    ['TC51', 'Flow Scene nhieu thiet bi'],
    /* TC52 - Flow background preset sang URL */
    ['TC52', 'Flow background preset sang URL'],
    /* TC53 - Flow sync gateway sau update client */
    ['TC53', 'Flow sync gateway sau update client'],
  ]

  for (const [tcId, tcName] of flowCases) {
    runTc(tcId, tcName, async ({ client, context, bindings }) => {
      let sceneId: string | undefined
      try {
        const scene = await createSceneForTc({
          client,
          context,
          tcId,
          bindings,
          overrides: tcId === 'TC50' ? { type: 'Lighting' } : {},
        })
        sceneId = scene.id
        const detail1 = await getSceneDetail(client, context, scene.id)
        expect(detail1.response.status()).toBe(200)

        const updatePayload =
          tcId === 'TC52'
            ? { background: 'https://cdn.example.com/uploads/scenes/flow.jpg' }
            : {
                name: generateSceneName(`${tcId}_updated`),
                binding: createAutoScenePayload({
                  tcId: `${tcId}_tmp`,
                  bindings: toMixedSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX),
                }).binding,
              }
        const update = await client.updateSceneAPI(scene.id, updatePayload)
        await recordSceneResponse(context, 'Flow update scene', update, {
          method: 'POST',
          endpoint: `/api/v0/scenes/${scene.id}`,
          request: updatePayload,
        })
        expectValidationOrDocumentedBehavior(update.status(), [200, 400, 422])

        if (tcId === 'TC53') {
          const syncPayload = {
            binding: createAutoScenePayload({
              tcId: 'TC53_sync',
              bindings: toSceneBindings(sceneTargets, AUTOMATION_DEVICE_STATE_IDX, false),
            }).binding,
          }
          const sync = await client.syncSceneFromGatewayAPI(scene.id, syncPayload)
          await recordSceneResponse(context, 'Flow gateway sync', sync, {
            method: 'POST',
            endpoint: `/api/v0/scenes/${scene.id}/sync-from-gateway`,
            request: syncPayload,
          })
          expectValidationOrDocumentedBehavior(sync.status(), [200, 400, 422])
        }

        const detail2 = await getSceneDetail(client, context, scene.id)
        expect(detail2.response.status()).toBe(200)
        const deletion = await client.deleteSceneAPI(scene.id)
        await recordSceneResponse(context, 'Flow delete scene', deletion, {
          method: 'DELETE',
          endpoint: `/api/v0/scenes/${scene.id}`,
        })
        expectValidationOrDocumentedBehavior(deletion.status(), [200, 204])
        context.cleanup.scene_deleted = true
        sceneId = undefined
      } finally {
        await cleanupAutoScene(client, context, sceneId)
      }
    })
  }
})
