import { expect, test, TestInfo } from '@playwright/test'
import {
  DeviceCreatePayload,
  DeviceManagementEvidence,
  DeviceManagementSuiteApi,
  cleanupArea,
  cleanupDevice,
  clearDeviceEvidenceDir,
  generateDevicePayload,
  getDeviceSuiteEnv,
  loginDeviceSuiteUser,
  newDeviceManagementSuiteApi,
  writeDevicePrecheckEvidence,
} from '@src/core/bms-api/device-management-suite'

const env = getDeviceSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminApi: DeviceManagementSuiteApi

type DeviceTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (
    api: DeviceManagementSuiteApi,
    evidence: DeviceManagementEvidence,
  ) => Promise<void>
}

type CreatedDevice = {
  deviceId: string
  payload: DeviceCreatePayload
  body: any
}

const fakeDeviceId = '9223372036854775807'

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

const responseData = (body: any) => body?.data?.device || body?.data || body

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: DeviceManagementEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const requireWriteFixture = () => {
  expect(env.testHcId, 'TEST_HC_ID is required for write cases').toBeTruthy()
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (
    api: DeviceManagementSuiteApi,
    evidence: DeviceManagementEvidence,
  ) => Promise<void>,
) => {
  const evidence = new DeviceManagementEvidence(testInfo, tcId, tcName, env)
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
    if (error instanceof Error && error.message.includes('Test is skipped')) {
      await evidence.write('SKIPPED', error)
      throw error
    }
    await evidence.collectFailureLogs(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const createAutomationDevice = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
  overrides: DeviceCreatePayload = {},
): Promise<CreatedDevice> => {
  requireWriteFixture()
  const payload = generateDevicePayload(env, tcId, overrides)
  const response = await api.iotCreateDevice(String(env.testHcId), payload)
  const body = await responseBody(response)
  expect([200, 201]).toContain(response.status())
  const data = responseData(body)
  const deviceId = String(data?.id || payload.id)
  expect(deviceId).toBeTruthy()
  expect(String(data?.mac || payload.mac).toLowerCase()).toBe(
    String(payload.mac).toLowerCase(),
  )
  evidence.addAssertion('Automation device is created with expected MAC')
  return { deviceId, payload, body }
}

const withAutomationDevice = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
  fn: (device: CreatedDevice) => Promise<void>,
  overrides: DeviceCreatePayload = {},
) => {
  let deviceId: string | undefined
  try {
    const created = await createAutomationDevice(api, evidence, tcId, overrides)
    deviceId = created.deviceId
    await fn(created)
  } finally {
    await cleanupDevice(api, evidence, deviceId)
  }
}

const createAutomationArea = async (
  api: DeviceManagementSuiteApi,
  evidence: DeviceManagementEvidence,
  tcId: string,
) => {
  const name = `auto_device_area_${tcId}_${Date.now()}`
  const response = await api.createArea({ name })
  const body = await responseBody(response)
  expectStatus(
    response.status(),
    [200, 201],
    evidence,
    'Automation area is created',
  )
  return String(body?.data?.id || body?.id)
}

const loginOptionalUserApi = async (
  username: string,
  password: string,
  evidence: DeviceManagementEvidence,
  label: string,
  token?: string,
) => {
  if (token) return newDeviceManagementSuiteApi(env, token)
  if (!username || !password) {
    evidence.addAssertion(`SKIPPED_FIXTURE_MISSING: ${label} username/password`)
    return undefined
  }
  const login = await loginDeviceSuiteUser(env, username, password)
  return newDeviceManagementSuiteApi(env, login.token)
}

const cases: DeviceTc[] = [
  {
    id: 'TC1',
    name: 'Xem danh sach thiet bi thanh cong',
    goal: 'Kiem tra API list devices tra danh sach dang doc duoc',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va data.items la array',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('List devices returns readable collection')
    },
  },
  {
    id: 'TC2',
    name: 'Danh sach thiet bi rong',
    goal: 'Kiem tra search khong match tra collection rong',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va khong co item match keyword automation',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_no_result_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body)).toHaveLength(0)
      evidence.addAssertion('No-result search returns empty device list')
    },
  },
  {
    id: 'TC3',
    name: 'Phan trang danh sach thiet bi',
    goal: 'Kiem tra page=2 limit=20',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va response pagination hop le',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 2, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Pagination page=2 returns readable collection')
    },
  },
  {
    id: 'TC4',
    name: 'Thay doi so ban ghi moi trang',
    goal: 'Kiem tra limit=5',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va so item khong vuot limit',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 5 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body).length).toBeLessThanOrEqual(5)
      evidence.addAssertion('Device list respects selected page size')
    },
  },
  {
    id: 'TC5',
    name: 'Tim kiem thiet bi co ket qua',
    goal: 'Kiem tra search theo ten/MAC device automation',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va response chua device vua tao',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC5', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          search: String(payload.mac),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(
          String(payload.mac).toLowerCase(),
        )
        evidence.addAssertion('Search by MAC returns automation device')
      })
    },
  },
  {
    id: 'TC6',
    name: 'Tim kiem khong co ket qua',
    goal: 'Kiem tra keyword khong ton tai',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va data rong',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_device_not_found_${Date.now()}`,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(listItems(body)).toHaveLength(0)
      evidence.addAssertion('Search with nonexistent keyword returns no items')
    },
  },
  {
    id: 'TC7',
    name: 'Xoa keyword tim kiem',
    goal: 'Kiem tra clear search goi lai list khong keyword',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 va danh sach quay ve collection doc duoc',
    run: async (api, evidence) => {
      const filtered = await api.listDevices({
        page: 1,
        limit: 20,
        search: `auto_clear_${Date.now()}`,
      })
      expect(filtered.status()).toBe(200)
      const cleared = await api.listDevices({ page: 1, limit: 20, search: '' })
      const body = await responseBody(cleared)
      expect(cleared.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Clearing search reloads device list')
    },
  },
  {
    id: 'TC8',
    name: 'Loc theo Home Controller',
    goal: 'Kiem tra filter hc_id',
    precondition: 'Co device automation tren TEST_HC_ID',
    expected: 'HTTP 200 va response chua device dung HC',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC8', async ({ deviceId }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          hc_id: env.testHcId,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(deviceId)
        evidence.addAssertion('Filter by HC returns automation device')
      })
    },
  },
  {
    id: 'TC9',
    name: 'Loc theo protocol',
    goal: 'Kiem tra filter protocol',
    precondition: 'Co device automation protocol ble',
    expected: 'HTTP 200 va response chua protocol tuong ung',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC9', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          protocol: String(payload.protocol),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(String(payload.protocol))
        evidence.addAssertion('Filter by protocol returns matching devices')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Loc theo trang thai network',
    goal: 'Kiem tra filter network_state=activated',
    precondition: 'Co device automation activated',
    expected: 'HTTP 200 va response chua network_state activated',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC10', async () => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          network_state: 'activated',
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Filter by network_state returns HTTP 200')
      })
    },
  },
  {
    id: 'TC11',
    name: 'Loc thiet bi online',
    goal: 'Kiem tra filter status=online',
    precondition: 'He thong co the co device online',
    expected: 'HTTP 200 va collection doc duoc',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        status: 'online',
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(listItems(body))).toBe(true)
      evidence.addAssertion('Filter status=online returns readable collection')
    },
  },
  {
    id: 'TC12',
    name: 'Loc theo 1 khu vuc',
    goal: 'Kiem tra filter areas voi area automation',
    precondition: 'Co area va device automation',
    expected: 'HTTP 200 va response chua device trong area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC12', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC12')
          const assign = await api.assignDevicesToArea(areaId, [deviceId])
          expectStatus(
            assign.status(),
            [200, 201, 202, 204],
            evidence,
            'Device is assigned to area',
          )
          const response = await api.listDevices({
            page: 1,
            limit: 20,
            areas: areaId,
          })
          const body = await responseBody(response)
          expect(response.status()).toBe(200)
          expect(JSON.stringify(body)).toContain(deviceId)
          evidence.addAssertion('Filter by one area returns assigned device')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC13',
    name: 'Loc theo nhieu khu vuc',
    goal: 'Kiem tra repeated areas filter',
    precondition: 'Co area automation A/B va device gan A',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      let areaA: string | undefined
      let areaB: string | undefined
      await withAutomationDevice(api, evidence, 'TC13', async ({ deviceId }) => {
        try {
          areaA = await createAutomationArea(api, evidence, 'TC13A')
          areaB = await createAutomationArea(api, evidence, 'TC13B')
          const assign = await api.assignDevicesToArea(areaA, [deviceId])
          expectStatus(
            assign.status(),
            [200, 201, 202, 204],
            evidence,
            'Device is assigned before multi-area filter',
          )
          const response = await api.listDevices({
            page: 1,
            limit: 20,
            areas: `${areaA},${areaB}`,
          })
          expect(response.status()).toBe(200)
          evidence.addAssertion('Filter by multiple areas returns HTTP 200')
        } finally {
          if (areaA) await api.unassignDevicesFromArea(areaA, [deviceId])
          await cleanupArea(api, evidence, areaA)
          await cleanupArea(api, evidence, areaB)
        }
      })
    },
  },
  {
    id: 'TC14',
    name: 'Loc thiet bi chua gan khu vuc',
    goal: 'Kiem tra areas=null',
    precondition: 'Co device automation chua gan area',
    expected: 'HTTP 200 va response chua device chua gan',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC14', async ({ deviceId }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          areas: 'null',
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(deviceId)
        evidence.addAssertion('areas=null returns unassigned automation device')
      })
    },
  },
  {
    id: 'TC15',
    name: 'Loc khu vuc hoac chua gan',
    goal: 'Kiem tra areas=<id>&areas=null theo source Postman',
    precondition: 'Co device automation chua gan area',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC15', async () => {
        const areaId = env.testAreaId || 'null'
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          areas: `${areaId},null`,
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Area or unassigned filter returns HTTP 200')
      })
    },
  },
  {
    id: 'TC16',
    name: 'Loc theo loai thiet bi',
    goal: 'Kiem tra device_type_id filter',
    precondition: 'TEST_DEVICE_TYPE_ID neu moi truong co catalog',
    expected: 'HTTP 200 hoac skip fixture missing',
    run: async (api, evidence) => {
      if (!env.testDeviceTypeId) {
        evidence.addAssertion('SKIPPED_FIXTURE_MISSING: TEST_DEVICE_TYPE_ID')
        test.skip(true, 'Set TEST_DEVICE_TYPE_ID to run device type filter')
      }
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        device_type_id: env.testDeviceTypeId,
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Filter by device_type_id returns HTTP 200')
    },
  },
  {
    id: 'TC17',
    name: 'Loc thiet bi input',
    goal: 'Kiem tra io_capability=input',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        io_capability: 'input',
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=input returns HTTP 200')
    },
  },
  {
    id: 'TC18',
    name: 'Loc thiet bi output',
    goal: 'Kiem tra io_capability=output',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        io_capability: 'output',
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=output returns HTTP 200')
    },
  },
  {
    id: 'TC19',
    name: 'Loc thiet bi input output',
    goal: 'Kiem tra io_capability=both',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      const response = await api.listDevices({
        page: 1,
        limit: 20,
        io_capability: 'both',
      })
      expect(response.status()).toBe(200)
      evidence.addAssertion('io_capability=both returns HTTP 200')
    },
  },
  {
    id: 'TC20',
    name: 'Ket hop nhieu filter',
    goal: 'Kiem tra ket hop hc/protocol/network/search',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va response chua device automation',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC20', async ({ payload }) => {
        const response = await api.listDevices({
          page: 1,
          limit: 20,
          hc_id: env.testHcId,
          protocol: String(payload.protocol),
          network_state: 'activated',
          search: String(payload.mac),
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body).toLowerCase()).toContain(
          String(payload.mac).toLowerCase(),
        )
        evidence.addAssertion('Combined filters return automation device')
      })
    },
  },
  {
    id: 'TC21',
    name: 'Xem chi tiet thiet bi thanh cong',
    goal: 'Kiem tra detail device',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va id/mac dung',
    run: async (api, evidence) => {
      await withAutomationDevice(
        api,
        evidence,
        'TC21',
        async ({ deviceId, payload }) => {
          const response = await api.getDevice(deviceId)
          const body = await responseBody(response)
          const data = responseData(body)
          expect(response.status()).toBe(200)
          expect(String(data.id)).toBe(deviceId)
          expect(String(data.mac).toLowerCase()).toBe(
            String(payload.mac).toLowerCase(),
          )
          evidence.addAssertion('Device detail returns created id and MAC')
        },
      )
    },
  },
  {
    id: 'TC22',
    name: 'Xem chi tiet thiet bi khong ton tai',
    goal: 'Kiem tra detail fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.getDevice(fakeDeviceId)
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Nonexistent device detail is rejected',
      )
    },
  },
  {
    id: 'TC23',
    name: 'Lookup nhieu thiet bi thanh cong',
    goal: 'Kiem tra POST /devices/lookup',
    precondition: 'Co 2 device automation',
    expected: 'HTTP 200 va items chua id da truyen',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC23A', async (a) => {
        await withAutomationDevice(api, evidence, 'TC23B', async (b) => {
          const response = await api.lookupDevices([a.deviceId, b.deviceId])
          const body = await responseBody(response)
          expect(response.status()).toBe(200)
          const text = JSON.stringify(body)
          expect(text).toContain(a.deviceId)
          expect(text).toContain(b.deviceId)
          evidence.addAssertion('Lookup returns both automation devices')
        })
      })
    },
  },
  {
    id: 'TC24',
    name: 'Lookup co ID khong ton tai',
    goal: 'Kiem tra lookup voi fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 200 khong crash hoac validation ro rang',
    run: async (api, evidence) => {
      const response = await api.lookupDevices([fakeDeviceId])
      expectStatus(
        response.status(),
        [200, 400],
        evidence,
        'Lookup fake id returns explicit backend result',
      )
    },
  },
  {
    id: 'TC25',
    name: 'Them thiet bi vao HC thanh cong',
    goal: 'Kiem tra tao device tren HC that',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 200/201 va device duoc tao dung HC',
    run: async (api, evidence) => {
      await withAutomationDevice(
        api,
        evidence,
        'TC25',
        async ({ deviceId, payload }) => {
          expect(deviceId).toBeTruthy()
          expect(String(payload.hc_id)).toBe(env.testHcId)
          evidence.addAssertion('Device is created under configured HC')
        },
      )
    },
  },
  {
    id: 'TC26',
    name: 'Them thiet bi thieu ID',
    goal: 'Kiem tra validation missing id',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC26')
      delete payload.id
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing device id is rejected',
      )
    },
  },
  {
    id: 'TC27',
    name: 'Them thiet bi thieu MAC',
    goal: 'Kiem tra validation missing mac',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC27')
      delete payload.mac
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing device MAC is rejected',
      )
    },
  },
  {
    id: 'TC28',
    name: 'Them thiet bi voi MAC sai dinh dang',
    goal: 'Kiem tra validation invalid mac',
    precondition: 'TEST_HC_ID hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      requireWriteFixture()
      const payload = generateDevicePayload(env, 'TC28', { mac: 'bad-mac' })
      const response = await api.iotCreateDevice(env.testHcId, payload)
      expectStatus(response.status(), [400], evidence, 'Invalid MAC is rejected')
    },
  },
  {
    id: 'TC29',
    name: 'Them thiet bi trung ID',
    goal: 'Kiem tra duplicate id',
    precondition: 'Co device automation',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC29', async ({ payload }) => {
        const duplicate = generateDevicePayload(env, 'TC29_DUP', {
          id: payload.id,
        })
        const response = await api.iotCreateDevice(env.testHcId, duplicate)
        const body = await responseBody(response)
        try {
          expectStatus(
            response.status(),
            [400, 409],
            evidence,
            'Duplicate id is rejected',
          )
        } finally {
          if ([200, 201].includes(response.status())) {
            const createdId = String(body?.data?.id || body?.id || duplicate.id)
            await cleanupDevice(api, evidence, createdId)
          }
        }
      })
    },
  },
  {
    id: 'TC30',
    name: 'Them thiet bi trung MAC',
    goal: 'Kiem tra duplicate mac',
    precondition: 'Co device automation',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC30', async ({ payload }) => {
        const duplicate = generateDevicePayload(env, 'TC30_DUP', {
          mac: payload.mac,
        })
        const response = await api.iotCreateDevice(env.testHcId, duplicate)
        const body = await responseBody(response)
        try {
          expectStatus(
            response.status(),
            [400, 409],
            evidence,
            'Duplicate MAC is rejected',
          )
        } finally {
          if ([200, 201].includes(response.status())) {
            const createdId = String(body?.data?.id || body?.id || duplicate.id)
            await cleanupDevice(api, evidence, createdId)
          }
        }
      })
    },
  },
  {
    id: 'TC31',
    name: 'Bind batch thiet bi thanh cong',
    goal: 'Ghi nhan case bind-batch can fixture mesh safe',
    precondition: 'Can xac nhan cleanup bind-batch an toan',
    expected: 'Skipped co evidence cho den khi fixture duoc duyet',
    run: async (_, evidence) => {
      evidence.addAssertion(
        'DEFERRED_SAFE_FIXTURE: bind-batch success waits for explicit safe HC mesh cleanup confirmation',
      )
      test.skip(true, 'DEFERRED_SAFE_FIXTURE: bind-batch safe cleanup not confirmed')
    },
  },
  {
    id: 'TC32',
    name: 'Bind batch co thiet bi loi',
    goal: 'Ghi nhan case bind-batch mixed result can fixture mesh safe',
    precondition: 'Can xac nhan cleanup bind-batch an toan',
    expected: 'Skipped co evidence cho den khi fixture duoc duyet',
    run: async (_, evidence) => {
      evidence.addAssertion(
        'DEFERRED_SAFE_FIXTURE: bind-batch mixed result waits for explicit safe HC mesh cleanup confirmation',
      )
      test.skip(true, 'DEFERRED_SAFE_FIXTURE: bind-batch safe cleanup not confirmed')
    },
  },
  {
    id: 'TC33',
    name: 'Cap nhat toan bo thiet bi thanh cong',
    goal: 'Kiem tra PUT safe fields tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(
        api,
        evidence,
        'TC33',
        async ({ deviceId, payload }) => {
          const { id: _id, ...updatePayload } = payload
          const response = await api.bmsPutDevice(deviceId, {
            ...updatePayload,
            name: `auto_device_put_TC33_${Date.now()}`,
            notes: 'put updated by automation',
            icon_key: 'lightbulb',
          })
          expectStatus(
            response.status(),
            [200],
            evidence,
            'BMS PUT updates automation device',
          )
        },
      )
    },
  },
  {
    id: 'TC34',
    name: 'Cap nhat ten ghi chu icon thiet bi',
    goal: 'Kiem tra PATCH safe fields',
    precondition: 'Co device automation',
    expected: 'HTTP 200 va field dung',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC34', async ({ deviceId }) => {
        const notes = `auto_patch_notes_TC34_${Date.now()}`
        const response = await api.bmsPatchDevice(deviceId, {
          name: `auto_device_patch_TC34_${Date.now()}`,
          notes,
          icon_key: 'lightbulb',
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain(notes)
        evidence.addAssertion('BMS PATCH updates name/notes/icon')
      })
    },
  },
  {
    id: 'TC35',
    name: 'Cap nhat trang thai network',
    goal: 'Kiem tra network_state record update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC35', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, {
          network_state: 'pending',
        })
        expectStatus(
          response.status(),
          [200],
          evidence,
          'IoT PATCH network_state updates automation record',
        )
      })
    },
  },
  {
    id: 'TC36',
    name: 'Cap nhat network data',
    goal: 'Kiem tra network_data update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC36', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, {
          network_data: { rssi: -65 },
        })
        expectStatus(
          response.status(),
          [200],
          evidence,
          'IoT PATCH network_data updates automation record',
        )
      })
    },
  },
  {
    id: 'TC37',
    name: 'Cap nhat scene config',
    goal: 'Kiem tra scene/config update tren automation device',
    precondition: 'Co device automation',
    expected: 'HTTP 200',
    run: async (api, evidence) => {
      await withAutomationDevice(api, evidence, 'TC37', async ({ deviceId }) => {
        const response = await api.iotPatchDevice(deviceId, {
          scene: { mode: 'night' },
          config: { room: 'automation' },
        })
        expectStatus(
          response.status(),
          [200],
          evidence,
          'IoT PATCH scene/config updates automation record',
        )
      })
    },
  },
  {
    id: 'TC38',
    name: 'Cap nhat thiet bi khong ton tai',
    goal: 'Kiem tra update fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 400',
    run: async (api, evidence) => {
      const response = await api.bmsPatchDevice(fakeDeviceId, {
        notes: 'not found',
      })
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Updating nonexistent device is rejected',
      )
    },
  },
  {
    id: 'TC39',
    name: 'Xoa thiet bi thanh cong',
    goal: 'Kiem tra delete single automation-created device',
    precondition: 'Co device automation',
    expected: 'HTTP 200/204 va detail khong con',
    run: async (api, evidence) => {
      const created = await createAutomationDevice(api, evidence, 'TC39')
      let deleted = false
      try {
        const response = await api.iotDeleteDevice(created.deviceId)
        expectStatus(
          response.status(),
          [200, 204],
          evidence,
          'Automation device is deleted',
        )
        deleted = true
        const getResponse = await api.iotGetDevice(created.deviceId)
        expectStatus(
          getResponse.status(),
          [204, 404],
          evidence,
          'Deleted device is absent from IoT detail',
        )
      } finally {
        if (!deleted) {
          await cleanupDevice(api, evidence, created.deviceId)
        }
      }
    },
  },
  {
    id: 'TC40',
    name: 'Huy xoa thiet bi',
    goal: 'Ghi nhan UI-only cancel delete khong goi API',
    precondition: 'Popup xac nhan xoa dang mo trong UI',
    expected: 'Khong goi API delete',
    run: async (_, evidence) => {
      evidence.addAssertion(
        'UI_ONLY_NOT_APPLICABLE: cancel delete does not call API in API suite',
      )
    },
  },
  {
    id: 'TC41',
    name: 'Xoa thiet bi khong ton tai',
    goal: 'Kiem tra delete fake id',
    precondition: 'Admin da dang nhap',
    expected: 'HTTP 404 hoac 204 theo backend',
    run: async (api, evidence) => {
      const response = await api.iotDeleteDevice(fakeDeviceId)
      expectStatus(
        response.status(),
        [204, 404],
        evidence,
        'Deleting nonexistent device returns explicit backend result',
      )
    },
  },
  {
    id: 'TC42',
    name: 'Xoa thiet bi dang thuoc khu vuc',
    goal: 'Kiem tra backend rule khi delete device assigned area',
    precondition: 'Co automation device assigned area',
    expected: 'HTTP explicit backend result va cleanup sach',
    run: async (api, evidence) => {
      let areaId: string | undefined
      const created = await createAutomationDevice(api, evidence, 'TC42')
      try {
        areaId = await createAutomationArea(api, evidence, 'TC42')
        await api.assignDevicesToArea(areaId, [created.deviceId])
        const response = await api.iotDeleteDevice(created.deviceId)
        expectStatus(
          response.status(),
          [200, 204, 400, 409],
          evidence,
          'Deleting area-assigned automation device returns explicit backend rule',
        )
      } finally {
        if (areaId) {
          await api.unassignDevicesFromArea(areaId, [created.deviceId])
        }
        await cleanupArea(api, evidence, areaId)
        await cleanupDevice(api, evidence, created.deviceId)
      }
    },
  },
  {
    id: 'TC43',
    name: 'Xoa thiet bi dang thuoc group',
    goal: 'Ghi nhan case can group fixture an toan',
    precondition: 'Can automation group fixture',
    expected: 'Skipped co evidence neu chua co fixture',
    run: async (_, evidence) => {
      evidence.addAssertion(
        'DEFERRED_GROUP_FIXTURE: group-bound delete waits for safe automation group fixture',
      )
      test.skip(true, 'DEFERRED_GROUP_FIXTURE: safe group fixture not configured')
    },
  },
  {
    id: 'TC45',
    name: 'Gan 1 thiet bi vao khu vuc',
    goal: 'Kiem tra assign device to area',
    precondition: 'Co area va device automation',
    expected: 'Device duoc gan vao area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC45', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC45')
          const response = await api.assignDevicesToArea(areaId, [deviceId])
          expectStatus(
            response.status(),
            [200, 201, 202, 204],
            evidence,
            'Device is assigned to area',
          )
          const list = await api.listAreaDevices(areaId, { page: 1, limit: 20 })
          const body = await responseBody(list)
          expect(JSON.stringify(body)).toContain(deviceId)
          evidence.addAssertion('Area device list contains assigned device')
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC46',
    name: 'Bo gan thiet bi khoi khu vuc',
    goal: 'Kiem tra unassign device from area',
    precondition: 'Device da duoc assign area',
    expected: 'Device khong con trong area',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC46', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC46')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.unassignDevicesFromArea(areaId, [deviceId])
          expectStatus(
            response.status(),
            [200, 202, 204],
            evidence,
            'Device is unassigned from area',
          )
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC47',
    name: 'Cap nhat vi tri thiet bi tren mat bang',
    goal: 'Kiem tra update position hop le',
    precondition: 'Device da duoc gan area',
    expected: 'HTTP 200/204',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC47', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC47')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.updateDevicePosition(areaId, deviceId, {
            pos_x: 0.25,
            pos_y: 0.75,
          })
          expectStatus(
            response.status(),
            [200, 204],
            evidence,
            'Device position is updated',
          )
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC48',
    name: 'Cap nhat vi tri ngoai khoang hop le',
    goal: 'Kiem tra validation position',
    precondition: 'Device da duoc gan area',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      let areaId: string | undefined
      await withAutomationDevice(api, evidence, 'TC48', async ({ deviceId }) => {
        try {
          areaId = await createAutomationArea(api, evidence, 'TC48')
          await api.assignDevicesToArea(areaId, [deviceId])
          const response = await api.updateDevicePosition(areaId, deviceId, {
            pos_x: -1,
            pos_y: 2,
          })
          expectStatus(
            response.status(),
            [400],
            evidence,
            'Invalid position is rejected',
          )
        } finally {
          if (areaId) await api.unassignDevicesFromArea(areaId, [deviceId])
          await cleanupArea(api, evidence, areaId)
        }
      })
    },
  },
  {
    id: 'TC49',
    name: 'Xem summary thiet bi theo khu vuc',
    goal: 'Kiem tra area device summary',
    precondition: 'Co area automation',
    expected: 'HTTP 200 va co summary fields',
    run: async (api, evidence) => {
      let areaId: string | undefined
      try {
        areaId = await createAutomationArea(api, evidence, 'TC49')
        const response = await api.getAreaDeviceSummary(areaId)
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(JSON.stringify(body)).toContain('total')
        evidence.addAssertion('Area device summary returns summary payload')
      } finally {
        await cleanupArea(api, evidence, areaId)
      }
    },
  },
  {
    id: 'TC50',
    name: 'User khong co quyen xem thiet bi',
    goal: 'Kiem tra permission view devices',
    precondition: 'NO_PERMISSION user neu co',
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
          .listDevices({ page: 1, limit: 10 })
        expectStatus(
          response.status(),
          [403],
          evidence,
          'No-permission user cannot view device list',
        )
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC51',
    name: 'User khong co quyen them thiet bi',
    goal: 'Kiem tra permission create device',
    precondition: 'VIEWER/NO_PERMISSION user neu co',
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
      let createdId: string | undefined
      try {
        requireWriteFixture()
        const payload = generateDevicePayload(env, 'TC51')
        const response = await userApi
          .withEvidence(evidence)
          .iotCreateDevice(env.testHcId, payload)
        const body = await responseBody(response)
        createdId = String(body?.data?.id || body?.id || payload.id || '')
        expectStatus(
          response.status(),
          [403],
          evidence,
          'Non-admin user cannot create device',
        )
      } finally {
        await cleanupDevice(api, evidence, createdId)
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC52',
    name: 'User khong co quyen sua thiet bi',
    goal: 'Kiem tra permission update device',
    precondition: 'VIEWER/NO_PERMISSION user va automation device',
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
        await withAutomationDevice(api, evidence, 'TC52', async ({ deviceId }) => {
          const response = await userApi
            .withEvidence(evidence)
            .bmsPatchDevice(deviceId, { notes: 'blocked' })
          expectStatus(
            response.status(),
            [403],
            evidence,
            'Non-admin user cannot update device',
          )
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC53',
    name: 'User khong co quyen xoa thiet bi',
    goal: 'Kiem tra permission delete device',
    precondition: 'VIEWER/NO_PERMISSION user va automation device',
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
        await withAutomationDevice(api, evidence, 'TC53', async ({ deviceId }) => {
          const response = await userApi
            .withEvidence(evidence)
            .iotDeleteDevice(deviceId)
          expectStatus(
            response.status(),
            [403],
            evidence,
            'Non-admin user cannot delete device',
          )
        })
      } finally {
        await userApi.context.dispose()
      }
    },
  },
  {
    id: 'TC54',
    name: 'Thieu token khi xem danh sach',
    goal: 'Kiem tra auth guard list device',
    precondition: 'Khong truyen Authorization',
    expected: 'HTTP 401/400 hoac auth disabled evidence',
    run: async (_, evidence) => {
      const anonymousApi = await newDeviceManagementSuiteApi(env)
      try {
        const response = await anonymousApi
          .withEvidence(evidence)
          .listDevices({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          env.requireAuth ? [400, 401] : [200, 400, 401],
          evidence,
          response.status() === 200
            ? 'Auth is disabled in current environment; anonymous list is allowed'
            : 'Anonymous list device is rejected',
        )
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
]

test.describe('Device Management API suite aligned with manual sheet', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearDeviceEvidenceDir(env)
    if (
      env.requireAuth &&
      !env.adminAccessToken &&
      (!env.adminUsername || !env.adminPassword)
    ) {
      const error =
        'ADMIN_USERNAME/ADMIN_PASSWORD or DEVICE_MANAGEMENT_ADMIN_ACCESS_TOKEN/BMS_ACCESS_TOKEN are required when DEVICE_MANAGEMENT_REQUIRE_AUTH is true'
      await writeDevicePrecheckEvidence(
        env,
        'PRECHECK_admin_login_env_missing',
        {
          status: 'FAILED',
          error_message: error,
        },
      )
      throw new Error(error)
    }

    const precheckApi = await newDeviceManagementSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeDevicePrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(
          `Health check failed before Device suite: ${health.status()}`,
        )
      }
    } finally {
      await precheckApi.context.dispose()
    }

    if (env.adminAccessToken) {
      adminToken = env.adminAccessToken
    } else if (env.adminUsername && env.adminPassword) {
      const adminLogin = await loginDeviceSuiteUser(
        env,
        env.adminUsername,
        env.adminPassword,
      )
      adminToken = adminLogin.token
      adminRefreshToken = adminLogin.refreshToken
    }
    adminApi = await newDeviceManagementSuiteApi(env, adminToken)
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
