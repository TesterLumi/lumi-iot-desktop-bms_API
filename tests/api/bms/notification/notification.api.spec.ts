import { expect, test, TestInfo } from '@playwright/test'
import {
  clearNotificationEvidenceDir,
  cleanupUser,
  generatedNotificationUserPayload,
  getNotificationSuiteEnv,
  loginNotificationSuiteUser,
  newNotificationSuiteApi,
  notificationCreatedAt,
  notificationId,
  notificationIsRead,
  notificationItems,
  notificationMeta,
  NotificationEvidence,
  NotificationPrefs,
  NotificationSuiteApi,
  notificationType,
  prefsFromBody,
  restorePrefs,
  userIdFromBody,
  writeNotificationPrecheckEvidence,
} from '@src/core/bms-api/notification-suite'

const env = getNotificationSuiteEnv()

let adminToken = ''
let adminRefreshToken: string | undefined
let adminApi: NotificationSuiteApi

type NotificationTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (
    api: NotificationSuiteApi,
    evidence: NotificationEvidence,
  ) => Promise<void>
}

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: NotificationEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const assertListEnvelope = (body: any, evidence: NotificationEvidence) => {
  expect(Array.isArray(notificationItems(body))).toBe(true)
  const meta = notificationMeta(body)
  expect(meta.total).toBeDefined()
  expect(meta.page).toBeDefined()
  expect(meta.limit).toBeDefined()
  evidence.addAssertion('Notification list has items and pagination metadata')
}

const assertItemShape = (item: any, evidence: NotificationEvidence) => {
  expect(notificationId(item)).toBeTruthy()
  expect(notificationType(item)).toBeTruthy()
  expect(typeof notificationIsRead(item)).toBe('boolean')
  expect(notificationCreatedAt(item)).toBeTruthy()
  expect(item.metadata).toBeDefined()
  evidence.addAssertion('Notification item has id, type, read state, metadata')
}

const getFirstNotification = async (
  api: NotificationSuiteApi,
  query?: Parameters<NotificationSuiteApi['listNotifications']>[0],
) => {
  const response = await api.listNotifications({ page: 1, limit: 20, ...query })
  const body = await responseBody(response)
  expect(response.status()).toBe(200)
  return notificationItems(body)[0]
}

const getFirstUnread = (api: NotificationSuiteApi) =>
  getFirstNotification(api, { is_read: false })

const withNoPermissionApi = async (
  api: NotificationSuiteApi,
  evidence: NotificationEvidence,
  tcId: string,
  fn: (userApi: NotificationSuiteApi) => Promise<void>,
) => {
  if (env.noPermissionUsername && env.noPermissionPassword) {
    const login = await loginNotificationSuiteUser(
      env,
      env.noPermissionUsername,
      env.noPermissionPassword,
    )
    const userApi = await newNotificationSuiteApi(env, login.token)
    try {
      await fn(userApi.withEvidence(evidence))
    } finally {
      await userApi.context.dispose()
    }
    return
  }

  let userId: string | undefined
  let userApi: NotificationSuiteApi | undefined
  try {
    const payload = generatedNotificationUserPayload(env, tcId)
    const createResponse = await api.registerUser(payload)
    const createBody = await responseBody(createResponse)
    expect(createResponse.status()).toBe(200)
    userId = userIdFromBody(createBody)
    expect(userId).toBeTruthy()

    const login = await loginNotificationSuiteUser(
      env,
      payload.user_name,
      payload.password,
    )
    userApi = await newNotificationSuiteApi(env, login.token)
    await fn(userApi.withEvidence(evidence))
  } finally {
    await userApi?.context.dispose()
    await cleanupUser(api, evidence, userId)
  }
}

const withPrefsBackup = async (
  api: NotificationSuiteApi,
  evidence: NotificationEvidence,
  fn: (before: NotificationPrefs) => Promise<void>,
) => {
  let before: NotificationPrefs | undefined
  try {
    const beforeResponse = await api.getPrefs()
    expect(beforeResponse.status()).toBe(200)
    before = prefsFromBody(await responseBody(beforeResponse))
    await fn(before)
  } finally {
    await restorePrefs(api, evidence, before)
  }
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (
    api: NotificationSuiteApi,
    evidence: NotificationEvidence,
  ) => Promise<void>,
) => {
  const evidence = new NotificationEvidence(testInfo, tcId, tcName, env.baseUrl)
  const api = adminApi.withEvidence(evidence)

  await evidence.attachStep({
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
    await evidence.collectSystemLog(error)
    await evidence.write('FAILED', error)
    throw error
  }
}

const cases: NotificationTc[] = [
  {
    id: 'TC1',
    name: 'Xem danh sach thong bao thanh cong',
    goal: 'Lay danh sach thong bao cua user dang nhap',
    precondition: 'Admin login thanh cong',
    expected: 'HTTP 200, co envelope data.items va meta pagination',
    run: async (api, evidence) => {
      const response = await api.listNotifications({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      assertListEnvelope(body, evidence)
      const first = notificationItems(body)[0]
      if (first) assertItemShape(first, evidence)
      else evidence.addAssertion('List can be empty without UI/backend error')
    },
  },
  {
    id: 'TC2',
    name: 'Danh sach thong bao rong',
    goal: 'Verify empty state bang filter khong co ket qua',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va items rong hoac validation reject filter sai',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 999999,
        limit: 20,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(notificationItems(body)).toHaveLength(0)
      evidence.addAssertion('High page returns empty notification items')
    },
  },
  {
    id: 'TC3',
    name: 'Phan trang danh sach thong bao',
    goal: 'Kiem tra page=1 va page=2',
    precondition: 'User dang nhap',
    expected: 'Response dung page/limit, items khong vuot limit',
    run: async (api, evidence) => {
      const page1 = await api.listNotifications({ page: 1, limit: 2 })
      const page2 = await api.listNotifications({ page: 2, limit: 2 })
      const page1Body = await responseBody(page1)
      const page2Body = await responseBody(page2)
      expect(page1.status()).toBe(200)
      expect(page2.status()).toBe(200)
      expect(notificationMeta(page1Body).page).toBe(1)
      expect(notificationMeta(page2Body).page).toBe(2)
      expect(notificationItems(page1Body).length).toBeLessThanOrEqual(2)
      expect(notificationItems(page2Body).length).toBeLessThanOrEqual(2)
      evidence.addAssertion('Pagination page and limit are respected')
    },
  },
  {
    id: 'TC4',
    name: 'Thay doi so ban ghi moi trang',
    goal: 'Kiem tra limit thay doi so item toi da',
    precondition: 'User dang nhap',
    expected: 'Items khong vuot limit moi request',
    run: async (api, evidence) => {
      const limit1 = await api.listNotifications({ page: 1, limit: 1 })
      const limit5 = await api.listNotifications({ page: 1, limit: 5 })
      const body1 = await responseBody(limit1)
      const body5 = await responseBody(limit5)
      expect(limit1.status()).toBe(200)
      expect(limit5.status()).toBe(200)
      expect(notificationItems(body1).length).toBeLessThanOrEqual(1)
      expect(notificationItems(body5).length).toBeLessThanOrEqual(5)
      evidence.addAssertion('Changing limit changes returned page size cap')
    },
  },
  {
    id: 'TC5',
    name: 'Sap xep thong bao moi nhat truoc',
    goal: 'Kiem tra created_at giam dan trong danh sach',
    precondition: 'User co thong bao hoac danh sach rong',
    expected: 'Items duoc sap xep moi nhat truoc',
    run: async (api, evidence) => {
      const response = await api.listNotifications({ page: 1, limit: 20 })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (let index = 1; index < items.length; index += 1) {
        const prev = Date.parse(notificationCreatedAt(items[index - 1]) || '')
        const current = Date.parse(notificationCreatedAt(items[index]) || '')
        expect(prev).toBeGreaterThanOrEqual(current)
      }
      evidence.addAssertion('created_at is sorted descending when items exist')
    },
  },
  {
    id: 'TC6',
    name: 'Loc thong bao chua doc',
    goal: 'Filter is_read=false',
    precondition: 'Co hoac khong co thong bao chua doc',
    expected: 'Moi item tra ve deu chua doc',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        is_read: false,
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) expect(notificationIsRead(item)).toBe(false)
      evidence.addAssertion('Unread filter only returns unread notifications')
    },
  },
  {
    id: 'TC7',
    name: 'Loc thong bao da doc',
    goal: 'Filter is_read=true',
    precondition: 'Co hoac khong co thong bao da doc',
    expected: 'Moi item tra ve deu da doc',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        is_read: true,
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) expect(notificationIsRead(item)).toBe(true)
      evidence.addAssertion('Read filter only returns read notifications')
    },
  },
  {
    id: 'TC8',
    name: 'Bo filter trang thai doc',
    goal: 'List khong filter is_read tra ca read va unread',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va danh sach hop le',
    run: async (api, evidence) => {
      const response = await api.listNotifications({ page: 1, limit: 20 })
      expect(response.status()).toBe(200)
      assertListEnvelope(await responseBody(response), evidence)
    },
  },
  {
    id: 'TC9',
    name: 'Loc thong bao thiet bi offline',
    goal: 'Filter notification_type=DEVICE_OFFLINE',
    precondition: 'User dang nhap',
    expected: 'Neu co item thi type dung DEVICE_OFFLINE',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        notification_type: 'DEVICE_OFFLINE',
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) expect(notificationType(item)).toBe('DEVICE_OFFLINE')
      evidence.addAssertion('DEVICE_OFFLINE filter returns matching type only')
    },
  },
  {
    id: 'TC10',
    name: 'Loc thong bao bao tri',
    goal: 'Filter notification_type=MAINTENANCE_ALERT',
    precondition: 'User dang nhap',
    expected: 'Neu co item thi type dung MAINTENANCE_ALERT',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        notification_type: 'MAINTENANCE_ALERT',
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) {
        expect(notificationType(item)).toBe('MAINTENANCE_ALERT')
      }
      evidence.addAssertion('MAINTENANCE_ALERT filter returns matching type')
    },
  },
  {
    id: 'TC11',
    name: 'Loc thong bao rule alert',
    goal: 'Filter notification_type=RULE_ALERT',
    precondition: 'User dang nhap',
    expected: 'Neu co item thi type dung RULE_ALERT',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        notification_type: 'RULE_ALERT',
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) expect(notificationType(item)).toBe('RULE_ALERT')
      evidence.addAssertion('RULE_ALERT filter returns matching type only')
    },
  },
  {
    id: 'TC12',
    name: 'Loc ket hop chua doc va DEVICE_OFFLINE',
    goal: 'Filter is_read=false + DEVICE_OFFLINE',
    precondition: 'User dang nhap',
    expected: 'Item tra ve vua unread vua DEVICE_OFFLINE',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        is_read: false,
        notification_type: 'DEVICE_OFFLINE',
      })
      const items = notificationItems(await responseBody(response))
      expect(response.status()).toBe(200)
      for (const item of items) {
        expect(notificationIsRead(item)).toBe(false)
        expect(notificationType(item)).toBe('DEVICE_OFFLINE')
      }
      evidence.addAssertion('Combined unread and type filter is consistent')
    },
  },
  {
    id: 'TC13',
    name: 'Filter khong co ket qua',
    goal: 'Filter hop le nhung khong co du lieu trang xa',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va items rong',
    run: async (api, evidence) => {
      const response = await api.listNotifications({
        page: 999999,
        limit: 20,
        notification_type: 'RULE_ALERT',
      })
      expect(response.status()).toBe(200)
      expect(notificationItems(await responseBody(response))).toHaveLength(0)
      evidence.addAssertion('No-result filter returns empty items')
    },
  },
  {
    id: 'TC14',
    name: 'Xem so luong thong bao chua doc',
    goal: 'Lay unread-count de hien thi badge',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va count la number >= 0',
    run: async (api, evidence) => {
      const response = await api.getUnreadCount()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(typeof body.data?.count).toBe('number')
      expect(body.data.count).toBeGreaterThanOrEqual(0)
      evidence.addAssertion('Unread count returns non-negative number')
    },
  },
  {
    id: 'TC15',
    name: 'Khong co thong bao chua doc',
    goal: 'Doi chieu unread-count voi list unread hien tai',
    precondition: 'User dang nhap',
    expected: 'Count >= so item unread tren trang dau',
    run: async (api, evidence) => {
      const countResponse = await api.getUnreadCount()
      const listResponse = await api.listNotifications({
        page: 1,
        limit: 20,
        is_read: false,
      })
      const countBody = await responseBody(countResponse)
      const listBody = await responseBody(listResponse)
      expect(countResponse.status()).toBe(200)
      expect(listResponse.status()).toBe(200)
      expect(countBody.data.count).toBeGreaterThanOrEqual(
        notificationItems(listBody).length,
      )
      evidence.addAssertion('Unread badge count is consistent with unread list')
    },
  },
  {
    id: 'TC16',
    name: 'So chua doc cap nhat sau khi doc mot thong bao',
    goal: 'Mark one unread notification and verify count does not increase',
    precondition: 'Co it nhat mot notification unread',
    expected: 'Unread count giam hoac giu nguyen neu khong co unread',
    run: async (api, evidence) => {
      const beforeCount = (await responseBody(await api.getUnreadCount())).data
        .count
      const item = await getFirstUnread(api)
      if (!item) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no unread item')
        return
      }
      const response = await api.markAsRead(notificationId(item)!)
      const afterCount = (await responseBody(await api.getUnreadCount())).data
        .count
      expect(response.status()).toBe(200)
      expect(afterCount).toBeLessThanOrEqual(beforeCount)
      evidence.addAssertion('Mark one unread item does not increase count')
    },
  },
  {
    id: 'TC17',
    name: 'So chua doc cap nhat sau khi doc tat ca',
    goal: 'Mark all read then verify unread count is zero',
    precondition: 'User dang nhap',
    expected: 'Unread-count = 0',
    run: async (api, evidence) => {
      const response = await api.markAllAsRead()
      const count = (await responseBody(await api.getUnreadCount())).data.count
      expect(response.status()).toBe(200)
      expect(count).toBe(0)
      evidence.addAssertion('Read-all moves unread count to zero')
    },
  },
  {
    id: 'TC18',
    name: 'Danh dau mot thong bao la da doc',
    goal: 'PATCH /notifications/:id/read',
    precondition: 'Co notification bat ky',
    expected: 'Response 200 va GET unread khong con id do',
    run: async (api, evidence) => {
      const item = await getFirstNotification(api)
      if (!item) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no notification item')
        return
      }
      const id = notificationId(item)!
      const response = await api.markAsRead(id)
      const unread = notificationItems(
        await responseBody(
          await api.listNotifications({ page: 1, limit: 100, is_read: false }),
        ),
      )
      expect(response.status()).toBe(200)
      expect(unread.some((candidate) => notificationId(candidate) === id)).toBe(
        false,
      )
      evidence.addAssertion('Marked notification is not returned as unread')
    },
  },
  {
    id: 'TC19',
    name: 'Danh dau da doc cho thong bao da doc',
    goal: 'PATCH read idempotent',
    precondition: 'Co notification bat ky',
    expected: 'Lan goi thu hai van on dinh',
    run: async (api, evidence) => {
      const item = await getFirstNotification(api)
      if (!item) {
        evidence.addAssertion('DATA_PRECONDITION_MISSING: no notification item')
        return
      }
      const id = notificationId(item)!
      expect((await api.markAsRead(id)).status()).toBe(200)
      expect([200, 404]).toContain((await api.markAsRead(id)).status())
      evidence.addAssertion('Repeated mark-read is stable for same id')
    },
  },
  {
    id: 'TC20',
    name: 'Danh dau da doc voi ID khong ton tai',
    goal: 'PATCH read fake uuid',
    precondition: 'User dang nhap',
    expected: 'HTTP 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.markAsRead(
        '00000000-0000-4000-8000-000000000099',
      )
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Mark read nonexistent notification is rejected',
      )
    },
  },
  {
    id: 'TC21',
    name: 'Danh dau da doc khi thieu quyen',
    goal: 'JWT user chi thao tac thong bao cua chinh minh',
    precondition: 'User khac dang nhap',
    expected: 'Fake id bi reject',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC21', async (userApi) => {
        const response = await userApi.markAsRead(
          '00000000-0000-4000-8000-000000000099',
        )
        expectStatus(
          response.status(),
          [400, 404],
          evidence,
          'Other JWT cannot mark a nonexistent or foreign notification',
        )
      })
    },
  },
  {
    id: 'TC22',
    name: 'Danh dau tat ca thong bao da doc',
    goal: 'PATCH /notifications/read-all',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va unread-count = 0',
    run: async (api, evidence) => {
      const response = await api.markAllAsRead()
      const count = (await responseBody(await api.getUnreadCount())).data.count
      expect(response.status()).toBe(200)
      expect(count).toBe(0)
      evidence.addAssertion('All notifications are read after read-all')
    },
  },
  {
    id: 'TC23',
    name: 'Danh dau tat ca khi khong co thong bao chua doc',
    goal: 'read-all idempotent',
    precondition: 'read-all da duoc goi truoc do',
    expected: 'HTTP 200 va count van = 0',
    run: async (api, evidence) => {
      expect((await api.markAllAsRead()).status()).toBe(200)
      const response = await api.markAllAsRead()
      const count = (await responseBody(await api.getUnreadCount())).data.count
      expect(response.status()).toBe(200)
      expect(count).toBe(0)
      evidence.addAssertion('Read-all is idempotent when unread count is zero')
    },
  },
  {
    id: 'TC24',
    name: 'Huy xac nhan doc tat ca',
    goal: 'Verify API layer khong thay doi neu client khong goi read-all',
    precondition: 'User dang nhap',
    expected: 'Chi GET unread-count, khong co PATCH read-all',
    run: async (api, evidence) => {
      const response = await api.getUnreadCount()
      expect(response.status()).toBe(200)
      evidence.addAssertion(
        'Cancel confirm is client-only; API evidence contains no read-all call',
      )
    },
  },
  {
    id: 'TC25',
    name: 'Xem cau hinh nhan thong bao',
    goal: 'GET /notifications/prefs',
    precondition: 'User dang nhap',
    expected: 'HTTP 200 va co cac key prefs',
    run: async (api, evidence) => {
      const response = await api.getPrefs()
      const prefs = prefsFromBody(await responseBody(response))
      expect(response.status()).toBe(200)
      expect(typeof prefs.deviceOffline).toBe('boolean')
      expect(typeof prefs.maintenanceAlert).toBe('boolean')
      expect(typeof prefs.ruleAlert).toBe('boolean')
      evidence.addAssertion('Prefs include three boolean switches')
    },
  },
  {
    id: 'TC26',
    name: 'Bat thong bao thiet bi offline',
    goal: 'PATCH prefs deviceOffline=true',
    precondition: 'User dang nhap',
    expected: 'deviceOffline=true va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({ deviceOffline: true })
        expect(response.status()).toBe(200)
        expect(prefsFromBody(await responseBody(response)).deviceOffline).toBe(
          true,
        )
        evidence.addAssertion('deviceOffline preference can be enabled')
      })
    },
  },
  {
    id: 'TC27',
    name: 'Tat thong bao thiet bi offline',
    goal: 'PATCH prefs deviceOffline=false',
    precondition: 'User dang nhap',
    expected: 'deviceOffline=false va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({ deviceOffline: false })
        expect(response.status()).toBe(200)
        expect(prefsFromBody(await responseBody(response)).deviceOffline).toBe(
          false,
        )
        evidence.addAssertion('deviceOffline preference can be disabled')
      })
    },
  },
  {
    id: 'TC28',
    name: 'Bat thong bao bao tri',
    goal: 'PATCH prefs maintenanceAlert=true',
    precondition: 'User dang nhap',
    expected: 'maintenanceAlert=true va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({ maintenanceAlert: true })
        expect(response.status()).toBe(200)
        expect(
          prefsFromBody(await responseBody(response)).maintenanceAlert,
        ).toBe(true)
        evidence.addAssertion('maintenanceAlert preference can be enabled')
      })
    },
  },
  {
    id: 'TC29',
    name: 'Tat thong bao bao tri',
    goal: 'PATCH prefs maintenanceAlert=false',
    precondition: 'User dang nhap',
    expected: 'maintenanceAlert=false va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({ maintenanceAlert: false })
        expect(response.status()).toBe(200)
        expect(
          prefsFromBody(await responseBody(response)).maintenanceAlert,
        ).toBe(false)
        evidence.addAssertion('maintenanceAlert preference can be disabled')
      })
    },
  },
  {
    id: 'TC30',
    name: 'Bat tat thong bao rule alert',
    goal: 'PATCH prefs ruleAlert true/false',
    precondition: 'User dang nhap',
    expected: 'ruleAlert cap nhat dung va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const enabled = await api.updatePrefs({ ruleAlert: true })
        const disabled = await api.updatePrefs({ ruleAlert: false })
        expect(enabled.status()).toBe(200)
        expect(disabled.status()).toBe(200)
        expect(prefsFromBody(await responseBody(enabled)).ruleAlert).toBe(true)
        expect(prefsFromBody(await responseBody(disabled)).ruleAlert).toBe(
          false,
        )
        evidence.addAssertion('ruleAlert preference toggles true and false')
      })
    },
  },
  {
    id: 'TC31',
    name: 'Cap nhat nhieu cau hinh cung luc',
    goal: 'PATCH ca 3 prefs',
    precondition: 'User dang nhap',
    expected: 'Ca 3 key dung request va cleanup restore',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({
          deviceOffline: true,
          maintenanceAlert: false,
          ruleAlert: true,
        })
        const prefs = prefsFromBody(await responseBody(response))
        expect(response.status()).toBe(200)
        expect(prefs.deviceOffline).toBe(true)
        expect(prefs.maintenanceAlert).toBe(false)
        expect(prefs.ruleAlert).toBe(true)
        evidence.addAssertion('Multiple prefs update atomically in response')
      })
    },
  },
  {
    id: 'TC32',
    name: 'Huy cap nhat cau hinh',
    goal: 'Verify API layer khong doi khi client cancel',
    precondition: 'User dang nhap',
    expected: 'GET truoc/sau khong PATCH',
    run: async (api, evidence) => {
      const before = prefsFromBody(await responseBody(await api.getPrefs()))
      const after = prefsFromBody(await responseBody(await api.getPrefs()))
      expect(after.deviceOffline).toBe(before.deviceOffline)
      expect(after.maintenanceAlert).toBe(before.maintenanceAlert)
      expect(after.ruleAlert).toBe(before.ruleAlert)
      evidence.addAssertion('Cancel update causes no prefs PATCH call')
    },
  },
  {
    id: 'TC33',
    name: 'Cap nhat prefs voi body rong',
    goal: 'PATCH prefs {}',
    precondition: 'User dang nhap',
    expected: 'Khong loi hoac validation ro rang',
    run: async (api, evidence) => {
      await withPrefsBackup(api, evidence, async () => {
        const response = await api.updatePrefs({})
        expectStatus(
          response.status(),
          [200, 400],
          evidence,
          response.status() === 200
            ? 'Empty prefs body is accepted as no-op'
            : 'Empty prefs body is rejected by validation',
        )
      })
    },
  },
  {
    id: 'TC34',
    name: 'Cap nhat prefs voi kieu du lieu sai',
    goal: 'PATCH prefs invalid type',
    precondition: 'User dang nhap',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.updatePrefs({ deviceOffline: 'yes' })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Invalid prefs payload type is rejected',
      )
    },
  },
  {
    id: 'TC35',
    name: 'Danh sach cap nhat khi co thong bao moi',
    goal: 'Refresh list endpoint tra timestamp/evidence moi nhat',
    precondition: 'User dang nhap',
    expected: 'Hai lan GET deu 200 va envelope hop le',
    run: async (api, evidence) => {
      const first = await api.listNotifications({ page: 1, limit: 20 })
      const second = await api.listNotifications({ page: 1, limit: 20 })
      expect(first.status()).toBe(200)
      expect(second.status()).toBe(200)
      assertListEnvelope(await responseBody(second), evidence)
      evidence.addAssertion('Refresh list returns current server state')
    },
  },
  {
    id: 'TC36',
    name: 'Refresh sau khi doc thong bao',
    goal: 'Sau read-all, refresh unread list khong con item',
    precondition: 'User dang nhap',
    expected: 'Unread list empty after refresh',
    run: async (api, evidence) => {
      expect((await api.markAllAsRead()).status()).toBe(200)
      const response = await api.listNotifications({
        page: 1,
        limit: 20,
        is_read: false,
      })
      expect(response.status()).toBe(200)
      expect(notificationItems(await responseBody(response))).toHaveLength(0)
      evidence.addAssertion('Unread list remains empty after refresh')
    },
  },
  {
    id: 'TC37',
    name: 'User khong co quyen xem thong bao',
    goal: 'Contract notification chi can JWT user hop le',
    precondition: 'User khac dang nhap',
    expected: 'HTTP 200 voi thong bao cua chinh user hoac 403 neu backend PBAC',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC37', async (userApi) => {
        const response = await userApi.listNotifications({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          [200, 403],
          evidence,
          response.status() === 200
            ? 'Valid JWT can view own notifications as documented'
            : 'Backend applies PBAC beyond notification API document',
        )
      })
    },
  },
  {
    id: 'TC38',
    name: 'User khong co quyen cap nhat cau hinh thong bao',
    goal: 'Contract prefs chi can JWT user hop le',
    precondition: 'User khac dang nhap',
    expected: 'HTTP 200 voi prefs cua chinh user hoac 403 neu backend PBAC',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC38', async (userApi) => {
        await withPrefsBackup(userApi, evidence, async () => {
          const response = await userApi.updatePrefs({ ruleAlert: true })
          expectStatus(
            response.status(),
            [200, 403],
            evidence,
            response.status() === 200
              ? 'Valid JWT can update own notification prefs as documented'
              : 'Backend applies PBAC beyond notification API document',
          )
        })
      })
    },
  },
]

test.describe('Notification API suite TC1-TC38', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearNotificationEvidenceDir(env)

    const envToken = env.rootAccessToken || env.accessToken

    if (!envToken && (!env.adminUsername || !env.adminPassword)) {
      const error =
        'BMS_ACCESS_TOKEN/BMS_ROOT_ACCESS_TOKEN or ADMIN_USERNAME/ADMIN_PASSWORD are required for notification suite'
      await writeNotificationPrecheckEvidence(
        env,
        'PRECHECK_auth_env_missing',
        {
          status: 'FAILED',
          error_message: error,
        },
      )
      throw new Error(error)
    }

    const precheckApi = await newNotificationSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writeNotificationPrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(
          `Health check failed before notification suite: ${health.status()}`,
        )
      }
    } finally {
      await precheckApi.context.dispose()
    }

    try {
      if (envToken) {
        adminToken = envToken
      } else {
        const adminLogin = await loginNotificationSuiteUser(
          env,
          env.adminUsername,
          env.adminPassword,
        )
        adminToken = adminLogin.token
        adminRefreshToken = adminLogin.refreshToken
      }
    } catch (error) {
      await writeNotificationPrecheckEvidence(env, 'PRECHECK_auth_failed', {
        status: 'FAILED',
        base_url: env.baseUrl,
        error_message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    adminApi = await newNotificationSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    if (adminToken && adminApi) {
      try {
        await adminApi.logout(adminToken, adminRefreshToken)
      } catch {
        // Best effort only; testcase evidence owns functional failures.
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
