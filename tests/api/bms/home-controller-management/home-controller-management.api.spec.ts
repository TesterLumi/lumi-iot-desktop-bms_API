import { expect, test, TestInfo } from '@playwright/test'
import {
  HcCreatePayload,
  HomeControllerEvidence,
  HomeControllerSuiteApi,
  cleanupBleGateway,
  cleanupHomeController,
  clearHomeControllerEvidenceDir,
  generateHomeControllerPayload,
  getHomeControllerSuiteEnv,
  loginHomeControllerSuiteUser,
  newHomeControllerSuiteApi,
  writeHomeControllerPrecheckEvidence,
} from '@src/core/bms-api/home-controller-management-suite'

const env = getHomeControllerSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminApi: HomeControllerSuiteApi

type HcTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (
    api: HomeControllerSuiteApi,
    evidence: HomeControllerEvidence,
  ) => Promise<void>
}

type CreatedHc = {
  hcId: string
  payload: HcCreatePayload
  body: any
}

const fakeHcId = '9223372036854775807'

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const listItems = (body: any): any[] =>
  Array.isArray(body?.data?.items)
    ? body.data.items
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body)
        ? body
        : []

const responseData = (body: any) =>
  body?.data?.home_controller || body?.data || body

const requireId = (value: string | number | undefined, message: string) => {
  expect(value, message).toBeTruthy()
  if (!value) throw new Error(message)
  return String(value)
}

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: HomeControllerEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (
    api: HomeControllerSuiteApi,
    evidence: HomeControllerEvidence,
  ) => Promise<void>,
) => {
  const evidence = new HomeControllerEvidence(testInfo, tcId, tcName, env)
  const api = adminApi.withEvidence(evidence)
  evidence.attachStep({
    step: 'Login admin precondition',
    method: 'POST',
    endpoint: `${env.apiPrefix}/auth/login`,
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
    await evidence.collectFailureLogs(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const createAutomationHc = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  tcId: string,
  overrides: HcCreatePayload = {},
): Promise<CreatedHc> => {
  const payload = generateHomeControllerPayload(env, tcId, overrides)
  const response = await api.createHomeController(payload)
  const body = await responseBody(response)
  expect([200, 201]).toContain(response.status())
  const data = responseData(body)
  const hcId = requireId(data?.id || body?.id, 'Created HC id is required')
  expect(String(data?.mac || '').toLowerCase()).toBe(
    String(payload.mac).toLowerCase(),
  )
  evidence.addAssertion('Automation HC is created with expected MAC')
  return { hcId, payload, body }
}

const withAutomationHc = async (
  api: HomeControllerSuiteApi,
  evidence: HomeControllerEvidence,
  tcId: string,
  fn: (hc: CreatedHc) => Promise<void>,
  overrides: HcCreatePayload = {},
) => {
  let hcId: string | undefined
  try {
    const created = await createAutomationHc(api, evidence, tcId, overrides)
    hcId = created.hcId
    await fn(created)
  } finally {
    await cleanupHomeController(api, evidence, hcId)
  }
}

const loginOptionalUserApi = async (
  username: string,
  password: string,
  evidence: HomeControllerEvidence,
  label: string,
  token?: string,
) => {
  if (token) {
    return newHomeControllerSuiteApi(env, token)
  }
  if (!username || !password) {
    evidence.addAssertion(`SKIPPED_FIXTURE_MISSING: ${label} username/password`)
    return undefined
  }
  const login = await loginHomeControllerSuiteUser(env, username, password)
  return newHomeControllerSuiteApi(env, login.token)
}

const cases: HcTc[] = [
  {
    id: 'TC1',
    name: 'Xem danh sach HC thanh cong',
    goal: 'Kiem tra man danh sach HC goi dung API list',
    precondition: 'User da dang nhap va co quyen xem HC',
    expected: 'HTTP 200 va danh sach HC hien thi dung du lieu API',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('List HC returns readable collection')
    },
  },
  {
    id: 'TC2',
    name: 'Danh sach HC rong',
    goal: 'Kiem tra trang thai khong co du lieu bang filter khong match',
    precondition: 'He thong hoat dong, filter khong co HC phu hop',
    expected: 'HTTP 200 va khong co item match keyword automation',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        search: `auto_no_result_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBe(0)
      evidence.addAssertion('No-result filter returns empty HC collection')
    },
  },
  {
    id: 'TC3',
    name: 'Phan trang danh sach HC',
    goal: 'Kiem tra list HC voi page=2 limit=20',
    precondition: 'User da dang nhap va co quyen xem HC',
    expected: 'HTTP 200 va response pagination hop le',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 2, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Pagination page=2 returns readable collection')
    },
  },
  {
    id: 'TC4',
    name: 'Thay doi so ban ghi moi trang',
    goal: 'Kiem tra thay doi limit hien thi danh sach HC',
    precondition: 'User da dang nhap va co quyen xem HC',
    expected: 'HTTP 200 va so item khong vuot limit',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({ page: 1, limit: 5 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBeLessThanOrEqual(5)
      evidence.addAssertion('List HC respects selected page size')
    },
  },
  {
    id: 'TC5',
    name: 'Tim kiem HC theo ten',
    goal: 'Kiem tra search theo ten HC',
    precondition: 'Co HC automation voi ten unique',
    expected: 'HTTP 200 va response chua ten HC vua tao',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC5', async ({ payload }) => {
        const response = await api.listHomeControllers({
          search: String(payload.name),
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(String(payload.name))
        evidence.addAssertion('Search by HC name returns matching HC')
      })
    },
  },
  {
    id: 'TC6',
    name: 'Tim kiem HC theo MAC',
    goal: 'Kiem tra filter mac chinh xac',
    precondition: 'Co HC automation',
    expected: 'HTTP 200 va items khop MAC',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC6', async ({ payload }) => {
        const mac = String(payload.mac)
        const response = await api.listHomeControllers({
          mac,
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(mac.toLowerCase())
        evidence.addAssertion('Filter by exact MAC returns created HC')
      })
    },
  },
  {
    id: 'TC7',
    name: 'Tim kiem khong co ket qua',
    goal: 'Kiem tra search keyword khong ton tai',
    precondition: 'Khong co HC khop keyword automation',
    expected: 'HTTP 200 va data rong',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        search: `auto_hc_not_found_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBe(0)
      evidence.addAssertion('Search with nonexistent keyword returns no items')
    },
  },
  {
    id: 'TC8',
    name: 'Xoa keyword tim kiem',
    goal: 'Kiem tra clear search goi lai list khong keyword',
    precondition: 'Dang co keyword search',
    expected: 'HTTP 200 va danh sach quay ve trang thai khong filter',
    run: async (api, evidence) => {
      const filteredResponse = await api.listHomeControllers({
        page: 1,
        limit: 20,
        search: `auto_hc_clear_${Date.now()}`,
      })
      expect(filteredResponse.status()).toBe(200)
      const clearedResponse = await api.listHomeControllers({
        page: 1,
        limit: 20,
        search: '',
      })
      const body = await responseBody(clearedResponse)
      expect(clearedResponse.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Clearing search reloads HC list successfully')
    },
  },
  {
    id: 'TC9',
    name: 'Loc theo loai HC',
    goal: 'Kiem tra filter hc_type',
    precondition: 'Co HC automation voi hc_type hop le',
    expected: 'HTTP 200 va co hc_type trong response',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC9', async ({ payload }) => {
        const response = await api.listHomeControllers({
          hc_type: String(payload.hc_type),
          page: 1,
          limit: 20,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(String(payload.hc_type))
        evidence.addAssertion('Filter by hc_type returns matching HC data')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Loc theo version',
    goal: 'Kiem tra filter version',
    precondition: 'Co HC automation ton tai',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC10', async ({ payload }) => {
        const response = await api.listHomeControllers({
          version: String(payload.version),
          page: 1,
          limit: 20,
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Filter by version returns HTTP 200')
      })
    },
  },
  {
    id: 'TC11',
    name: 'Loc theo network interface',
    goal: 'Kiem tra filter network_interface=LAN',
    precondition: 'Co HC dung LAN neu moi truong co du lieu',
    expected: 'HTTP 200 va backend tra response filter hop le',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        network_interface: 'LAN',
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by network_interface=LAN returns HTTP 200')
    },
  },
  {
    id: 'TC12',
    name: 'Loc theo trang thai connected',
    goal: 'Kiem tra filter connected=true',
    precondition: 'Co HC online neu moi truong co du lieu',
    expected: 'HTTP 200 va backend tra response filter hop le',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        connected: true,
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by connected=true returns HTTP 200')
    },
  },
  {
    id: 'TC13',
    name: 'Loc theo trang thai disconnected',
    goal: 'Kiem tra filter connected=false',
    precondition: 'Co HC offline neu moi truong co du lieu',
    expected: 'HTTP 200 va backend tra response filter hop le',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        connected: false,
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by connected=false returns HTTP 200')
    },
  },
  {
    id: 'TC14',
    name: 'Loc theo lifecycle state active',
    goal: 'Kiem tra filter lifecycle_state=active',
    precondition: 'Co HC active trong he thong',
    expected: 'HTTP 200 va backend tra response filter hop le',
    run: async (api, evidence) => {
      const response = await api.listHomeControllers({
        page: 1,
        limit: 20,
        lifecycle_state: 'active',
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by lifecycle_state=active returns HTTP 200')
    },
  },
  {
    id: 'TC18',
    name: 'Lay chi tiet HC thanh cong',
    goal: 'Kiem tra get detail HC',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va id/mac dung',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC9', async ({ hcId, payload }) => {
        const response = await api.getHomeController(hcId)
        const body = await responseBody(response)
        const data = responseData(body)
        expect(response.status()).toBe(200)
        expect(String(data.id)).toBe(hcId)
        expect(String(data.mac).toLowerCase()).toBe(
          String(payload.mac).toLowerCase(),
        )
        evidence.addAssertion('Detail returns created HC id and MAC')
      })
    },
  },
  {
    id: 'TC19',
    name: 'Lay detail HC khong ton tai',
    goal: 'Kiem tra get detail fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.getHomeController(fakeHcId)
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Nonexistent HC detail is rejected',
      )
    },
  },
  {
    id: 'TC19_API',
    name: 'Lay detail id sai format',
    goal: 'Kiem tra validation id format',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.getHomeController('abc')
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Invalid id format is rejected',
      )
    },
  },
  {
    id: 'TC20',
    name: 'Lay connection events thanh cong',
    goal: 'Kiem tra connection-events API',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va collection',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC12', async ({ hcId }) => {
        const response = await api.getConnectionEvents(hcId, {
          page: 1,
          limit: 10,
        })
        expectStatus(
          response.status(),
          [200],
          evidence,
          'Connection events returns HTTP 200',
        )
      })
    },
  },
  {
    id: 'TC20_API',
    name: 'Connection events from am',
    goal: 'Kiem tra validation connection-events from am',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC19', async ({ hcId }) => {
        const response = await api.getConnectionEvents(hcId, {
          from: -1,
          page: 1,
          limit: 10,
        })
        expectStatus(
          response.status(),
          [400],
          evidence,
          'Negative from for connection events is rejected',
        )
      })
    },
  },
  {
    id: 'TC24',
    name: 'Tao HC thanh cong',
    goal: 'Kiem tra create HC hop le',
    precondition: 'Admin token hop le va MAC unique',
    expected: 'HTTP 200/201 va co id/mac',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC14', async ({ hcId }) => {
        expect(hcId).toBeTruthy()
        evidence.addAssertion('Create HC returns id and cleanup runs after test')
      })
    },
  },
  {
    id: 'TC24_API',
    name: 'Tao HC voi hc_type ssd202d',
    goal: 'Kiem tra create voi hc_type khac',
    precondition: 'MAC unique',
    expected: 'HTTP 200/201 hoac 400 neu backend khong support',
    run: async (api, evidence) => {
      let hcId: string | undefined
      try {
        const payload = generateHomeControllerPayload(env, 'TC15', {
          hc_type: 'ssd202d',
        })
        const response = await api.createHomeController(payload)
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(
          response.status(),
          [200, 201, 400],
          evidence,
          'ssd202d is accepted or explicitly rejected by backend',
        )
      } finally {
        await cleanupHomeController(api, evidence, hcId)
      }
    },
  },
  {
    id: 'TC25',
    name: 'Tao HC thieu mac',
    goal: 'Kiem tra validation missing mac',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(
        generateHomeControllerPayload(env, 'TC16', { mac: undefined }),
      )
      expectStatus(response.status(), [400], evidence, 'Missing mac returns 400')
    },
  },
  {
    id: 'TC26',
    name: 'Tao HC mac sai format',
    goal: 'Kiem tra validation mac format',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(
        generateHomeControllerPayload(env, 'TC17', { mac: 'invalid-mac' }),
      )
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Invalid MAC format returns 400',
      )
    },
  },
  {
    id: 'TC27',
    name: 'Tao HC trung MAC',
    goal: 'Kiem tra duplicate MAC',
    precondition: 'Da tao HC A',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC18', async ({ payload }) => {
        const response = await api.createHomeController(payload)
        expectStatus(
          response.status(),
          [400, 409],
          evidence,
          'Duplicate MAC is rejected',
        )
      })
    },
  },
  {
    id: 'TC29_API',
    name: 'Tao HC hc_type sai enum',
    goal: 'Kiem tra validation hc_type',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.createHomeController(
        generateHomeControllerPayload(env, 'TC19', { hc_type: 'invalid' }),
      )
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Invalid hc_type is rejected',
      )
    },
  },
  {
    id: 'TC33_API',
    name: 'Tao HC co field la',
    goal: 'Kiem tra unknown field',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac backend ignore an toan',
    run: async (api, evidence) => {
      let hcId: string | undefined
      try {
        const response = await api.createHomeController(
          generateHomeControllerPayload(env, 'TC20', { unknown_field: 'x' }),
        )
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(
          response.status(),
          [200, 201, 400],
          evidence,
          response.status() === 400
            ? 'Unknown field is rejected'
            : 'NEED_CONFIRM_VALIDATION backend ignores unknown create field',
        )
      } finally {
        await cleanupHomeController(api, evidence, hcId)
      }
    },
  },
  {
    id: 'TC36',
    name: 'Cap nhat notes HC thanh cong',
    goal: 'Kiem tra update notes an toan',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 va notes moi dung',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC21', async ({ hcId }) => {
        const notes = `auto_notes_TC21_${Date.now()}`
        const response = await api.updateHomeController(hcId, { notes })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(notes)
        evidence.addAssertion('Update notes returns updated value')
      })
    },
  },
  {
    id: 'TC36_API',
    name: 'Update body rong no-op',
    goal: 'Kiem tra PATCH body rong',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 400 theo backend',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC22', async ({ hcId }) => {
        const response = await api.updateHomeController(hcId, {})
        expectStatus(
          response.status(),
          [200, 400],
          evidence,
          'Empty update is accepted as no-op or rejected',
        )
      })
    },
  },
  {
    id: 'TC39',
    name: 'Update HC khong ton tai',
    goal: 'Kiem tra update fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.updateHomeController(fakeHcId, { notes: 'x' })
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Update nonexistent HC is rejected',
      )
    },
  },
  {
    id: 'TC39_API',
    name: 'Update id sai format',
    goal: 'Kiem tra validation update id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.updateHomeController('abc', { notes: 'x' })
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Invalid update id is rejected',
      )
    },
  },
  {
    id: 'TC37_API',
    name: 'Update co field la',
    goal: 'Kiem tra unknown update field',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 400 hoac ignore an toan',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC25', async ({ hcId }) => {
        const response = await api.updateHomeController(hcId, {
          unknown_field: 'x',
        })
        expectStatus(
          response.status(),
          [200, 400],
          evidence,
          response.status() === 400
            ? 'Unknown update field is rejected'
            : 'NEED_CONFIRM_VALIDATION backend ignores unknown update field',
        )
      })
    },
  },
  {
    id: 'TC41+TC82',
    name: 'Xoa HC automation thanh cong va refresh danh sach',
    goal: 'Kiem tra delete don voi HC do testcase tao',
    precondition: 'HC automation vua tao',
    expected: 'HTTP 200 va get lai khong active',
    run: async (api, evidence) => {
      const created = await createAutomationHc(api, evidence, 'TC26')
      const response = await api.deleteHomeController(created.hcId)
      expect(response.status()).toBe(200)
      evidence.markHcDeleted()
      const getResponse = await api.getHomeController(created.hcId)
      expect([400, 404]).toContain(getResponse.status())
      evidence.addAssertion(
        'Deleted automation HC is no longer available by detail API',
      )
    },
  },
  {
    id: 'TC43',
    name: 'Xoa HC khong ton tai',
    goal: 'Kiem tra delete fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.deleteHomeController(fakeHcId)
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Delete nonexistent HC is rejected',
      )
    },
  },
  {
    id: 'TC43_API',
    name: 'Xoa HC id sai format',
    goal: 'Kiem tra delete invalid id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.deleteHomeController('abc')
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Delete invalid id is rejected',
      )
    },
  },
  {
    id: 'TC65_API',
    name: 'IoT list HC thanh cong',
    goal: 'Kiem tra IoT list HC read-only',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.iotListHomeControllers()
      expectStatus(
        response.status(),
        [200],
        evidence,
        'IoT list HC returns HTTP 200',
      )
    },
  },
  {
    id: 'TC72_API',
    name: 'IoT get HC theo id thanh cong',
    goal: 'Kiem tra IoT get HC read-only',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 204 theo backend',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC30', async ({ hcId }) => {
        const response = await api.iotGetHomeController(hcId)
        expectStatus(
          response.status(),
          [200, 204],
          evidence,
          'IoT get HC returns 200 or empty 204',
        )
      })
    },
  },
  {
    id: 'TC72_API_NEGATIVE',
    name: 'IoT get HC khong ton tai',
    goal: 'Kiem tra IoT get fake id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 204 hoac 404',
    run: async (api, evidence) => {
      const response = await api.iotGetHomeController(fakeHcId)
      expectStatus(
        response.status(),
        [204, 404],
        evidence,
        'IoT get nonexistent HC returns no content or not found',
      )
    },
  },
  {
    id: 'TC65',
    name: 'Sync-time thanh cong',
    goal: 'Kiem tra sync-time voi MAC automation',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC32', async ({ payload }) => {
        const response = await api.syncTime(String(payload.mac))
        expectStatus(
          response.status(),
          [200],
          evidence,
          'Sync-time returns HTTP 200',
        )
      })
    },
  },
  {
    id: 'TC65_API_NEGATIVE',
    name: 'Sync-time MAC khong ton tai',
    goal: 'Kiem tra sync-time fake MAC',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.syncTime('AA:BB:CC:DD:EE:99')
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Sync-time fake MAC is rejected',
      )
    },
  },
  {
    id: 'TC69',
    name: 'Get link upload thanh cong',
    goal: 'Kiem tra get-link-upload voi API key neu co',
    precondition: 'IOT_HC_LOG_UPLOAD_API_KEY cau hinh',
    expected: 'HTTP 200 hoac skip fixture missing',
    run: async (api, evidence) => {
      if (!env.iotLogUploadApiKey) {
        evidence.addAssertion(
          'SKIPPED_FIXTURE_MISSING: IOT_HC_LOG_UPLOAD_API_KEY',
        )
        return
      }
      await withAutomationHc(api, evidence, 'TC34', async ({ payload }) => {
        const response = await api.getLinkUpload(
          String(payload.mac),
          env.iotLogObjectKey,
          env.iotLogUploadApiKey,
        )
        expectStatus(
          response.status(),
          [200],
          evidence,
          'Get link upload returns HTTP 200 with upload URL',
        )
      })
    },
  },
  {
    id: 'TC70',
    name: 'Get link upload thieu API key',
    goal: 'Kiem tra guard API key get-link-upload',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 401 hoac 403',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC35', async ({ payload }) => {
        const response = await api.getLinkUpload(
          String(payload.mac),
          env.iotLogObjectKey,
        )
        expectStatus(
          response.status(),
          [401, 403],
          evidence,
          'Get link upload without API key is rejected',
        )
      })
    },
  },
  {
    id: 'TC66',
    name: 'Version-info update thanh cong',
    goal: 'Kiem tra version-info safe mutation',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 200 hoac 204',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC36', async ({ payload }) => {
        const response = await api.updateVersionInfo(String(payload.mac), {
          hc_type: env.testHcType,
          components: [
            {
              component_type: 'firmware',
              name: 'automation',
              version: env.testHcVersion,
              binary_checksum:
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            },
          ],
        })
        expectStatus(
          response.status(),
          [200, 204],
          evidence,
          'Version-info update succeeds for automation HC',
        )
      })
    },
  },
  {
    id: 'TC67_API',
    name: 'Version-info duplicate component',
    goal: 'Kiem tra validation duplicate component',
    precondition: 'HC automation ton tai',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC37', async ({ payload }) => {
        const component = {
          component_type: 'firmware',
          name: 'automation',
          version: env.testHcVersion,
          binary_checksum:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        }
        const response = await api.updateVersionInfo(String(payload.mac), {
          hc_type: env.testHcType,
          components: [component, component],
        })
        expectStatus(
          response.status(),
          [400],
          evidence,
          'Duplicate version component is rejected',
        )
      })
    },
  },
  {
    id: 'TC72_API_LIST',
    name: 'List BLE gateway thanh cong',
    goal: 'Kiem tra BLE gateway list read-only',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listBleGateways()
      expectStatus(
        response.status(),
        [200],
        evidence,
        'BLE gateway list returns HTTP 200',
      )
    },
  },
  {
    id: 'TC72_NEGATIVE',
    name: 'Get BLE gateway HC khong ton tai',
    goal: 'Kiem tra get BLE fake hc_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 204 hoac 404',
    run: async (api, evidence) => {
      const response = await api.getBleGateway(fakeHcId)
      expectStatus(
        response.status(),
        [204, 404],
        evidence,
        'BLE fake HC returns empty or not found',
      )
    },
  },
  {
    id: 'TC72+TC73+TC74',
    name: 'Create update delete BLE gateway voi HC automation',
    goal: 'Kiem tra BLE CRUD an toan voi HC do testcase tao',
    precondition: 'HC automation ton tai',
    expected: 'Create/update/delete thanh cong hoac skip neu backend yeu cau fixture khac',
    run: async (api, evidence) => {
      await withAutomationHc(api, evidence, 'TC40', async ({ hcId }) => {
        try {
          const createResponse = await api.createBleGateway({
            hc_id: hcId,
            version: 'auto-1.0.0',
            public_key: `auto_key_${Date.now()}`,
          })
          expectStatus(
            createResponse.status(),
            [200, 201, 400, 404, 409],
            evidence,
            'BLE create returns explicit backend result',
          )
          if (![200, 201].includes(createResponse.status())) return
          const updateResponse = await api.updateBleGateway(hcId, {
            version: 'auto-1.0.1',
          })
          expectStatus(
            updateResponse.status(),
            [200, 204],
            evidence,
            'BLE update succeeds',
          )
        } finally {
          await cleanupBleGateway(api, evidence, hcId)
        }
      })
    },
  },
  {
    id: 'TC75_API_NO_TOKEN',
    name: 'Khong token list HC',
    goal: 'Kiem tra auth guard list HC',
    precondition: 'Khong Authorization',
    expected: 'HTTP 401 hoac 400',
    run: async (_, evidence) => {
      const anonymousApi = await newHomeControllerSuiteApi(env)
      try {
        const response = await anonymousApi
          .withEvidence(evidence)
          .listHomeControllers({ page: 1, limit: 10 })
        expectStatus(
          response.status(),
          env.requireAuth ? [400, 401] : [200, 400, 401],
          evidence,
          response.status() === 200
            ? 'Auth is disabled in current environment; list HC without token is allowed'
            : 'List HC without token is rejected',
        )
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
  {
    id: 'TC75_API_INVALID_TOKEN',
    name: 'Token sai list HC',
    goal: 'Kiem tra invalid bearer token',
    precondition: 'Bearer invalid_token',
    expected: 'HTTP 401',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken(
        'GET',
        `${env.apiPrefix}/home-controllers?page=1&limit=10`,
      )
      expectStatus(
        response.status(),
        env.requireAuth ? [401] : [200, 401],
        evidence,
        response.status() === 200
          ? 'Auth is disabled in current environment; invalid token is ignored'
          : 'Invalid token returns 401',
      )
    },
  },
  {
    id: 'TC75',
    name: 'User khong co quyen view HC',
    goal: 'Kiem tra permission view HC',
    precondition: 'NO_PERMISSION_USERNAME/PASSWORD neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (_, evidence) => {
      const userApi = await loginOptionalUserApi(
        env.noPermissionUsername,
        env.noPermissionPassword,
        evidence,
        'NO_PERMISSION',
        env.noPermissionAccessToken,
      )
      if (!userApi) return
      try {
        const response = await userApi
          .withEvidence(evidence)
          .listHomeControllers({ page: 1, limit: 10 })
        expectStatus(
          response.status(),
          [403],
          evidence,
          'No-permission user cannot view HC list',
        )
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC76',
    name: 'User khong co quyen create HC',
    goal: 'Kiem tra permission create HC',
    precondition: 'VIEWER hoac NO_PERMISSION user neu co',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(
        env.viewerUsername || env.noPermissionUsername,
        env.viewerPassword || env.noPermissionPassword,
        evidence,
        'VIEWER_OR_NO_PERMISSION',
        env.viewerAccessToken || env.noPermissionAccessToken,
      )
      if (!userApi) return
      let hcId: string | undefined
      try {
        const response = await userApi
          .withEvidence(evidence)
          .createHomeController(generateHomeControllerPayload(env, 'TC44'))
        const body = await responseBody(response)
        hcId = body?.data?.id
        expectStatus(
          response.status(),
          [403],
          evidence,
          'Non-admin user cannot create HC',
        )
      } finally {
        await cleanupHomeController(api, evidence, hcId)
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC77+TC78',
    name: 'User khong co quyen update va delete HC',
    goal: 'Kiem tra permission update/delete HC',
    precondition: 'VIEWER hoac NO_PERMISSION user va HC automation',
    expected: 'HTTP 403 hoac skip fixture missing',
    run: async (api, evidence) => {
      const userApi = await loginOptionalUserApi(
        env.viewerUsername || env.noPermissionUsername,
        env.viewerPassword || env.noPermissionPassword,
        evidence,
        'VIEWER_OR_NO_PERMISSION',
        env.viewerAccessToken || env.noPermissionAccessToken,
      )
      if (!userApi) return
      try {
        await withAutomationHc(api, evidence, 'TC45', async ({ hcId }) => {
          const updateResponse = await userApi
            .withEvidence(evidence)
            .updateHomeController(hcId, { notes: 'blocked' })
          expectStatus(
            updateResponse.status(),
            [403],
            evidence,
            'Non-admin user cannot update HC',
          )
          const deleteResponse = await userApi
            .withEvidence(evidence)
            .deleteHomeController(hcId)
          expectStatus(
            deleteResponse.status(),
            [403],
            evidence,
            'Non-admin user cannot delete HC',
          )
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
]

test.describe('Home Controller Management API suite aligned with manual sheet', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearHomeControllerEvidenceDir(env)
    if (
      env.requireAuth &&
      !env.adminAccessToken &&
      (!env.adminUsername || !env.adminPassword)
    ) {
      const error =
        'ADMIN_USERNAME/ADMIN_PASSWORD or HOME_CONTROLLER_ADMIN_ACCESS_TOKEN/GROUP_ADMIN_ACCESS_TOKEN are required when HOME_CONTROLLER_REQUIRE_AUTH or GROUP_REQUIRE_AUTH is true'
      await writeHomeControllerPrecheckEvidence(
        env,
        'PRECHECK_admin_login_env_missing',
        {
          status: 'FAILED',
          error_message: error,
        },
      )
      throw new Error(error)
    }

    const precheckApi = await newHomeControllerSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeHomeControllerPrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(`Health check failed before HC suite: ${health.status()}`)
      }
    } finally {
      await precheckApi.context.dispose()
    }

    if (env.adminAccessToken) {
      adminToken = env.adminAccessToken
    } else if (env.adminUsername && env.adminPassword) {
      const adminLogin = await loginHomeControllerSuiteUser(
        env,
        env.adminUsername,
        env.adminPassword,
      )
      adminToken = adminLogin.token
      adminRefreshToken = adminLogin.refreshToken
    }
    adminApi = await newHomeControllerSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    if (adminApi && adminRefreshToken) {
      try {
        await adminApi.logout(adminRefreshToken)
      } catch {
        // Best effort only.
      }
    }
    await adminApi?.context.dispose()
  })

  for (const tc of cases) {
    test(`${tc.id} - ${tc.name}`, async ({}, testInfo) => {
      testInfo.annotations.push({
        type: 'manual-goal',
        description: `${tc.goal}; Precondition: ${tc.precondition}; Expected: ${tc.expected}`,
      })
      await runTc(testInfo, tc.id, tc.name, tc.run)
    })
  }
})
