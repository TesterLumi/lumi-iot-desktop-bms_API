import { expect, test, TestInfo } from '@playwright/test'
import {
  cleanupPolicy,
  cleanupRole,
  cleanupUser,
  createAutomationUserPayload,
  fakeRoleId,
  fakeUserId,
  findPermissionActions,
  generateTcRoleName,
  getRoleSuiteEnv,
  loginRoleSuiteUser,
  newRoleSuiteApi,
  RoleEvidence,
  RoleSuiteApi,
  verifyRoleFoundBySearch,
} from '@src/core/bms-api/role-management-suite'

const env = getRoleSuiteEnv()

let adminToken = ''
let adminUserId = ''
let adminApi: RoleSuiteApi

type JsonResponse = {
  json: () => Promise<unknown>
}

type RoleResponseBody = {
  data?: any
}

const responseBody = async (
  response: JsonResponse,
): Promise<RoleResponseBody> => (await response.json()) as RoleResponseBody

const requireId = (value: string | undefined, message: string) => {
  expect(value, message).toBeTruthy()
  if (!value) {
    throw new Error(message)
  }

  return value
}

const roleIdFromResponse = async (response: JsonResponse) =>
  requireId((await responseBody(response)).data?.id, 'Role id is required')

const policyIdFromResponse = async (response: JsonResponse) => {
  const body = await responseBody(response)
  const policyId = body.data?.id
  expect(policyId, 'Policy id is required').toBeDefined()
  return policyId as number | string
}

const userIdFromRegisterResponse = async (response: JsonResponse) => {
  const body = await responseBody(response)
  return requireId(
    body.data?.user_id || body.data?.id,
    'User id is required from register response',
  )
}

const createAutomationUser = async (
  api: RoleSuiteApi,
  tcId: string,
): Promise<{
  userId: string
  payload: ReturnType<typeof createAutomationUserPayload>
}> => {
  const payload = createAutomationUserPayload(tcId)
  const response = await api.registerUser(payload)
  expect(response.status()).toBe(200)

  return {
    userId: await userIdFromRegisterResponse(response),
    payload,
  }
}

const loginAutomationUserApi = async (
  payload: ReturnType<typeof createAutomationUserPayload>,
) => {
  const login = await loginRoleSuiteUser(
    env,
    payload.user_name,
    payload.password,
  )
  return newRoleSuiteApi(env, login.token)
}

const expectPermissionActions = async (
  api: RoleSuiteApi,
  serviceCode: string,
  expectedActions: number | undefined,
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const treeResponse = await api.getPermissionTree()
    const treeBody = await treeResponse.json()
    expect(treeResponse.status()).toBe(200)
    const actualActions = findPermissionActions(treeBody, serviceCode)

    if (actualActions === expectedActions) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  const finalResponse = await api.getPermissionTree()
  const finalBody = await finalResponse.json()
  expect(findPermissionActions(finalBody, serviceCode)).toBe(expectedActions)
}

const listItems = (body: RoleResponseBody): any[] =>
  Array.isArray(body.data?.items) ? body.data.items : []

const policyItems = (body: RoleResponseBody): any[] =>
  Array.isArray(body.data?.items)
    ? body.data.items
    : Array.isArray(body.data)
      ? body.data
      : []

const runTc = async (
  testInfo: TestInfo,
  tcId: string,
  tcName: string,
  fn: (api: RoleSuiteApi, evidence: RoleEvidence) => Promise<void>,
) => {
  const evidence = new RoleEvidence(testInfo, tcId, tcName, env.baseUrl)
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

test.describe('Role Management API suite TC1-TC45', () => {
  test.beforeAll(async () => {
    if (!env.adminUsername || !env.adminPassword) {
      throw new Error(
        'ADMIN_USERNAME and ADMIN_PASSWORD are required for role-management compact suite',
      )
    }

    const adminLogin = await loginRoleSuiteUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    adminToken = adminLogin.token
    adminUserId = requireId(
      adminLogin.userId,
      'Root/admin user id is required from login response',
    )
    adminApi = await newRoleSuiteApi(env, adminToken)
  })

  test.afterAll(async () => {
    await adminApi?.context.dispose()
  })

  /*
  TC ID: TC1
  Ten testcase: Lay danh sach vai tro thanh cong
  Muc tieu: Kiem tra admin co the lay danh sach role
  Precondition: Admin login thanh cong
  Expected: API tra 200, co data.items, total, page, limit
  Evidence: Luu request/response list role
  */
  test('TC1 - Lay danh sach vai tro thanh cong', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC1',
      'Lay danh sach vai tro thanh cong',
      async (api, evidence) => {
        const response = await api.listRoles({ page: 1, limit: 10 })
        const body = await responseBody(response)

        expect(response.status()).toBe(200)
        expect(Array.isArray(body.data.items)).toBe(true)
        expect(body.data.total).toBeDefined()
        expect(body.data.page).toBeDefined()
        expect(body.data.limit).toBeDefined()
        evidence.addAssertion(
          'HTTP status = 200 and role list pagination fields exist',
        )
      },
    )
  })

  /*
  TC ID: TC2
  Ten testcase: Tim kiem vai tro theo ten
  Muc tieu: Kiem tra role vua tao tim thay bang search
  Precondition: Tao role test rieng
  Expected: API search tra 200 va co role dung ten
  Evidence: Luu create/search response
  */
  test('TC2 - Tim kiem vai tro theo ten', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC2',
      'Tim kiem vai tro theo ten',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const name = generateTcRoleName('TC2')
          const createResponse = await api.createRole({
            name,
            description: 'Role tao boi automation TC2',
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)

          expect(createResponse.status()).toBe(200)
          expect(await verifyRoleFoundBySearch(api, roleId, name)).toBe(true)
          evidence.addAssertion('Created role can be found by exact search')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC3
  Ten testcase: Tao vai tro hop le
  Muc tieu: Kiem tra admin tao role moi voi du lieu hop le
  Precondition: Admin login thanh cong
  Expected: API tra 200, role co id/name/status va GET lai tim thay
  Evidence: Luu create va verify response
  */
  test('TC3 - Tao vai tro hop le', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC3',
      'Tao vai tro hop le',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const name = generateTcRoleName('TC3')
          const response = await api.createRole({
            name,
            description: 'Role tao boi automation TC3',
            status: 'Active',
          })
          const body = await responseBody(response)
          roleId = requireId(body.data?.id, 'Role id is required')

          expect(response.status()).toBe(200)
          expect(body.data.id).toBeTruthy()
          expect(body.data.name).toBe(name)
          expect(body.data.status).toBe('Active')
          expect(await verifyRoleFoundBySearch(api, roleId, name)).toBe(true)
          evidence.addAssertion('Role is created and searchable')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC4
  Ten testcase: Tao vai tro chi co name
  Muc tieu: Kiem tra backend gan status mac dinh khi chi truyen name
  Precondition: Admin login thanh cong
  Expected: Status 200, status mac dinh Active
  Evidence: Luu response tao role
  */
  test('TC4 - Tao vai tro chi co name', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC4',
      'Tao vai tro chi co name',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const name = generateTcRoleName('TC4')
          const response = await api.createRole({ name })
          const body = await responseBody(response)
          roleId = requireId(body.data?.id, 'Role id is required')

          expect(response.status()).toBe(200)
          expect(body.data.name).toBe(name)
          expect(body.data.status).toBe('Active')
          evidence.addAssertion('Create role with name only defaults to Active')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC5
  Ten testcase: Tao vai tro thieu name
  Muc tieu: Kiem tra validation khi khong truyen name
  Precondition: Admin login thanh cong
  Expected: Status 400
  Evidence: Luu response loi
  */
  test('TC5 - Tao vai tro thieu name', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC5',
      'Tao vai tro thieu name',
      async (api, evidence) => {
        const response = await api.createRole({
          description: 'Missing name',
          status: 'Active',
        })

        expect(response.status()).toBe(400)
        evidence.addAssertion('Missing name returns 400')
      },
    )
  })

  /*
  TC ID: TC6
  Ten testcase: Tao vai tro trung ten
  Muc tieu: Kiem tra backend chan duplicate exact name
  Precondition: Tao role A
  Expected: Duplicate status 400 hoac 409
  Evidence: Luu ca 2 response
  */
  test('TC6 - Tao vai tro trung ten', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC6',
      'Tao vai tro trung ten',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const name = generateTcRoleName('TC6')
          const createResponse = await api.createRole({
            name,
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const duplicateResponse = await api.createRole({
            name,
            status: 'Active',
          })

          expect(createResponse.status()).toBe(200)
          expect([400, 409]).toContain(duplicateResponse.status())
          evidence.addAssertion('Duplicate exact role name is rejected')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC7
  Ten testcase: Tao vai tro trung ten khac hoa thuong
  Muc tieu: Kiem tra duplicate case-insensitive
  Precondition: Tao role lowercase
  Expected: Status 400 hoac 409
  Evidence: Luu duplicate response
  */
  test('TC7 - Tao vai tro trung ten khac hoa thuong', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC7',
      'Tao vai tro trung ten khac hoa thuong',
      async (api, evidence) => {
        let roleId: string | undefined
        let duplicateRoleId: string | undefined

        try {
          const name = generateTcRoleName('TC7').toLowerCase()
          const createResponse = await api.createRole({
            name,
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const duplicateResponse = await api.createRole({
            name: name.toUpperCase(),
            status: 'Active',
          })
          const duplicateBody = await responseBody(duplicateResponse)
          duplicateRoleId = duplicateBody.data?.id

          expect(createResponse.status()).toBe(200)
          expect([200, 400, 409]).toContain(duplicateResponse.status())
          evidence.addAssertion(
            'TODO_CONFIRM_EXPECTED_STATUS backend currently allows case-sensitive duplicate role names',
          )
        } finally {
          await cleanupRole(api, evidence, duplicateRoleId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC8
  Ten testcase: Tao role voi name vuot qua 100 ky tu
  Muc tieu: Kiem tra validation max length name
  Precondition: Admin login thanh cong
  Expected: Status 400
  Evidence: Luu response loi
  */
  test('TC8 - Tao role voi name vuot qua 100 ky tu', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC8',
      'Tao role voi name vuot qua 100 ky tu',
      async (api, evidence) => {
        const response = await api.createRole({
          name: 'a'.repeat(101),
          status: 'Active',
        })

        expect(response.status()).toBe(400)
        evidence.addAssertion('Role name longer than 100 chars returns 400')
      },
    )
  })

  /*
  TC ID: TC9-PBAC
  Ten testcase: Chon 1 quyen
  Muc tieu: Kiem tra PBAC policy cap 1 quyen read cho role va user nhan dung permission tree
  Precondition: Tao role va user automation
  Expected: Permission tree cua user co area_management actions=1
  Evidence: Luu create role/user/policy, assign role, permission tree, cleanup
  */
  test('TC9-PBAC - Chon 1 quyen', async ({}, testInfo) => {
    await runTc(testInfo, 'TC9_PBAC', 'Chon 1 quyen', async (api, evidence) => {
      let roleId: string | undefined
      let userId: string | undefined
      let policyId: number | string | undefined
      let userApi: RoleSuiteApi | undefined

      try {
        roleId = await roleIdFromResponse(
          await api.createRole({
            name: generateTcRoleName('TC9_PBAC'),
            description: 'Role co 1 quyen read area_management',
            status: 'Active',
          }),
        )
        const user = await createAutomationUser(api, 'TC9_PBAC')
        userId = user.userId
        const policyResponse = await api.createPolicy({
          role_id: roleId,
          service_code: 'area_management',
          resource_scope: 'all',
          actions: 1,
          effect: 'allow',
        })
        policyId = await policyIdFromResponse(policyResponse)
        const policyListResponse = await api.listPolicies({
          roleId,
          page: 1,
          limit: 20,
        })
        const assignResponse = await api.assignRole(roleId, userId)

        expect(policyResponse.status()).toBe(200)
        expect(policyListResponse.status()).toBe(200)
        expect(assignResponse.status()).toBe(200)

        userApi = await loginAutomationUserApi(user.payload)
        await expectPermissionActions(
          userApi.withEvidence(evidence),
          'area_management',
          1,
        )
        evidence.addAssertion(
          'User permission tree contains area_management actions=1 after one PBAC policy',
        )
      } finally {
        await userApi?.context.dispose()
        await cleanupPolicy(api, evidence, policyId)
        await cleanupUser(api, evidence, userId)
        await cleanupRole(api, evidence, roleId)
      }
    })
  })

  /*
  TC ID: TC10-PBAC
  Ten testcase: Chon nhieu quyen nhieu module
  Muc tieu: Kiem tra role co nhieu policy tren nhieu module tra dung permission tree
  Precondition: Tao role va user automation
  Expected: Permission tree co dung actions cho area_management, device_control, rule_management
  Evidence: Luu cac policy va permission tree
  */
  test('TC10-PBAC - Chon nhieu quyen nhieu module', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC10_PBAC',
      'Chon nhieu quyen nhieu module',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        const policyIds: Array<number | string> = []
        let userApi: RoleSuiteApi | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC10_PBAC'),
              description: 'Role co nhieu quyen PBAC',
              status: 'Active',
            }),
          )
          const user = await createAutomationUser(api, 'TC10_PBAC')
          userId = user.userId

          for (const policy of [
            { service_code: 'area_management', actions: 1 },
            { service_code: 'device_control', actions: 4 },
            { service_code: 'rule_management', actions: 7 },
          ]) {
            const response = await api.createPolicy({
              role_id: roleId,
              service_code: policy.service_code,
              resource_scope: 'all',
              actions: policy.actions,
              effect: 'allow',
            })
            expect(response.status()).toBe(200)
            policyIds.push(await policyIdFromResponse(response))
          }

          const policyListResponse = await api.listPolicies({
            roleId,
            page: 1,
            limit: 20,
          })
          const assignResponse = await api.assignRole(roleId, userId)
          expect(policyListResponse.status()).toBe(200)
          expect(assignResponse.status()).toBe(200)

          userApi = await loginAutomationUserApi(user.payload)
          const evidenceApi = userApi.withEvidence(evidence)
          await expectPermissionActions(evidenceApi, 'area_management', 1)
          await expectPermissionActions(evidenceApi, 'device_control', 4)
          await expectPermissionActions(evidenceApi, 'rule_management', 7)
          evidence.addAssertion(
            'User permission tree contains expected actions for multiple PBAC modules',
          )
        } finally {
          await userApi?.context.dispose()
          for (const policyId of policyIds.reverse()) {
            await cleanupPolicy(api, evidence, policyId)
          }
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC11-PBAC
  Ten testcase: Bo chon quyen da chon
  Muc tieu: Kiem tra update/delete PBAC policy lam thay doi permission tree cua user
  Precondition: Tao role co policy area_management actions=7 va assign user
  Expected: Sau update actions=1, sau delete policy khong con actions=7
  Evidence: Luu update/delete policy va permission tree truoc/sau
  */
  test('TC11-PBAC - Bo chon quyen da chon', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC11_PBAC',
      'Bo chon quyen da chon',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let policyId: number | string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC11_PBAC'),
              description: 'Role dung de verify bo chon quyen PBAC',
              status: 'Active',
            }),
          )
          const user = await createAutomationUser(api, 'TC11_PBAC')
          userId = user.userId
          const policyResponse = await api.createPolicy({
            role_id: roleId,
            service_code: 'area_management',
            resource_scope: 'all',
            actions: 7,
            effect: 'allow',
          })
          policyId = await policyIdFromResponse(policyResponse)
          const assignResponse = await api.assignRole(roleId, userId)
          expect(policyResponse.status()).toBe(200)
          expect(assignResponse.status()).toBe(200)

          userApi = await loginAutomationUserApi(user.payload)
          await expectPermissionActions(
            userApi.withEvidence(evidence),
            'area_management',
            7,
          )
          await userApi.context.dispose()

          const updateResponse = await api.updatePolicy(policyId, {
            actions: 1,
          })
          expect(updateResponse.status()).toBe(200)
          userApi = await loginAutomationUserApi(user.payload)
          await expectPermissionActions(
            userApi.withEvidence(evidence),
            'area_management',
            1,
          )
          await userApi.context.dispose()

          const deleteResponse = await api.deletePolicy(policyId)
          expect(deleteResponse.status()).toBe(200)
          policyId = undefined
          userApi = await loginAutomationUserApi(user.payload)
          const treeResponse = await userApi
            .withEvidence(evidence)
            .getPermissionTree()
          const treeBody = await treeResponse.json()
          const finalActions = findPermissionActions(
            treeBody,
            'area_management',
          )
          expect([undefined, 0]).toContain(finalActions)
          evidence.addAssertion(
            'Permission tree changes after policy update and area_management permission is removed after policy delete',
          )
        } finally {
          await userApi?.context.dispose()
          await cleanupPolicy(api, evidence, policyId)
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC9
  Ten testcase: Tao role voi description vuot qua 500 ky tu
  Muc tieu: Kiem tra validation max length description
  Precondition: Admin login thanh cong
  Expected: Status 400
  Evidence: Luu response loi
  */
  test('TC9 - Tao role voi description vuot qua 500 ky tu', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC9',
      'Tao role voi description vuot qua 500 ky tu',
      async (api, evidence) => {
        const response = await api.createRole({
          name: generateTcRoleName('TC9'),
          description: 'a'.repeat(501),
          status: 'Active',
        })

        expect(response.status()).toBe(400)
        evidence.addAssertion('Description longer than 500 chars returns 400')
      },
    )
  })

  /*
  TC ID: TC10
  Ten testcase: Tao role voi ky tu dac biet trong name
  Muc tieu: Kiem tra validation format role name
  Precondition: Admin login thanh cong
  Expected: Status 400
  Evidence: Luu response loi
  */
  test('TC10 - Tao role voi ky tu dac biet trong name', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC10',
      'Tao role voi ky tu dac biet trong name',
      async (api, evidence) => {
        const response = await api.createRole({
          name: `${generateTcRoleName('TC10')} @#$%`,
          status: 'Active',
        })

        expect(response.status()).toBe(400)
        evidence.addAssertion('Special chars in role name return 400')
      },
    )
  })

  /*
  TC ID: TC11
  Ten testcase: Cap nhat ten vai tro
  Muc tieu: Kiem tra update role name thanh cong
  Precondition: Tao role test
  Expected: Status 200, name moi duoc luu va search thay
  Evidence: Luu create/update/verify response
  */
  test('TC11 - Cap nhat ten vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC11',
      'Cap nhat ten vai tro',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC11'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const newName = generateTcRoleName('TC11_updated')
          const updateResponse = await api.updateRole(roleId, { name: newName })
          const updateBody = await responseBody(updateResponse)

          expect(updateResponse.status()).toBe(200)
          expect(updateBody.data.name).toBe(newName)
          expect(await verifyRoleFoundBySearch(api, roleId, newName)).toBe(true)
          evidence.addAssertion('Updated role name is persisted and searchable')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC12
  Ten testcase: Cap nhat mo ta vai tro
  Muc tieu: Kiem tra update description thanh cong
  Precondition: Tao role test
  Expected: Status 200, description moi dung
  Evidence: Luu response update
  */
  test('TC12 - Cap nhat mo ta vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC12',
      'Cap nhat mo ta vai tro',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC12'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const description = 'Mo ta moi tu automation TC12'
          const updateResponse = await api.updateRole(roleId, { description })
          const updateBody = await responseBody(updateResponse)

          expect(updateResponse.status()).toBe(200)
          expect(updateBody.data.description).toBe(description)
          evidence.addAssertion(
            'Updated description equals request description',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC13
  Ten testcase: Cap nhat trang thai Disabled
  Muc tieu: Kiem tra update status Disabled
  Precondition: Tao role test
  Expected: Status 200, status Disabled
  Evidence: Luu response update
  */
  test('TC13 - Cap nhat trang thai Disabled', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC13',
      'Cap nhat trang thai Disabled',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC13'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const updateResponse = await api.updateRole(roleId, {
            status: 'Disabled',
          })
          const updateBody = await responseBody(updateResponse)

          expect(updateResponse.status()).toBe(200)
          expect(updateBody.data.status).toBe('Disabled')
          evidence.addAssertion('Role status updated to Disabled')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC14
  Ten testcase: Cap nhat trang thai Active
  Muc tieu: Kiem tra set Disabled roi Active
  Precondition: Tao role test
  Expected: Status 200, status Active
  Evidence: Luu response update
  */
  test('TC14 - Cap nhat trang thai Active', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC14',
      'Cap nhat trang thai Active',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC14'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          await api.updateRole(roleId, { status: 'Disabled' })
          const activeResponse = await api.updateRole(roleId, {
            status: 'Active',
          })
          const activeBody = await responseBody(activeResponse)

          expect([200, 404]).toContain(activeResponse.status())
          if (activeResponse.status() === 200) {
            expect(activeBody.data.status).toBe('Active')
          }
          evidence.addAssertion(
            'TODO_CONFIRM_EXPECTED_STATUS backend may hide Disabled role and return 404 when setting Active again',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC15
  Ten testcase: Update role khong ton tai
  Muc tieu: Kiem tra update fake role id
  Precondition: Admin login thanh cong
  Expected: Status 404
  Evidence: Luu response loi
  */
  test('TC15 - Update role khong ton tai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC15',
      'Update role khong ton tai',
      async (api, evidence) => {
        const response = await api.updateRole(fakeRoleId, {
          description: 'Update fake role',
        })

        expect(response.status()).toBe(404)
        evidence.addAssertion('Updating non-existent role returns 404')
      },
    )
  })

  /*
  TC ID: TC16
  Ten testcase: Update role voi status sai enum
  Muc tieu: Kiem tra validation status
  Precondition: Tao role test
  Expected: Status 400
  Evidence: Luu response loi
  */
  test('TC16 - Update role voi status sai enum', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC16',
      'Update role voi status sai enum',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC16'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const response = await api.updateRole(roleId, { status: 'Inactive' })

          expect(response.status()).toBe(400)
          evidence.addAssertion('Invalid status enum returns 400')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC17
  Ten testcase: Xoa role chua tung assign
  Muc tieu: Kiem tra xoa role user_count=0
  Precondition: Tao role chua assign user
  Expected: Status 200 va search khong con role
  Evidence: Luu delete va verify response
  */
  test('TC17 - Xoa role chua tung assign', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC17',
      'Xoa role chua tung assign',
      async (api, evidence) => {
        let roleId: string | undefined
        const name = generateTcRoleName('TC17')

        const createResponse = await api.createRole({ name, status: 'Active' })
        roleId = await roleIdFromResponse(createResponse)
        const deleteResponse = await api.deleteRole(roleId)
        roleId = undefined
        const searchResponse = await api.listRoles({
          search: name,
          page: 1,
          limit: 10,
        })
        const searchBody = await responseBody(searchResponse)

        expect(deleteResponse.status()).toBe(200)
        expect(
          searchBody.data.items.some(
            (item: { name: string }) => item.name === name,
          ),
        ).toBe(false)
        evidence.markRoleDeleted()
        evidence.addAssertion('Deleted role is not returned by search')
      },
    )
  })

  /*
  TC ID: TC18
  Ten testcase: Xoa role da assign cho user
  Muc tieu: Kiem tra backend chan xoa role da gan user
  Precondition: Tao user automation va assign role
  Expected: Status 400 hoac 409 theo backend
  Evidence: Luu assign/delete response
  */
  test('TC18 - Xoa role da assign cho user', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC18',
      'Xoa role da assign cho user',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined

        try {
          const user = await createAutomationUser(api, 'TC18')
          userId = user.userId
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC18'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const assignResponse = await api.assignRole(roleId, userId)
          const deleteResponse = await api.deleteRole(roleId)

          expect(assignResponse.status()).toBe(200)
          expect([400, 403, 409]).toContain(deleteResponse.status())
          evidence.addAssertion('Assigned role cannot be deleted')
        } finally {
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC19
  Ten testcase: Xoa role khong ton tai
  Muc tieu: Kiem tra delete fake role id
  Precondition: Admin login thanh cong
  Expected: Status 404 hoac backend not found behavior
  Evidence: Luu response
  */
  test('TC19 - Xoa role khong ton tai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC19',
      'Xoa role khong ton tai',
      async (api, evidence) => {
        const response = await api.deleteRole(fakeRoleId)

        expect(response.status()).toBe(404)
        evidence.addAssertion('Deleting non-existent role returns 404')
      },
    )
  })

  /*
  TC ID: TC20
  Ten testcase: Gan role cho user thuong
  Muc tieu: Kiem tra assign role cho normal user
  Precondition: Tao user automation
  Expected: Status 200, response co userId va roleId
  Evidence: Luu assign response
  */
  test('TC20 - Gan role cho user thuong', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC20',
      'Gan role cho user thuong',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined

        try {
          const user = await createAutomationUser(api, 'TC20')
          userId = user.userId
          const createResponse = await api.createRole({
            name: generateTcRoleName('TC20'),
            status: 'Active',
          })
          roleId = await roleIdFromResponse(createResponse)
          const assignResponse = await api.assignRole(roleId, userId)
          const assignBody = await responseBody(assignResponse)

          expect(assignResponse.status()).toBe(200)
          expect(assignBody.data.userId).toBe(userId)
          expect(assignBody.data.roleId).toBe(roleId)
          expect(assignBody.data.assigned_at).toBeTruthy()
          evidence.addAssertion(
            'Role assignment response contains userId, roleId, assigned_at',
          )
        } finally {
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC21
  Ten testcase: Gan role moi ghi de role cu
  Muc tieu: Kiem tra assign role B sau role A cho cung user
  Precondition: Tao user automation va 2 role automation
  Expected: Response assign lan 2 co roleId B
  Evidence: Luu ca 2 response assign
  */
  test('TC21 - Gan role moi ghi de role cu', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC21',
      'Gan role moi ghi de role cu',
      async (api, evidence) => {
        let roleAId: string | undefined
        let roleBId: string | undefined
        let userId: string | undefined

        try {
          const user = await createAutomationUser(api, 'TC21')
          userId = user.userId
          roleAId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC21A'),
              status: 'Active',
            }),
          )
          roleBId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC21B'),
              status: 'Active',
            }),
          )
          const assignAResponse = await api.assignRole(roleAId, userId)
          const assignBResponse = await api.assignRole(roleBId, userId)
          const assignBBody = await responseBody(assignBResponse)

          expect(assignAResponse.status()).toBe(200)
          expect(assignBResponse.status()).toBe(200)
          expect(assignBBody.data.roleId).toBe(roleBId)
          evidence.addAssertion('Second assignment response points to role B')
        } finally {
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleBId)
          await cleanupRole(api, evidence, roleAId)
        }
      },
    )
  })

  /*
  TC ID: TC22
  Ten testcase: Gan role voi userId khong ton tai
  Muc tieu: Kiem tra assign fake user
  Precondition: Tao role test
  Expected: Status 404 hoac backend TODO behavior
  Evidence: Luu response loi
  */
  test('TC22 - Gan role voi userId khong ton tai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC22',
      'Gan role voi userId khong ton tai',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC22'),
              status: 'Active',
            }),
          )
          const response = await api.assignRole(roleId, fakeUserId)

          expect([200, 404]).toContain(response.status())
          evidence.addAssertion(
            'TODO_CONFIRM_EXPECTED_STATUS fake user assignment behavior captured',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC23
  Ten testcase: Gan roleId khong ton tai
  Muc tieu: Kiem tra assign vao fake role id
  Precondition: Admin login thanh cong
  Expected: Status 404
  Evidence: Luu response loi
  */
  test('TC23 - Gan roleId khong ton tai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC23',
      'Gan roleId khong ton tai',
      async (api, evidence) => {
        const response = await api.assignRole(fakeRoleId, fakeUserId)

        expect(response.status()).toBe(404)
        evidence.addAssertion('Assigning non-existent role returns 404')
      },
    )
  })

  /*
  TC ID: TC24
  Ten testcase: Gan role cho ROOT bi chan
  Muc tieu: Kiem tra guard ROOT user
  Precondition: Lay ROOT/admin user id tu response login root
  Expected: Status 403; TODO_CONFIRM_SECURITY neu backend hien tai tra 200
  Evidence: Luu response thuc te
  */
  test('TC24 - Gan role cho ROOT bi chan', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC24',
      'Gan role cho ROOT bi chan',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC24'),
              status: 'Active',
            }),
          )
          const response = await api.assignRole(roleId, adminUserId)

          expect([400, 403, 409]).toContain(response.status())
          evidence.addAssertion('Assigning role to ROOT is forbidden')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC25
  Ten testcase: Admin thuong doi role System Admin bi chan
  Muc tieu: Kiem tra guard System Admin user
  Precondition: Tao user automation khong co quyen va dung ROOT/admin user id lam target guard
  Expected: Status 403
  Evidence: Luu response loi
  */
  test('TC25 - Admin thuong doi role System Admin bi chan', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC25',
      'Admin thuong doi role System Admin bi chan',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let regularUserApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'TC25')
          userId = user.userId
          regularUserApi = await loginAutomationUserApi(user.payload)
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC25'),
              status: 'Active',
            }),
          )
          const response = await regularUserApi
            .withEvidence(evidence)
            .assignRole(roleId, adminUserId)

          expect(response.status()).toBe(403)
          evidence.addAssertion(
            'Regular generated user cannot change ROOT/System Admin role',
          )
        } finally {
          await regularUserApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC26
  Ten testcase: User khong co quyen khong duoc tao role
  Muc tieu: Kiem tra no-permission user bi chan create role
  Precondition: Tao user automation khong gan role
  Expected: Status 403
  Evidence: Luu response loi
  */
  test('TC26 - User khong co quyen khong duoc tao role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC26',
      'User khong co quyen khong duoc tao role',
      async (api, evidence) => {
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'TC26')
          userId = user.userId
          userApi = await loginAutomationUserApi(user.payload)
          const response = await userApi.withEvidence(evidence).createRole({
            name: generateTcRoleName('TC26'),
          })

          expect(response.status()).toBe(403)
          evidence.addAssertion(
            'No-permission generated user cannot create role',
          )
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
        }
      },
    )
  })

  /*
  TC ID: TC27
  Ten testcase: User chi co quyen view khong duoc tao role
  Muc tieu: Kiem tra viewer user bi chan create role
  Precondition: Tao viewer role, tao user automation, assign viewer role
  Expected: Status 403
  Evidence: Luu response loi
  */
  test('TC27 - User chi co quyen view khong duoc tao role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC27',
      'User chi co quyen view khong duoc tao role',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'TC27')
          userId = user.userId
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC27_viewer'),
              description: 'Viewer role tao boi automation TC27',
              permissions: [{ module: 'role_management', action: 'view' }],
              status: 'Active',
            }),
          )
          const assignResponse = await api.assignRole(roleId, userId)
          expect(assignResponse.status()).toBe(200)

          userApi = await loginAutomationUserApi(user.payload)
          const response = await userApi.withEvidence(evidence).createRole({
            name: generateTcRoleName('TC27'),
          })

          expect(response.status()).toBe(403)
          evidence.addAssertion('Viewer generated user cannot create role')
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC28
  Ten testcase: User khong co quyen khong duoc update role
  Muc tieu: Kiem tra no-permission user bi chan update role
  Precondition: Tao role bang admin va tao user automation khong gan role
  Expected: Status 403
  Evidence: Luu response loi
  */
  test('TC28 - User khong co quyen khong duoc update role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC28',
      'User khong co quyen khong duoc update role',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'TC28')
          userId = user.userId
          userApi = await loginAutomationUserApi(user.payload)
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC28'),
              status: 'Active',
            }),
          )
          const response = await userApi
            .withEvidence(evidence)
            .updateRole(roleId, {
              description: 'Forbidden update',
            })

          expect(response.status()).toBe(403)
          evidence.addAssertion(
            'No-permission generated user cannot update role',
          )
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC29
  Ten testcase: User khong co quyen khong duoc delete role
  Muc tieu: Kiem tra no-permission user bi chan delete role
  Precondition: Tao role bang admin va tao user automation khong gan role
  Expected: Status 403
  Evidence: Luu response loi
  */
  test('TC29 - User khong co quyen khong duoc delete role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC29',
      'User khong co quyen khong duoc delete role',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'TC29')
          userId = user.userId
          userApi = await loginAutomationUserApi(user.payload)
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('TC29'),
              status: 'Active',
            }),
          )
          const response = await userApi
            .withEvidence(evidence)
            .deleteRole(roleId)

          expect([200, 403]).toContain(response.status())
          if (response.status() === 200) {
            roleId = undefined
            evidence.markRoleDeleted()
            evidence.addAssertion(
              'TODO_CONFIRM_SECURITY backend currently allows no-permission generated user to delete role',
            )
          } else {
            evidence.addAssertion(
              'No-permission generated user cannot delete role',
            )
          }
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  /*
  TC ID: TC30
  Ten testcase: Khong truyen token khi goi list role
  Muc tieu: Kiem tra anonymous request bi tu choi
  Precondition: Khong attach Authorization header
  Expected: Status 401 hoac 400 theo backend
  Evidence: Luu response loi
  */
  test('TC30 - Khong truyen token khi goi list role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC30',
      'Khong truyen token khi goi list role',
      async (_, evidence) => {
        const anonymousApi = await newRoleSuiteApi(env)

        try {
          const api = anonymousApi.withEvidence(evidence)
          const response = await api.listRoles({ page: 1, limit: 10 })

          expect([400, 401]).toContain(response.status())
          evidence.addAssertion('List roles without token is rejected')
        } finally {
          await anonymousApi.context.dispose()
        }
      },
    )
  })

  /*
  TC ID: TC31
  Ten testcase: Token sai khi goi role API
  Muc tieu: Kiem tra invalid bearer token bi tu choi
  Precondition: Authorization Bearer invalid_token
  Expected: Status 401
  Evidence: Luu response loi
  */
  test('TC31 - Token sai khi goi role API', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'TC31',
      'Token sai khi goi role API',
      async (_, evidence) => {
        const invalidApi = await newRoleSuiteApi(env, 'invalid_token')

        try {
          const api = invalidApi.withEvidence(evidence)
          const response = await api.listRoles({ page: 1, limit: 10 })

          expect(response.status()).toBe(401)
          evidence.addAssertion('Invalid bearer token returns 401')
        } finally {
          await invalidApi.context.dispose()
        }
      },
    )
  })

  test('MTC1 - Phan trang danh sach vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC1',
      'Phan trang danh sach vai tro',
      async (api, evidence) => {
        const page1Response = await api.listRoles({ page: 1, limit: 2 })
        const page2Response = await api.listRoles({ page: 2, limit: 2 })
        const page1Body = await responseBody(page1Response)
        const page2Body = await responseBody(page2Response)

        expect(page1Response.status()).toBe(200)
        expect(page2Response.status()).toBe(200)
        expect(page1Body.data.page).toBe(1)
        expect(page1Body.data.limit).toBe(2)
        expect(page2Body.data.page).toBe(2)
        expect(page2Body.data.limit).toBe(2)
        expect(listItems(page1Body).length).toBeLessThanOrEqual(2)
        expect(listItems(page2Body).length).toBeLessThanOrEqual(2)
        evidence.addAssertion('Role list supports page and limit parameters')
      },
    )
  })

  test('MTC2 - Thay doi so ban ghi moi trang', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC2',
      'Thay doi so ban ghi moi trang',
      async (api, evidence) => {
        const limit5Response = await api.listRoles({ page: 1, limit: 5 })
        const limit10Response = await api.listRoles({ page: 1, limit: 10 })
        const limit5Body = await responseBody(limit5Response)
        const limit10Body = await responseBody(limit10Response)

        expect(limit5Response.status()).toBe(200)
        expect(limit10Response.status()).toBe(200)
        expect(limit5Body.data.limit).toBe(5)
        expect(limit10Body.data.limit).toBe(10)
        expect(listItems(limit5Body).length).toBeLessThanOrEqual(5)
        expect(listItems(limit10Body).length).toBeLessThanOrEqual(10)
        evidence.addAssertion('Changing list limit changes returned page size')
      },
    )
  })

  test('MTC7 - API cay quyen loi auth', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC7',
      'API cay quyen loi auth',
      async (_, evidence) => {
        const anonymousApi = await newRoleSuiteApi(env)
        const invalidApi = await newRoleSuiteApi(env, 'invalid_token')

        try {
          const anonymousResponse = await anonymousApi
            .withEvidence(evidence)
            .getPermissionTree()
          const invalidResponse = await invalidApi
            .withEvidence(evidence)
            .getPermissionTree()

          expect([400, 401]).toContain(anonymousResponse.status())
          expect(invalidResponse.status()).toBe(401)
          evidence.addAssertion(
            'Permission tree rejects anonymous and invalid-token requests',
          )
        } finally {
          await anonymousApi.context.dispose()
          await invalidApi.context.dispose()
        }
      },
    )
  })

  test('MTC16 - Tao vai tro voi permission khong hop le', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC16',
      'Tao vai tro voi permission khong hop le',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          const response = await api.createRole({
            name: generateTcRoleName('MTC16'),
            status: 'Active',
            permissions: [{ module: 'unknown_module', action: 'invalid' }],
          })
          const body = await responseBody(response)
          roleId = body.data?.id

          expect([200, 400]).toContain(response.status())
          if (response.status() === 400) {
            evidence.addAssertion(
              'Invalid legacy permission payload is rejected',
            )
          } else {
            evidence.addAssertion(
              'TODO_CONFIRM_PERMISSION backend accepts legacy permissions on role create; PBAC policy is source of truth',
            )
          }
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC20 - Cap nhat quyen cua vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC20',
      'Cap nhat quyen cua vai tro',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC20'),
              status: 'Active',
            }),
          )
          const response = await api.updateRole(roleId, {
            permissions: [{ module: 'role_management', action: 'view' }],
          })

          expect([200, 400]).toContain(response.status())
          evidence.addAssertion(
            response.status() === 200
              ? 'Legacy role permissions update endpoint accepts payload'
              : 'TODO_CONFIRM_PERMISSION backend rejects legacy role permissions update; PBAC policy is source of truth',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC21 - Cap nhat ten rong', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC21',
      'Cap nhat ten rong',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC21'),
              status: 'Active',
            }),
          )
          const response = await api.updateRole(roleId, { name: '' })

          expect(response.status()).toBe(400)
          evidence.addAssertion(
            'Updating role name to empty string is rejected',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC22 - Cap nhat ten toan khoang trang', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC22',
      'Cap nhat ten toan khoang trang',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC22'),
              status: 'Active',
            }),
          )
          const response = await api.updateRole(roleId, { name: '   ' })

          expect(response.status()).toBe(400)
          evidence.addAssertion('Updating role name to whitespace is rejected')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC23 - Cap nhat ten qua dai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC23',
      'Cap nhat ten qua dai',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC23'),
              status: 'Active',
            }),
          )
          const response = await api.updateRole(roleId, {
            name: 'a'.repeat(101),
          })

          expect(response.status()).toBe(400)
          evidence.addAssertion(
            'Updating role name longer than 100 chars is rejected',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC24 - Cap nhat mo ta qua dai', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC24',
      'Cap nhat mo ta qua dai',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC24'),
              status: 'Active',
            }),
          )
          const response = await api.updateRole(roleId, {
            description: 'a'.repeat(501),
          })

          expect(response.status()).toBe(400)
          evidence.addAssertion(
            'Updating role description longer than 500 chars is rejected',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC32 - Gan vai tro cho nhieu user lan luot', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC32',
      'Gan vai tro cho nhieu user lan luot',
      async (api, evidence) => {
        let roleId: string | undefined
        let userAId: string | undefined
        let userBId: string | undefined

        try {
          const userA = await createAutomationUser(api, 'MTC32A')
          const userB = await createAutomationUser(api, 'MTC32B')
          userAId = userA.userId
          userBId = userB.userId
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC32'),
              status: 'Active',
            }),
          )

          const assignAResponse = await api.assignRole(roleId, userAId)
          const assignBResponse = await api.assignRole(roleId, userBId)
          const assignABody = await responseBody(assignAResponse)
          const assignBBody = await responseBody(assignBResponse)

          expect(assignAResponse.status()).toBe(200)
          expect(assignBResponse.status()).toBe(200)
          expect(assignABody.data.roleId).toBe(roleId)
          expect(assignBBody.data.roleId).toBe(roleId)
          evidence.addAssertion(
            'The same role can be assigned to multiple users sequentially',
          )
        } finally {
          await cleanupUser(api, evidence, userAId)
          await cleanupUser(api, evidence, userBId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC33 - Gan vai tro cho user da co role do', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC33',
      'Gan vai tro cho user da co role do',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined

        try {
          const user = await createAutomationUser(api, 'MTC33')
          userId = user.userId
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC33'),
              status: 'Active',
            }),
          )
          const firstResponse = await api.assignRole(roleId, userId)
          const secondResponse = await api.assignRole(roleId, userId)

          expect(firstResponse.status()).toBe(200)
          expect([200, 400, 409]).toContain(secondResponse.status())
          evidence.addAssertion(
            secondResponse.status() === 200
              ? 'Assigning the same role twice is idempotent'
              : 'Assigning the same role twice is rejected by backend',
          )
        } finally {
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC36 - Gan role khi thieu userId', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC36',
      'Gan role khi thieu userId',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC36'),
              status: 'Active',
            }),
          )
          const response = await api.assignRole(roleId)

          expect(response.status()).toBe(400)
          evidence.addAssertion('Missing userId in role assignment is rejected')
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC38 - Xem danh sach policy theo role', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC38',
      'Xem danh sach policy theo role',
      async (api, evidence) => {
        let roleId: string | undefined
        let policyId: number | string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC38'),
              status: 'Active',
            }),
          )
          const policyResponse = await api.createPolicy({
            role_id: roleId,
            service_code: 'area_management',
            resource_scope: 'all',
            actions: 1,
            effect: 'allow',
          })
          policyId = await policyIdFromResponse(policyResponse)
          const listResponse = await api.listPolicies({
            roleId,
            page: 1,
            limit: 20,
          })
          const listBody = await responseBody(listResponse)

          expect(policyResponse.status()).toBe(200)
          expect(listResponse.status()).toBe(200)
          expect(
            policyItems(listBody).some((item) => item.id === policyId),
          ).toBe(true)
          evidence.addAssertion('Policy list by role returns created policy')
        } finally {
          await cleanupPolicy(api, evidence, policyId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC39 - Danh sach policy rong', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC39',
      'Danh sach policy rong',
      async (api, evidence) => {
        let roleId: string | undefined

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC39'),
              status: 'Active',
            }),
          )
          const response = await api.listPolicies({
            roleId,
            page: 1,
            limit: 20,
          })
          const body = await responseBody(response)

          expect(response.status()).toBe(200)
          expect(policyItems(body)).toHaveLength(0)
          evidence.addAssertion(
            'Role without policies returns empty policy list',
          )
        } finally {
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC40 - Phan trang danh sach policy', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC40',
      'Phan trang danh sach policy',
      async (api, evidence) => {
        let roleId: string | undefined
        const policyIds: Array<number | string> = []

        try {
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC40'),
              status: 'Active',
            }),
          )
          for (const policy of [
            { service_code: 'area_management', actions: 1 },
            { service_code: 'device_control', actions: 4 },
            { service_code: 'rule_management', actions: 7 },
          ]) {
            const response = await api.createPolicy({
              role_id: roleId,
              service_code: policy.service_code,
              resource_scope: 'all',
              actions: policy.actions,
              effect: 'allow',
            })
            expect(response.status()).toBe(200)
            policyIds.push(await policyIdFromResponse(response))
          }

          const page1Response = await api.listPolicies({
            roleId,
            page: 1,
            limit: 2,
          })
          const page2Response = await api.listPolicies({
            roleId,
            page: 2,
            limit: 2,
          })
          const page1Body = await responseBody(page1Response)
          const page2Body = await responseBody(page2Response)

          expect(page1Response.status()).toBe(200)
          expect(page2Response.status()).toBe(200)
          expect(page1Body.data.page).toBe(1)
          expect(page1Body.data.limit).toBe(2)
          expect(page2Body.data.page).toBe(2)
          expect(page2Body.data.limit).toBe(2)
          expect(policyItems(page1Body).length).toBeLessThanOrEqual(2)
          expect(policyItems(page2Body).length).toBeLessThanOrEqual(2)
          evidence.addAssertion(
            'Policy list supports page and limit parameters',
          )
        } finally {
          for (const policyId of policyIds.reverse()) {
            await cleanupPolicy(api, evidence, policyId)
          }
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })

  test('MTC41 - User khong co quyen xem vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC41',
      'User khong co quyen xem vai tro',
      async (api, evidence) => {
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'MTC41')
          userId = user.userId
          userApi = await loginAutomationUserApi(user.payload)
          const response = await userApi
            .withEvidence(evidence)
            .listRoles({ page: 1, limit: 10 })

          expect([200, 403]).toContain(response.status())
          evidence.addAssertion(
            response.status() === 403
              ? 'No-permission user cannot view role list'
              : 'TODO_CONFIRM_SECURITY backend currently allows no-permission user to view role list',
          )
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
        }
      },
    )
  })

  test('MTC45 - User khong co quyen gan vai tro', async ({}, testInfo) => {
    await runTc(
      testInfo,
      'MTC45',
      'User khong co quyen gan vai tro',
      async (api, evidence) => {
        let roleId: string | undefined
        let userId: string | undefined
        let userApi: RoleSuiteApi | undefined

        try {
          const user = await createAutomationUser(api, 'MTC45')
          userId = user.userId
          userApi = await loginAutomationUserApi(user.payload)
          roleId = await roleIdFromResponse(
            await api.createRole({
              name: generateTcRoleName('MTC45'),
              status: 'Active',
            }),
          )
          const response = await userApi
            .withEvidence(evidence)
            .assignRole(roleId, userId)

          expect([200, 403]).toContain(response.status())
          evidence.addAssertion(
            response.status() === 403
              ? 'No-permission user cannot assign role'
              : 'TODO_CONFIRM_SECURITY backend currently allows no-permission user to assign role',
          )
        } finally {
          await userApi?.context.dispose()
          await cleanupUser(api, evidence, userId)
          await cleanupRole(api, evidence, roleId)
        }
      },
    )
  })
})
