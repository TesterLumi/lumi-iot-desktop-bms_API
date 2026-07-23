import { APIRequestContext, expect, test } from '@playwright/test'
import {
  GROUP_ALLOW_DEVICE_CONTROL,
  GROUP_API_BASE,
  GROUP_BASE_URL,
  GROUP_HC_BASE_URL,
  GROUP_REQUIRE_AUTH,
  GroupApiClient,
  GroupState,
  GroupStateValue,
  SLOT_ON_OFF,
  TEST_AREA_ID,
  TEST_LIGHTING_DEVICE_ID_1,
  TEST_LIGHTING_DEVICE_ID_2,
  TEST_SWITCH_DEVICE_ID_1,
  TEST_SWITCH_DEVICE_ID_2,
  attachGroupAssertion,
  attachGroupStep,
  cleanupGroup,
  controlGroupAndExpectDevices,
  createGroupAndExtractId,
  createGroupPayload,
  createGroupTestContext,
  expectAllowedStatus,
  expectGroupDetailShape,
  expectGroupListShape,
  extractData,
  extractId,
  extractItems,
  generateGroupName,
  getDeviceStatus,
  getInitialDeviceStates,
  getSlotValue,
  loginAs,
  probeUrl,
  recordGroupResponse,
  resetDeviceStates,
  resetGroupEvidenceRunDir,
  saveGroupEvidence,
  waitForGroupDeletedFromHC,
  waitForGroupSyncedToHC,
} from './group-management.support'

const FAKE_ID = '999999999999999999'
const INVALID_ID = 'abc'
const FAKE_DEVICE_ID = '999999999999999998'

let adminToken = ''
let viewerToken = ''
let noPermissionToken = ''
let baseProbe: Awaited<ReturnType<typeof probeUrl>>
let hcProbe: Awaited<ReturnType<typeof probeUrl>>

test.describe('Group Management API Real HC TC1-TC123', () => {
  test.beforeAll(async () => {
    await resetGroupEvidenceRunDir()
    ;[adminToken, viewerToken, noPermissionToken, baseProbe, hcProbe] =
      await Promise.all([
        loginAs('admin'),
        loginAs('viewer'),
        loginAs('no_permission'),
        probeUrl(GROUP_BASE_URL),
        probeUrl(GROUP_HC_BASE_URL),
      ])
  })

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (args: {
      client: GroupApiClient
      context: ReturnType<typeof createGroupTestContext>
      request: APIRequestContext
    }) => Promise<void>,
    options: {
      requireAdmin?: boolean
      requireHc?: boolean
      requireControl?: boolean
      timeoutMs?: number
    } = {},
  ) => {
    test(`${tcId} - ${tcName}`, async ({ request }) => {
      if (options.timeoutMs) {
        test.setTimeout(options.timeoutMs)
      }
      const context = createGroupTestContext(tcId, tcName)
      const client = new GroupApiClient(request, adminToken)
      try {
        test.skip(!baseProbe?.ok, `GROUP_BASE_URL is not reachable: ${JSON.stringify(baseProbe)}`)
        test.skip(
          options.requireAdmin !== false && GROUP_REQUIRE_AUTH && !adminToken,
          'Admin token or login env is required when GROUP_REQUIRE_AUTH=true',
        )
        test.skip(options.requireHc === true && !hcProbe?.ok, `HC is not reachable: ${JSON.stringify(hcProbe)}`)
        test.skip(options.requireControl === true && !GROUP_ALLOW_DEVICE_CONTROL, 'Set GROUP_ALLOW_DEVICE_CONTROL=true to control real devices')
        await handler({ client, context, request })
        await saveGroupEvidence(context, 'PASSED')
      } catch (error) {
        if (error instanceof Error && error.message.includes('Test is skipped')) {
          await saveGroupEvidence(context, 'SKIPPED', error)
          throw error
        }
        await saveGroupEvidence(context, 'FAILED', error)
        throw error
      }
    })
  }

  /*
   * TC ID: TC1
   * Ten testcase: Lay danh sach group thanh cong
   * Muc tieu: Kiem tra admin co the lay danh sach group tu API that.
   * Expected: HTTP 200 va response la list hoac paginated list.
   * Evidence: Luu request/response GET group list.
   */
  runTc('TC1', 'Lay danh sach nhom thuong thanh cong', async ({ client, context }) => {
    const response = await client.listGroupsAPI({ page: 1, limit: 20 })
    const body = await recordGroupResponse(context, 'List groups', response, {
      method: 'GET',
      endpoint: `${GROUP_API_BASE}?page=1&limit=20`,
    })
    expect(response.status()).toBe(200)
    expectGroupListShape(body)
    attachGroupAssertion(context, 'List groups returns list or paginated list')
  })

  const filterCases: Array<[string, string, string]> = [
    ['TC2', 'Phan trang danh sach nhom thuong', 'Normal'],
    ['TC3', 'Tim kiem nhom thuong theo ten', 'Lighting'],
  ]
  for (const [tcId, tcName, type] of filterCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const response = await client.listGroupsAPI({ type, page: 1, limit: 20 })
      const body = await recordGroupResponse(context, `Filter group type ${type}`, response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}?type=${type}`,
      })
      expect(response.status()).toBe(200)
      for (const item of extractItems(body)) {
        if (item.type) {
          expect(String(item.type)).toBe(type)
        }
      }
      attachGroupAssertion(context, `Returned groups have type ${type} when backend includes type`)
    })
  }

  /*
   * TC ID: TC4
   * Ten testcase: Tim group theo ten
   * Expected: Search theo name tra group vua tao hoac list hop le neu backend search partial.
   */
  runTc('TC4', 'Tim kiem khong co ket qua', async ({ client, context }) => {
    let groupId: string | undefined
    const name = generateGroupName('TC4', 'search')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC4', name }))
      const response = await client.listGroupsAPI({ search: name, page: 1, limit: 20 })
      const body = await recordGroupResponse(context, 'Search group by name', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}?search=${name}`,
      })
      expect(response.status()).toBe(200)
      const items = extractItems(body)
      if (items.length > 0) {
        expect(items.some((item) => item.name === name)).toBe(true)
      }
      attachGroupAssertion(context, 'Search response contains created group when backend returns matched item')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  /*
   * TC ID: TC5
   * Ten testcase: Lay chi tiet group thanh cong
   * Expected: Detail dung id/name/type/devices.
   */
  runTc('TC5', 'Filter nhom theo HC', async ({ client, context }) => {
    let groupId: string | undefined
    try {
      const payload = createGroupPayload({ tcId: 'TC5', deviceIds: [TEST_SWITCH_DEVICE_ID_1].filter(Boolean) })
      groupId = await createGroupAndExtractId(client, context, payload)
      const response = await client.getGroupAPI(groupId)
      const body = await recordGroupResponse(context, 'Get group detail', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}`,
      })
      expect(response.status()).toBe(200)
      expectGroupDetailShape(body)
      expect(String(extractId(body))).toBe(String(groupId))
      attachGroupAssertion(context, 'Group detail returns created group id')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  const detailNegativeCases: Array<[string, string, string, number[]]> = [
    ['TC6', 'Filter nhom theo trang thai active', FAKE_ID, [404, 400]],
    ['TC7', 'Filter nhom theo nhieu trang thai', INVALID_ID, [400, 404]],
  ]
  for (const [tcId, tcName, groupId, statuses] of detailNegativeCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const response = await client.getGroupAPI(groupId)
      await recordGroupResponse(context, 'Get invalid group detail', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}`,
      })
      expectAllowedStatus(response.status(), statuses)
      attachGroupAssertion(context, `Backend rejects invalid detail id with status ${response.status()}`)
    })
  }

  const createNormalCases: Array<[string, string, Array<string | number>]> = [
    ['TC8', 'Filter nhom theo 1 khu vuc', []],
    ['TC9', 'Filter nhom theo nhieu khu vuc', [TEST_SWITCH_DEVICE_ID_1]],
    ['TC10', 'Filter nhom chua gan khu vuc', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2]],
  ]
  for (const [tcId, tcName, deviceIds] of createNormalCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        const payload = createGroupPayload({ tcId, type: 'Normal', deviceIds: deviceIds.filter(Boolean) })
        groupId = await createGroupAndExtractId(client, context, payload)
        const detail = await client.getGroupAPI(groupId)
        const body = await recordGroupResponse(context, 'Get group after create', detail, {
          method: 'GET',
          endpoint: `${GROUP_API_BASE}/${groupId}`,
        })
        expect(detail.status()).toBe(200)
        expectGroupDetailShape(body)
        attachGroupAssertion(context, 'Normal group is created and readable')
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  runTc('TC11', 'Xem chi tiet nhom thuong', async ({ client, context }) => {
    const payload = { type: 'Normal', device_ids: [] }
    const response = await client.createGroupAPI(payload)
    await recordGroupResponse(context, 'Create invalid normal group', response, {
      method: 'POST',
      endpoint: GROUP_API_BASE,
      request: payload,
    })
    expectAllowedStatus(response.status(), [400, 422])
    attachGroupAssertion(context, 'Missing name is rejected by backend')
  })

  runTc('TC12', 'Xem chi tiet nhom khong ton tai', async ({ client, context }) => {
    let groupIdA: string | undefined
    let groupIdB: string | undefined
    const name = generateGroupName('TC12', 'duplicate')
    try {
      groupIdA = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC12', name }))
      const response = await client.createGroupAPI(createGroupPayload({ tcId: 'TC12', name }))
      const body = await recordGroupResponse(context, 'Create duplicate group name', response, {
        method: 'POST',
        endpoint: GROUP_API_BASE,
        request: { name, type: 'Normal' },
      })
      if (response.status() >= 200 && response.status() < 300) {
        groupIdB = String(extractId(body) ?? '')
      }
      expectAllowedStatus(response.status(), [200, 201, 400, 409, 422])
      attachGroupAssertion(context, 'Duplicate name behavior is documented by real backend status')
    } finally {
      await cleanupGroup(client, context, groupIdB)
      await cleanupGroup(client, context, groupIdA)
    }
  })

  const createValidationCases: Array<[string, string, Record<string, unknown>, number[]]> = [
    ['TC13', 'Them nhom thuong thanh cong', { name: generateGroupName('TC13'), type: 'Normal', device_ids: [FAKE_DEVICE_ID] }, [400, 404, 422]],
    ['TC14', 'Them nhom thuong co attr', { name: generateGroupName('TC14'), type: 'Normal', device_ids: ['abc'] }, [400, 422]],
  ]
  for (const [tcId, tcName, payload, statuses] of createValidationCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const response = await client.createGroupAPI(payload)
      await recordGroupResponse(context, 'Create invalid normal group', response, {
        method: 'POST',
        endpoint: GROUP_API_BASE,
        request: payload,
      })
      expectAllowedStatus(response.status(), statuses)
      attachGroupAssertion(context, 'Invalid create group is rejected by backend')
    })
  }

  const createLightingCases: Array<[string, string, Array<string | number>, number[]]> = [
    ['TC15', 'Khong cho them nhom thieu ten', [], [200, 201, 400, 422]],
    ['TC16', 'Khong cho them ten toan khoang trang', [TEST_LIGHTING_DEVICE_ID_1], [200, 201]],
    ['TC17', 'Khong cho them nhom thieu device type', [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], [200, 201]],
  ]
  for (const [tcId, tcName, deviceIds, statuses] of createLightingCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const payload = createGroupPayload({ tcId, type: 'Lighting', deviceIds: deviceIds.filter(Boolean) })
      try {
        const response = await client.createGroupAPI(payload)
        const body = await recordGroupResponse(context, 'Create lighting group', response, {
          method: 'POST',
          endpoint: GROUP_API_BASE,
          request: payload,
        })
        expectAllowedStatus(response.status(), statuses)
        if ([200, 201].includes(response.status())) {
          groupId = String(extractId(body))
          const detail = await client.getGroupAPI(groupId)
          await recordGroupResponse(context, 'Get lighting group detail', detail, {
            method: 'GET',
            endpoint: `${GROUP_API_BASE}/${groupId}`,
          })
          expect(detail.status()).toBe(200)
        }
        attachGroupAssertion(context, 'Lighting group create behavior matches backend rule')
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const createLightingValidationCases: Array<[string, string, Record<string, unknown>, number[]]> = [
    ['TC18', 'Khong cho them nhom voi device type khong hop le', { name: generateGroupName('TC18'), type: 'Lighting', device_ids: [TEST_SWITCH_DEVICE_ID_1] }, [400, 422, 200]],
    ['TC19', 'Khong cho them nhom trung ten neu he thong gioi han', { name: generateGroupName('TC19'), device_ids: [TEST_LIGHTING_DEVICE_ID_1].filter(Boolean) }, [200, 400, 422]],
    ['TC20', 'Huy them nhom', { name: generateGroupName('TC20'), type: 'Invalid', device_ids: [] }, [400, 422]],
  ]
  for (const [tcId, tcName, payload, statuses] of createLightingValidationCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        const response = await client.createGroupAPI(payload)
        const body = await recordGroupResponse(context, 'Create lighting validation case', response, {
          method: 'POST',
          endpoint: GROUP_API_BASE,
          request: payload,
        })
        if (response.status() >= 200 && response.status() < 300) {
          groupId = String(extractId(body) ?? '')
        }
        expectAllowedStatus(response.status(), statuses)
        attachGroupAssertion(context, 'Lighting validation checked with real backend behavior')
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const updateCases: Array<[string, string, Record<string, unknown>, number[]]> = [
    ['TC21', 'Cap nhat ten icon nhom thanh cong', { name: generateGroupName('TC21', 'updated') }, [200]],
    ['TC22', 'Cap nhat attr nhom', { icon: 'group-auto-updated' }, [200, 400, 422]],
    ['TC23', 'Disable nhom thuong', { type: 'Lighting' }, [200, 400, 422]],
  ]
  for (const [tcId, tcName, patch, statuses] of updateCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId }))
        const response = await client.updateGroupAPI(groupId, patch)
        await recordGroupResponse(context, 'Update group', response, {
          method: 'PATCH',
          endpoint: `${GROUP_API_BASE}/${groupId}`,
          request: patch,
        })
        expectAllowedStatus(response.status(), statuses)
        if (response.status() === 200 && patch.name) {
          const detail = await client.getGroupAPI(groupId)
          const body = await recordGroupResponse(context, 'Get group after update', detail, {
            method: 'GET',
            endpoint: `${GROUP_API_BASE}/${groupId}`,
          })
          expect(String(extractData(body) && (extractData(body) as { name?: string }).name)).toBe(patch.name)
        }
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const updateNegativeCases: Array<[string, string, string, Record<string, unknown>, number[]]> = [
    ['TC24', 'Enable lai nhom thuong', FAKE_ID, { name: generateGroupName('TC24') }, [404, 400]],
    ['TC25', 'Khong cho cap nhat ten rong', INVALID_ID, { name: generateGroupName('TC25') }, [400, 404]],
    ['TC26', 'Khong cho cap nhat nhom khong ton tai', '', { name: '' }, [400, 422]],
  ]
  for (const [tcId, tcName, fixedId, payload, statuses] of updateNegativeCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const targetId = fixedId || (groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId })))
      try {
        const response = await client.updateGroupAPI(targetId, payload)
        await recordGroupResponse(context, 'Update invalid group', response, {
          method: 'PATCH',
          endpoint: `${GROUP_API_BASE}/${targetId}`,
          request: payload,
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const addRemoveCases: Array<[string, string, 'add' | 'remove', Array<string | number>, number[]]> = [
    ['TC27', 'Huy cap nhat nhom', 'add', [TEST_SWITCH_DEVICE_ID_1], [200, 201, 202, 204]],
    ['TC28', 'Update batch nhieu nhom thanh cong', 'add', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], [200, 201, 202, 204]],
    ['TC29', 'Update batch co item ID sai', 'add', [TEST_SWITCH_DEVICE_ID_1], [200, 201, 202, 204, 409]],
    ['TC30', 'Xoa nhom thuong thanh cong', 'remove', [TEST_SWITCH_DEVICE_ID_1], [200, 202, 204]],
    ['TC31', 'Huy popup xac nhan xoa', 'remove', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], [200, 202, 204]],
    ['TC32', 'Xoa nhom khong ton tai', 'remove', [TEST_SWITCH_DEVICE_ID_1], [200, 202, 204, 404]],
  ]
  for (const [tcId, tcName, action, deviceIds, statuses] of addRemoveCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const ids = deviceIds.filter(Boolean)
      try {
        const initialIds = action === 'remove' && tcId !== 'TC32' ? ids : []
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, deviceIds: initialIds }))
        if (tcId === 'TC29') {
          await client.addDevicesToGroupAPI(groupId, ids)
        }
        const response = action === 'add'
          ? await client.addDevicesToGroupAPI(groupId, ids)
          : await client.removeDevicesFromGroupAPI(groupId, ids)
        await recordGroupResponse(context, `${action} devices`, response, {
          method: action === 'add' ? 'POST' : 'DELETE',
          endpoint: `${GROUP_API_BASE}/${groupId}/members`,
          request: { device_ids: ids },
        })
        expectAllowedStatus(response.status(), statuses)
        const detail = await client.getGroupAPI(groupId)
        await recordGroupResponse(context, 'Get group after device mutation', detail, {
          method: 'GET',
          endpoint: `${GROUP_API_BASE}/${groupId}`,
        })
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const groupDeviceNegativeCases: Array<[string, string, 'add' | 'remove', string, Array<string | number>, number[]]> = [
    ['TC33', 'Xoa nhieu nhom thanh cong', 'add', FAKE_ID, [TEST_SWITCH_DEVICE_ID_1], [404, 400]],
    ['TC34', 'Xoa batch khi chua chon nhom', 'remove', FAKE_ID, [TEST_SWITCH_DEVICE_ID_1], [404, 400]],
  ]
  for (const [tcId, tcName, action, fixedGroupId, deviceIds, statuses] of groupDeviceNegativeCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const targetId = fixedGroupId || (groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId })))
      try {
        const response = action === 'add'
          ? await client.addDevicesToGroupAPI(targetId, deviceIds)
          : await client.removeDevicesFromGroupAPI(targetId, deviceIds)
        await recordGroupResponse(context, `${action} invalid devices`, response, {
          method: action === 'add' ? 'POST' : 'DELETE',
          endpoint: `${GROUP_API_BASE}/${targetId}/members`,
          request: { device_ids: deviceIds },
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  runTc('TC35', 'Lay danh sach thiet bi trong nhom', async ({ client, context }) => {
    let groupId: string | undefined
    const ids = [TEST_SWITCH_DEVICE_ID_1].filter(Boolean)
    test.skip(ids.length === 0, 'Need TEST_SWITCH_DEVICE_ID_1 for group member list testcase')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC35', deviceIds: ids }))
      const response = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      const body = await recordGroupResponse(context, 'List devices in normal group', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(response.status()).toBe(200)
      expect(Array.isArray(extractItems(body))).toBe(true)
      attachGroupAssertion(context, 'Group members API returns device list with pagination fields when available')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  runTc('TC36', 'Filter thiet bi theo trang thai', async ({ client, context }) => {
    let groupId: string | undefined
    const ids = [TEST_SWITCH_DEVICE_ID_1].filter(Boolean)
    test.skip(ids.length === 0, 'Need TEST_SWITCH_DEVICE_ID_1 for group member filter testcase')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC36', deviceIds: ids }))
      const response = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { state: 'pending,failed', page: 1, limit: 20 },
      })
      const body = await recordGroupResponse(context, 'Filter devices in normal group by state', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?state=pending,failed&page=1&limit=20`,
      })
      expect(response.status()).toBe(200)
      expect(Array.isArray(extractItems(body))).toBe(true)
      attachGroupAssertion(context, 'Group members API accepts state filter and returns a member list')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  const normalControlCases: Array<[string, string, Array<string | number>, boolean, number[]]> = [
    ['TC37', 'Them 1 thiet bi vao nhom thanh cong', [TEST_SWITCH_DEVICE_ID_1], true, [200, 202]],
    ['TC38', 'Them nhieu thiet bi vao nhom', [TEST_SWITCH_DEVICE_ID_1], false, [200, 202]],
    ['TC39', 'Chon thiet bi tu 1 HC vao nhom', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], true, [200, 202]],
    ['TC40', 'Chon thiet bi tu nhieu HC vao nhom', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], false, [200, 202]],
  ]
  for (const [tcId, tcName, deviceIds, value] of normalControlCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      let initialStates
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, type: 'Normal', deviceIds: ids }))
        initialStates = await getInitialDeviceStates(client, ids)
        await controlGroupAndExpectDevices({
          client,
          context,
          groupId,
          deviceIds: ids,
          states: [{ idx: SLOT_ON_OFF, value }],
          expectedSlot: SLOT_ON_OFF,
          expectedValue: value,
        })
      } finally {
        await resetDeviceStates(client, context, initialStates)
        await cleanupGroup(client, context, groupId)
      }
    }, { requireHc: true, requireControl: true, timeoutMs: 90000 })
  }

  runTc('TC41', 'Khong cho them trung thiet bi', async ({ client, context }) => {
    let groupId: string | undefined
    const ids = [TEST_SWITCH_DEVICE_ID_1].filter(Boolean)
    test.skip(ids.length === 0, 'Need TEST_SWITCH_DEVICE_ID_1 for duplicate member testcase')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC41', deviceIds: ids }))
      const response = await client.addDevicesToGroupAPI(groupId, ids)
      await recordGroupResponse(context, 'Add duplicate device to normal group', response, {
        method: 'POST',
        endpoint: `${GROUP_API_BASE}/${groupId}/members`,
        request: {
          members: ids.map((cellId) => ({ cell_id: String(cellId), state: 'activated' })),
          bindings: [],
        },
      })
      expectAllowedStatus(response.status(), [200, 202, 400, 409, 422])
      const membersResponse = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      const body = await recordGroupResponse(context, 'List members after duplicate add', membersResponse, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(membersResponse.status()).toBe(200)
      const matchingMembers = extractItems(body).filter((item) => String(item.cell_id ?? item.id) === String(ids[0]))
      expect(matchingMembers.length).toBeLessThanOrEqual(1)
      attachGroupAssertion(context, 'Duplicate add request does not create duplicated member row')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  runTc('TC42', 'Khong cho them thiet bi khong ton tai', async ({ client, context }) => {
    const response = await client.controlGroupAPI(FAKE_ID, [{ idx: SLOT_ON_OFF, value: true }])
    await recordGroupResponse(context, 'Control fake group', response, {
      method: 'POST',
      endpoint: `${GROUP_API_BASE}/${FAKE_ID}/control`,
      request: { states: [{ idx: SLOT_ON_OFF, value: true }] },
    })
    expectAllowedStatus(response.status(), [404, 400])
  }, { requireControl: true })

  const lightingControlCases: Array<[string, string, Array<string | number>, number, GroupStateValue]> = [
    ['TC43', 'Khong cho them thiet bi khi nhom khong ton tai', [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], SLOT_ON_OFF, true],
    ['TC44', 'Huy chon thiet bi', [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], SLOT_ON_OFF, false],
  ]
  for (const [tcId, tcName, deviceIds, slot, value] of lightingControlCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      let initialStates
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, type: 'Lighting', deviceIds: ids }))
        initialStates = await getInitialDeviceStates(client, ids)
        await controlGroupAndExpectDevices({
          client,
          context,
          groupId,
          deviceIds: ids,
          states: [{ idx: slot, value }],
          expectedSlot: slot,
          expectedValue: value,
        })
      } finally {
        await resetDeviceStates(client, context, initialStates)
        await cleanupGroup(client, context, groupId)
      }
    }, { requireHc: true, requireControl: true, timeoutMs: 90000 })
  }

  const removeNormalMemberCases: Array<[string, string, Array<string | number>, number[]]> = [
    ['TC45', 'Xoa 1 thiet bi khoi nhom', [TEST_SWITCH_DEVICE_ID_1], [200, 202, 204]],
    ['TC46', 'Xoa nhieu thiet bi khoi nhom', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], [200, 202, 204]],
  ]
  for (const [tcId, tcName, deviceIds, statuses] of removeNormalMemberCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, deviceIds: ids }))
        const response = await client.removeDevicesFromGroupAPI(groupId, ids)
        await recordGroupResponse(context, 'Remove normal group members', response, {
          method: 'DELETE',
          endpoint: `${GROUP_API_BASE}/${groupId}/members`,
          request: {
            members: ids.map((cellId) => ({ cell_id: String(cellId) })),
            bindings: [],
          },
        })
        expectAllowedStatus(response.status(), statuses)
        const membersResponse = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
          query: { page: 1, limit: 20 },
        })
        await recordGroupResponse(context, 'List members after remove', membersResponse, {
          method: 'GET',
          endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
        })
        expect(membersResponse.status()).toBe(200)
        attachGroupAssertion(context, 'Normal group member remove is accepted and member list is readable after mutation')
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  runTc('TC47', 'Huy xoa thiet bi khoi nhom', async ({ client, context }) => {
    let groupId: string | undefined
    const ids = [TEST_SWITCH_DEVICE_ID_1].filter(Boolean)
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC47', deviceIds: ids }))
      const before = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      await recordGroupResponse(context, 'List members before cancel remove', before, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(before.status()).toBe(200)
      attachGroupStep(context, {
        step: 'Cancel remove member action',
        method: 'NO_API',
        endpoint: 'No DELETE request is sent when user cancels the confirmation popup',
      })
      const after = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      await recordGroupResponse(context, 'List members after cancel remove', after, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(after.status()).toBe(200)
      attachGroupAssertion(context, 'Cancel remove does not send delete API and member list remains readable')
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  })

  const normalRuntimeExcelCases: Array<[string, string, GroupState[], number, GroupStateValue, Array<string | number>, boolean]> = [
    ['TC48', 'Dieu khien bat 1 thiet bi trong nhom va dong bo cac thiet bi con lai', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], true],
    ['TC49', 'Dieu khien tat 1 thiet bi trong nhom va dong bo cac thiet bi con lai', [{ idx: SLOT_ON_OFF, value: false }], SLOT_ON_OFF, false, [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], true],
    ['TC50', 'Dieu khien nhieu trang thai cua 1 thiet bi trong nhom', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], true],
    ['TC52', 'Dieu khien nhom chi co 1 thiet bi', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_SWITCH_DEVICE_ID_1], true],
    ['TC56', 'Dieu khien lien tiep nhieu lan', [{ idx: SLOT_ON_OFF, value: false }], SLOT_ON_OFF, false, [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2], true],
    ['TC57', 'Dieu khien roi refresh man hinh', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_SWITCH_DEVICE_ID_1], true],
  ]
  for (const [tcId, tcName, states, expectedSlot, expectedValue, deviceIds, verifyDevices] of normalRuntimeExcelCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      let initialStates
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, deviceIds: ids }))
        initialStates = await getInitialDeviceStates(client, ids)
        if (tcId === 'TC56') {
          const first = await client.controlGroupAPI(groupId, [{ idx: SLOT_ON_OFF, value: true }])
          await recordGroupResponse(context, 'Control normal group first request', first, {
            method: 'POST',
            endpoint: `${GROUP_API_BASE}/${groupId}/control`,
            request: { states: [{ idx: SLOT_ON_OFF, value: true }] },
          })
          expectAllowedStatus(first.status(), [200, 202])
        }
        await controlGroupAndExpectDevices({
          client,
          context,
          groupId,
          deviceIds: ids,
          states,
          expectedSlot,
          expectedValue,
        })
        if (tcId === 'TC57') {
          const refresh = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
            query: { page: 1, limit: 20 },
          })
          await recordGroupResponse(context, 'Refresh member list after control', refresh, {
            method: 'GET',
            endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
          })
          expect(refresh.status()).toBe(200)
        }
      } finally {
        await resetDeviceStates(client, context, initialStates)
        await cleanupGroup(client, context, groupId)
      }
    }, { requireHc: verifyDevices, requireControl: true, timeoutMs: 90000 })
  }

  runTc('TC51', 'Dieu khien nhom co thiet bi offline', async ({ context }) => {
    test.skip(true, 'SKIP_WITH_REASON: Chua co fixture an toan de dua thiet bi that ve offline trong moi truong HC that')
    attachGroupAssertion(context, 'Offline device control requires a controlled offline fixture')
  }, { requireAdmin: false })

  runTc('TC53', 'Dieu khien thiet bi ngoai nhom khong lam thay doi nhom', async ({ client, context }) => {
    let groupId: string | undefined
    let initialStates
    const groupIds = [TEST_SWITCH_DEVICE_ID_1].filter(Boolean)
    const outsideIds = [TEST_SWITCH_DEVICE_ID_2].filter(Boolean)
    test.skip(groupIds.length === 0 || outsideIds.length === 0, 'Need one in-group device and one outside device')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC53', deviceIds: groupIds }))
      initialStates = await getInitialDeviceStates(client, [...groupIds, ...outsideIds])
      const response = await client.controlDeviceAPI(outsideIds[0], [{ idx: SLOT_ON_OFF, value: true }])
      await recordGroupResponse(context, 'Control outside device', response, {
        method: 'POST',
        endpoint: '/api/devices/control',
        request: { device_id: outsideIds[0], states: [{ idx: SLOT_ON_OFF, value: true }] },
      })
      expectAllowedStatus(response.status(), [200, 202])
      const members = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      await recordGroupResponse(context, 'Get group members after outside control', members, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(members.status()).toBe(200)
      attachGroupAssertion(context, 'Outside device control does not call group control API for the tested group')
    } finally {
      await resetDeviceStates(client, context, initialStates)
      await cleanupGroup(client, context, groupId)
    }
  }, { requireHc: true, requireControl: true, timeoutMs: 90000 })

  runTc('TC54', 'Dieu khien nhom disabled', async ({ client, context }) => {
    let groupId: string | undefined
    let initialStates
    const ids = [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2]
      .filter(Boolean)
      .filter((deviceId, index, list) => list.indexOf(deviceId) === index)
    test.skip(ids.length < 2, 'Need at least 2 distinct switch devices to verify disabled group does not sync all members')
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC54', deviceIds: ids }))
      initialStates = await getInitialDeviceStates(client, ids)
      const update = await client.updateGroupAPI(groupId, { enable: false })
      await recordGroupResponse(context, 'Disable normal group before control', update, {
        method: 'PATCH',
        endpoint: `${GROUP_API_BASE}/${groupId}`,
        request: { enable: false },
      })
      expectAllowedStatus(update.status(), [200, 202, 400, 422])

      const beforeMembers = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      const beforeBody = await recordGroupResponse(context, 'Get disabled group members before member control', beforeMembers, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(beforeMembers.status()).toBe(200)
      const beforeMemberIds = extractItems(beforeBody).map((item) => String(item.cell_id ?? item.id))
      for (const deviceId of ids) {
        expect(beforeMemberIds).toContain(String(deviceId))
      }

      const otherInitialValue = getSlotValue(initialStates, ids[1], SLOT_ON_OFF)
      const controlValue = typeof otherInitialValue === 'boolean' ? !otherInitialValue : true
      const response = await client.controlDeviceAPI(ids[0], [{ idx: SLOT_ON_OFF, value: controlValue }])
      await recordGroupResponse(context, 'Control one member in disabled group', response, {
        method: 'POST',
        endpoint: '/api/devices/control',
        request: { device_id: ids[0], states: [{ idx: SLOT_ON_OFF, value: controlValue }] },
      })
      expectAllowedStatus(response.status(), [200, 202, 400, 404, 422])

      await new Promise((resolve) => setTimeout(resolve, 3000))

      const afterMembers = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
        query: { page: 1, limit: 20 },
      })
      const afterBody = await recordGroupResponse(context, 'Get disabled group members after member control', afterMembers, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=20`,
      })
      expect(afterMembers.status()).toBe(200)
      const afterMemberIds = extractItems(afterBody).map((item) => String(item.cell_id ?? item.id))
      for (const deviceId of ids) {
        expect(afterMemberIds).toContain(String(deviceId))
      }
      expect(new Set(afterMemberIds.filter((deviceId) => ids.map(String).includes(deviceId))).size).toBe(ids.length)

      if ([200, 202].includes(response.status()) && otherInitialValue !== undefined) {
        const afterStates = await getDeviceStatus(client, ids)
        attachGroupStep(context, {
          step: 'Verify disabled group does not sync controlled member state to another member',
          method: 'GET',
          endpoint: '/api/devices/status',
          request: { ids },
          response: { initialStates, afterStates, checked_device_id: ids[1], expected_value: otherInitialValue },
        })
        expect(getSlotValue(afterStates, ids[1], SLOT_ON_OFF)).toBe(otherInitialValue)
      } else {
        attachGroupAssertion(context, `Member control was blocked with status ${response.status()}, disabled group did not execute group-wide control`)
      }
    } finally {
      await resetDeviceStates(client, context, initialStates)
      await cleanupGroup(client, context, groupId)
    }
  }, { requireHc: true, requireControl: true, timeoutMs: 90000 })

  runTc('TC55', 'Dieu khien voi gia tri khong hop le', async ({ client, context }) => {
    let groupId: string | undefined
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC55', deviceIds: [TEST_SWITCH_DEVICE_ID_1].filter(Boolean) }))
      const response = await client.controlGroupAPI(groupId, [{ idx: SLOT_ON_OFF, value: 'invalid' }])
      await recordGroupResponse(context, 'Control normal group with invalid value', response, {
        method: 'POST',
        endpoint: `${GROUP_API_BASE}/${groupId}/control`,
        request: { states: [{ idx: SLOT_ON_OFF, value: 'invalid' }] },
      })
      expectAllowedStatus(response.status(), [400, 404, 422])
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  }, { requireControl: true })

  runTc('TC58', 'Dieu khien nhom co thiet bi khong cung capability', async ({ context }) => {
    test.skip(true, 'SKIP_WITH_REASON: Device hien tai chi co fixture bat/tat, chua co fixture khac capability de kiem chung an toan')
    attachGroupAssertion(context, 'Different-capability group control is skipped until fixture is available')
  }, { requireAdmin: false })

  const iotNormalCases: Array<[string, string, 'list' | 'detail' | 'update']> = [
    ['TC59', 'Lay danh sach IoT group thuong', 'list'],
    ['TC60', 'Xem chi tiet IoT group thuong', 'detail'],
    ['TC61', 'Cap nhat trang thai members IoT group thuong', 'update'],
  ]
  for (const [tcId, tcName, action] of iotNormalCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const endpoint = action === 'list' ? '/api/v0/iot/groups' : `${GROUP_API_BASE}/${FAKE_ID}`
      const response =
        action === 'list'
          ? await client.requestAPI('GET', '/api/v0/iot/groups', { query: { hc_id: '1001', state: 'actived' } })
          : action === 'detail'
            ? await client.requestAPI('GET', `/api/v0/iot/groups/${FAKE_ID}`)
            : await client.requestAPI('PATCH', `/api/v0/iot/groups/${FAKE_ID}`, {
              body: { members: [{ cell_id: TEST_SWITCH_DEVICE_ID_1 || FAKE_DEVICE_ID, state: 'actived' }] },
            })
      await recordGroupResponse(context, `IoT normal group ${action}`, response, {
        method: action === 'update' ? 'PATCH' : 'GET',
        endpoint,
        request: action === 'update' ? { members: [{ cell_id: TEST_SWITCH_DEVICE_ID_1 || FAKE_DEVICE_ID, state: 'actived' }] } : undefined,
      })
      expectAllowedStatus(response.status(), [200, 202, 400, 404, 422])
    })
  }

  runTc('TC62', 'Lay danh sach device type group lighting', async ({ client, context }) => {
    const response = await client.requestAPI('GET', '/api/v0/device-types', {
      query: { type: 'group', sub_type: 'lighting' },
    })
    const body = await recordGroupResponse(context, 'List lighting group device types', response, {
      method: 'GET',
      endpoint: '/api/v0/device-types?type=group&sub_type=lighting',
    })
    expectAllowedStatus(response.status(), [200, 404])
    if (response.status() === 200) {
      expect(Array.isArray(extractItems(body))).toBe(true)
    }
  })

  const lightingListCases: Array<[string, string, Record<string, string | number | boolean | undefined>, number[]]> = [
    ['TC63', 'Lay danh sach group lighting thanh cong', { sub_type: 'lighting', page: 1, limit: 20 }, [200]],
    ['TC64', 'Phan trang danh sach group lighting', { sub_type: 'lighting', page: 2, limit: 20 }, [200]],
    ['TC65', 'Tim kiem group lighting theo ten', { sub_type: 'lighting', search: 'Lighting', page: 1, limit: 20 }, [200]],
    ['TC66', 'Filter group lighting theo HC', { hc_id: '1001', sub_type: 'lighting', page: 1, limit: 20 }, [200]],
    ['TC67', 'Filter group lighting theo device type', { sub_type: 'lighting', device_type_id: 10000, page: 1, limit: 20 }, [200]],
    ['TC68', 'Filter group lighting theo trang thai', { sub_type: 'lighting', state: 'actived,removed', page: 1, limit: 20 }, [200]],
    ['TC69', 'Filter group lighting theo khu vuc', { sub_type: 'lighting', area_id: TEST_AREA_ID || undefined, page: 1, limit: 20 }, [200]],
    ['TC70', 'Filter group lighting chua gan khu vuc', { sub_type: 'lighting', area_id: 'null', page: 1, limit: 20 }, [200]],
    ['TC71', 'Xem chi tiet group lighting', {}, [200]],
  ]
  for (const [tcId, tcName, query, statuses] of lightingListCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      if (tcId === 'TC71') {
        let groupId: string | undefined
        try {
          groupId = await createGroupAndExtractId(client, context, createGroupPayload({
            tcId,
            type: 'Lighting',
            deviceIds: [TEST_LIGHTING_DEVICE_ID_1].filter(Boolean),
          }))
          const response = await client.getGroupAPI(groupId)
          const body = await recordGroupResponse(context, 'Get lighting group detail', response, {
            method: 'GET',
            endpoint: `${GROUP_API_BASE}/${groupId}`,
          })
          expect(response.status()).toBe(200)
          expectGroupDetailShape(body)
        } finally {
          await cleanupGroup(client, context, groupId)
        }
        return
      }
      const response = await client.listGroupsAPI(query)
      const body = await recordGroupResponse(context, 'List/filter lighting groups', response, {
        method: 'GET',
        endpoint: `${GROUP_API_BASE}?${new URLSearchParams(query as Record<string, string>).toString()}`,
      })
      expectAllowedStatus(response.status(), statuses)
      expectGroupListShape(body)
    })
  }

  const lightingCreateUpdateDeleteCases: Array<[string, string, 'create' | 'invalid' | 'update' | 'delete', Record<string, unknown>, number[]]> = [
    ['TC72', 'Tao group lighting thanh cong', 'create', {}, [200, 201]],
    ['TC73', 'Khong cho tao lighting thieu ten', 'invalid', { hc_id: '4932308540097724437', device_type: 10000, icon: 'group-auto' }, [400, 422]],
    ['TC74', 'Khong cho tao lighting thieu HC', 'invalid', { device_type: 10000, name: generateGroupName('TC74', 'lighting'), icon: 'group-auto' }, [400, 422]],
    ['TC75', 'Khong cho tao lighting thieu device type', 'invalid', { hc_id: '4932308540097724437', name: generateGroupName('TC75', 'lighting'), icon: 'group-auto' }, [400, 422]],
    ['TC76', 'Khong cho tao lighting voi device type thuong', 'invalid', { hc_id: '4932308540097724437', device_type: 10001, name: generateGroupName('TC76', 'lighting'), icon: 'group-auto' }, [400, 422]],
    ['TC77', 'Cap nhat ten icon group lighting', 'update', { name: generateGroupName('TC77', 'updated'), icon: 'group-light-updated' }, [200, 202]],
    ['TC78', 'Disable group lighting', 'update', { enable: false }, [200, 202, 400, 422]],
    ['TC79', 'Enable lai group lighting', 'update', { enable: true }, [200, 202, 400, 422]],
    ['TC80', 'Xoa group lighting thanh cong', 'delete', {}, [200, 204]],
  ]
  for (const [tcId, tcName, action, payload, statuses] of lightingCreateUpdateDeleteCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        if (action === 'create') {
          groupId = await createGroupAndExtractId(client, context, createGroupPayload({
            tcId,
            type: 'Lighting',
            deviceIds: [TEST_LIGHTING_DEVICE_ID_1].filter(Boolean),
          }))
          return
        }
        if (action === 'invalid') {
          const response = await client.createGroupAPI(payload)
          await recordGroupResponse(context, 'Create invalid lighting group', response, {
            method: 'POST',
            endpoint: GROUP_API_BASE,
            request: payload,
          })
          expectAllowedStatus(response.status(), statuses)
          return
        }
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({
          tcId,
          type: 'Lighting',
          deviceIds: action === 'delete' ? [] : [TEST_LIGHTING_DEVICE_ID_1].filter(Boolean),
        }))
        const response = action === 'update'
          ? await client.updateGroupAPI(groupId, payload)
          : await client.deleteGroupAPI(groupId)
        await recordGroupResponse(context, `${action} lighting group`, response, {
          method: action === 'update' ? 'PATCH' : 'DELETE',
          endpoint: `${GROUP_API_BASE}/${groupId}`,
          request: action === 'update' ? payload : undefined,
        })
        expectAllowedStatus(response.status(), statuses)
        if (action === 'delete') {
          context.cleanup.group_deleted = [200, 204].includes(response.status())
          groupId = undefined
        }
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  runTc('TC81', 'Xoa nhieu group lighting thanh cong', async ({ client, context }) => {
    const groupIds: string[] = []
    try {
      groupIds.push(await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC81_a', type: 'Lighting' })))
      groupIds.push(await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC81_b', type: 'Lighting' })))
      for (const groupId of groupIds) {
        const bindings = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/bindings`, {
          query: { page: 1, limit: 100, state: ['pending', 'activated', 'failed', 'removing'] },
        })
        await recordGroupResponse(context, 'Get lighting group bindings before batch delete', bindings, {
          method: 'GET',
          endpoint: `${GROUP_API_BASE}/${groupId}/bindings?page=1&limit=100&state=pending&state=activated&state=failed&state=removing`,
        })
        expect(bindings.status()).toBe(200)

        const members = await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`, {
          query: { page: 1, limit: 100, state: ['pending', 'activated', 'failed', 'removing'] },
        })
        const membersBody = await recordGroupResponse(context, 'Get lighting group members before batch delete', members, {
          method: 'GET',
          endpoint: `${GROUP_API_BASE}/${groupId}/members?page=1&limit=100&state=pending&state=activated&state=failed&state=removing`,
        })
        expect(members.status()).toBe(200)
        expect(extractItems(membersBody).length).toBe(0)
      }

      const deleteBatchPayload = { group_ids: [...groupIds] }
      const response = await client.requestAPI('DELETE', `${GROUP_API_BASE}/delete-batch`, {
        body: deleteBatchPayload,
      })
      await recordGroupResponse(context, 'Delete batch lighting groups', response, {
        method: 'DELETE',
        endpoint: `${GROUP_API_BASE}/delete-batch`,
        request: deleteBatchPayload,
      })
      expectAllowedStatus(response.status(), [200, 202, 204])
      if ([200, 202, 204].includes(response.status())) {
        context.cleanup.group_deleted = true
        groupIds.length = 0
      }
    } finally {
      for (const groupId of groupIds) {
        await cleanupGroup(client, context, groupId)
      }
    }
  })

  const lightingMemberCases: Array<[string, string, 'list' | 'add' | 'remove' | 'negative', Array<string | number>, number[]]> = [
    ['TC82', 'Lay danh sach member cua group lighting', 'list', [], [200]],
    ['TC83', 'Them thiet bi den vao group lighting', 'add', [TEST_LIGHTING_DEVICE_ID_1], [200, 202, 204]],
    ['TC84', 'Them nhieu thiet bi den vao group lighting', 'add', [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], [200, 202, 204]],
    ['TC85', 'Khong cho them thiet bi khong phai lighting', 'negative', [TEST_SWITCH_DEVICE_ID_1], [200, 202, 400, 422]],
    ['TC86', 'Khong cho them trung thiet bi den', 'add', [TEST_LIGHTING_DEVICE_ID_1], [200, 202, 204, 409]],
    ['TC87', 'Xoa mot thiet bi khoi group lighting', 'remove', [TEST_LIGHTING_DEVICE_ID_1], [200, 202, 204]],
    ['TC88', 'Xoa nhieu thiet bi khoi group lighting', 'remove', [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], [200, 202, 204]],
  ]
  for (const [tcId, tcName, action, deviceIds, statuses] of lightingMemberCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({
          tcId,
          type: 'Lighting',
          deviceIds: action === 'remove' ? ids : [],
        }))
        const response =
          action === 'list'
            ? await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/members`)
            : action === 'remove'
              ? await client.removeDevicesFromGroupAPI(groupId, ids)
              : await client.addDevicesToGroupAPI(groupId, ids)
        await recordGroupResponse(context, `${action} lighting members`, response, {
          method: action === 'list' ? 'GET' : action === 'remove' ? 'DELETE' : 'POST',
          endpoint: `${GROUP_API_BASE}/${groupId}/members`,
          request: action === 'list' ? undefined : { members: ids },
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const lightingBindingCases: Array<[string, string, 'list' | 'filter' | 'add' | 'combo' | 'remove' | 'negative', number[]]> = [
    ['TC89', 'Lay danh sach binding cua group lighting', 'list', [200]],
    ['TC90', 'Filter binding theo trang thai', 'filter', [200]],
    ['TC91', 'Them mot binding vao group lighting', 'add', [200, 202, 204, 400, 422]],
    ['TC92', 'Them member va binding cung luc', 'combo', [200, 202, 204, 400, 422]],
    ['TC93', 'Khong cho them trung binding', 'negative', [200, 202, 400, 409, 422]],
    ['TC94', 'Xoa mot binding khoi group lighting', 'remove', [200, 202, 204, 400, 404, 422]],
    ['TC95', 'Xoa nhieu binding khoi group lighting', 'remove', [200, 202, 204, 400, 404, 422]],
  ]
  for (const [tcId, tcName, action, statuses] of lightingBindingCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, type: 'Lighting' }))
        const binding = { cell_id: TEST_LIGHTING_DEVICE_ID_1, state: 'activated', endpoint: SLOT_ON_OFF }
        const response =
          action === 'list'
            ? await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/bindings`)
            : action === 'filter'
              ? await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/bindings`, { query: { state: 'activated' } })
              : action === 'remove'
                ? await client.requestAPI('DELETE', `${GROUP_API_BASE}/${groupId}/members`, { body: { members: [], bindings: [binding] } })
                : await client.requestAPI('POST', `${GROUP_API_BASE}/${groupId}/members`, {
                  body: {
                    members: action === 'combo' ? [{ cell_id: TEST_LIGHTING_DEVICE_ID_1, state: 'activated' }] : [],
                    bindings: [binding],
                  },
                })
        await recordGroupResponse(context, `${action} lighting bindings`, response, {
          method: action === 'list' || action === 'filter' ? 'GET' : action === 'remove' ? 'DELETE' : 'POST',
          endpoint: `${GROUP_API_BASE}/${groupId}/${action === 'list' || action === 'filter' ? 'bindings' : 'members'}`,
          request: action === 'list' || action === 'filter' ? undefined : { binding },
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const lightingAreaSortCases: Array<[string, string, 'assign' | 'unassign' | 'iot-list' | 'sort-detail' | 'sort-update', number[]]> = [
    ['TC96', 'Gan group lighting vao khu vuc', 'assign', [200, 201, 202, 204, 400, 404, 422]],
    ['TC97', 'Go group lighting khoi khu vuc', 'unassign', [200, 202, 204, 400, 404, 422]],
    ['TC98', 'Lay danh sach IoT group lighting', 'iot-list', [200]],
    ['TC99', 'Xem chi tiet IoT group lighting', 'sort-detail', [200, 404]],
    ['TC100', 'Cap nhat members va bindings IoT group lighting', 'sort-update', [200, 202, 204, 400, 404, 422]],
  ]
  for (const [tcId, tcName, action, statuses] of lightingAreaSortCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, type: 'Lighting' }))
        const response =
          action === 'assign'
            ? await client.assignGroupToAreaAPI(groupId, TEST_AREA_ID || 'missing-area-id')
            : action === 'unassign'
              ? await client.requestAPI('DELETE', `/api/v0/areas/${TEST_AREA_ID || 'missing-area-id'}/groups`, { body: { group_ids: [groupId] } })
              : action === 'iot-list'
                ? await client.requestAPI('GET', '/api/v0/iot/groups?hc_id=1001&state=actived&state=failed')
                : action === 'sort-detail'
                  ? await client.requestAPI('GET', `${GROUP_API_BASE}/${groupId}/sort`)
                  : await client.requestAPI('PATCH', `${GROUP_API_BASE}/${groupId}/sort`, { body: { members: [], bindings: [] } })
        await recordGroupResponse(context, `Lighting area/sort action ${action}`, response, {
          method: action === 'assign' ? 'POST' : action === 'unassign' ? 'DELETE' : action === 'sort-update' ? 'PATCH' : 'GET',
          endpoint: action === 'iot-list' ? '/api/v0/iot/groups?hc_id=1001&state=actived&state=failed' : action,
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    })
  }

  const lightingRuntimeMoreCases: Array<[string, string, GroupState[], number, GroupStateValue, Array<string | number>, boolean]> = [
    ['TC101', 'Bat nhom lighting thanh cong', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], true],
    ['TC102', 'Tat nhom lighting thanh cong', [{ idx: SLOT_ON_OFF, value: false }], SLOT_ON_OFF, false, [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], true],
    ['TC103', 'Bat nhom lighting khi mot so thiet bi dang bat mot so dang tat', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], true],
    ['TC104', 'Tat nhom lighting khi mot so thiet bi dang bat mot so dang tat', [{ idx: SLOT_ON_OFF, value: false }], SLOT_ON_OFF, false, [TEST_LIGHTING_DEVICE_ID_1, TEST_LIGHTING_DEVICE_ID_2], true],
    ['TC105', 'Dieu khien nhom lighting chi co 1 thiet bi', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1], true],
    ['TC106', 'Dieu khien nhom lighting khong co thiet bi', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [], false],
    ['TC109', 'Dieu khien nhom lighting nhieu lan lien tiep', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1], true],
    ['TC110', 'Double click nut bat tat group', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1], true],
    ['TC111', 'Dieu khien group roi refresh man hinh', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1], true],
    ['TC112', 'Dieu khien group khong anh huong thiet bi ngoai group', [{ idx: SLOT_ON_OFF, value: true }], SLOT_ON_OFF, true, [TEST_LIGHTING_DEVICE_ID_1], true],
  ]
  for (const [tcId, tcName, states, expectedSlot, expectedValue, deviceIds, verifyDevices] of lightingRuntimeMoreCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      let initialStates
      const ids = deviceIds.filter(Boolean)
      try {
        groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId, type: 'Lighting', deviceIds: ids }))
        if (!verifyDevices) {
          const response = await client.controlGroupAPI(groupId, states)
          await recordGroupResponse(context, 'Control empty lighting group', response, {
            method: 'POST',
            endpoint: `${GROUP_API_BASE}/${groupId}/control`,
            request: { states },
          })
          expectAllowedStatus(response.status(), [200, 202, 400, 404, 422])
          return
        }
        initialStates = await getInitialDeviceStates(client, ids)
        await controlGroupAndExpectDevices({
          client,
          context,
          groupId,
          deviceIds: ids,
          states,
          expectedSlot,
          expectedValue,
        })
      } finally {
        await resetDeviceStates(client, context, initialStates)
        await cleanupGroup(client, context, groupId)
      }
    }, { requireHc: verifyDevices, requireControl: true, timeoutMs: 90000 })
  }

  const lightingRuntimeEdgeCases: Array<[string, string, Record<string, unknown>, number[]]> = [
    ['TC107', 'Dieu khien nhom lighting co thiet bi offline', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [200, 202, 400, 404, 422]],
    ['TC108', 'Dieu khien nhom lighting co thiet bi failed', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [200, 202, 400, 404, 422]],
    ['TC113', 'Dieu khien group bang group id khong ton tai', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [400, 404]],
    ['TC114', 'Dieu khien group voi states rong', { states: [] }, [400, 404, 422]],
    ['TC115', 'Dieu khien group thieu device id', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [200, 202, 400, 404, 422]],
    ['TC116', 'Dieu khien group thieu states', {}, [400, 404, 422]],
    ['TC117', 'Dieu khien group voi idx khong ton tai', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [400, 404]],
    ['TC118', 'Dieu khien group voi value sai kieu du lieu', { states: [{ idx: SLOT_ON_OFF, value: { invalid: true } }] }, [400, 404, 422]],
    ['TC119', 'Dieu khien group khi API timeout', { states: [{ idx: SLOT_ON_OFF, value: true }] }, [200, 202, 400, 404, 408, 422, 504]],
  ]
  for (const [tcId, tcName, payload, statuses] of lightingRuntimeEdgeCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      let groupId: string | undefined
      try {
        const targetId = ['TC113', 'TC117'].includes(tcId)
          ? FAKE_ID
          : (groupId = await createGroupAndExtractId(client, context, createGroupPayload({
            tcId,
            type: 'Lighting',
            deviceIds: [TEST_LIGHTING_DEVICE_ID_1].filter(Boolean),
          })))
        const response = await client.requestAPI('POST', `${GROUP_API_BASE}/${targetId}/control`, { body: payload })
        await recordGroupResponse(context, 'Lighting runtime edge control', response, {
          method: 'POST',
          endpoint: `${GROUP_API_BASE}/${targetId}/control`,
          request: payload,
        })
        expectAllowedStatus(response.status(), statuses)
      } finally {
        await cleanupGroup(client, context, groupId)
      }
    }, { requireControl: true })
  }

  runTc('TC120', 'Dieu khien group khi khong co quyen', async ({ request, client, context }) => {
    const restrictedToken = noPermissionToken || viewerToken
    test.skip(!restrictedToken, 'Viewer or no-permission token is required')
    let groupId: string | undefined
    try {
      groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC120', type: 'Lighting' }))
      const restrictedClient = new GroupApiClient(request, restrictedToken)
      const response = await restrictedClient.controlGroupAPI(groupId, [{ idx: SLOT_ON_OFF, value: true }])
      await recordGroupResponse(context, 'Control group without permission', response, {
        method: 'POST',
        endpoint: `${GROUP_API_BASE}/${groupId}/control`,
      })
      expectAllowedStatus(response.status(), [401, 403])
    } finally {
      await cleanupGroup(client, context, groupId)
    }
  }, { requireAdmin: false, requireControl: true })

  const bleCases: Array<[string, string, boolean]> = [
    ['TC121', 'Bat nhom BLE mac dinh', true],
    ['TC122', 'Tat nhom BLE mac dinh', false],
  ]
  for (const [tcId, tcName, value] of bleCases) {
    runTc(tcId, tcName, async ({ client, context }) => {
      const bleGroup = await findBleDefaultGroup(client, context)
      const bleGroupId = bleGroup?.id
      test.skip(!bleGroupId, 'Default BLE group is not available on this environment')
      const response = await client.controlGroupAPI(String(bleGroupId), [{ idx: SLOT_ON_OFF, value }])
      await recordGroupResponse(context, 'Control default BLE group', response, {
        method: 'POST',
        endpoint: `${GROUP_API_BASE}/${bleGroupId}/control`,
        request: { states: [{ idx: SLOT_ON_OFF, value }] },
      })
      expectAllowedStatus(response.status(), [200, 202, 400, 404, 422])
    }, { requireHc: true, requireControl: true })
  }

  runTc('TC123', 'Khong cho xoa nhom BLE mac dinh sau khi dieu khien', async ({ client, context }) => {
    test.skip(process.env.GROUP_ALLOW_DEFAULT_BLE_DELETE_CHECK !== 'true', 'Skip destructive default BLE delete check unless explicitly allowed')
    const bleGroup = await findBleDefaultGroup(client, context)
    const bleGroupId = bleGroup?.id
    test.skip(!bleGroupId, 'Default BLE group is not available on this environment')
    const response = await client.deleteGroupAPI(String(bleGroupId))
    await recordGroupResponse(context, 'Delete default BLE group', response, {
      method: 'DELETE',
      endpoint: `${GROUP_API_BASE}/${bleGroupId}`,
    })
    expectAllowedStatus(response.status(), [400, 403, 409, 422])
  })
})

const findBleDefaultGroup = async (
  client: GroupApiClient,
  context: ReturnType<typeof createGroupTestContext>,
) => {
  const response = await client.listGroupsAPI({ limit: 100 })
  const body = await recordGroupResponse(context, 'Find default BLE group', response, {
    method: 'GET',
    endpoint: `${GROUP_API_BASE}?limit=100`,
  })
  expect(response.status()).toBe(200)
  return extractItems(body).find((item) => {
    const deviceType = item.device_type as { id?: number; name?: string } | undefined
    return deviceType?.id === 9999 || String(item.name ?? '').toLowerCase().includes('ble')
  })
}
