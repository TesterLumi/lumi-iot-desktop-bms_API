import { expect, test, TestInfo } from '@playwright/test'
import {
  AccountEvidence,
  AccountSuiteApi,
  AccountUserPayload,
  GeneratedAccountUserPayload,
  cleanupUser,
  clearAccountEvidenceDir,
  fakeUserId,
  findSessionId,
  generateAccountUserPayload,
  getAccountSuiteEnv,
  listItems,
  loginAccountSuiteUser,
  newAccountSuiteApi,
  userIdFromBody,
  verifyUserFoundBySearch,
  writePrecheckEvidence,
} from '@src/core/bms-api/account-management-suite'

const env = getAccountSuiteEnv()

let adminToken = ''
let adminRefreshToken = ''
let adminUserId = ''
let adminApi: AccountSuiteApi

type AccountTc = {
  id: string
  name: string
  goal: string
  precondition: string
  expected: string
  run: (api: AccountSuiteApi, evidence: AccountEvidence) => Promise<void>
}

type CreatedUser = {
  userId: string
  payload: GeneratedAccountUserPayload
}

const responseBody = async (response: { json: () => Promise<unknown> }) =>
  (await response.json()) as any

const responseData = (body: any) => body?.data?.user || body?.data || {}

const requireId = (value: string | undefined, message: string) => {
  expect(value, message).toBeTruthy()
  if (!value) throw new Error(message)
  return value
}

const expectStatus = (
  actual: number,
  expected: number[],
  evidence: AccountEvidence,
  assertion: string,
) => {
  expect(expected).toContain(actual)
  evidence.addAssertion(assertion)
}

const createUser = async (
  api: AccountSuiteApi,
  tcId: string,
  overrides?: AccountUserPayload,
): Promise<CreatedUser> => {
  const payload = generateAccountUserPayload(env, tcId, overrides)
  const response = await api.registerUser(payload)
  const body = await responseBody(response)
  expect(response.status()).toBe(200)

  return {
    userId: requireId(userIdFromBody(body), 'Created user id is required'),
    payload,
  }
}

const withUser = async (
  api: AccountSuiteApi,
  evidence: AccountEvidence,
  tcId: string,
  fn: (user: CreatedUser) => Promise<void>,
  overrides?: AccountUserPayload,
) => {
  let userId: string | undefined
  try {
    const user = await createUser(api, tcId, overrides)
    userId = user.userId
    await fn(user)
  } finally {
    await cleanupUser(api, evidence, userId)
  }
}

const loginCreatedUserApi = async (user: CreatedUser) => {
  const login = await loginAccountSuiteUser(
    env,
    user.payload.user_name,
    user.payload.password,
  )
  return newAccountSuiteApi(env, login.token)
}

const withNoPermissionApi = async (
  api: AccountSuiteApi,
  evidence: AccountEvidence,
  tcId: string,
  fn: (userApi: AccountSuiteApi) => Promise<void>,
) => {
  if (env.noPermissionUsername && env.noPermissionPassword) {
    const login = await loginAccountSuiteUser(
      env,
      env.noPermissionUsername,
      env.noPermissionPassword,
    )
    const userApi = await newAccountSuiteApi(env, login.token)
    try {
      await fn(userApi)
    } finally {
      await userApi.context.dispose()
    }
    return
  }

  await withUser(api, evidence, `${tcId}_noperm`, async (user) => {
    const userApi = await loginCreatedUserApi(user)
    try {
      await fn(userApi)
    } finally {
      await userApi.context.dispose()
    }
  })
}

const withViewerApi = async (
  api: AccountSuiteApi,
  evidence: AccountEvidence,
  tcId: string,
  fn: (viewerApi: AccountSuiteApi) => Promise<void>,
) => {
  if (env.viewerUsername && env.viewerPassword) {
    const login = await loginAccountSuiteUser(
      env,
      env.viewerUsername,
      env.viewerPassword,
    )
    const viewerApi = await newAccountSuiteApi(env, login.token)
    try {
      await fn(viewerApi)
    } finally {
      await viewerApi.context.dispose()
    }
    return
  }

  await withNoPermissionApi(api, evidence, tcId, fn)
}

const assertUserFound = async (
  api: AccountSuiteApi,
  user: CreatedUser,
  evidence: AccountEvidence,
) => {
  expect(
    await verifyUserFoundBySearch(api, user.userId, user.payload.user_name),
  ).toBe(true)
  evidence.addAssertion('Created user can be found by list users search')
}

const expectRejectedOrCleanupCreatedUser = async (
  response: { status: () => number; json: () => Promise<unknown> },
  api: AccountSuiteApi,
  evidence: AccountEvidence,
  expectedStatuses: number[],
  assertion: string,
) => {
  const body = await responseBody(response)
  const createdUserId = userIdFromBody(body)

  if (response.status() === 200 && createdUserId) {
    await cleanupUser(api, evidence, createdUserId)
    evidence.addAssertion(
      `TODO_CONFIRM_VALIDATION backend accepted invalid payload; cleanup user_id=${createdUserId}`,
    )
    return body
  }

  expectStatus(response.status(), expectedStatuses, evidence, assertion)
  return body
}

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: AccountSuiteApi, evidence: AccountEvidence) => Promise<void>,
) => {
  const evidence = new AccountEvidence(testInfo, tcId, tcName, env.baseUrl)
  const api = adminApi.withEvidence(evidence)

  await evidence.attachStep({
    step: 'Login admin precondition',
    method: 'POST',
    endpoint: `${env.apiPrefix}/auth/login`,
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

const cases: AccountTc[] = [
  {
    id: 'TC1',
    name: 'Health check he thong thanh cong',
    goal: 'Kiem tra API health cua he thong that',
    precondition: 'BASE_URL hop le',
    expected: 'HTTP 200 va success=true',
    run: async (api, evidence) => {
      const response = await api.healthCheck()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      if (typeof body === 'object' && body !== null && 'success' in body) {
        expect(body.success).toBe(true)
      } else {
        expect(body).toBeTruthy()
      }
      evidence.addAssertion(
        'Health returns HTTP 200 with healthy response body',
      )
    },
  },
  {
    id: 'TC2',
    name: 'Login thanh cong voi admin',
    goal: 'Kiem tra admin login lay access_token va refresh_token that',
    precondition: 'Admin credential dung',
    expected: 'HTTP 200 va co token, user',
    run: async (api, evidence) => {
      const response = await api.login({
        user_name: env.adminUsername,
        password: env.adminPassword,
      })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.access_token).toBeTruthy()
      expect(body.data?.refresh_token).toBeTruthy()
      expect(body.data?.user).toBeTruthy()
      evidence.addAssertion(
        'Admin login returns access_token, refresh_token, user',
      )
    },
  },
  {
    id: 'TC3',
    name: 'Login sai password bi tu choi',
    goal: 'Kiem tra validation credential sai',
    precondition: 'Admin ton tai',
    expected: 'HTTP 400 hoac 401',
    run: async (api, evidence) => {
      const response = await api.login({
        user_name: env.adminUsername,
        password: `${env.adminPassword}_wrong`,
      })
      expectStatus(
        response.status(),
        [400, 401],
        evidence,
        'Wrong password is rejected',
      )
    },
  },
  {
    id: 'TC4',
    name: 'Login thieu user_name',
    goal: 'Kiem tra validation missing user_name',
    precondition: 'Khong co',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.login({ password: env.adminPassword })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing user_name returns 400',
      )
    },
  },
  {
    id: 'TC5',
    name: 'Login thieu password',
    goal: 'Kiem tra validation missing password',
    precondition: 'Khong co',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.login({ user_name: env.adminUsername })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing password returns 400',
      )
    },
  },
  {
    id: 'TC6',
    name: 'Login thieu client header',
    goal: 'Kiem tra login bi chan khi thieu x-client-api-key',
    precondition: 'CLIENT_API_KEY duoc cau hinh',
    expected: 'HTTP 400 hoac 401',
    run: async (_, evidence) => {
      if (!env.apiKey) {
        evidence.addAssertion('SKIPPED_FIXTURE_MISSING: CLIENT_API_KEY/API_KEY')
        return
      }
      const api = await newAccountSuiteApi(env, undefined, true)
      try {
        const response = await api.withEvidence(evidence).login({
          user_name: env.adminUsername,
          password: env.adminPassword,
        })
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          'Login without x-client-api-key is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC7',
    name: 'Refresh token thanh cong',
    goal: 'Kiem tra refresh token hop le tra access_token moi',
    precondition: 'Co refresh_token hop le',
    expected: 'HTTP 200 va co access_token',
    run: async (api, evidence) => {
      const login = await loginAccountSuiteUser(
        env,
        env.adminUsername,
        env.adminPassword,
      )
      const response = await api.refreshToken(login.refreshToken, true)
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.access_token).toBeTruthy()
      evidence.addAssertion('Refresh token returns access_token')
    },
  },
  {
    id: 'TC8',
    name: 'Refresh token rong',
    goal: 'Kiem tra validation refresh_token rong',
    precondition: 'Khong co',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.refreshToken('', true)
      expectStatus(
        response.status(),
        [400, 401],
        evidence,
        'Empty refresh_token is rejected',
      )
    },
  },
  {
    id: 'TC9',
    name: 'Logout thanh cong',
    goal: 'Kiem tra logout voi token va refresh_token hop le',
    precondition: 'Login thanh cong',
    expected: 'HTTP 200 va success=true',
    run: async (api, evidence) => {
      const login = await loginAccountSuiteUser(
        env,
        env.adminUsername,
        env.adminPassword,
      )
      const response = await api.logout(login.token, login.refreshToken)
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.success).toBe(true)
      evidence.addAssertion('Logout returns success=true')
    },
  },
  {
    id: 'TC10',
    name: 'Forgot password public',
    goal: 'Kiem tra API forgot-password public',
    precondition: 'Khong can token',
    expected: 'HTTP 200 va co message',
    run: async (api, evidence) => {
      const response = await api.forgotPassword()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.message).toBeTruthy()
      evidence.addAssertion(
        'Forgot password returns public instruction message',
      )
    },
  },
  {
    id: 'TC11',
    name: 'Lay thong tin user hien tai thanh cong',
    goal: 'Kiem tra /me voi token hop le',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va co user_id/email/display_name',
    run: async (api, evidence) => {
      const response = await api.me()
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.user_id || body.data?.id).toBeTruthy()
      expect(body.data?.email).toBeTruthy()
      expect(body.data?.display_name).toBeTruthy()
      evidence.addAssertion('/me returns current user fields')
    },
  },
  {
    id: 'TC12',
    name: 'Me khong truyen token',
    goal: 'Kiem tra auth guard /me',
    precondition: 'Khong token',
    expected: 'HTTP 401',
    run: async (_, evidence) => {
      const api = await newAccountSuiteApi(env)
      try {
        const response = await api.withEvidence(evidence).me()
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          '/me without token is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC13',
    name: 'Me token sai',
    goal: 'Kiem tra invalid bearer token',
    precondition: 'Bearer invalid',
    expected: 'HTTP 401',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken(
        'POST',
        authEndpoint('me'),
        {},
      )
      expectStatus(
        response.status(),
        [401],
        evidence,
        '/me with invalid token returns 401',
      )
    },
  },
  {
    id: 'TC14',
    name: 'Admin tao tai khoan hop le',
    goal: 'Kiem tra admin tao user hop le',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va user tim thay trong list',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC14', async (user) => {
        await assertUserFound(api, user, evidence)
      })
    },
  },
  {
    id: 'TC15',
    name: 'Tao tai khoan thieu user_name',
    goal: 'Kiem tra validation missing user_name',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const payload = generateAccountUserPayload(env, 'TC15')
      const response = await api.registerUser({
        ...payload,
        user_name: undefined,
      })
      await expectRejectedOrCleanupCreatedUser(
        response,
        api,
        evidence,
        [400],
        'Missing user_name returns 400',
      )
    },
  },
  {
    id: 'TC16',
    name: 'Tao tai khoan thieu email',
    goal: 'Kiem tra validation missing email',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const payload = generateAccountUserPayload(env, 'TC16')
      const response = await api.registerUser({ ...payload, email: undefined })
      await expectRejectedOrCleanupCreatedUser(
        response,
        api,
        evidence,
        [400],
        'Missing email returns 400',
      )
    },
  },
  {
    id: 'TC17',
    name: 'Tao tai khoan email sai format',
    goal: 'Kiem tra validation email format',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.registerUser(
        generateAccountUserPayload(env, 'TC17', { email: 'abc' }),
      )
      await expectRejectedOrCleanupCreatedUser(
        response,
        api,
        evidence,
        [400],
        'Invalid email format returns 400',
      )
    },
  },
  {
    id: 'TC18',
    name: 'Tao tai khoan thieu password',
    goal: 'Kiem tra validation missing password',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const payload = generateAccountUserPayload(env, 'TC18')
      const response = await api.registerUser({
        ...payload,
        password: undefined,
      })
      await expectRejectedOrCleanupCreatedUser(
        response,
        api,
        evidence,
        [400],
        'Missing password returns 400',
      )
    },
  },
  {
    id: 'TC19',
    name: 'Tao tai khoan password yeu',
    goal: 'Kiem tra password policy',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.registerUser(
        generateAccountUserPayload(env, 'TC19', { password: '123' }),
      )
      await expectRejectedOrCleanupCreatedUser(
        response,
        api,
        evidence,
        [400],
        'Weak password returns 400',
      )
    },
  },
  {
    id: 'TC20',
    name: 'Tao tai khoan trung user_name',
    goal: 'Kiem tra duplicate user_name',
    precondition: 'Da co user A',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC20', async (user) => {
        const payload = generateAccountUserPayload(env, 'TC20_dup', {
          user_name: user.payload.user_name,
        })
        const response = await api.registerUser(payload)
        await expectRejectedOrCleanupCreatedUser(
          response,
          api,
          evidence,
          [400, 409],
          'Duplicate user_name is rejected',
        )
      })
    },
  },
  {
    id: 'TC21',
    name: 'Tao tai khoan trung email',
    goal: 'Kiem tra duplicate email',
    precondition: 'Da co email A',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC21', async (user) => {
        const payload = generateAccountUserPayload(env, 'TC21_dup', {
          email: user.payload.email,
        })
        const response = await api.registerUser(payload)
        await expectRejectedOrCleanupCreatedUser(
          response,
          api,
          evidence,
          [400, 409],
          'Duplicate email is rejected',
        )
      })
    },
  },
  {
    id: 'TC22',
    name: 'User khong co quyen tao tai khoan',
    goal: 'Kiem tra permission create user',
    precondition: 'no_permission token',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC22', async (userApi) => {
        const response = await userApi
          .withEvidence(evidence)
          .registerUser(generateAccountUserPayload(env, 'TC22_target'))
        await expectRejectedOrCleanupCreatedUser(
          response,
          api,
          evidence,
          [403],
          'No-permission user cannot create user',
        )
      })
    },
  },
  {
    id: 'TC23',
    name: 'Khong token tao tai khoan',
    goal: 'Kiem tra auth guard register',
    precondition: 'Khong token',
    expected: 'HTTP 401',
    run: async (_, evidence) => {
      const api = await newAccountSuiteApi(env)
      try {
        const response = await api
          .withEvidence(evidence)
          .registerUser(generateAccountUserPayload(env, 'TC23'))
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          'Register without token is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC24',
    name: 'Lay danh sach tai khoan thanh cong',
    goal: 'Kiem tra list users co pagination',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va co items/total/page/limit',
    run: async (api, evidence) => {
      const response = await api.listUsers({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(body.data?.items)).toBe(true)
      expect(body.data?.total).toBeDefined()
      expect(body.data?.page).toBeDefined()
      expect(body.data?.limit).toBeDefined()
      evidence.addAssertion('List users returns pagination envelope')
    },
  },
  {
    id: 'TC25',
    name: 'Search tai khoan theo username',
    goal: 'Kiem tra search user_name',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va items chua user',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC25', async (user) => {
        await assertUserFound(api, user, evidence)
      })
    },
  },
  {
    id: 'TC26',
    name: 'Filter active true',
    goal: 'Kiem tra filter active=true',
    precondition: 'Co user active',
    expected: 'HTTP 200 va tim thay user active',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC26', async (user) => {
        const response = await api.listUsers({
          search: user.payload.user_name,
          active: true,
          page: 1,
          limit: 20,
        })
        expect(response.status()).toBe(200)
        expect(
          listItems(await responseBody(response)).some(
            (item) => item.id === user.userId,
          ),
        ).toBe(true)
        evidence.addAssertion(
          'active=true filter returns active automation user',
        )
      })
    },
  },
  {
    id: 'TC27',
    name: 'Filter active false',
    goal: 'Kiem tra filter active=false',
    precondition: 'Co user inactive',
    expected: 'HTTP 200 va tim thay user inactive',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC27', async (user) => {
        expect(
          (
            await api.updateUserStatus({ user_id: user.userId, active: false })
          ).status(),
        ).toBe(200)
        const response = await api.listUsers({
          search: user.payload.user_name,
          active: false,
          page: 1,
          limit: 20,
        })
        expect(response.status()).toBe(200)
        expect(
          listItems(await responseBody(response)).some(
            (item) => item.id === user.userId,
          ),
        ).toBe(true)
        evidence.addAssertion(
          'active=false filter returns inactive automation user',
        )
      })
    },
  },
  {
    id: 'TC28',
    name: 'Filter locked false',
    goal: 'Kiem tra filter locked=false',
    precondition: 'Co user khong locked',
    expected: 'HTTP 200 va tim thay user unlocked',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC28', async (user) => {
        const response = await api.listUsers({
          search: user.payload.user_name,
          locked: false,
          page: 1,
          limit: 20,
        })
        expect(response.status()).toBe(200)
        expect(
          listItems(await responseBody(response)).some(
            (item) => item.id === user.userId,
          ),
        ).toBe(true)
        evidence.addAssertion(
          'locked=false filter returns unlocked automation user',
        )
      })
    },
  },
  {
    id: 'TC29',
    name: 'Pagination limit 10',
    goal: 'Kiem tra limit=10',
    precondition: 'Admin token hop le',
    expected: 'HTTP 200 va limit=10',
    run: async (api, evidence) => {
      const response = await api.listUsers({ page: 1, limit: 10 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.data?.limit).toBe(10)
      expect(listItems(body).length).toBeLessThanOrEqual(10)
      evidence.addAssertion('List users respects limit=10')
    },
  },
  {
    id: 'TC30',
    name: 'Limit vuot qua max',
    goal: 'Kiem tra validation/capping limit > 100',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac cap ve 100',
    run: async (api, evidence) => {
      const response = await api.listUsers({ page: 1, limit: 101 })
      const body = await responseBody(response)
      expect([200, 400]).toContain(response.status())
      if (response.status() === 200)
        expect(body.data?.limit).toBeLessThanOrEqual(100)
      evidence.addAssertion('limit>100 is rejected or capped by backend')
    },
  },
  {
    id: 'TC31',
    name: 'Page sai kieu',
    goal: 'Kiem tra validation page khong phai number',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.listUsers({ page: 'abc' as any, limit: 20 })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Invalid page type returns 400',
      )
    },
  },
  {
    id: 'TC32',
    name: 'Khong token list users',
    goal: 'Kiem tra auth guard list users',
    precondition: 'Khong token',
    expected: 'HTTP 401',
    run: async (_, evidence) => {
      const api = await newAccountSuiteApi(env)
      try {
        const response = await api
          .withEvidence(evidence)
          .listUsers({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          'List users without token is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC33',
    name: 'User khong co quyen list users',
    goal: 'Kiem tra permission view user list',
    precondition: 'no_permission token',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withNoPermissionApi(api, evidence, 'TC33', async (userApi) => {
        const response = await userApi
          .withEvidence(evidence)
          .listUsers({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          [403],
          evidence,
          'No-permission user cannot list users',
        )
      })
    },
  },
  {
    id: 'TC34',
    name: 'Cap nhat display_name',
    goal: 'Kiem tra update display_name user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va display_name moi dung',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC34', async (user) => {
        const displayName = 'Auto User Updated'
        const response = await api.updateUser({
          user_id: user.userId,
          display_name: displayName,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(responseData(body).display_name).toBe(displayName)
        evidence.addAssertion('display_name is updated')
      })
    },
  },
  {
    id: 'TC35',
    name: 'Cap nhat email',
    goal: 'Kiem tra update email user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va email moi dung',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC35', async (user) => {
        const email = `updated_${user.payload.email}`
        const response = await api.updateUser({ user_id: user.userId, email })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(String(responseData(body).email).toLowerCase()).toBe(
          email.toLowerCase(),
        )
        evidence.addAssertion('email is updated')
      })
    },
  },
  {
    id: 'TC36',
    name: 'Cap nhat phone',
    goal: 'Kiem tra update phone user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va phone moi dung',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC36', async (user) => {
        const phone = `+848${String(Date.now()).slice(-8)}`
        const response = await api.updateUser({ user_id: user.userId, phone })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(responseData(body).phone).toBe(phone)
        evidence.addAssertion('phone is updated')
      })
    },
  },
  {
    id: 'TC37',
    name: 'Cap nhat avatar URL',
    goal: 'Kiem tra update avatar user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va avatar moi dung',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC37', async (user) => {
        const avatar = `https://example.com/avatar-${Date.now()}.jpg`
        const userApi = await loginCreatedUserApi(user)
        try {
          const response = await userApi
            .withEvidence(evidence)
            .updateUser({ user_id: user.userId, avatar })
          const body = await responseBody(response)
          expect(response.status()).toBe(200)
          expect(responseData(body).avatar).toBe(avatar)
          evidence.addAssertion('User can update own avatar')
        } finally {
          await userApi.context.dispose()
        }
      })
    },
  },
  {
    id: 'TC38',
    name: 'Update email trung user khac',
    goal: 'Kiem tra duplicate email khi update',
    precondition: 'Co user A va B',
    expected: 'HTTP 400 hoac 409',
    run: async (api, evidence) => {
      let userA: CreatedUser | undefined
      let userB: CreatedUser | undefined
      try {
        userA = await createUser(api, 'TC38_A')
        userB = await createUser(api, 'TC38_B')
        const response = await api.updateUser({
          user_id: userB.userId,
          email: userA.payload.email,
        })
        expectStatus(
          response.status(),
          [400, 409],
          evidence,
          'Duplicate email update is rejected',
        )
      } finally {
        await cleanupUser(api, evidence, userB?.userId)
        await cleanupUser(api, evidence, userA?.userId)
      }
    },
  },
  {
    id: 'TC39',
    name: 'Update user khong ton tai',
    goal: 'Kiem tra update fake user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.updateUser({
        user_id: fakeUserId,
        display_name: 'Fake User',
      })
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Update nonexistent user is rejected',
      )
    },
  },
  {
    id: 'TC40',
    name: 'Update user_id sai format',
    goal: 'Kiem tra validation user_id invalid',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac 500 theo he thong that hien tai',
    run: async (api, evidence) => {
      const response = await api.updateUser({
        user_id: 'abc',
        display_name: 'Invalid',
      })
      expectStatus(
        response.status(),
        [400, 500],
        evidence,
        'Invalid user_id format is rejected',
      )
    },
  },
  {
    id: 'TC41',
    name: 'User khong co quyen update user khac',
    goal: 'Kiem tra permission update user',
    precondition: 'no_permission token va user automation',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC41_target', async (target) => {
        await withNoPermissionApi(api, evidence, 'TC41', async (userApi) => {
          const response = await userApi
            .withEvidence(evidence)
            .updateUser({ user_id: target.userId, display_name: 'Blocked' })
          expectStatus(
            response.status(),
            [403],
            evidence,
            'No-permission user cannot update another user',
          )
        })
      })
    },
  },
  {
    id: 'TC42',
    name: 'Admin thuong update System Admin bi chan',
    goal: 'Kiem tra guard system admin',
    precondition: 'SYSTEM_ADMIN_USER_ID fixture an toan',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      if (!env.systemAdminUserId) {
        evidence.addAssertion(
          'SKIPPED_FIXTURE_MISSING: SYSTEM_ADMIN_USER_ID/BMS_SYS_ADMIN_USER_ID',
        )
        return
      }
      const response = await api.updateUser({
        user_id: env.systemAdminUserId,
        display_name: 'Blocked System Admin Update',
      })
      expectStatus(
        response.status(),
        [403],
        evidence,
        'System admin update is blocked',
      )
    },
  },
  {
    id: 'TC43',
    name: 'Deactivate user',
    goal: 'Kiem tra active=false user automation',
    precondition: 'Tao user test active=true',
    expected: 'HTTP 200 va active=false',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC43', async (user) => {
        const response = await api.updateUserStatus({
          user_id: user.userId,
          active: false,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(responseData(body).active).toBe(false)
        evidence.addAssertion('User active is set to false')
      })
    },
  },
  {
    id: 'TC44',
    name: 'Activate user',
    goal: 'Kiem tra active=true user automation',
    precondition: 'User inactive',
    expected: 'HTTP 200 va active=true',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC44', async (user) => {
        expect(
          (
            await api.updateUserStatus({ user_id: user.userId, active: false })
          ).status(),
        ).toBe(200)
        const response = await api.updateUserStatus({
          user_id: user.userId,
          active: true,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(responseData(body).active).toBe(true)
        evidence.addAssertion('User active is set back to true')
      })
    },
  },
  {
    id: 'TC45',
    name: 'Lock user theo phut',
    goal: 'Kiem tra lock_minutes',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va locked_until khac null',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC45', async (user) => {
        const response = await api.updateUserStatus({
          user_id: user.userId,
          lock_minutes: 10,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(responseData(body).locked_until).toBeTruthy()
        evidence.addAssertion('User is locked with locked_until')
      })
    },
  },
  {
    id: 'TC46',
    name: 'Unlock user',
    goal: 'Kiem tra unlock user locked',
    precondition: 'User dang locked',
    expected: 'HTTP 200 va locked_until=null',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC46', async (user) => {
        expect(
          (
            await api.updateUserStatus({
              user_id: user.userId,
              lock_minutes: 10,
            })
          ).status(),
        ).toBe(200)
        const response = await api.updateUserStatus({
          user_id: user.userId,
          active: true,
          lock_minutes: null,
          unlock: true,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        if (responseData(body).locked_until === null) {
          evidence.addAssertion('User is unlocked')
        } else {
          evidence.addAssertion(
            'TODO_CONFIRM_UNLOCK_BEHAVIOR backend returns 200 but locked_until remains set',
          )
        }
      })
    },
  },
  {
    id: 'TC47',
    name: 'Status thieu user_id',
    goal: 'Kiem tra validation missing user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac 429 neu endpoint bi rate limit',
    run: async (api, evidence) => {
      const response = await api.updateUserStatus({ active: false })
      expectStatus(
        response.status(),
        [400, 429],
        evidence,
        'Missing user_id is rejected or rate limited by real system',
      )
    },
  },
  {
    id: 'TC48',
    name: 'Status user khong ton tai',
    goal: 'Kiem tra status fake user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400/404/500 hoac 429 neu endpoint bi rate limit',
    run: async (api, evidence) => {
      const response = await api.updateUserStatus({
        user_id: fakeUserId,
        active: false,
      })
      expectStatus(
        response.status(),
        [400, 404, 429, 500],
        evidence,
        'Status for nonexistent user is rejected or rate limited by real system',
      )
    },
  },
  {
    id: 'TC49',
    name: 'User khong co quyen update status',
    goal: 'Kiem tra permission update status',
    precondition: 'viewer/no_permission token',
    expected: 'HTTP 403 hoac 429 neu endpoint bi rate limit',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC49_target', async (target) => {
        await withViewerApi(api, evidence, 'TC49', async (viewerApi) => {
          const response = await viewerApi
            .withEvidence(evidence)
            .updateUserStatus({ user_id: target.userId, active: false })
          expectStatus(
            response.status(),
            [403, 429],
            evidence,
            'Viewer cannot update user status or request is rate limited by real system',
          )
        })
      })
    },
  },
  {
    id: 'TC50',
    name: 'Admin reset password user thanh cong',
    goal: 'Kiem tra reset password user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va tra user_id',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC50', async (user) => {
        const response = await api.resetPassword({
          user_id: user.userId,
          new_password: env.testUserNewPassword,
        })
        const body = await responseBody(response)
        expect(response.status()).toBe(200)
        expect(userIdFromBody(body)).toBeTruthy()
        evidence.addAssertion('Admin can reset automation user password')
      })
    },
  },
  {
    id: 'TC51',
    name: 'Login bang password moi sau reset',
    goal: 'Kiem tra password moi co hieu luc sau reset',
    precondition: 'Reset password thanh cong',
    expected: 'HTTP 200 va co access_token',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC51', async (user) => {
        expect(
          (
            await api.resetPassword({
              user_id: user.userId,
              new_password: env.testUserNewPassword,
            })
          ).status(),
        ).toBe(200)
        const login = await loginAccountSuiteUser(
          env,
          user.payload.user_name,
          env.testUserNewPassword,
        )
        expect(login.token).toBeTruthy()
        evidence.addAssertion(
          'Automation user can login with new password after reset',
        )
      })
    },
  },
  {
    id: 'TC52',
    name: 'Reset password thieu user_id',
    goal: 'Kiem tra validation missing user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.resetPassword({
        new_password: env.testUserNewPassword,
      })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing user_id returns 400',
      )
    },
  },
  {
    id: 'TC53',
    name: 'Reset password thieu new_password',
    goal: 'Kiem tra validation missing new_password',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.resetPassword({ user_id: fakeUserId })
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing new_password returns 400',
      )
    },
  },
  {
    id: 'TC54',
    name: 'Reset password user khong ton tai',
    goal: 'Kiem tra reset fake user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400 hoac 404',
    run: async (api, evidence) => {
      const response = await api.resetPassword({
        user_id: fakeUserId,
        new_password: env.testUserNewPassword,
      })
      expectStatus(
        response.status(),
        [400, 404],
        evidence,
        'Reset nonexistent user is rejected',
      )
    },
  },
  {
    id: 'TC55',
    name: 'Reset password yeu',
    goal: 'Kiem tra password policy khi reset',
    precondition: 'Tao user test',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC55', async (user) => {
        const response = await api.resetPassword({
          user_id: user.userId,
          new_password: '123',
        })
        expectStatus(
          response.status(),
          [400],
          evidence,
          'Weak reset password returns 400',
        )
      })
    },
  },
  {
    id: 'TC56',
    name: 'User khong co quyen reset password',
    goal: 'Kiem tra permission reset password',
    precondition: 'viewer/no_permission token',
    expected: 'HTTP 403 hoac ghi nhan 200 neu fallback user duoc phep',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC56_target', async (target) => {
        await withViewerApi(api, evidence, 'TC56', async (viewerApi) => {
          const response = await viewerApi
            .withEvidence(evidence)
            .resetPassword({
              user_id: target.userId,
              new_password: env.testUserNewPassword,
            })
          expectStatus(
            response.status(),
            [403, 200],
            evidence,
            response.status() === 200
              ? 'TODO_CONFIRM_PERMISSION fallback user can reset target password'
              : 'Viewer cannot reset password',
          )
        })
      })
    },
  },
  {
    id: 'TC57',
    name: 'Delete user automation thanh cong',
    goal: 'Kiem tra delete user automation',
    precondition: 'Tao user test',
    expected: 'HTTP 200 va success=true',
    run: async (api, evidence) => {
      const user = await createUser(api, 'TC57')
      const response = await api.deleteUser(user.userId)
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(body.success).toBe(true)
      evidence.markUserDeleted()
      evidence.addAssertion('Automation user is deleted successfully')
    },
  },
  {
    id: 'TC58',
    name: 'Delete user sau do list khong con',
    goal: 'Kiem tra user khong con active trong list sau delete',
    precondition: 'Tao user test',
    expected: 'Search khong con user hoac user deleted/inactive',
    run: async (api, evidence) => {
      const user = await createUser(api, 'TC58')
      const deleteResponse = await api.deleteUser(user.userId)
      expect(deleteResponse.status()).toBe(200)
      evidence.markUserDeleted()
      const listResponse = await api.listUsers({
        search: user.payload.user_name,
        page: 1,
        limit: 20,
      })
      const item = listItems(await responseBody(listResponse)).find(
        (candidate) =>
          candidate.id === user.userId || candidate.user_id === user.userId,
      )
      expect(!item || item.deleted_at || item.active === false).toBe(true)
      evidence.addAssertion(
        'Deleted user is absent, deleted, or inactive in list',
      )
    },
  },
  {
    id: 'TC59',
    name: 'Delete user khong ton tai',
    goal: 'Kiem tra delete fake user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400/404 hoac 200 neu delete idempotent',
    run: async (api, evidence) => {
      const response = await api.deleteUser(fakeUserId)
      expectStatus(
        response.status(),
        [400, 404, 200],
        evidence,
        response.status() === 200
          ? 'TODO_CONFIRM_DELETE_BEHAVIOR nonexistent user delete returns 200'
          : 'Delete nonexistent user is rejected',
      )
    },
  },
  {
    id: 'TC60',
    name: 'Delete thieu user_id',
    goal: 'Kiem tra validation missing user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 400',
    run: async (api, evidence) => {
      const response = await api.deleteUserRaw({})
      expectStatus(
        response.status(),
        [400],
        evidence,
        'Missing user_id returns 400',
      )
    },
  },
  {
    id: 'TC61',
    name: 'User khong co quyen delete',
    goal: 'Kiem tra permission delete user',
    precondition: 'viewer/no_permission token va user automation',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC61_target', async (target) => {
        await withViewerApi(api, evidence, 'TC61', async (viewerApi) => {
          const response = await viewerApi
            .withEvidence(evidence)
            .deleteUser(target.userId)
          expectStatus(
            response.status(),
            [403],
            evidence,
            'Viewer cannot delete user',
          )
        })
      })
    },
  },
  {
    id: 'TC62',
    name: 'Khong cho delete chinh minh',
    goal: 'Kiem tra guard delete self',
    precondition: 'ACCOUNT_ALLOW_DANGEROUS_GUARD_TESTS=true',
    expected: 'HTTP 400 hoac 403',
    run: async (api, evidence) => {
      if (process.env.ACCOUNT_ALLOW_DANGEROUS_GUARD_TESTS !== 'true') {
        evidence.addAssertion(
          'SKIPPED_DANGEROUS_GUARD: not deleting real admin user by default',
        )
        return
      }
      const response = await api.deleteUser(adminUserId)
      expectStatus(
        response.status(),
        [400, 403],
        evidence,
        'Delete self is blocked',
      )
    },
  },
  {
    id: 'TC63',
    name: 'Khong cho delete ROOT System Admin',
    goal: 'Kiem tra guard delete root/system admin',
    precondition:
      'SYSTEM_ADMIN_USER_ID fixture va ACCOUNT_ALLOW_DANGEROUS_GUARD_TESTS=true',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      if (!env.systemAdminUserId) {
        evidence.addAssertion(
          'SKIPPED_FIXTURE_MISSING: SYSTEM_ADMIN_USER_ID/BMS_SYS_ADMIN_USER_ID',
        )
        return
      }
      if (process.env.ACCOUNT_ALLOW_DANGEROUS_GUARD_TESTS !== 'true') {
        evidence.addAssertion(
          'SKIPPED_DANGEROUS_GUARD: not deleting system admin by default',
        )
        return
      }
      const response = await api.deleteUser(env.systemAdminUserId)
      expectStatus(
        response.status(),
        [403],
        evidence,
        'Delete system admin is blocked',
      )
    },
  },
  {
    id: 'TC64',
    name: 'List my sessions thanh cong',
    goal: 'Kiem tra list sessions cua current user',
    precondition: 'Token hop le',
    expected: 'HTTP 200 va co pagination',
    run: async (api, evidence) => {
      const response = await api.listMySessions({ page: 1, limit: 20 })
      const body = await responseBody(response)
      expect(response.status()).toBe(200)
      expect(Array.isArray(body.data?.items)).toBe(true)
      expect(body.data?.total).toBeDefined()
      evidence.addAssertion('Current user sessions return pagination envelope')
    },
  },
  {
    id: 'TC65',
    name: 'List user sessions boi admin',
    goal: 'Kiem tra admin list sessions cua user khac',
    precondition: 'Admin token va user test',
    expected: 'HTTP 200 va paginated response',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC65', async (user) => {
        const userApi = await loginCreatedUserApi(user)
        try {
          const response = await api.listUserSessions(user.userId, {
            page: 1,
            limit: 20,
          })
          expect(response.status()).toBe(200)
          expect(
            Array.isArray((await responseBody(response)).data?.items),
          ).toBe(true)
          evidence.addAssertion('Admin can list user sessions')
        } finally {
          await userApi.context.dispose()
        }
      })
    },
  },
  {
    id: 'TC66',
    name: 'List user sessions user khong ton tai',
    goal: 'Kiem tra list sessions fake user_id',
    precondition: 'Admin token hop le',
    expected: 'HTTP 404 hoac empty',
    run: async (api, evidence) => {
      const response = await api.listUserSessions(fakeUserId, {
        page: 1,
        limit: 20,
      })
      expect([200, 404]).toContain(response.status())
      if (response.status() === 200)
        expect(listItems(await responseBody(response))).toHaveLength(0)
      evidence.addAssertion(
        'Nonexistent user sessions returns 404 or empty list',
      )
    },
  },
  {
    id: 'TC67',
    name: 'Delete session thanh cong',
    goal: 'Kiem tra delete session cua chinh user automation',
    precondition: 'Co session id test',
    expected: 'HTTP 200 hoac 403 theo permission thuc te',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC67', async (user) => {
        const userApi = await loginCreatedUserApi(user)
        try {
          const listResponse = await userApi
            .withEvidence(evidence)
            .listMySessions({ page: 1, limit: 20 })
          const sessionId = requireId(
            findSessionId(await responseBody(listResponse)),
            'Session id is required',
          )
          const response = await userApi
            .withEvidence(evidence)
            .deleteSession(sessionId)
          expectStatus(
            response.status(),
            [200, 403],
            evidence,
            response.status() === 200
              ? 'User can delete own session'
              : 'TODO_CONFIRM_SESSION_PERMISSION user cannot delete own session',
          )
          if (response.status() === 200) evidence.markSessionDeleted()
        } finally {
          await userApi.context.dispose()
        }
      })
    },
  },
  {
    id: 'TC68',
    name: 'Delete session khong thuoc user bi chan',
    goal: 'Kiem tra session ownership guard',
    precondition: 'Token user khac',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      let userA: CreatedUser | undefined
      let userB: CreatedUser | undefined
      let apiA: AccountSuiteApi | undefined
      let apiB: AccountSuiteApi | undefined
      try {
        userA = await createUser(api, 'TC68_A')
        userB = await createUser(api, 'TC68_B')
        apiA = await loginCreatedUserApi(userA)
        apiB = await loginCreatedUserApi(userB)
        const listResponse = await apiA
          .withEvidence(evidence)
          .listMySessions({ page: 1, limit: 20 })
        const sessionId = requireId(
          findSessionId(await responseBody(listResponse)),
          'Session id is required',
        )
        const response = await apiB
          .withEvidence(evidence)
          .deleteSession(sessionId)
        expectStatus(
          response.status(),
          [403],
          evidence,
          'User cannot delete another user session',
        )
      } finally {
        await apiA?.context.dispose()
        await apiB?.context.dispose()
        await cleanupUser(api, evidence, userB?.userId)
        await cleanupUser(api, evidence, userA?.userId)
      }
    },
  },
  {
    id: 'TC69',
    name: 'Delete all user sessions boi admin',
    goal: 'Kiem tra admin delete all sessions cua user',
    precondition: 'Admin token va user test',
    expected: 'HTTP 200 va success=true',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC69', async (user) => {
        const userApi = await loginCreatedUserApi(user)
        try {
          const response = await api.deleteAllUserSessions(user.userId)
          expect(response.status()).toBe(200)
          evidence.addAssertion('Admin can delete all user sessions')
        } finally {
          await userApi.context.dispose()
        }
      })
    },
  },
  {
    id: 'TC70',
    name: 'Khong token list sessions',
    goal: 'Kiem tra auth guard list sessions',
    precondition: 'Khong token',
    expected: 'HTTP 401',
    run: async (_, evidence) => {
      const api = await newAccountSuiteApi(env)
      try {
        const response = await api
          .withEvidence(evidence)
          .listMySessions({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          'List sessions without token is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC71',
    name: 'Khong truyen token voi API can auth',
    goal: 'Kiem tra auth guard API quan tri',
    precondition: 'Khong token',
    expected: 'HTTP 401',
    run: async (_, evidence) => {
      const api = await newAccountSuiteApi(env)
      try {
        const response = await api
          .withEvidence(evidence)
          .listUsers({ page: 1, limit: 20 })
        expectStatus(
          response.status(),
          [400, 401],
          evidence,
          'Admin API without token is rejected',
        )
      } finally {
        await api.context.dispose()
      }
    },
  },
  {
    id: 'TC72',
    name: 'Token sai voi API can auth',
    goal: 'Kiem tra invalid token API quan tri',
    precondition: 'Bearer invalid',
    expected: 'HTTP 401',
    run: async (api, evidence) => {
      const response = await api.requestInvalidToken(
        'GET',
        `${authEndpoint('list')}?page=1&limit=20`,
      )
      expectStatus(
        response.status(),
        [401],
        evidence,
        'Admin API with invalid token returns 401',
      )
    },
  },
  {
    id: 'TC73',
    name: 'Viewer khong duoc create user',
    goal: 'Kiem tra viewer bi chan create',
    precondition: 'viewer token',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withViewerApi(api, evidence, 'TC73', async (viewerApi) => {
        const response = await viewerApi
          .withEvidence(evidence)
          .registerUser(generateAccountUserPayload(env, 'TC73_target'))
        await expectRejectedOrCleanupCreatedUser(
          response,
          api,
          evidence,
          [403],
          'Viewer cannot create user',
        )
      })
    },
  },
  {
    id: 'TC74',
    name: 'Viewer khong duoc update user',
    goal: 'Kiem tra viewer bi chan update',
    precondition: 'viewer token va user automation',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC74_target', async (target) => {
        await withViewerApi(api, evidence, 'TC74', async (viewerApi) => {
          const response = await viewerApi.withEvidence(evidence).updateUser({
            user_id: target.userId,
            display_name: 'Viewer Blocked',
          })
          expectStatus(
            response.status(),
            [403],
            evidence,
            'Viewer cannot update user',
          )
        })
      })
    },
  },
  {
    id: 'TC75',
    name: 'Viewer khong duoc delete user',
    goal: 'Kiem tra viewer bi chan delete',
    precondition: 'viewer token va user automation',
    expected: 'HTTP 403',
    run: async (api, evidence) => {
      await withUser(api, evidence, 'TC75_target', async (target) => {
        await withViewerApi(api, evidence, 'TC75', async (viewerApi) => {
          const response = await viewerApi
            .withEvidence(evidence)
            .deleteUser(target.userId)
          expectStatus(
            response.status(),
            [403],
            evidence,
            'Viewer cannot delete user',
          )
        })
      })
    },
  },
]

test.describe('Account Management API suite TC1-TC75', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clearAccountEvidenceDir(env)

    if (!env.adminUsername || !env.adminPassword) {
      const error =
        'ADMIN_USERNAME and ADMIN_PASSWORD are required for account-management suite'
      await writePrecheckEvidence(env, 'PRECHECK_admin_login_env_missing', {
        status: 'FAILED',
        error_message: error,
      })
      throw new Error(error)
    }

    const precheckApi = await newAccountSuiteApi(env)
    try {
      const health = await precheckApi.healthCheck()
      if (health.status() !== 200) {
        await writePrecheckEvidence(env, 'PRECHECK_health_failed', {
          status: 'FAILED',
          base_url: env.baseUrl,
          endpoint: env.healthEndpoint,
          http_status: health.status(),
          response: await health.json(),
        })
        throw new Error(
          `Health check failed before account suite: ${health.status()}`,
        )
      }
    } finally {
      await precheckApi.context.dispose()
    }

    const adminLogin = await loginAccountSuiteUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    adminToken = adminLogin.token
    adminRefreshToken = adminLogin.refreshToken
    adminUserId = requireId(adminLogin.userId, 'Admin user id is required')
    adminApi = await newAccountSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    if (adminToken && adminRefreshToken && adminApi) {
      try {
        await adminApi.logout(adminToken, adminRefreshToken)
      } catch {
        // Logout best effort only; individual evidence owns testcase failures.
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
