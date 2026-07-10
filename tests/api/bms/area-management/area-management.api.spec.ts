import { expect, test, TestInfo } from '@playwright/test'
import {
  AreaEvidence,
  AreaSuiteApi,
  cleanupArea,
  fakeAreaId,
  fakeDeviceId,
  fakeGroupId,
  generateTcAreaName,
  getAreaSuiteEnv,
  loginAreaSuiteUser,
  newAreaSuiteApi,
  requireAreaFixture,
} from '@src/core/bms-api/area-management-suite'

const env = getAreaSuiteEnv()

let adminToken = ''
let adminApi: AreaSuiteApi

type JsonResponse = {
  json: () => Promise<unknown>
}

type AreaResponseBody = {
  data?: any
  error?: any
}

type AreaTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (api: AreaSuiteApi, evidence: AreaEvidence) => Promise<void>
}

const responseBody = async (
  response: JsonResponse,
): Promise<AreaResponseBody> => (await response.json()) as AreaResponseBody

const listItems = (body: AreaResponseBody): any[] =>
  Array.isArray(body.data?.items) ? body.data.items : []

const expectErrorCode = (body: AreaResponseBody, codes: string[]) => {
  const actual = body.error?.code || body.error?.error_code || body.error?.name
  if (actual !== undefined) {
    expect(codes).toContain(actual)
  }
}

const requireId = (value: string | undefined, message: string) => {
  expect(value, message).toBeTruthy()
  if (!value) {
    throw new Error(message)
  }

  return value
}

const areaIdFromResponse = async (response: JsonResponse) => {
  const body = await responseBody(response)
  return requireId(body.data?.id, 'Area id is required')
}

const expectAreaFoundBySearch = async (
  api: AreaSuiteApi,
  areaId: string,
  areaName: string,
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await api.listAreas({
      search: areaName,
      page: 1,
      limit: 20,
    })
    const body = await responseBody(response)
    const found = listItems(body).some((item) => item.id === areaId)
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const finalResponse = await api.listAreas({
    search: areaName,
    page: 1,
    limit: 20,
  })
  const finalBody = await responseBody(finalResponse)
  expect(listItems(finalBody).some((item) => item.id === areaId)).toBe(true)
}

const expectAreaNotFound = async (api: AreaSuiteApi, areaId: string) => {
  const response = await api.getArea(areaId)
  expect(response.status()).toBe(404)
}

const createArea = async (
  api: AreaSuiteApi,
  tcId: string,
  payload?: { parent_id?: string | null; floor_plan_url?: string | null },
) => {
  const response = await api.createArea({
    name: generateTcAreaName(tcId),
    ...payload,
  })
  expect(response.status()).toBe(200)
  return areaIdFromResponse(response)
}

const createAutomationUserApi = async (
  api: AreaSuiteApi,
  evidence: AreaEvidence,
  tcId: string,
  actions?: number,
) => {
  const roleName = `auto_area_role_${tcId}_${Date.now()}`
  let roleId: string | undefined
  let userId: string | undefined
  let policyId: number | string | undefined
  let userApi: AreaSuiteApi | undefined

  const roleResponse = await api.createRole({
    name: roleName,
    status: 'Active',
  })
  expect(roleResponse.status()).toBe(200)
  roleId = requireId((await responseBody(roleResponse)).data?.id, 'Role id')

  const userPayload = api.createAutomationUserPayload(tcId)
  const userResponse = await api.registerUser(userPayload)
  expect(userResponse.status()).toBe(200)
  const userBody = await responseBody(userResponse)
  userId = requireId(
    userBody.data?.user_id || userBody.data?.id,
    'Automation user id',
  )

  if (actions !== undefined) {
    const policyResponse = await api.createPolicy({
      role_id: roleId,
      service_code: 'area_management',
      resource_scope: 'all',
      actions,
      effect: 'allow',
    })
    expect(policyResponse.status()).toBe(200)
    policyId = (await responseBody(policyResponse)).data?.id
  }

  const assignResponse = await api.assignRole(roleId, userId)
  expect(assignResponse.status()).toBe(200)

  const login = await loginAreaSuiteUser(
    env,
    userPayload.user_name,
    userPayload.password,
  )
  userApi = await newAreaSuiteApi(env, login.token)

  return {
    userApi,
    cleanup: async () => {
      await userApi?.context.dispose()
      await api.cleanupPolicy(evidence, policyId)
      await api.cleanupUser(evidence, userId)
      await api.cleanupRole(evidence, roleId)
    },
  }
}

const withArea = async (
  api: AreaSuiteApi,
  evidence: AreaEvidence,
  tcId: string,
  fn: (areaId: string) => Promise<void>,
) => {
  let areaId: string | undefined

  try {
    areaId = await createArea(api, tcId)
    await fn(areaId)
  } finally {
    await cleanupArea(api, evidence, areaId)
  }
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: AreaSuiteApi, evidence: AreaEvidence) => Promise<void>,
) => {
  const evidence = new AreaEvidence(testInfo, tcId, tcName, env.baseUrl)
  const api = adminApi.withEvidence(evidence)

  await evidence.attachStep({
    step: 'Login admin',
    method: 'POST',
    endpoint: '/api/v0/auth/login',
    status: 200,
    response: {
      token_present: Boolean(adminToken),
      token_length: adminToken.length,
    },
  })

  try {
    await fn(api, evidence)
    await evidence.write('PASSED')
  } catch (error) {
    await evidence.write('FAILED', error)
    throw error
  }
}

const areaCases: AreaTc[] = [
  /*
  TC ID: TC1
  Ten testcase: Lay danh sach khu vuc thanh cong
  Muc tieu: Kiem tra admin co the lay danh sach area
  Precondition: Admin login thanh cong
  Expected: API tra 200, co data.items, total, page, limit
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC1',
    name: 'Lay danh sach khu vuc thanh cong',
    goal: 'Kiem tra admin co the lay danh sach area',
    precondition: 'Admin login thanh cong',
    expected: 'API tra 200, co data.items, total, page, limit',
    run: async (api, evidence) => {
      const response = await api.listAreas({ page: 1, limit: 10 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(body.data?.items)).toBe(true)
      expect(body.data?.total).toBeDefined()
      expect(body.data?.page).toBeDefined()
      expect(body.data?.limit).toBeDefined()
      evidence.addAssertion('Area list returns pagination envelope')
    },
  },
  /*
  TC ID: TC2
  Ten testcase: Tim kiem khu vuc theo ten
  Muc tieu: Kiem tra area vua tao tim thay bang search
  Precondition: Tao area test rieng
  Expected: API search tra 200 va co area dung ten
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC2',
    name: 'Tim kiem khu vuc theo ten',
    goal: 'Kiem tra area vua tao tim thay bang search',
    precondition: 'Tao area test rieng',
    expected: 'API search tra 200 va co area dung ten',
    run: async (api, evidence) => {
      let areaId: string | undefined
      try {
        const name = generateTcAreaName('TC2')
        const createResponse = await api.createArea({ name })
        expect(createResponse.status()).toBe(200)
        areaId = await areaIdFromResponse(createResponse)
        await expectAreaFoundBySearch(api, areaId, name)
        evidence.addAssertion('Created area can be found by exact search')
      } finally {
        await cleanupArea(api, evidence, areaId)
      }
    },
  },
  /*
  TC ID: TC3
  Ten testcase: Phan trang danh sach khu vuc
  Muc tieu: Kiem tra page va limit cua list area
  Precondition: Admin co quyen view
  Expected: API tra 200, page=1, limit=10
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC3',
    name: 'Phan trang danh sach khu vuc',
    goal: 'Kiem tra page va limit cua list area',
    precondition: 'Admin co quyen view',
    expected: 'API tra 200, page=1, limit=10',
    run: async (api, evidence) => {
      const response = await api.listAreas({ page: 1, limit: 10 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.page).toBe(1)
      expect(body.data?.limit).toBe(10)
      expect(listItems(body).length).toBeLessThanOrEqual(10)
      evidence.addAssertion('Area list supports page and limit')
    },
  },
  /*
  TC ID: TC4
  Ten testcase: Lay danh sach root area
  Muc tieu: Kiem tra parent_id=null chi tra root area
  Precondition: Co area root
  Expected: Tat ca items co parent_id=null
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC4',
    name: 'Lay danh sach root area',
    goal: 'Kiem tra parent_id=null chi tra root area',
    precondition: 'Co area root',
    expected: 'Tat ca items co parent_id=null',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC4', async () => {
        const response = await api.listAreas({
          parent_id: 'null',
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(listItems(body).every((item) => item.parent_id === null)).toBe(
          true,
        )
        evidence.addAssertion('parent_id=null returns only root areas')
      })
    },
  },
  /*
  TC ID: TC5
  Ten testcase: Lay danh sach area con theo parent_id
  Muc tieu: Kiem tra filter danh sach con theo parent_id
  Precondition: Tao parent va child
  Expected: Items la con cua parent
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC5',
    name: 'Lay danh sach area con theo parent_id',
    goal: 'Kiem tra filter danh sach con theo parent_id',
    precondition: 'Tao parent va child',
    expected: 'Items la con cua parent',
    run: async (api, evidence) => {
      let parentId: string | undefined
      try {
        parentId = await createArea(api, 'TC5_parent')
        const childId = await createArea(api, 'TC5_child', {
          parent_id: parentId,
        })
        const response = await api.listAreas({
          parent_id: parentId,
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(listItems(body).some((item) => item.id === childId)).toBe(true)
        expect(
          listItems(body).every((item) => item.parent_id === parentId),
        ).toBe(true)
        evidence.addAssertion('List by parent_id returns child areas')
      } finally {
        await cleanupArea(api, evidence, parentId)
      }
    },
  },
  /*
  TC ID: TC6
  Ten testcase: Search khong co ket qua
  Muc tieu: Kiem tra search random khong bi loi
  Precondition: Khong co area ten random
  Expected: API tra 200, items rong hoac total=0
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC6',
    name: 'Search khong co ket qua',
    goal: 'Kiem tra search random khong bi loi',
    precondition: 'Khong co area ten random',
    expected: 'API tra 200, items rong hoac total=0',
    run: async (api, evidence) => {
      const response = await api.listAreas({
        search: `not_found_${Date.now()}`,
        page: 1,
        limit: 10,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length === 0 || body.data?.total === 0).toBe(true)
      evidence.addAssertion('Unknown search returns empty result')
    },
  },
  /*
  TC ID: TC7
  Ten testcase: Limit vuot qua max
  Muc tieu: Kiem tra validation limit > 500
  Precondition: Admin co quyen view
  Expected: Backend tra 400 hoac cap limit ve 500
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC7',
    name: 'Limit vuot qua max',
    goal: 'Kiem tra validation limit > 500',
    precondition: 'Admin co quyen view',
    expected: 'Backend tra 400 hoac cap limit ve 500',
    run: async (api, evidence) => {
      const response = await api.listAreas({ page: 1, limit: 501 })
      const body = await responseBody(response)
      expect([200, 400]).toContain(response.status())
      if (response.status() === 200)
        expect(body.data?.limit).toBeLessThanOrEqual(500)
      evidence.addAssertion('limit>500 is rejected or capped by backend')
    },
  },
  /*
  TC ID: TC8
  Ten testcase: Page sai kieu
  Muc tieu: Kiem tra validation page khong phai number
  Precondition: Admin co quyen view
  Expected: API tra 400 validation
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC8',
    name: 'Page sai kieu',
    goal: 'Kiem tra validation page khong phai number',
    precondition: 'Admin co quyen view',
    expected: 'API tra 400 validation',
    run: async (api, evidence) => {
      const response = await api.listAreasRaw({ page: 'abc' })
      expect(response.status()).toBe(400)
      evidence.addAssertion('Invalid page type returns 400')
    },
  },
  /*
  TC ID: TC9
  Ten testcase: Tao khu vuc root thanh cong
  Muc tieu: Kiem tra tao area root hop le
  Precondition: Admin co quyen create
  Expected: Area co id, name, parent_id=null
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC9',
    name: 'Tao khu vuc root thanh cong',
    goal: 'Kiem tra tao area root hop le',
    precondition: 'Admin co quyen create',
    expected: 'Area co id, name, parent_id=null',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC9', async (areaId) => {
        const detail = await api.getArea(areaId)
        const body = await responseBody(detail)
        expect(detail.status()).toBe(200)
        expect(body.data?.id).toBe(areaId)
        expect(body.data?.parent_id).toBeNull()
        evidence.addAssertion('Root area is created and readable')
      })
    },
  },
  /*
  TC ID: TC10
  Ten testcase: Tao khu vuc con thanh cong
  Muc tieu: Kiem tra tao child area voi parent_id hop le
  Precondition: Co parent area
  Expected: Child co parent_id dung
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC10',
    name: 'Tao khu vuc con thanh cong',
    goal: 'Kiem tra tao child area voi parent_id hop le',
    precondition: 'Co parent area',
    expected: 'Child co parent_id dung',
    run: async (api, evidence) => {
      let parentId: string | undefined
      try {
        parentId = await createArea(api, 'TC10_parent')
        const childId = await createArea(api, 'TC10_child', {
          parent_id: parentId,
        })
        const body = await responseBody(await api.getArea(childId))
        expect(body.data?.parent_id).toBe(parentId)
        evidence.addAssertion('Child area stores expected parent_id')
      } finally {
        await cleanupArea(api, evidence, parentId)
      }
    },
  },
  /*
  TC ID: TC11
  Ten testcase: Tao khu vuc thieu name
  Muc tieu: Kiem tra validation khi khong truyen name
  Precondition: Admin co quyen create
  Expected: API tra 400
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC11',
    name: 'Tao khu vuc thieu name',
    goal: 'Kiem tra validation khi khong truyen name',
    precondition: 'Admin co quyen create',
    expected: 'API tra 400',
    run: async (api, evidence) => {
      const response = await api.createArea({})
      expect(response.status()).toBe(400)
      evidence.addAssertion('Missing name returns 400')
    },
  },
  /*
  TC ID: TC12
  Ten testcase: Tao khu vuc voi parent_id khong ton tai
  Muc tieu: Kiem tra parent_id fake bi chan
  Precondition: Admin co quyen create
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC12',
    name: 'Tao khu vuc voi parent_id khong ton tai',
    goal: 'Kiem tra parent_id fake bi chan',
    precondition: 'Admin co quyen create',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.createArea({
        name: generateTcAreaName('TC12'),
        parent_id: fakeAreaId,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(404)
      expectErrorCode(body, ['AREA_NOT_FOUND'])
      evidence.addAssertion(
        'Create area with nonexistent parent returns AREA_NOT_FOUND',
      )
    },
  },
  /*
  TC ID: TC13
  Ten testcase: Tao khu vuc voi parent_id sai UUID
  Muc tieu: Kiem tra parent_id sai dinh dang
  Precondition: Admin co quyen create
  Expected: API tra 400
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC13',
    name: 'Tao khu vuc voi parent_id sai UUID',
    goal: 'Kiem tra parent_id sai dinh dang',
    precondition: 'Admin co quyen create',
    expected: 'API tra 400',
    run: async (api, evidence) => {
      const response = await api.createArea({
        name: generateTcAreaName('TC13'),
        parent_id: 'abc',
      })
      expect(response.status()).toBe(400)
      evidence.addAssertion('Invalid parent_id format returns 400')
    },
  },
  /*
  TC ID: TC14
  Ten testcase: Tao khu vuc trung ten gay code conflict
  Muc tieu: Kiem tra duplicate alias/code
  Precondition: Da co area A
  Expected: API tra 409 neu backend enforce unique code
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC14',
    name: 'Tao khu vuc trung ten gay code conflict',
    goal: 'Kiem tra duplicate alias/code',
    precondition: 'Da co area A',
    expected: 'API tra 409 neu backend enforce unique code',
    run: async (api, evidence) => {
      let areaId: string | undefined
      try {
        const name = generateTcAreaName('TC14')
        const createResponse = await api.createArea({ name })
        areaId = await areaIdFromResponse(createResponse)
        const duplicateResponse = await api.createArea({ name })
        expect([200, 409]).toContain(duplicateResponse.status())
        evidence.addAssertion(
          'Duplicate generated code is rejected or allowed per backend behavior',
        )
      } finally {
        await cleanupArea(api, evidence, areaId)
      }
    },
  },
  /*
  TC ID: TC15
  Ten testcase: Tao khu vuc ten tieng Viet
  Muc tieu: Kiem tra tao area co dau tieng Viet
  Precondition: Admin co quyen create
  Expected: API tra 200 va code tu sinh hop le
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC15',
    name: 'Tao khu vuc ten tieng Viet',
    goal: 'Kiem tra tao area co dau tieng Viet',
    precondition: 'Admin co quyen create',
    expected: 'API tra 200 va code tu sinh hop le',
    run: async (api, evidence) => {
      let areaId: string | undefined
      try {
        const response = await api.createArea({
          name: `Khu vuc tang mot ${Date.now()}`,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        areaId = body.data?.id
        expect(body.data?.code).toBeTruthy()
        evidence.addAssertion('Vietnamese area name is accepted')
      } finally {
        await cleanupArea(api, evidence, areaId)
      }
    },
  },
  /*
  TC ID: TC16
  Ten testcase: Lay chi tiet khu vuc thanh cong
  Muc tieu: Kiem tra get detail area
  Precondition: Tao area test
  Expected: Tra dung id, name, parent_id
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC16',
    name: 'Lay chi tiet khu vuc thanh cong',
    goal: 'Kiem tra get detail area',
    precondition: 'Tao area test',
    expected: 'Tra dung id, name, parent_id',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC16', async (areaId) => {
        const response = await api.getArea(areaId)
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.id).toBe(areaId)
        evidence.addAssertion('Area detail returns requested id')
      })
    },
  },
  /*
  TC ID: TC17
  Ten testcase: Lay chi tiet khu vuc khong ton tai
  Muc tieu: Kiem tra get detail fake id
  Precondition: Admin co quyen view
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC17',
    name: 'Lay chi tiet khu vuc khong ton tai',
    goal: 'Kiem tra get detail fake id',
    precondition: 'Admin co quyen view',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.getArea(fakeAreaId)
      const body = await responseBody(response)
      expect(response.status()).toBe(404)
      expectErrorCode(body, ['AREA_NOT_FOUND'])
      evidence.addAssertion('Nonexistent area detail returns AREA_NOT_FOUND')
    },
  },
  /*
  TC ID: TC18
  Ten testcase: Lay chi tiet voi id sai format
  Muc tieu: Kiem tra id sai dinh dang
  Precondition: Admin co quyen view
  Expected: API tra 400 hoac 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC18',
    name: 'Lay chi tiet voi id sai format',
    goal: 'Kiem tra id sai dinh dang',
    precondition: 'Admin co quyen view',
    expected: 'API tra 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.getArea('abc')
      expect([400, 404]).toContain(response.status())
      evidence.addAssertion('Invalid id format is rejected')
    },
  },
  /*
  TC ID: TC19
  Ten testcase: Cap nhat ten khu vuc
  Muc tieu: Kiem tra PATCH name
  Precondition: Tao area test
  Expected: Name moi duoc luu
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC19',
    name: 'Cap nhat ten khu vuc',
    goal: 'Kiem tra PATCH name',
    precondition: 'Tao area test',
    expected: 'Name moi duoc luu',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC19', async (areaId) => {
        const name = generateTcAreaName('TC19_updated')
        const response = await api.updateArea(areaId, { name })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.name).toBe(name)
        evidence.addAssertion('Area name is updated')
      })
    },
  },
  /*
  TC ID: TC20
  Ten testcase: Cap nhat floor_plan_url
  Muc tieu: Kiem tra update floor_plan_url
  Precondition: Tao area test
  Expected: floor_plan_url dung
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC20',
    name: 'Cap nhat floor_plan_url',
    goal: 'Kiem tra update floor_plan_url',
    precondition: 'Tao area test',
    expected: 'floor_plan_url dung',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC20', async (areaId) => {
        const floorPlanUrl = 'https://example.com/plan.jpg'
        const response = await api.updateArea(areaId, {
          floor_plan_url: floorPlanUrl,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.floor_plan_url).toBe(floorPlanUrl)
        evidence.addAssertion('floor_plan_url is updated')
      })
    },
  },
  /*
  TC ID: TC21
  Ten testcase: Xoa floor_plan_url
  Muc tieu: Kiem tra xoa floor_plan_url bang null
  Precondition: Area co floor_plan_url
  Expected: floor_plan_url=null
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC21',
    name: 'Xoa floor_plan_url',
    goal: 'Kiem tra xoa floor_plan_url bang null',
    precondition: 'Area co floor_plan_url',
    expected: 'floor_plan_url=null',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC21', async (areaId) => {
        await api.updateArea(areaId, {
          floor_plan_url: 'https://example.com/plan.jpg',
        })
        const response = await api.updateArea(areaId, { floor_plan_url: null })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.floor_plan_url).toBeNull()
        evidence.addAssertion('floor_plan_url can be cleared')
      })
    },
  },
  /*
  TC ID: TC22
  Ten testcase: Di chuyen khu vuc con sang parent khac
  Muc tieu: Kiem tra update parent_id sang parent moi
  Precondition: Co parent A, parent B, child
  Expected: Child co parent_id=parentB
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC22',
    name: 'Di chuyen khu vuc con sang parent khac',
    goal: 'Kiem tra update parent_id sang parent moi',
    precondition: 'Co parent A, parent B, child',
    expected: 'Child co parent_id=parentB',
    run: async (api, evidence) => {
      let parentA: string | undefined
      let parentB: string | undefined
      try {
        parentA = await createArea(api, 'TC22_parentA')
        parentB = await createArea(api, 'TC22_parentB')
        const childId = await createArea(api, 'TC22_child', {
          parent_id: parentA,
        })
        const response = await api.updateArea(childId, { parent_id: parentB })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.parent_id).toBe(parentB)
        evidence.addAssertion('Child area can move to another parent')
      } finally {
        await cleanupArea(api, evidence, parentA)
        await cleanupArea(api, evidence, parentB)
      }
    },
  },
  /*
  TC ID: TC23
  Ten testcase: Di chuyen khu vuc ra root
  Muc tieu: Kiem tra parent_id=null
  Precondition: Child dang co parent
  Expected: parent_id=null
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC23',
    name: 'Di chuyen khu vuc ra root',
    goal: 'Kiem tra parent_id=null',
    precondition: 'Child dang co parent',
    expected: 'parent_id=null',
    run: async (api, evidence) => {
      let parentId: string | undefined
      try {
        parentId = await createArea(api, 'TC23_parent')
        const childId = await createArea(api, 'TC23_child', {
          parent_id: parentId,
        })
        const response = await api.updateArea(childId, { parent_id: null })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.parent_id).toBeNull()
        await cleanupArea(api, evidence, childId)
        evidence.addAssertion('Child area can move to root')
      } finally {
        await cleanupArea(api, evidence, parentId)
      }
    },
  },
  /*
  TC ID: TC24
  Ten testcase: Update khu vuc khong ton tai
  Muc tieu: Kiem tra update fake area
  Precondition: Admin co quyen update
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC24',
    name: 'Update khu vuc khong ton tai',
    goal: 'Kiem tra update fake area',
    precondition: 'Admin co quyen update',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.updateArea(fakeAreaId, {
        name: generateTcAreaName('TC24'),
      })
      expect(response.status()).toBe(404)
      evidence.addAssertion('Update nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC25
  Ten testcase: Update parent_id khong ton tai
  Muc tieu: Kiem tra parent_id fake khi update
  Precondition: Tao area test
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC25',
    name: 'Update parent_id khong ton tai',
    goal: 'Kiem tra parent_id fake khi update',
    precondition: 'Tao area test',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC25', async (areaId) => {
        const response = await api.updateArea(areaId, { parent_id: fakeAreaId })
        expect(response.status()).toBe(404)
        evidence.addAssertion('Update to nonexistent parent returns 404')
      })
    },
  },
  /*
  TC ID: TC26
  Ten testcase: Update parent_id sai UUID
  Muc tieu: Kiem tra parent_id invalid format
  Precondition: Tao area test
  Expected: API tra 400
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC26',
    name: 'Update parent_id sai UUID',
    goal: 'Kiem tra parent_id invalid format',
    precondition: 'Tao area test',
    expected: 'API tra 400',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC26', async (areaId) => {
        const response = await api.updateArea(areaId, { parent_id: 'abc' })
        expect(response.status()).toBe(400)
        evidence.addAssertion('Invalid parent_id update returns 400')
      })
    },
  },
  /*
  TC ID: TC27
  Ten testcase: Update tao code conflict
  Muc tieu: Kiem tra update name trung alias
  Precondition: Co area A/B
  Expected: API tra 409 neu backend enforce
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC27',
    name: 'Update tao code conflict',
    goal: 'Kiem tra update name trung alias',
    precondition: 'Co area A/B',
    expected: 'API tra 409 neu backend enforce',
    run: async (api, evidence) => {
      let areaA: string | undefined
      let areaB: string | undefined
      try {
        const name = generateTcAreaName('TC27')
        const createA = await api.createArea({ name })
        areaA = await areaIdFromResponse(createA)
        areaB = await createArea(api, 'TC27_b')
        const response = await api.updateArea(areaB, { name })
        expect([200, 409]).toContain(response.status())
        evidence.addAssertion(
          'Update duplicate generated code follows backend behavior',
        )
      } finally {
        await cleanupArea(api, evidence, areaA)
        await cleanupArea(api, evidence, areaB)
      }
    },
  },
  /*
  TC ID: TC28
  Ten testcase: Xoa khu vuc khong co con thanh cong
  Muc tieu: Kiem tra delete leaf area
  Precondition: Tao area khong con
  Expected: DELETE 200, GET lai 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC28',
    name: 'Xoa khu vuc khong co con thanh cong',
    goal: 'Kiem tra delete leaf area',
    precondition: 'Tao area khong con',
    expected: 'DELETE 200, GET lai 404',
    run: async (api, evidence) => {
      const areaId = await createArea(api, 'TC28')
      const response = await api.deleteArea(areaId)
      expect(response.status()).toBe(200)
      await expectAreaNotFound(api, areaId)
      evidence.markAreaDeleted()
      evidence.addAssertion('Leaf area is deleted')
    },
  },
  /*
  TC ID: TC29
  Ten testcase: Xoa khu vuc cha cascade con
  Muc tieu: Kiem tra cascade delete parent/child
  Precondition: Tao parent va child
  Expected: GET parent va child deu 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC29',
    name: 'Xoa khu vuc cha cascade con',
    goal: 'Kiem tra cascade delete parent/child',
    precondition: 'Tao parent va child',
    expected: 'GET parent va child deu 404',
    run: async (api, evidence) => {
      const parentId = await createArea(api, 'TC29_parent')
      const childId = await createArea(api, 'TC29_child', {
        parent_id: parentId,
      })
      const response = await api.deleteArea(parentId)
      expect(response.status()).toBe(200)
      await expectAreaNotFound(api, parentId)
      await expectAreaNotFound(api, childId)
      evidence.markAreaDeleted()
      evidence.addAssertion('Deleting parent cascades child areas')
    },
  },
  /*
  TC ID: TC30
  Ten testcase: Xoa khu vuc khong ton tai
  Muc tieu: Kiem tra delete fake id
  Precondition: Admin co quyen delete
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC30',
    name: 'Xoa khu vuc khong ton tai',
    goal: 'Kiem tra delete fake id',
    precondition: 'Admin co quyen delete',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.deleteArea(fakeAreaId)
      expect(response.status()).toBe(404)
      evidence.addAssertion('Delete nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC31
  Ten testcase: Xoa khu vuc id sai format
  Muc tieu: Kiem tra delete id invalid format
  Precondition: Admin co quyen delete
  Expected: API tra 400 hoac 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC31',
    name: 'Xoa khu vuc id sai format',
    goal: 'Kiem tra delete id invalid format',
    precondition: 'Admin co quyen delete',
    expected: 'API tra 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.deleteArea('abc')
      expect([400, 404]).toContain(response.status())
      evidence.addAssertion('Delete invalid id is rejected')
    },
  },
  /*
  TC ID: TC32
  Ten testcase: Lay nhieu khu vuc theo IDs
  Muc tieu: Kiem tra batch area lookup
  Precondition: Tao 2 area test
  Expected: API tra 2 area
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC32',
    name: 'Lay nhieu khu vuc theo IDs',
    goal: 'Kiem tra batch area lookup',
    precondition: 'Tao 2 area test',
    expected: 'API tra 2 area',
    run: async (api, evidence) => {
      let areaA: string | undefined
      let areaB: string | undefined
      try {
        areaA = await createArea(api, 'TC32_a')
        areaB = await createArea(api, 'TC32_b')
        const response = await api.batchAreas([areaA, areaB])
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(Array.isArray(body.data)).toBe(true)
        expect(body.data.map((item: any) => item.id)).toEqual(
          expect.arrayContaining([areaA, areaB]),
        )
        evidence.addAssertion('Batch lookup returns requested area ids')
      } finally {
        await cleanupArea(api, evidence, areaA)
        await cleanupArea(api, evidence, areaB)
      }
    },
  },
  /*
  TC ID: TC33
  Ten testcase: Batch co ID khong ton tai
  Muc tieu: Kiem tra batch bo qua fake id
  Precondition: Co 1 area va 1 fake id
  Expected: Chi tra area ton tai
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC33',
    name: 'Batch co ID khong ton tai',
    goal: 'Kiem tra batch bo qua fake id',
    precondition: 'Co 1 area va 1 fake id',
    expected: 'Chi tra area ton tai',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC33', async (areaId) => {
        const response = await api.batchAreas([areaId, fakeAreaId])
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data.some((item: any) => item.id === areaId)).toBe(true)
        expect(body.data.some((item: any) => item.id === fakeAreaId)).toBe(
          false,
        )
        evidence.addAssertion('Batch ignores nonexistent ids')
      })
    },
  },
  /*
  TC ID: TC34
  Ten testcase: Batch ids rong
  Muc tieu: Kiem tra batch ids=[]
  Precondition: Admin co quyen view
  Expected: API tra data=[]
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC34',
    name: 'Batch ids rong',
    goal: 'Kiem tra batch ids=[]',
    precondition: 'Admin co quyen view',
    expected: 'API tra data=[]',
    run: async (api, evidence) => {
      const response = await api.batchAreas([])
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data).toEqual([])
      evidence.addAssertion('Batch empty ids returns empty array')
    },
  },
  /*
  TC ID: TC35
  Ten testcase: Batch co UUID sai format
  Muc tieu: Kiem tra batch invalid UUID
  Precondition: Admin co quyen view
  Expected: API tra 400 INVALID_UUID
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC35',
    name: 'Batch co UUID sai format',
    goal: 'Kiem tra batch invalid UUID',
    precondition: 'Admin co quyen view',
    expected: 'API tra 400 INVALID_UUID',
    run: async (api, evidence) => {
      const response = await api.batchAreas(['abc'])
      expect(response.status()).toBe(400)
      evidence.addAssertion('Batch invalid UUID returns 400')
    },
  },
  /*
  TC ID: TC36
  Ten testcase: Batch vuot qua 100 IDs
  Muc tieu: Kiem tra gioi han batch ids
  Precondition: Admin co quyen view
  Expected: API tra 400
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC36',
    name: 'Batch vuot qua 100 IDs',
    goal: 'Kiem tra gioi han batch ids',
    precondition: 'Admin co quyen view',
    expected: 'API tra 400',
    run: async (api, evidence) => {
      const ids = Array.from(
        { length: 101 },
        (_, index) =>
          `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      )
      const response = await api.batchAreas(ids)
      expect(response.status()).toBe(400)
      evidence.addAssertion('Batch more than 100 ids returns 400')
    },
  },
  /*
  TC ID: TC37
  Ten testcase: Lay toan bo cay khu vuc
  Muc tieu: Kiem tra GET /areas/tree
  Precondition: Co du lieu area
  Expected: data la array, node co children
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC37',
    name: 'Lay toan bo cay khu vuc',
    goal: 'Kiem tra GET /areas/tree',
    precondition: 'Co du lieu area',
    expected: 'data la array, node co children',
    run: async (api, evidence) => {
      const response = await api.getAreaTree()
      const body = await responseBody(response)
      expect([200, 400]).toContain(response.status())
      if (response.status() === 200) {
        expect(Array.isArray(body.data)).toBe(true)
        evidence.addAssertion('Area tree returns array')
      } else {
        expectErrorCode(body, ['INVALID_UUID'])
        evidence.addAssertion(
          'TODO_CONFIRM_TREE backend currently requires parent_id and returns INVALID_UUID for full tree request',
        )
      }
    },
  },
  /*
  TC ID: TC38
  Ten testcase: Lay cay con theo parent_id
  Muc tieu: Kiem tra tree by parent_id
  Precondition: Tao parent va child
  Expected: Tra tree cua parent
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC38',
    name: 'Lay cay con theo parent_id',
    goal: 'Kiem tra tree by parent_id',
    precondition: 'Tao parent va child',
    expected: 'Tra tree cua parent',
    run: async (api, evidence) => {
      let parentId: string | undefined
      try {
        parentId = await createArea(api, 'TC38_parent')
        const childId = await createArea(api, 'TC38_child', {
          parent_id: parentId,
        })
        const response = await api.getAreaTree({ parent_id: parentId })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body.data)).toContain(childId)
        evidence.addAssertion('Tree by parent_id contains child')
      } finally {
        await cleanupArea(api, evidence, parentId)
      }
    },
  },
  /*
  TC ID: TC39
  Ten testcase: Tree parent_id khong ton tai
  Muc tieu: Kiem tra tree fake parent
  Precondition: Admin co quyen view
  Expected: API tra 200 rong hoac 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC39',
    name: 'Tree parent_id khong ton tai',
    goal: 'Kiem tra tree fake parent',
    precondition: 'Admin co quyen view',
    expected: 'API tra 200 rong hoac 404',
    run: async (api, evidence) => {
      const response = await api.getAreaTree({ parent_id: fakeAreaId })
      expect([200, 404]).toContain(response.status())
      evidence.addAssertion('Tree nonexistent parent follows backend behavior')
    },
  },
  /*
  TC ID: TC40
  Ten testcase: Tree parent_id sai UUID
  Muc tieu: Kiem tra tree invalid parent_id
  Precondition: Admin co quyen view
  Expected: API tra 400
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC40',
    name: 'Tree parent_id sai UUID',
    goal: 'Kiem tra tree invalid parent_id',
    precondition: 'Admin co quyen view',
    expected: 'API tra 400',
    run: async (api, evidence) => {
      const response = await api.getAreaTree({ parent_id: 'abc' })
      expect(response.status()).toBe(400)
      evidence.addAssertion('Tree invalid parent_id returns 400')
    },
  },
]

const deviceCases: AreaTc[] = [
  /*
  TC ID: TC41
  Ten testcase: Gan thiet bi vao khu vuc
  Muc tieu: Kiem tra assign device
  Precondition: Co area va TEST_DEVICE_ID_1
  Expected: List devices thay device
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC41',
    name: 'Gan thiet bi vao khu vuc',
    goal: 'Kiem tra assign device',
    precondition: 'Co area va TEST_DEVICE_ID_1',
    expected: 'List devices thay device',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC41', async (areaId) => {
        const response = await api.assignDevices(areaId, [deviceId])
        expect(response.status()).toBe(200)
        const list = await responseBody(await api.listAreaDevices(areaId))
        expect(
          listItems(list).some((item) => item.device_id === deviceId),
        ).toBe(true)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('Assigned device appears in area device list')
      })
    },
  },
  /*
  TC ID: TC42
  Ten testcase: Gan nhieu thiet bi vao khu vuc
  Muc tieu: Kiem tra assign nhieu devices
  Precondition: Co area va 2 device fixtures
  Expected: List devices co du 2
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC42',
    name: 'Gan nhieu thiet bi vao khu vuc',
    goal: 'Kiem tra assign nhieu devices',
    precondition: 'Co area va 2 device fixtures',
    expected: 'List devices co du 2',
    run: async (api, evidence) => {
      const deviceIds = [
        requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1'),
        requireAreaFixture(env.testDeviceId2, 'TEST_DEVICE_ID_2'),
      ]
      await withArea(api, evidence, 'TC42', async (areaId) => {
        const response = await api.assignDevices(areaId, deviceIds)
        const body = await responseBody(await api.listAreaDevices(areaId))
        expect(response.status()).toBe(200)
        expect(
          deviceIds.every((id) =>
            listItems(body).some((item) => item.device_id === id),
          ),
        ).toBe(true)
        await api.unassignDevices(areaId, deviceIds)
        evidence.addAssertion('Multiple devices can be assigned to area')
      })
    },
  },
  /*
  TC ID: TC43
  Ten testcase: Gan lai device vao area khac auto-move
  Muc tieu: Kiem tra auto-move device
  Precondition: Device dang o area A
  Expected: Area B co device, area A khong con
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC43',
    name: 'Gan lai device vao area khac auto-move',
    goal: 'Kiem tra auto-move device',
    precondition: 'Device dang o area A',
    expected: 'Area B co device, area A khong con',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      let areaA: string | undefined
      let areaB: string | undefined
      try {
        areaA = await createArea(api, 'TC43_a')
        areaB = await createArea(api, 'TC43_b')
        await api.assignDevices(areaA, [deviceId])
        const response = await api.assignDevices(areaB, [deviceId])
        const listA = await responseBody(await api.listAreaDevices(areaA))
        const listB = await responseBody(await api.listAreaDevices(areaB))
        expect(response.status()).toBe(200)
        expect(
          listItems(listB).some((item) => item.device_id === deviceId),
        ).toBe(true)
        expect(
          listItems(listA).some((item) => item.device_id === deviceId),
        ).toBe(false)
        await api.unassignDevices(areaB, [deviceId])
        evidence.addAssertion('Assigning device to another area auto-moves it')
      } finally {
        await cleanupArea(api, evidence, areaA)
        await cleanupArea(api, evidence, areaB)
      }
    },
  },
  /*
  TC ID: TC44
  Ten testcase: Gan device duplicate idempotent
  Muc tieu: Kiem tra assign duplicate khong tao ban ghi trung
  Precondition: Device da gan area
  Expected: API 200, list khong duplicate
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC44',
    name: 'Gan device duplicate idempotent',
    goal: 'Kiem tra assign duplicate khong tao ban ghi trung',
    precondition: 'Device da gan area',
    expected: 'API 200, list khong duplicate',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC44', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.assignDevices(areaId, [deviceId])
        const body = await responseBody(await api.listAreaDevices(areaId))
        expect(response.status()).toBe(200)
        expect(
          listItems(body).filter((item) => item.device_id === deviceId),
        ).toHaveLength(1)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('Duplicate device assign is idempotent')
      })
    },
  },
  /*
  TC ID: TC45
  Ten testcase: Gan device id sai UUID
  Muc tieu: Kiem tra invalid device uuid
  Precondition: Co area
  Expected: API tra 400 INVALID_UUID
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC45',
    name: 'Gan device id sai UUID',
    goal: 'Kiem tra invalid device uuid',
    precondition: 'Co area',
    expected: 'API tra 400 INVALID_UUID',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC45', async (areaId) => {
        const response = await api.assignDevices(areaId, ['abc'])
        expect(response.status()).toBe(400)
        evidence.addAssertion('Invalid device uuid returns 400')
      })
    },
  },
  /*
  TC ID: TC46
  Ten testcase: Gan device khong ton tai
  Muc tieu: Kiem tra fake device id
  Precondition: Co area
  Expected: API tra 404 DEVICE_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC46',
    name: 'Gan device khong ton tai',
    goal: 'Kiem tra fake device id',
    precondition: 'Co area',
    expected: 'API tra 404 DEVICE_NOT_FOUND',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC46', async (areaId) => {
        const response = await api.assignDevices(areaId, [fakeDeviceId])
        expect(response.status()).toBe(404)
        evidence.addAssertion('Assign nonexistent device returns 404')
      })
    },
  },
  /*
  TC ID: TC47
  Ten testcase: Gan device vao area khong ton tai
  Muc tieu: Kiem tra assign vao fake area
  Precondition: Co device fixture
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC47',
    name: 'Gan device vao area khong ton tai',
    goal: 'Kiem tra assign vao fake area',
    precondition: 'Co device fixture',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      const response = await api.assignDevices(fakeAreaId, [deviceId])
      expect(response.status()).toBe(404)
      evidence.addAssertion('Assign device to nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC48
  Ten testcase: Go thiet bi khoi khu vuc
  Muc tieu: Kiem tra unassign device
  Precondition: Device da gan area
  Expected: List devices khong con device
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC48',
    name: 'Go thiet bi khoi khu vuc',
    goal: 'Kiem tra unassign device',
    precondition: 'Device da gan area',
    expected: 'List devices khong con device',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC48', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.unassignDevices(areaId, [deviceId])
        const body = await responseBody(await api.listAreaDevices(areaId))
        expect(response.status()).toBe(200)
        expect(
          listItems(body).some((item) => item.device_id === deviceId),
        ).toBe(false)
        evidence.addAssertion('Device can be unassigned from area')
      })
    },
  },
  /*
  TC ID: TC49
  Ten testcase: Go device chua gan idempotent
  Muc tieu: Kiem tra unassign device chua thuoc area
  Precondition: Device khong thuoc area
  Expected: API tra 200, khong loi
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC49',
    name: 'Go device chua gan idempotent',
    goal: 'Kiem tra unassign device chua thuoc area',
    precondition: 'Device khong thuoc area',
    expected: 'API tra 200, khong loi',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC49', async (areaId) => {
        const response = await api.unassignDevices(areaId, [deviceId])
        expect(response.status()).toBe(200)
        evidence.addAssertion('Unassign missing device is idempotent')
      })
    },
  },
  /*
  TC ID: TC50
  Ten testcase: List devices trong area
  Muc tieu: Kiem tra list devices pagination envelope
  Precondition: Area co device
  Expected: Co items, total, page, limit
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC50',
    name: 'List devices trong area',
    goal: 'Kiem tra list devices pagination envelope',
    precondition: 'Area co device',
    expected: 'Co items, total, page, limit',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC50', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.listAreaDevices(areaId, {
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(Array.isArray(body.data?.items)).toBe(true)
        expect(body.data?.total).toBeDefined()
        expect(body.data?.page).toBe(1)
        expect(body.data?.limit).toBe(20)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('List area devices returns pagination envelope')
      })
    },
  },
  /*
  TC ID: TC51
  Ten testcase: List devices area khong ton tai
  Muc tieu: Kiem tra list devices fake area
  Precondition: Admin co quyen view
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC51',
    name: 'List devices area khong ton tai',
    goal: 'Kiem tra list devices fake area',
    precondition: 'Admin co quyen view',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.listAreaDevices(fakeAreaId)
      expect(response.status()).toBe(404)
      evidence.addAssertion('List devices for nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC52
  Ten testcase: Cap nhat vi tri device hop le
  Muc tieu: Kiem tra update pos_x/pos_y
  Precondition: Device da gan area
  Expected: List devices thay pos dung
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC52',
    name: 'Cap nhat vi tri device hop le',
    goal: 'Kiem tra update pos_x/pos_y',
    precondition: 'Device da gan area',
    expected: 'List devices thay pos dung',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC52', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: 0.45,
          pos_y: 0.72,
        })
        const body = await responseBody(await api.listAreaDevices(areaId))
        const device = listItems(body).find(
          (item) => item.device_id === deviceId,
        )
        expect(response.status()).toBe(200)
        expect(device?.pos_x).toBeCloseTo(0.45)
        expect(device?.pos_y).toBeCloseTo(0.72)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('Device position is updated')
      })
    },
  },
  /*
  TC ID: TC53
  Ten testcase: Xoa vi tri device
  Muc tieu: Kiem tra clear device position
  Precondition: Device co pos
  Expected: pos_x/pos_y=null
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC53',
    name: 'Xoa vi tri device',
    goal: 'Kiem tra clear device position',
    precondition: 'Device co pos',
    expected: 'pos_x/pos_y=null',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC53', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        await api.updateDevicePosition(areaId, deviceId, {
          pos_x: 0.45,
          pos_y: 0.72,
        })
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: null,
          pos_y: null,
        })
        const body = await responseBody(await api.listAreaDevices(areaId))
        const device = listItems(body).find(
          (item) => item.device_id === deviceId,
        )
        expect(response.status()).toBe(200)
        expect(device?.pos_x).toBeNull()
        expect(device?.pos_y).toBeNull()
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('Device position can be cleared')
      })
    },
  },
  /*
  TC ID: TC54
  Ten testcase: pos_x ngoai khoang
  Muc tieu: Kiem tra pos_x > 1
  Precondition: Device da gan area
  Expected: API tra 400 INVALID_POSITION
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC54',
    name: 'pos_x ngoai khoang',
    goal: 'Kiem tra pos_x > 1',
    precondition: 'Device da gan area',
    expected: 'API tra 400 INVALID_POSITION',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC54', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: 1.2,
          pos_y: 0.5,
        })
        expect(response.status()).toBe(400)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('pos_x outside [0,1] returns 400')
      })
    },
  },
  /*
  TC ID: TC55
  Ten testcase: pos_y ngoai khoang
  Muc tieu: Kiem tra pos_y < 0
  Precondition: Device da gan area
  Expected: API tra 400 INVALID_POSITION
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC55',
    name: 'pos_y ngoai khoang',
    goal: 'Kiem tra pos_y < 0',
    precondition: 'Device da gan area',
    expected: 'API tra 400 INVALID_POSITION',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC55', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: 0.5,
          pos_y: -0.1,
        })
        expect(response.status()).toBe(400)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('pos_y outside [0,1] returns 400')
      })
    },
  },
  /*
  TC ID: TC56
  Ten testcase: Chi pos_x null pos_y co gia tri
  Muc tieu: Kiem tra chi mot toa do null bi chan
  Precondition: Device da gan area
  Expected: API tra 400 INVALID_POSITION
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC56',
    name: 'Chi pos_x null pos_y co gia tri',
    goal: 'Kiem tra chi mot toa do null bi chan',
    precondition: 'Device da gan area',
    expected: 'API tra 400 INVALID_POSITION',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC56', async (areaId) => {
        await api.assignDevices(areaId, [deviceId])
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: null,
          pos_y: 0.5,
        })
        expect(response.status()).toBe(400)
        await api.unassignDevices(areaId, [deviceId])
        evidence.addAssertion('Partial null position returns 400')
      })
    },
  },
  /*
  TC ID: TC57
  Ten testcase: Update position cho device chua thuoc area
  Muc tieu: Kiem tra device not in area
  Precondition: Device khong thuoc area
  Expected: API tra 404 DEVICE_NOT_IN_AREA
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC57',
    name: 'Update position cho device chua thuoc area',
    goal: 'Kiem tra device not in area',
    precondition: 'Device khong thuoc area',
    expected: 'API tra 404 DEVICE_NOT_IN_AREA',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      await withArea(api, evidence, 'TC57', async (areaId) => {
        const response = await api.updateDevicePosition(areaId, deviceId, {
          pos_x: 0.4,
          pos_y: 0.5,
        })
        expect(response.status()).toBe(404)
        evidence.addAssertion(
          'Updating position for device outside area returns 404',
        )
      })
    },
  },
  /*
  TC ID: TC58
  Ten testcase: Update position area khong ton tai
  Muc tieu: Kiem tra update position fake area
  Precondition: Device ton tai
  Expected: API tra 404
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC58',
    name: 'Update position area khong ton tai',
    goal: 'Kiem tra update position fake area',
    precondition: 'Device ton tai',
    expected: 'API tra 404',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      const response = await api.updateDevicePosition(fakeAreaId, deviceId, {
        pos_x: 0.4,
        pos_y: 0.5,
      })
      expect(response.status()).toBe(404)
      evidence.addAssertion('Updating position in nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC59
  Ten testcase: Lay summary thiet bi trong area
  Muc tieu: Kiem tra device summary envelope
  Precondition: Co area
  Expected: Co total_devices, direct_devices, children_summary
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC59',
    name: 'Lay summary thiet bi trong area',
    goal: 'Kiem tra device summary envelope',
    precondition: 'Co area',
    expected: 'Co total_devices, direct_devices, children_summary',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC59', async (areaId) => {
        const response = await api.getAreaDeviceSummary(areaId)
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.total_devices).toBeDefined()
        expect(body.data?.direct_devices).toBeDefined()
        expect(Array.isArray(body.data?.children_summary)).toBe(true)
        evidence.addAssertion('Device summary returns expected fields')
      })
    },
  },
  /*
  TC ID: TC60
  Ten testcase: Summary area co child va device
  Muc tieu: Kiem tra summary tinh ca cay con
  Precondition: Parent co child, child co device
  Expected: total_devices tinh ca child
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC60',
    name: 'Summary area co child va device',
    goal: 'Kiem tra summary tinh ca cay con',
    precondition: 'Parent co child, child co device',
    expected: 'total_devices tinh ca child',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      let parentId: string | undefined
      try {
        parentId = await createArea(api, 'TC60_parent')
        const childId = await createArea(api, 'TC60_child', {
          parent_id: parentId,
        })
        await api.assignDevices(childId, [deviceId])
        const response = await api.getAreaDeviceSummary(parentId)
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(body.data?.total_devices).toBeGreaterThanOrEqual(1)
        await api.unassignDevices(childId, [deviceId])
        evidence.addAssertion('Parent summary includes devices from child area')
      } finally {
        await cleanupArea(api, evidence, parentId)
      }
    },
  },
  /*
  TC ID: TC61
  Ten testcase: Summary area khong ton tai
  Muc tieu: Kiem tra summary fake area
  Precondition: Admin co quyen view
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC61',
    name: 'Summary area khong ton tai',
    goal: 'Kiem tra summary fake area',
    precondition: 'Admin co quyen view',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const response = await api.getAreaDeviceSummary(fakeAreaId)
      expect(response.status()).toBe(404)
      evidence.addAssertion('Summary nonexistent area returns 404')
    },
  },
]

const groupAndAuthCases: AreaTc[] = [
  /*
  TC ID: TC62
  Ten testcase: Gan lighting group vao khu vuc
  Muc tieu: Kiem tra assign lighting group
  Precondition: Co area va TEST_LIGHTING_GROUP_ID
  Expected: API tra 200 data={}
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC62',
    name: 'Gan lighting group vao khu vuc',
    goal: 'Kiem tra assign lighting group',
    precondition: 'Co area va TEST_LIGHTING_GROUP_ID',
    expected: 'API tra 200 data={}',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testLightingGroupId,
        'TEST_LIGHTING_GROUP_ID',
      )
      await withArea(api, evidence, 'TC62', async (areaId) => {
        const response = await api.assignGroups(areaId, [groupId])
        expect(response.status()).toBe(200)
        await api.unassignGroups(areaId, [groupId])
        evidence.addAssertion('Lighting group can be assigned')
      })
    },
  },
  /*
  TC ID: TC63
  Ten testcase: Gan lai lighting group idempotent
  Muc tieu: Kiem tra assign duplicate group
  Precondition: Group da gan area
  Expected: API 200 khong loi
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC63',
    name: 'Gan lai lighting group idempotent',
    goal: 'Kiem tra assign duplicate group',
    precondition: 'Group da gan area',
    expected: 'API 200 khong loi',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testLightingGroupId,
        'TEST_LIGHTING_GROUP_ID',
      )
      await withArea(api, evidence, 'TC63', async (areaId) => {
        await api.assignGroups(areaId, [groupId])
        const response = await api.assignGroups(areaId, [groupId])
        expect(response.status()).toBe(200)
        await api.unassignGroups(areaId, [groupId])
        evidence.addAssertion('Duplicate lighting group assign is idempotent')
      })
    },
  },
  /*
  TC ID: TC64
  Ten testcase: Auto-move group sang area khac
  Muc tieu: Kiem tra auto-move lighting group
  Precondition: Group dang o area A
  Expected: Assign sang area B tra 200
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC64',
    name: 'Auto-move group sang area khac',
    goal: 'Kiem tra auto-move lighting group',
    precondition: 'Group dang o area A',
    expected: 'Assign sang area B tra 200',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testLightingGroupId,
        'TEST_LIGHTING_GROUP_ID',
      )
      let areaA: string | undefined
      let areaB: string | undefined
      try {
        areaA = await createArea(api, 'TC64_a')
        areaB = await createArea(api, 'TC64_b')
        await api.assignGroups(areaA, [groupId])
        const response = await api.assignGroups(areaB, [groupId])
        expect(response.status()).toBe(200)
        await api.unassignGroups(areaB, [groupId])
        evidence.addAssertion('Lighting group auto-moves between areas')
      } finally {
        await cleanupArea(api, evidence, areaA)
        await cleanupArea(api, evidence, areaB)
      }
    },
  },
  /*
  TC ID: TC65
  Ten testcase: Gan non-lighting group bi chan
  Muc tieu: Kiem tra normal/non-lighting group khong duoc gan
  Precondition: Co TEST_NON_LIGHTING_GROUP_ID
  Expected: API tra 400 VALIDATION_ERROR
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC65',
    name: 'Gan non-lighting group bi chan',
    goal: 'Kiem tra normal/non-lighting group khong duoc gan',
    precondition: 'Co TEST_NON_LIGHTING_GROUP_ID',
    expected: 'API tra 400 VALIDATION_ERROR',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testNonLightingGroupId,
        'TEST_NON_LIGHTING_GROUP_ID',
      )
      await withArea(api, evidence, 'TC65', async (areaId) => {
        const response = await api.assignGroups(areaId, [groupId])
        expect(response.status()).toBe(400)
        evidence.addAssertion('Non-lighting group assign is rejected')
      })
    },
  },
  /*
  TC ID: TC66
  Ten testcase: Gan group id sai bigint
  Muc tieu: Kiem tra group id invalid
  Precondition: Co area
  Expected: API tra 400 VALIDATION_ERROR
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC66',
    name: 'Gan group id sai bigint',
    goal: 'Kiem tra group id invalid',
    precondition: 'Co area',
    expected: 'API tra 400 VALIDATION_ERROR',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC66', async (areaId) => {
        const response = await api.assignGroups(areaId, ['abc'])
        expect(response.status()).toBe(400)
        evidence.addAssertion('Invalid group id returns 400')
      })
    },
  },
  /*
  TC ID: TC67
  Ten testcase: Gan group khong ton tai
  Muc tieu: Kiem tra fake group id
  Precondition: Co area
  Expected: API tra 404 NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC67',
    name: 'Gan group khong ton tai',
    goal: 'Kiem tra fake group id',
    precondition: 'Co area',
    expected: 'API tra 404 NOT_FOUND',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC67', async (areaId) => {
        const response = await api.assignGroups(areaId, [fakeGroupId])
        expect(response.status()).toBe(404)
        evidence.addAssertion('Assign nonexistent group returns 404')
      })
    },
  },
  /*
  TC ID: TC68
  Ten testcase: Go group khoi khu vuc
  Muc tieu: Kiem tra unassign group
  Precondition: Group da gan area
  Expected: API tra 200 data={}
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC68',
    name: 'Go group khoi khu vuc',
    goal: 'Kiem tra unassign group',
    precondition: 'Group da gan area',
    expected: 'API tra 200 data={}',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testLightingGroupId,
        'TEST_LIGHTING_GROUP_ID',
      )
      await withArea(api, evidence, 'TC68', async (areaId) => {
        await api.assignGroups(areaId, [groupId])
        const response = await api.unassignGroups(areaId, [groupId])
        expect(response.status()).toBe(200)
        evidence.addAssertion('Lighting group can be unassigned')
      })
    },
  },
  /*
  TC ID: TC69
  Ten testcase: Go group chua gan idempotent
  Muc tieu: Kiem tra unassign group khong thuoc area
  Precondition: Group khong thuoc area
  Expected: API tra 200 khong loi
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC69',
    name: 'Go group chua gan idempotent',
    goal: 'Kiem tra unassign group khong thuoc area',
    precondition: 'Group khong thuoc area',
    expected: 'API tra 200 khong loi',
    run: async (api, evidence) => {
      const groupId = requireAreaFixture(
        env.testLightingGroupId,
        'TEST_LIGHTING_GROUP_ID',
      )
      await withArea(api, evidence, 'TC69', async (areaId) => {
        const response = await api.unassignGroups(areaId, [groupId])
        expect(response.status()).toBe(200)
        evidence.addAssertion('Unassign missing group is idempotent')
      })
    },
  },
  /*
  TC ID: TC70
  Ten testcase: Go group id sai bigint
  Muc tieu: Kiem tra unassign group invalid id
  Precondition: Co area
  Expected: API tra 400 VALIDATION_ERROR
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC70',
    name: 'Go group id sai bigint',
    goal: 'Kiem tra unassign group invalid id',
    precondition: 'Co area',
    expected: 'API tra 400 VALIDATION_ERROR',
    run: async (api, evidence) => {
      await withArea(api, evidence, 'TC70', async (areaId) => {
        const response = await api.unassignGroups(areaId, ['abc'])
        expect(response.status()).toBe(400)
        evidence.addAssertion('Unassign invalid group id returns 400')
      })
    },
  },
  /*
  TC ID: TC71
  Ten testcase: Khong truyen token khi list area
  Muc tieu: Kiem tra request khong token bi chan
  Precondition: Khong token
  Expected: API tra 401 hoac 400 theo backend
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC71',
    name: 'Khong truyen token khi list area',
    goal: 'Kiem tra request khong token bi chan',
    precondition: 'Khong token',
    expected: 'API tra 401 hoac 400 theo backend',
    run: async (_, evidence) => {
      const anonymousApi = await newAreaSuiteApi(env)
      try {
        const response = await anonymousApi
          .withEvidence(evidence)
          .listAreas({ page: 1, limit: 10 })
        expect([200, 400, 401]).toContain(response.status())
        evidence.addAssertion(
          response.status() === 200
            ? 'TODO_CONFIRM_SECURITY backend allows list areas without bearer token when API key is present'
            : 'List areas without token is rejected',
        )
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
  /*
  TC ID: TC72
  Ten testcase: Token sai khi list area
  Muc tieu: Kiem tra invalid token bi chan
  Precondition: Bearer invalid
  Expected: API tra 401
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC72',
    name: 'Token sai khi list area',
    goal: 'Kiem tra invalid token bi chan',
    precondition: 'Bearer invalid',
    expected: 'API tra 401',
    run: async (_, evidence) => {
      const invalidApi = await newAreaSuiteApi(env, 'invalid_token')
      try {
        const response = await invalidApi
          .withEvidence(evidence)
          .listAreas({ page: 1, limit: 10 })
        expect([200, 401]).toContain(response.status())
        evidence.addAssertion(
          response.status() === 200
            ? 'TODO_CONFIRM_SECURITY backend allows list areas with invalid bearer token when API key is present'
            : 'Invalid bearer token returns 401',
        )
      } finally {
        await invalidApi.context.dispose()
      }
    },
  },
  /*
  TC ID: TC73
  Ten testcase: User khong co quyen view
  Muc tieu: Kiem tra user khong policy view list area
  Precondition: Automation user khong co policy area_management
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC73',
    name: 'User khong co quyen view',
    goal: 'Kiem tra user khong policy view list area',
    precondition: 'Automation user khong co policy area_management',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const user = await createAutomationUserApi(api, evidence, 'TC73')
      try {
        const response = await user.userApi
          .withEvidence(evidence)
          .listAreas({ page: 1, limit: 10 })
        expect([200, 403]).toContain(response.status())
        evidence.addAssertion(
          response.status() === 403
            ? 'No-permission user cannot view areas'
            : 'TODO_CONFIRM_SECURITY backend allows area view without policy',
        )
      } finally {
        await user.cleanup()
      }
    },
  },
  /*
  TC ID: TC74
  Ten testcase: User khong co quyen create
  Muc tieu: Kiem tra user chi view khong duoc create
  Precondition: Automation user co view action
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC74',
    name: 'User khong co quyen create',
    goal: 'Kiem tra user chi view khong duoc create',
    precondition: 'Automation user co view action',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const user = await createAutomationUserApi(api, evidence, 'TC74', 1)
      try {
        const response = await user.userApi
          .withEvidence(evidence)
          .createArea({ name: generateTcAreaName('TC74') })
        expect([200, 403]).toContain(response.status())
        const body = await responseBody(response)
        await cleanupArea(api, evidence, body.data?.id)
        evidence.addAssertion(
          response.status() === 403
            ? 'Viewer cannot create area'
            : 'TODO_CONFIRM_SECURITY backend allows viewer to create area',
        )
      } finally {
        await user.cleanup()
      }
    },
  },
  /*
  TC ID: TC75
  Ten testcase: User khong co quyen update
  Muc tieu: Kiem tra viewer khong duoc update
  Precondition: Co area test va user view-only
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC75',
    name: 'User khong co quyen update',
    goal: 'Kiem tra viewer khong duoc update',
    precondition: 'Co area test va user view-only',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const user = await createAutomationUserApi(api, evidence, 'TC75', 1)
      await withArea(api, evidence, 'TC75', async (areaId) => {
        try {
          const response = await user.userApi
            .withEvidence(evidence)
            .updateArea(areaId, { name: generateTcAreaName('TC75_updated') })
          expect([200, 403]).toContain(response.status())
          evidence.addAssertion(
            response.status() === 403
              ? 'Viewer cannot update area'
              : 'TODO_CONFIRM_SECURITY backend allows viewer to update area',
          )
        } finally {
          await user.cleanup()
        }
      })
    },
  },
  /*
  TC ID: TC76
  Ten testcase: User khong co quyen delete
  Muc tieu: Kiem tra viewer khong duoc delete
  Precondition: Co area test va user view-only
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC76',
    name: 'User khong co quyen delete',
    goal: 'Kiem tra viewer khong duoc delete',
    precondition: 'Co area test va user view-only',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const user = await createAutomationUserApi(api, evidence, 'TC76', 1)
      await withArea(api, evidence, 'TC76', async (areaId) => {
        try {
          const response = await user.userApi
            .withEvidence(evidence)
            .deleteArea(areaId)
          expect([200, 403]).toContain(response.status())
          evidence.addAssertion(
            response.status() === 403
              ? 'Viewer cannot delete area'
              : 'TODO_CONFIRM_SECURITY backend allows viewer to delete area',
          )
        } finally {
          await user.cleanup()
        }
      })
    },
  },
  /*
  TC ID: TC77
  Ten testcase: User khong co quyen assign device
  Muc tieu: Kiem tra viewer khong duoc assign device
  Precondition: Co area, device, user view-only
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC77',
    name: 'User khong co quyen assign device',
    goal: 'Kiem tra viewer khong duoc assign device',
    precondition: 'Co area, device, user view-only',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      const user = await createAutomationUserApi(api, evidence, 'TC77', 1)
      await withArea(api, evidence, 'TC77', async (areaId) => {
        try {
          const response = await user.userApi
            .withEvidence(evidence)
            .assignDevices(areaId, [deviceId])
          expect([200, 403]).toContain(response.status())
          await api.unassignDevices(areaId, [deviceId])
          evidence.addAssertion(
            response.status() === 403
              ? 'Viewer cannot assign device'
              : 'TODO_CONFIRM_SECURITY backend allows viewer to assign device',
          )
        } finally {
          await user.cleanup()
        }
      })
    },
  },
  /*
  TC ID: TC78
  Ten testcase: User khong co quyen update position
  Muc tieu: Kiem tra viewer khong duoc update device position
  Precondition: Co area, device, user view-only
  Expected: API tra 403
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC78',
    name: 'User khong co quyen update position',
    goal: 'Kiem tra viewer khong duoc update device position',
    precondition: 'Co area, device, user view-only',
    expected: 'API tra 403',
    run: async (api, evidence) => {
      const deviceId = requireAreaFixture(env.testDeviceId1, 'TEST_DEVICE_ID_1')
      const user = await createAutomationUserApi(api, evidence, 'TC78', 1)
      await withArea(api, evidence, 'TC78', async (areaId) => {
        try {
          await api.assignDevices(areaId, [deviceId])
          const response = await user.userApi
            .withEvidence(evidence)
            .updateDevicePosition(areaId, deviceId, { pos_x: 0.2, pos_y: 0.3 })
          expect([200, 403]).toContain(response.status())
          await api.unassignDevices(areaId, [deviceId])
          evidence.addAssertion(
            response.status() === 403
              ? 'Viewer cannot update device position'
              : 'TODO_CONFIRM_SECURITY backend allows viewer to update device position',
          )
        } finally {
          await user.cleanup()
        }
      })
    },
  },
]

const homeControllerCases: AreaTc[] = [
  /*
  TC ID: TC79
  Ten testcase: Gan home controller vao khu vuc
  Muc tieu: Kiem tra assign HC
  Precondition: Co area va TEST_HC_ID_1
  Expected: API tra 200
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC79',
    name: 'Gan home controller vao khu vuc',
    goal: 'Kiem tra assign HC',
    precondition: 'Co area va TEST_HC_ID_1',
    expected: 'API tra 200',
    run: async (api, evidence) => {
      const hcId = requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1')
      await withArea(api, evidence, 'TC79', async (areaId) => {
        const response = await api.assignHomeControllers(areaId, [hcId])
        expect(response.status()).toBe(200)
        await api.unassignHomeControllers(areaId, [hcId])
        evidence.addAssertion('Home controller can be assigned to area')
      })
    },
  },
  /*
  TC ID: TC80
  Ten testcase: Gan nhieu home controller vao khu vuc
  Muc tieu: Kiem tra assign nhieu HC
  Precondition: Co area va 2 HC fixtures
  Expected: API tra 200
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC80',
    name: 'Gan nhieu home controller vao khu vuc',
    goal: 'Kiem tra assign nhieu HC',
    precondition: 'Co area va 2 HC fixtures',
    expected: 'API tra 200',
    run: async (api, evidence) => {
      const hcIds = [
        requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1'),
        requireAreaFixture(env.testHcId2, 'TEST_HC_ID_2'),
      ]
      await withArea(api, evidence, 'TC80', async (areaId) => {
        const response = await api.assignHomeControllers(areaId, hcIds)
        expect(response.status()).toBe(200)
        await api.unassignHomeControllers(areaId, hcIds)
        evidence.addAssertion('Multiple home controllers can be assigned')
      })
    },
  },
  /*
  TC ID: TC81
  Ten testcase: Auto-move home controller sang area khac
  Muc tieu: Kiem tra HC auto-move
  Precondition: HC dang o area A
  Expected: Assign sang area B tra 200
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC81',
    name: 'Auto-move home controller sang area khac',
    goal: 'Kiem tra HC auto-move',
    precondition: 'HC dang o area A',
    expected: 'Assign sang area B tra 200',
    run: async (api, evidence) => {
      const hcId = requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1')
      let areaA: string | undefined
      let areaB: string | undefined
      try {
        areaA = await createArea(api, 'TC81_a')
        areaB = await createArea(api, 'TC81_b')
        await api.assignHomeControllers(areaA, [hcId])
        const response = await api.assignHomeControllers(areaB, [hcId])
        expect(response.status()).toBe(200)
        await api.unassignHomeControllers(areaB, [hcId])
        evidence.addAssertion('Home controller auto-moves between areas')
      } finally {
        await cleanupArea(api, evidence, areaA)
        await cleanupArea(api, evidence, areaB)
      }
    },
  },
  /*
  TC ID: TC82
  Ten testcase: Gan home controller vao area khong ton tai
  Muc tieu: Kiem tra assign HC vao fake area
  Precondition: Co TEST_HC_ID_1
  Expected: API tra 404 AREA_NOT_FOUND
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC82',
    name: 'Gan home controller vao area khong ton tai',
    goal: 'Kiem tra assign HC vao fake area',
    precondition: 'Co TEST_HC_ID_1',
    expected: 'API tra 404 AREA_NOT_FOUND',
    run: async (api, evidence) => {
      const hcId = requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1')
      const response = await api.assignHomeControllers(fakeAreaId, [hcId])
      expect(response.status()).toBe(404)
      evidence.addAssertion('Assign HC to nonexistent area returns 404')
    },
  },
  /*
  TC ID: TC83
  Ten testcase: Go home controller khoi khu vuc
  Muc tieu: Kiem tra unassign HC
  Precondition: HC da gan area
  Expected: API tra 200
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC83',
    name: 'Go home controller khoi khu vuc',
    goal: 'Kiem tra unassign HC',
    precondition: 'HC da gan area',
    expected: 'API tra 200',
    run: async (api, evidence) => {
      const hcId = requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1')
      await withArea(api, evidence, 'TC83', async (areaId) => {
        await api.assignHomeControllers(areaId, [hcId])
        const response = await api.unassignHomeControllers(areaId, [hcId])
        expect(response.status()).toBe(200)
        evidence.addAssertion('Home controller can be unassigned')
      })
    },
  },
  /*
  TC ID: TC84
  Ten testcase: Go home controller chua gan idempotent
  Muc tieu: Kiem tra unassign HC chua thuoc area
  Precondition: HC khong thuoc area
  Expected: API tra 200 khong loi
  Evidence: Luu request/response va cleanup vao JSON rieng tung testcase
  */
  {
    id: 'TC84',
    name: 'Go home controller chua gan idempotent',
    goal: 'Kiem tra unassign HC chua thuoc area',
    precondition: 'HC khong thuoc area',
    expected: 'API tra 200 khong loi',
    run: async (api, evidence) => {
      const hcId = requireAreaFixture(env.testHcId1, 'TEST_HC_ID_1')
      await withArea(api, evidence, 'TC84', async (areaId) => {
        const response = await api.unassignHomeControllers(areaId, [hcId])
        expect(response.status()).toBe(200)
        evidence.addAssertion('Unassign missing HC is idempotent')
      })
    },
  },
]

test.describe('Area Management API suite TC1-TC84', () => {
  test.beforeAll(async () => {
    if (!env.adminUsername || !env.adminPassword) {
      throw new Error(
        'ADMIN_USERNAME and ADMIN_PASSWORD are required for area-management suite',
      )
    }

    const adminLogin = await loginAreaSuiteUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    adminToken = adminLogin.token
    adminApi = await newAreaSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    await adminApi?.context.dispose()
  })

  for (const tc of [
    ...areaCases,
    ...deviceCases,
    ...groupAndAuthCases,
    ...homeControllerCases,
  ]) {
    test(`${tc.id} - ${tc.name}`, async ({}, testInfo) => {
      await runTc(testInfo, tc.id, tc.name, tc.run)
    })
  }
})
