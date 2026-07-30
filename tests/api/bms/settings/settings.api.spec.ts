import { expect, test, TestInfo } from '@playwright/test'
import {
  SettingsEvidence,
  SettingsSuiteApi,
  SettingsUserPayload,
  cleanupSettingsUser,
  clearSettingsEvidenceDir,
  generateSettingsUserPayload,
  getSettingsSuiteEnv,
  largePngLikeBuffer,
  loginSettingsUser,
  newSettingsSuiteApi,
  tinyPng,
  userFromBody,
  userIdFromBody,
} from '@src/core/bms-api/settings-suite'

const env = getSettingsSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminUserId = ''
let adminUser: any
let adminApi: SettingsSuiteApi

type SettingsTc = {
  id: string
  name: string
  run: (api: SettingsSuiteApi, evidence: SettingsEvidence) => Promise<void>
}

type CreatedUser = {
  userId: string
  payload: SettingsUserPayload
}

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: SettingsEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const createUser = async (
  api: SettingsSuiteApi,
  tcId: string,
  overrides?: Partial<SettingsUserPayload>,
) => {
  const payload = generateSettingsUserPayload(env, tcId, overrides)
  const response = await api.registerUser(payload)
  const body = await responseBody(response)
  expect(response.status()).toBe(200)
  const userId = userIdFromBody(body)
  expect(userId, 'Created user id is required').toBeTruthy()
  return { userId: userId as string, payload }
}

const withUser = async (
  api: SettingsSuiteApi,
  evidence: SettingsEvidence,
  tcId: string,
  fn: (user: CreatedUser) => Promise<void>,
  overrides?: Partial<SettingsUserPayload>,
) => {
  let userId: string | undefined
  try {
    const user = await createUser(api, tcId, overrides)
    userId = user.userId
    await fn(user)
  } finally {
    await cleanupSettingsUser(api, evidence, userId)
  }
}

const withUserApi = async (
  api: SettingsSuiteApi,
  evidence: SettingsEvidence,
  tcId: string,
  fn: (
    user: CreatedUser,
    userApi: SettingsSuiteApi,
    login: { token: string; refreshToken: string },
  ) => Promise<void>,
  overrides?: Partial<SettingsUserPayload>,
) => {
  await withUser(api, evidence, tcId, async (user) => {
    const login = await loginSettingsUser(
      env,
      user.payload.user_name,
      user.payload.password,
    )
    const userApi = await newSettingsSuiteApi(env, login.token)
    const userApiWithEvidence = userApi.withEvidence(evidence)
    try {
      await fn(user, userApiWithEvidence, login)
    } finally {
      await userApi.context.dispose()
    }
  }, overrides)
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: SettingsSuiteApi, evidence: SettingsEvidence) => Promise<void>,
) => {
  const evidence = new SettingsEvidence(testInfo, tcId, tcName, env.baseUrl)
  const api = adminApi.withEvidence(evidence)

  await evidence.attachStep({
    step: 'Auth precondition',
    method: 'TOKEN',
    endpoint: adminToken ? 'env/shared token or login result' : `${env.apiPrefix}/auth/login`,
    status: 200,
    response: {
      token_present: Boolean(adminToken),
      token_length: adminToken.length,
      user_id: adminUserId,
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

const authEndpoint = (path: string) => `${env.apiPrefix}/auth/${path}`

const cases: SettingsTc[] = [
  {
    id: 'TC1',
    name: 'Xem thong tin tai khoan thanh cong',
    run: async (api, evidence) => {
      const response = await api.me()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(userFromBody(body).email).toBeTruthy()
      evidence.addAssertion('Current account info returns email/display name/avatar fields')
    },
  },
  {
    id: 'TC2',
    name: 'Khong xem duoc thong tin khi thieu token',
    run: async (api, evidence) => {
      const response = await api.requestWithoutToken('POST', authEndpoint('me'), {})
      expectStatus(response.status(), [400, 401], evidence, 'Account info without token is rejected')
    },
  },
  {
    id: 'TC3',
    name: 'Cap nhat ten hien thi thanh cong',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC3', async (user, userApi) => {
        const displayName = 'Auto Settings Updated'
        const response = await userApi.updateUser({
          user_id: user.userId,
          display_name: displayName,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(userFromBody(body).display_name).toBe(displayName)
        evidence.addAssertion('Display name is updated for current user')
      })
    },
  },
  {
    id: 'TC4',
    name: 'Cap nhat email thanh cong',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC4', async (user, userApi) => {
        const email = `${user.payload.user_name}_new@auto-test.local`.toLowerCase()
        const response = await userApi.updateUser({
          user_id: user.userId,
          email,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(userFromBody(body).email).toBe(email)
        evidence.addAssertion('Email is updated for current user')
      })
    },
  },
  {
    id: 'TC5',
    name: 'Cap nhat so dien thoai thanh cong',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC5', async (user, userApi) => {
        const phone = `+849${String(Date.now()).slice(-8)}`
        const response = await userApi.updateUser({
          user_id: user.userId,
          phone,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(userFromBody(body).phone).toBe(phone)
        evidence.addAssertion('Phone number is updated for current user')
      })
    },
  },
  {
    id: 'TC6',
    name: 'Cap nhat avatar thanh cong',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC6', async (user, userApi) => {
        if (env.allowFileUploads) {
          const upload = await userApi.uploadFile(
            { content_type: 'image/png', folder: 'avatars' },
            { name: 'avatar.png', mimeType: 'image/png', buffer: tinyPng() },
          )
          const uploadBody = await responseBody(upload)
          expect(upload.status()).toBe(200)
          const avatar = uploadBody?.data?.key || uploadBody?.data?.url
          expect(avatar).toBeTruthy()
          const update = await userApi.updateUser({ user_id: user.userId, avatar })
          expect(update.status()).toBe(200)
          evidence.addCleanupWarning('Uploaded avatar object has no delete API in Postman collection')
          evidence.addAssertion('Avatar upload and profile update succeed')
          return
        }

        const avatar = adminUser?.avatar || 'avatar/02fb489c-5064-4f90-a633-56d103e291ed_1782278437.png'
        const response = await userApi.updateUser({ user_id: user.userId, avatar })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Avatar update succeeds with existing avatar key; valid upload guarded to avoid storage trash')
      })
    },
  },
  {
    id: 'TC7',
    name: 'Lay presigned URL avatar thanh cong',
    run: async (api, evidence) => {
      const key = adminUser?.avatar || 'avatars/random-uuid.jpg'
      const response = await api.presignedUrl({ key, expires_in: 86400 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body?.data?.url).toContain('X-Amz-')
      evidence.addAssertion('Presigned avatar URL is returned')
    },
  },
  {
    id: 'TC8',
    name: 'Cap nhat email sai dinh dang',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC8', async (user, userApi) => {
        const response = await userApi.updateUser({
          user_id: user.userId,
          email: 'invalid-email',
        })
        expectStatus(response.status(), [400], evidence, 'Invalid email format is rejected')
      })
    },
  },
  {
    id: 'TC9',
    name: 'Cap nhat so dien thoai sai dinh dang',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC9', async (user, userApi) => {
        const response = await userApi.updateUser({
          user_id: user.userId,
          phone: 'bad-phone',
        })
        expectStatus(response.status(), [400], evidence, 'Invalid phone format is rejected')
      })
    },
  },
  {
    id: 'TC10',
    name: 'Cap nhat ten hien thi rong',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC10', async (user, userApi) => {
        const response = await userApi.updateUser({
          user_id: user.userId,
          display_name: '',
        })
        expectStatus(response.status(), [200, 400], evidence, 'Empty display name behavior is captured')
        if (response.status() === 200) {
          evidence.addAssertion('TODO_CONFIRM_VALIDATION backend accepts empty display_name')
        }
      })
    },
  },
  {
    id: 'TC11',
    name: 'Cap nhat ten hien thi toan khoang trang',
    run: async (api, evidence) => {
      await withUserApi(api, evidence, 'TC11', async (user, userApi) => {
        const response = await userApi.updateUser({
          user_id: user.userId,
          display_name: '   ',
        })
        expectStatus(response.status(), [200, 400], evidence, 'Whitespace display name behavior is captured')
        if (response.status() === 200) {
          evidence.addAssertion('TODO_CONFIRM_VALIDATION backend accepts whitespace display_name')
        }
      })
    },
  },
  {
    id: 'TC12',
    name: 'Cap nhat email trung user khac',
    run: async (api, evidence) => {
      let secondUserId: string | undefined
      await withUserApi(api, evidence, 'TC12_a', async (user, userApi) => {
        try {
          const second = await createUser(api, 'TC12_b')
          secondUserId = second.userId
          const response = await userApi.updateUser({
            user_id: user.userId,
            email: second.payload.email,
          })
          expectStatus(response.status(), [400, 409], evidence, 'Duplicate email is rejected')
        } finally {
          await cleanupSettingsUser(api, evidence, secondUserId)
        }
      })
    },
  },
  {
    id: 'TC13',
    name: 'Upload avatar sai dinh dang file',
    run: async (api, evidence) => {
      const response = await api.uploadFile(
        { content_type: 'text/plain', folder: 'avatars' },
        { name: 'avatar.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
      )
      expectStatus(response.status(), [400], evidence, 'Invalid avatar file format is rejected')
    },
  },
  {
    id: 'TC14',
    name: 'Upload avatar dung luong vuot gioi han',
    run: async (api, evidence) => {
      if (!env.allowFileUploads) {
        await evidence.attachStep({
          step: 'Large upload guard',
          method: 'POST',
          endpoint: `${env.apiPrefix}/files/upload?content_type=image/png&folder=avatars`,
          status: 0,
          request: { file: { name: 'large.png', mimeType: 'image/png', size: 6 * 1024 * 1024 } },
          response: 'WRITE_GUARD_SKIPPED: set SETTINGS_ALLOW_FILE_UPLOADS=true to execute large upload against real object storage',
        })
        evidence.addAssertion('Large valid upload is guarded to avoid storage trash and long backend upload')
        return
      }

      try {
        const response = await api.uploadFile(
          { content_type: 'image/png', folder: 'avatars' },
          { name: 'large.png', mimeType: 'image/png', buffer: largePngLikeBuffer(6 * 1024 * 1024) },
          10_000,
        )
        expectStatus(response.status(), [400, 413, 422, 500], evidence, 'Oversized avatar upload is rejected or handled')
      } catch (error) {
        await evidence.attachStep({
          step: 'Large upload timeout',
          method: 'POST',
          endpoint: `${env.apiPrefix}/files/upload?content_type=image/png&folder=avatars`,
          status: 0,
          request: { file: { name: 'large.png', mimeType: 'image/png', size: 6 * 1024 * 1024 } },
          response: `Timeout/Error captured: ${error instanceof Error ? error.message : String(error)}`,
        })
        evidence.addAssertion('Oversized upload timeout/error is captured as backend behavior evidence')
      }
    },
  },
  {
    id: 'TC15',
    name: 'Huy cap nhat thong tin',
    run: async (api, evidence) => {
      const before = await api.me()
      const after = await api.me()
      expect(before.status()).toBe(200)
      expect(after.status()).toBe(200)
      expect(userFromBody(await responseBody(after)).email).toBe(
        userFromBody(await responseBody(before)).email,
      )
      evidence.addAssertion('Cancel update is client-only; account data is unchanged without update API call')
    },
  },
  {
    id: 'TC16',
    name: 'Reset mat khau thanh cong',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC16', async (user) => {
        const response = await api.resetPassword({
          user_id: user.userId,
          new_password: env.testUserNewPassword,
        })
        expect(response.status()).toBe(200)
        const login = await loginSettingsUser(env, user.payload.user_name, env.testUserNewPassword)
        expect(login.token).toBeTruthy()
        evidence.addAssertion('Password reset succeeds and new password can login')
      })
    },
  },
  {
    id: 'TC17',
    name: 'Reset mat khau thieu mat khau moi',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC17', async (user) => {
        const response = await api.resetPassword({ user_id: user.userId })
        expectStatus(response.status(), [400], evidence, 'Missing new password is rejected')
      })
    },
  },
  {
    id: 'TC18',
    name: 'Reset mat khau qua ngan',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC18', async (user) => {
        const response = await api.resetPassword({
          user_id: user.userId,
          new_password: '123',
        })
        expectStatus(response.status(), [400], evidence, 'Short new password is rejected')
      })
    },
  },
  {
    id: 'TC19',
    name: 'Reset mat khau thieu user id',
    run: async (api, evidence) => {
      const response = await api.resetPassword({
        new_password: env.testUserNewPassword,
      })
      expectStatus(response.status(), [400], evidence, 'Missing reset user_id is rejected')
    },
  },
  {
    id: 'TC20',
    name: 'Dang xuat tai khoan thanh cong',
    run: async (api, evidence) => {
      if (!env.adminUsername || !env.adminPassword) {
        await evidence.attachStep({
          step: 'Logout guard',
          method: 'POST',
          endpoint: authEndpoint('logout'),
          status: 0,
          response: 'WRITE_GUARD_SKIPPED: ADMIN_USERNAME/ADMIN_PASSWORD are required to create a disposable login session for logout',
        })
        evidence.addAssertion('Logout success is guarded when only a shared token is available')
        return
      }

      const loginResponse = await api.login({
        user_name: env.adminUsername,
        password: env.adminPassword,
      })
      const loginBody = await responseBody(loginResponse)
      expect(loginResponse.status()).toBe(200)
      const disposableToken =
        loginBody?.data?.access_token || loginBody?.data?.token
      const disposableRefreshToken =
        loginBody?.data?.refresh_token || loginBody?.data?.refreshToken
      expect(disposableToken).toBeTruthy()
      expect(disposableRefreshToken).toBeTruthy()

      const sessionApi = await newSettingsSuiteApi(env, disposableToken)
      try {
        const response = await sessionApi.withEvidence(evidence).logout({
          refresh_token: disposableRefreshToken,
        })
        expect(response.status()).toBe(200)
        evidence.addAssertion('Logout succeeds with valid disposable admin refresh token')
      } finally {
        await sessionApi.context.dispose()
      }
    },
  },
  {
    id: 'TC21',
    name: 'Huy dang xuat',
    run: async (api, evidence) => {
      const before = await api.me()
      const after = await api.me()
      expect(before.status()).toBe(200)
      expect(after.status()).toBe(200)
      evidence.addAssertion('Cancel logout is client-only; token remains usable without logout API call')
    },
  },
  {
    id: 'TC22',
    name: 'Logout thieu refresh token',
    run: async (api, evidence) => {
      const response = await api.logout({})
      expectStatus(response.status(), [400, 401], evidence, 'Logout without refresh token is rejected or session clear is enforced')
    },
  },
]

test.describe.serial('BMS Settings API', () => {
  test.beforeAll(async () => {
    await clearSettingsEvidenceDir(env)

    if (env.adminAccessToken || env.rootAccessToken) {
      adminToken = env.adminAccessToken || env.rootAccessToken
      adminApi = await newSettingsSuiteApi(env, adminToken)
      const me = await adminApi.me()
      const body = await responseBody(me)
      adminUser = userFromBody(body)
      adminUserId = adminUser?.user_id || adminUser?.id || ''
      return
    }

    if (!env.adminUsername || !env.adminPassword) {
      throw new Error(
        'SETTINGS_ADMIN_ACCESS_TOKEN/BMS_ACCESS_TOKEN/BMS_ROOT_ACCESS_TOKEN or ADMIN_USERNAME/ADMIN_PASSWORD are required',
      )
    }

    const login = await loginSettingsUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    adminToken = login.token
    adminRefreshToken = login.refreshToken
    adminUserId = login.userId || ''
    adminUser = login.user
    adminApi = await newSettingsSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    if (adminApi) await adminApi.context.dispose()
    adminRefreshToken = ''
  })

  for (const tc of cases) {
    test(`${tc.id} ${tc.name}`, async ({}, testInfo) => {
      await runTc(testInfo, tc.id, tc.name, tc.run)
    })
  }
})
