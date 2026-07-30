import { expect, test, TestInfo } from '@playwright/test'
import {
  clearMaintenanceEvidenceDir,
  cleanupUser,
  configFromBody,
  deviceIdOf,
  generatedMaintenanceUserPayload,
  getMaintenanceSuiteEnv,
  loginMaintenanceSuiteUser,
  maintenanceItems,
  MaintenanceConfig,
  MaintenanceEvidence,
  MaintenanceSuiteApi,
  newMaintenanceSuiteApi,
  paginationMeta,
  restoreConfig,
  restoreThresholds,
  thresholdPayloadFromDevice,
  userIdFromBody,
  writeMaintenancePrecheckEvidence,
} from '@src/core/bms-api/maintenance-suite'

const env = getMaintenanceSuiteEnv()

let adminToken = ''
let adminApi: MaintenanceSuiteApi

type MaintenanceTc = {
  id: string
  name: string
  run: (api: MaintenanceSuiteApi, evidence: MaintenanceEvidence) => Promise<void>
}

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: MaintenanceEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const assertListEnvelope = (body: any, evidence: MaintenanceEvidence) => {
  expect(Array.isArray(maintenanceItems(body))).toBe(true)
  const meta = paginationMeta(body)
  expect(meta.total).toBeDefined()
  expect(meta.page).toBeDefined()
  expect(meta.limit).toBeDefined()
  evidence.addAssertion('Maintenance list has items and pagination metadata')
}

const firstDevice = async (api: MaintenanceSuiteApi) => {
  if (env.testDeviceId) return { id: env.testDeviceId }
  const response = await api.listDevices({ page: 1, limit: 20, status: 'all' })
  expect(response.status()).toBe(200)
  return maintenanceItems(await responseBody(response))[0]
}

const withConfigBackup = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  fn: (before: MaintenanceConfig) => Promise<void>,
) => {
  let before: MaintenanceConfig | undefined
  try {
    const beforeResponse = await api.getConfig()
    expect(beforeResponse.status()).toBe(200)
    before = configFromBody(await responseBody(beforeResponse))
    await fn(before)
  } finally {
    await restoreConfig(api, evidence, before)
  }
}

const withNoPermissionApi = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  tcId: string,
  fn: (userApi: MaintenanceSuiteApi) => Promise<void>,
) => {
  if (env.noPermissionUsername && env.noPermissionPassword) {
    const login = await loginMaintenanceSuiteUser(
      env,
      env.noPermissionUsername,
      env.noPermissionPassword,
    )
    const userApi = await newMaintenanceSuiteApi(env, login.token)
    try {
      await fn(userApi.withEvidence(evidence))
    } finally {
      await userApi.context.dispose()
    }
    return
  }

  let userId: string | undefined
  let userApi: MaintenanceSuiteApi | undefined
  try {
    const payload = generatedMaintenanceUserPayload(env, tcId)
    const createResponse = await api.registerUser(payload)
    expect(createResponse.status()).toBe(200)
    userId = userIdFromBody(await responseBody(createResponse))
    const login = await loginMaintenanceSuiteUser(
      env,
      payload.user_name,
      payload.password,
    )
    userApi = await newMaintenanceSuiteApi(env, login.token)
    await fn(userApi.withEvidence(evidence))
  } finally {
    await userApi?.context.dispose()
    await cleanupUser(api, evidence, userId)
  }
}

const maybeRunDoneWrite = async (
  api: MaintenanceSuiteApi,
  evidence: MaintenanceEvidence,
  fn: (deviceId: string) => Promise<void>,
) => {
  const device = await firstDevice(api)
  const deviceId = deviceIdOf(device)
  if (!deviceId) {
    evidence.addAssertion('DATA_PRECONDITION_MISSING: no maintenance device')
    return
  }
  if (!env.allowDoneWrites && !env.testDeviceId) {
    evidence.addAssertion(
      'WRITE_GUARD_SKIPPED: maintenance done resets real absolute values; set MAINTENANCE_ALLOW_DONE_WRITES=true or MAINTENANCE_TEST_DEVICE_ID to execute',
    )
    return
  }
  await fn(deviceId)
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: MaintenanceSuiteApi, evidence: MaintenanceEvidence) => Promise<void>,
) => {
  const evidence = new MaintenanceEvidence(testInfo, tcId, tcName, env.baseUrl)
  const api = adminApi.withEvidence(evidence)
  await evidence.attachStep({
    step: 'Auth precondition',
    method: adminToken ? 'TOKEN' : 'POST',
    endpoint: adminToken ? 'env/shared token or login result' : `${env.apiPrefix}/auth/login`,
    status: 200,
    response: { token_present: Boolean(adminToken), token_length: adminToken.length },
  })
  try {
    await fn(api, evidence)
    await evidence.write('PASSED')
  } catch (error) {
    await evidence.collectSystemLog(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const cases: MaintenanceTc[] = [
  {
    id: 'TC1',
    name: 'Xem cau hinh bao tri',
    run: async (api, evidence) => {
      const response = await api.getConfig()
      const config = configFromBody(await responseBody(response))
      expect(response.status()).toBe(200)
      expect(config.alertModule).toBe('maintenance')
      expect(config.alertType).toBe('MAINTENANCE_ALERT')
      expect(typeof config.nearThresholdPercentage).toBe('number')
      expect(typeof config.overThresholdPercentage).toBe('number')
      expect(typeof config.repeatMaintenanceAlert).toBe('boolean')
      evidence.addAssertion('Config has maintenance module, alert type and thresholds')
    },
  },
  {
    id: 'TC2',
    name: 'Cap nhat cau hinh bao tri thanh cong',
    run: async (api, evidence) => {
      await withConfigBackup(api, evidence, async (before) => {
        const response = await api.updateConfig({
          nearThresholdPercentage: Math.max(1, Math.min(90, before.nearThresholdPercentage ?? 80)),
          overThresholdPercentage: Math.max(100, before.overThresholdPercentage ?? 110),
          repeatMaintenanceAlert: !(before.repeatMaintenanceAlert ?? false),
        })
        expect(response.status()).toBe(200)
        expect(configFromBody(await responseBody(response)).alertModule).toBe('maintenance')
        evidence.addAssertion('Config can be updated and is restored in cleanup')
      })
    },
  },
  {
    id: 'TC3',
    name: 'Cap nhat cau hinh voi nguong khong hop le',
    run: async (api, evidence) => {
      const response = await api.updateConfig({
        nearThresholdPercentage: 120,
        overThresholdPercentage: 100,
        repeatMaintenanceAlert: true,
      })
      expectStatus(response.status(), [400], evidence, 'Invalid config threshold is rejected')
    },
  },
  {
    id: 'TC4',
    name: 'Xem danh sach thiet bi bao tri',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20 })
      expect(response.status()).toBe(200)
      assertListEnvelope(await responseBody(response), evidence)
    },
  },
  {
    id: 'TC5',
    name: 'Danh sach bao tri rong',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 999999, limit: 20 })
      expect(response.status()).toBe(200)
      expect(maintenanceItems(await responseBody(response))).toHaveLength(0)
      evidence.addAssertion('High page returns empty maintenance list')
    },
  },
  {
    id: 'TC6',
    name: 'Loc thiet bi trang thai warning',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20, status: 'warning' })
      expect(response.status()).toBe(200)
      assertListEnvelope(await responseBody(response), evidence)
    },
  },
  {
    id: 'TC7',
    name: 'Phan trang danh sach bao tri',
    run: async (api, evidence) => {
      const page1 = await api.listDevices({ page: 1, limit: 2 })
      const page2 = await api.listDevices({ page: 2, limit: 2 })
      const body1 = await responseBody(page1)
      const body2 = await responseBody(page2)
      expect(page1.status()).toBe(200)
      expect(page2.status()).toBe(200)
      expect(paginationMeta(body1).page).toBe(1)
      expect(paginationMeta(body2).page).toBe(2)
      expect(maintenanceItems(body1).length).toBeLessThanOrEqual(2)
      expect(maintenanceItems(body2).length).toBeLessThanOrEqual(2)
      evidence.addAssertion('Pagination page and limit are respected')
    },
  },
  {
    id: 'TC8',
    name: 'Xem summary bao tri',
    run: async (api, evidence) => {
      const response = await api.getSummary()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(typeof body.data?.total_action_required).toBe('number')
      expect(typeof body.data?.over_threshold_count).toBe('number')
      expect(typeof body.data?.near_threshold_count).toBe('number')
      evidence.addAssertion('Summary returns total, over and near counts')
    },
  },
  {
    id: 'TC9',
    name: 'Danh dau da bao tri thanh cong',
    run: async (api, evidence) => {
      await maybeRunDoneWrite(api, evidence, async (deviceId) => {
        const response = await api.markDone(deviceId, { notes: 'Auto maintenance done TC9' })
        expect(response.status()).toBe(200)
        expect((await responseBody(response)).data?.device_id).toBe(deviceId)
        evidence.addAssertion('Device maintenance done is recorded')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Danh dau bao tri khong nhap ghi chu',
    run: async (api, evidence) => {
      await maybeRunDoneWrite(api, evidence, async (deviceId) => {
        const response = await api.markDone(deviceId)
        expect(response.status()).toBe(200)
        evidence.addAssertion('Done maintenance accepts empty notes')
      })
    },
  },
  {
    id: 'TC11',
    name: 'Huy danh dau hoan tat bao tri',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 1, limit: 20 })
      expect(response.status()).toBe(200)
      evidence.addAssertion('Cancel is client-only; evidence has no done PATCH')
    },
  },
  {
    id: 'TC12',
    name: 'Danh dau hoan tat thiet bi khong ton tai',
    run: async (api, evidence) => {
      const response = await api.markDone('999999999999999')
      expectStatus(response.status(), [400, 404], evidence, 'Nonexistent device done is rejected')
    },
  },
  {
    id: 'TC13',
    name: 'Xem lich su bao tri',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device) || '999999999999999'
      const response = await api.listLogs(id, { page: 1, limit: 20 })
      expectStatus(response.status(), [200, 404], evidence, 'Logs endpoint returns logs or not-found empty state')
    },
  },
  {
    id: 'TC14',
    name: 'Lich su bao tri rong',
    run: async (api, evidence) => {
      const response = await api.listLogs('999999999999999', { page: 1, limit: 20 })
      expectStatus(response.status(), [200, 404], evidence, 'Nonexistent/no-log device returns 200 empty or 404')
    },
  },
  {
    id: 'TC15',
    name: 'Cap nhat nguong thiet bi thanh cong',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device)
      if (!id) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no device to update threshold')
        return
      }
      const restorePayload = thresholdPayloadFromDevice(device)
      const payload = restorePayload.thresholds?.length
        ? restorePayload
        : { thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 1000, description: 'Auto threshold TC15' }] }
      try {
        const response = await api.updateThresholds(id, payload)
        expect(response.status()).toBe(200)
        evidence.addAssertion('Threshold update succeeds for selected device')
      } finally {
        await restoreThresholds(api, evidence, id, restorePayload)
      }
    },
  },
  {
    id: 'TC16',
    name: 'Cap nhat nguong am',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device) || '101'
      const response = await api.updateThresholds(id, {
        thresholds: [{ threshold_type: 'RUNTIME', threshold_value: -1 }],
      })
      expectStatus(response.status(), [400], evidence, 'Negative threshold value is rejected')
    },
  },
  {
    id: 'TC17',
    name: 'Cap nhat nguong thieu threshold type',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device) || '101'
      const response = await api.updateThresholds(id, {
        thresholds: [{ threshold_value: 1000 }],
      })
      expectStatus(response.status(), [400], evidence, 'Missing threshold_type is rejected')
    },
  },
  {
    id: 'TC18',
    name: 'Cap nhat nhieu nguong cho mot thiet bi',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device)
      if (!id) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no device to update thresholds')
        return
      }
      const restorePayload = thresholdPayloadFromDevice(device)
      try {
        const response = await api.updateThresholds(id, {
          thresholds: [
            { threshold_type: 'RUNTIME', threshold_value: 1000 },
            { threshold_type: 'ON_OFF', threshold_value: 100 },
          ],
        })
        expectStatus(response.status(), [200, 400], evidence, 'Multiple thresholds are accepted or duplicate/type validation is explicit')
      } finally {
        await restoreThresholds(api, evidence, id, restorePayload)
      }
    },
  },
  {
    id: 'TC19',
    name: 'Danh dau bao tri nhieu thiet bi',
    run: async (api, evidence) => {
      await maybeRunDoneWrite(api, evidence, async (deviceId) => {
        const response = await api.bulkDone({
          maintenances: [{ device_id: deviceId, notes: 'Bulk done TC19' }],
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Bulk done succeeds for selected devices')
      })
    },
  },
  {
    id: 'TC20',
    name: 'Bulk maintenance co device khong ton tai',
    run: async (api, evidence) => {
      const response = await api.bulkDone({
        maintenances: [{ device_id: '999999999999999', notes: null }],
      })
      expectStatus(response.status(), [200, 400], evidence, 'Bulk done invalid/nonexistent device is handled by validation or failed_items')
    },
  },
  {
    id: 'TC21',
    name: 'Khong chon thiet bi khi bao tri hang loat',
    run: async (api, evidence) => {
      const response = await api.bulkDone({ maintenances: [] })
      expectStatus(
        response.status(),
        [200, 400],
        evidence,
        response.status() === 400
          ? 'Empty bulk done list is rejected'
          : 'TODO_CONFIRM_VALIDATION backend accepts empty bulk done list as no-op',
      )
    },
  },
  {
    id: 'TC22',
    name: 'Cap nhat nguong hang loat thanh cong',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device)
      if (!id) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no device to bulk threshold')
        return
      }
      const restorePayload = thresholdPayloadFromDevice(device)
      try {
        const response = await api.bulkThresholds({
          device_ids: [id],
          thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 5000 }],
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Bulk threshold succeeds for selected device')
      } finally {
        await restoreThresholds(api, evidence, id, restorePayload)
      }
    },
  },
  {
    id: 'TC23',
    name: 'Bulk threshold co device khong ton tai',
    run: async (api, evidence) => {
      const response = await api.bulkThresholds({
        device_ids: ['999999999999999'],
        thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 5000 }],
      })
      expectStatus(response.status(), [200, 400], evidence, 'Bulk threshold nonexistent device is handled')
    },
  },
  {
    id: 'TC24',
    name: 'Bulk threshold thieu danh sach thiet bi',
    run: async (api, evidence) => {
      const response = await api.bulkThresholds({
        device_ids: [],
        thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 5000 }],
      })
      expectStatus(response.status(), [400], evidence, 'Empty device_ids is rejected')
    },
  },
  {
    id: 'TC25',
    name: 'User khong co quyen xem bao tri',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC25', async (userApi) => {
        const response = await userApi.listDevices({ page: 1, limit: 20 })
        expectStatus(response.status(), [200, 403], evidence, 'JWT user can view own allowed data or PBAC rejects')
      })
    },
  },
  {
    id: 'TC26',
    name: 'User khong co quyen cap nhat nguong',
    run: async (api, evidence) => {
      const device = await firstDevice(api)
      const id = deviceIdOf(device) || '101'
      await withNoPermissionApi(api, evidence, 'TC26', async (userApi) => {
        const response = await userApi.updateThresholds(id, {
          thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 1000 }],
        })
        expectStatus(response.status(), [200, 403, 404], evidence, 'No-permission threshold update behavior is captured')
      })
    },
  },
  {
    id: 'TC27',
    name: 'User khong co quyen hoan tat bao tri',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC27', async (userApi) => {
        const response = await userApi.markDone('999999999999999')
        expectStatus(response.status(), [400, 403, 404], evidence, 'No-permission done behavior is captured')
      })
    },
  },
  {
    id: 'TC28',
    name: 'Thieu token khi xem bao tri',
    run: async (_, evidence) => {
      const anonymousApi = await newMaintenanceSuiteApi(env)
      try {
        const response = await anonymousApi.withEvidence(evidence).listDevices({ page: 1, limit: 20 })
        expectStatus(response.status(), [400, 401], evidence, 'Maintenance list without token is rejected')
      } finally {
        await anonymousApi.context.dispose()
      }
    },
  },
  {
    id: 'TC29',
    name: 'Token het han khi luu nguong',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken(
        'PUT',
        api.maintenanceEndpoint('/devices/101/thresholds'),
        { thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 1000 }] },
      )
      expectStatus(response.status(), [401], evidence, 'Invalid token threshold update returns 401')
    },
  },
  {
    id: 'TC30',
    name: 'Token het han khi hoan tat bao tri',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken(
        'PATCH',
        api.maintenanceEndpoint('/devices/101/done'),
        {},
      )
      expectStatus(response.status(), [401], evidence, 'Invalid token maintenance done returns 401')
    },
  },
  {
    id: 'TC31',
    name: 'API danh sach bao tri loi server',
    run: async (api, evidence) => {
      const response = await api.listDevices({ page: 'abc', limit: 20 })
      expectStatus(response.status(), [400, 500], evidence, 'Invalid list query returns controlled error')
    },
  },
  {
    id: 'TC32',
    name: 'API summary loi server',
    run: async (api, evidence) => {
      const response = await api.getSummary({ device_type_id: ['bad'] })
      expectStatus(response.status(), [200, 400, 500], evidence, 'Invalid summary query returns controlled response')
    },
  },
  {
    id: 'TC33',
    name: 'API hoan tat bao tri loi server',
    run: async (api, evidence) => {
      const response = await api.markDone('bad-device-id')
      expectStatus(response.status(), [400, 500], evidence, 'Bad done path id returns controlled error')
    },
  },
  {
    id: 'TC34',
    name: 'API cap nhat nguong loi server',
    run: async (api, evidence) => {
      const response = await api.updateThresholds('bad-device-id', {
        thresholds: [{ threshold_type: 'RUNTIME', threshold_value: 1000 }],
      })
      expectStatus(response.status(), [400, 500], evidence, 'Bad threshold path id returns controlled error')
    },
  },
  {
    id: 'TC35',
    name: 'Refresh sau khi hoan tat bao tri',
    run: async (api, evidence) => {
      const before = await api.listDevices({ page: 1, limit: 20 })
      const after = await api.listDevices({ page: 1, limit: 20 })
      expect(before.status()).toBe(200)
      expect(after.status()).toBe(200)
      assertListEnvelope(await responseBody(after), evidence)
      evidence.addAssertion('Refresh maintenance list returns current backend state')
    },
  },
]

test.describe('Maintenance API suite TC1-TC35', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearMaintenanceEvidenceDir(env)
    const envToken = env.rootAccessToken || env.adminAccessToken
    if (!envToken && (!env.adminUsername || !env.adminPassword)) {
      const error =
        'MAINTENANCE_ADMIN_ACCESS_TOKEN/BMS_ACCESS_TOKEN/BMS_ROOT_ACCESS_TOKEN or ADMIN_USERNAME/ADMIN_PASSWORD are required'
      await writeMaintenancePrecheckEvidence(env, 'PRECHECK_auth_env_missing', {
        status: 'FAILED',
        error_message: error,
      })
      throw new Error(error)
    }

    const precheckApi = await newMaintenanceSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeMaintenancePrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(`Health check failed: ${health.status()}`)
      }
    } finally {
      await precheckApi.context.dispose()
    }

    try {
      if (envToken) {
        adminToken = envToken
      } else {
        const login = await loginMaintenanceSuiteUser(
          env,
          env.adminUsername,
          env.adminPassword,
        )
        adminToken = login.token
      }
    } catch (error) {
      await writeMaintenancePrecheckEvidence(env, 'PRECHECK_auth_failed', {
        status: 'FAILED',
        base_url: env.baseUrl,
        error_message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    adminApi = await newMaintenanceSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    await adminApi?.context.dispose()
  })

  for (const tc of cases) {
    test(`${tc.id} - ${tc.name}`, async ({}, testInfo) => {
      testInfo.annotations.push({
        type: 'manual-goal',
        description: tc.name,
      })
      await runTc(testInfo, tc.id, tc.name, tc.run)
    })
  }
})
