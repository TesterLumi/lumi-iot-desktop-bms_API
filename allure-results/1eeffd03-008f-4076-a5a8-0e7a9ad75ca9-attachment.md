# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\group-management\group-management.api.spec.ts >> Group Management API Real HC TC1-TC69 >> TC1 - Lay danh sach group thanh cong
- Location: tests\e2e\group-management\group-management.api.spec.ts:82:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 404
```

# Test source

```ts
  22  |   createGroupPayload,
  23  |   createGroupTestContext,
  24  |   expectAllowedStatus,
  25  |   expectGroupDetailShape,
  26  |   expectGroupListShape,
  27  |   extractData,
  28  |   extractId,
  29  |   extractItems,
  30  |   generateGroupName,
  31  |   getInitialDeviceStates,
  32  |   loginAs,
  33  |   probeUrl,
  34  |   recordGroupResponse,
  35  |   resetDeviceStates,
  36  |   resetGroupEvidenceRunDir,
  37  |   saveGroupEvidence,
  38  |   waitForGroupDeletedFromHC,
  39  |   waitForGroupSyncedToHC,
  40  | } from './group-management.support'
  41  | 
  42  | const FAKE_ID = '999999999999999999'
  43  | const INVALID_ID = 'abc'
  44  | const FAKE_DEVICE_ID = '999999999999999998'
  45  | 
  46  | let adminToken = ''
  47  | let viewerToken = ''
  48  | let noPermissionToken = ''
  49  | let baseProbe: Awaited<ReturnType<typeof probeUrl>>
  50  | let hcProbe: Awaited<ReturnType<typeof probeUrl>>
  51  | 
  52  | test.describe('Group Management API Real HC TC1-TC69', () => {
  53  |   test.describe.configure({ mode: 'serial' })
  54  | 
  55  |   test.beforeAll(async () => {
  56  |     await resetGroupEvidenceRunDir()
  57  |     ;[adminToken, viewerToken, noPermissionToken, baseProbe, hcProbe] =
  58  |       await Promise.all([
  59  |         loginAs('admin'),
  60  |         loginAs('viewer'),
  61  |         loginAs('no_permission'),
  62  |         probeUrl(GROUP_BASE_URL),
  63  |         probeUrl(GROUP_HC_BASE_URL),
  64  |       ])
  65  |   })
  66  | 
  67  |   const runTc = (
  68  |     tcId: string,
  69  |     tcName: string,
  70  |     handler: (args: {
  71  |       client: GroupApiClient
  72  |       context: ReturnType<typeof createGroupTestContext>
  73  |       request: APIRequestContext
  74  |     }) => Promise<void>,
  75  |     options: {
  76  |       requireAdmin?: boolean
  77  |       requireHc?: boolean
  78  |       requireControl?: boolean
  79  |       timeoutMs?: number
  80  |     } = {},
  81  |   ) => {
  82  |     test(`${tcId} - ${tcName}`, async ({ request }) => {
  83  |       if (options.timeoutMs) {
  84  |         test.setTimeout(options.timeoutMs)
  85  |       }
  86  |       const context = createGroupTestContext(tcId, tcName)
  87  |       const client = new GroupApiClient(request, adminToken)
  88  |       try {
  89  |         test.skip(!baseProbe?.ok, `GROUP_BASE_URL is not reachable: ${JSON.stringify(baseProbe)}`)
  90  |         test.skip(
  91  |           options.requireAdmin !== false && GROUP_REQUIRE_AUTH && !adminToken,
  92  |           'Admin token or login env is required when GROUP_REQUIRE_AUTH=true',
  93  |         )
  94  |         test.skip(options.requireHc === true && !hcProbe?.ok, `HC is not reachable: ${JSON.stringify(hcProbe)}`)
  95  |         test.skip(options.requireControl === true && !GROUP_ALLOW_DEVICE_CONTROL, 'Set GROUP_ALLOW_DEVICE_CONTROL=true to control real devices')
  96  |         await handler({ client, context, request })
  97  |         await saveGroupEvidence(context, 'PASSED')
  98  |       } catch (error) {
  99  |         if (error instanceof Error && error.message.includes('Test is skipped')) {
  100 |           await saveGroupEvidence(context, 'SKIPPED', error)
  101 |           throw error
  102 |         }
  103 |         await saveGroupEvidence(context, 'FAILED', error)
  104 |         throw error
  105 |       }
  106 |     })
  107 |   }
  108 | 
  109 |   /*
  110 |    * TC ID: TC1
  111 |    * Ten testcase: Lay danh sach group thanh cong
  112 |    * Muc tieu: Kiem tra admin co the lay danh sach group tu API that.
  113 |    * Expected: HTTP 200 va response la list hoac paginated list.
  114 |    * Evidence: Luu request/response GET group list.
  115 |    */
  116 |   runTc('TC1', 'Lay danh sach group thanh cong', async ({ client, context }) => {
  117 |     const response = await client.listGroupsAPI({ page: 1, limit: 20 })
  118 |     const body = await recordGroupResponse(context, 'List groups', response, {
  119 |       method: 'GET',
  120 |       endpoint: `${GROUP_API_BASE}?page=1&limit=20`,
  121 |     })
> 122 |     expect(response.status()).toBe(200)
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  123 |     expectGroupListShape(body)
  124 |     attachGroupAssertion(context, 'List groups returns list or paginated list')
  125 |   })
  126 | 
  127 |   const filterCases: Array<[string, string, string]> = [
  128 |     ['TC2', 'Loc group theo type Normal', 'Normal'],
  129 |     ['TC3', 'Loc group theo type Lighting', 'Lighting'],
  130 |   ]
  131 |   for (const [tcId, tcName, type] of filterCases) {
  132 |     runTc(tcId, tcName, async ({ client, context }) => {
  133 |       const response = await client.listGroupsAPI({ type, page: 1, limit: 20 })
  134 |       const body = await recordGroupResponse(context, `Filter group type ${type}`, response, {
  135 |         method: 'GET',
  136 |         endpoint: `${GROUP_API_BASE}?type=${type}`,
  137 |       })
  138 |       expect(response.status()).toBe(200)
  139 |       for (const item of extractItems(body)) {
  140 |         if (item.type) {
  141 |           expect(String(item.type)).toBe(type)
  142 |         }
  143 |       }
  144 |       attachGroupAssertion(context, `Returned groups have type ${type} when backend includes type`)
  145 |     })
  146 |   }
  147 | 
  148 |   /*
  149 |    * TC ID: TC4
  150 |    * Ten testcase: Tim group theo ten
  151 |    * Expected: Search theo name tra group vua tao hoac list hop le neu backend search partial.
  152 |    */
  153 |   runTc('TC4', 'Tim group theo ten', async ({ client, context }) => {
  154 |     let groupId: string | undefined
  155 |     const name = generateGroupName('TC4', 'search')
  156 |     try {
  157 |       groupId = await createGroupAndExtractId(client, context, createGroupPayload({ tcId: 'TC4', name }))
  158 |       const response = await client.listGroupsAPI({ search: name, page: 1, limit: 20 })
  159 |       const body = await recordGroupResponse(context, 'Search group by name', response, {
  160 |         method: 'GET',
  161 |         endpoint: `${GROUP_API_BASE}?search=${name}`,
  162 |       })
  163 |       expect(response.status()).toBe(200)
  164 |       const items = extractItems(body)
  165 |       if (items.length > 0) {
  166 |         expect(items.some((item) => item.name === name)).toBe(true)
  167 |       }
  168 |       attachGroupAssertion(context, 'Search response contains created group when backend returns matched item')
  169 |     } finally {
  170 |       await cleanupGroup(client, context, groupId)
  171 |     }
  172 |   })
  173 | 
  174 |   /*
  175 |    * TC ID: TC5
  176 |    * Ten testcase: Lay chi tiet group thanh cong
  177 |    * Expected: Detail dung id/name/type/devices.
  178 |    */
  179 |   runTc('TC5', 'Lay chi tiet group thanh cong', async ({ client, context }) => {
  180 |     let groupId: string | undefined
  181 |     try {
  182 |       const payload = createGroupPayload({ tcId: 'TC5', deviceIds: [TEST_SWITCH_DEVICE_ID_1].filter(Boolean) })
  183 |       groupId = await createGroupAndExtractId(client, context, payload)
  184 |       const response = await client.getGroupAPI(groupId)
  185 |       const body = await recordGroupResponse(context, 'Get group detail', response, {
  186 |         method: 'GET',
  187 |         endpoint: `${GROUP_API_BASE}/${groupId}`,
  188 |       })
  189 |       expect(response.status()).toBe(200)
  190 |       expectGroupDetailShape(body)
  191 |       expect(String(extractId(body))).toBe(String(groupId))
  192 |       attachGroupAssertion(context, 'Group detail returns created group id')
  193 |     } finally {
  194 |       await cleanupGroup(client, context, groupId)
  195 |     }
  196 |   })
  197 | 
  198 |   const detailNegativeCases: Array<[string, string, string, number[]]> = [
  199 |     ['TC6', 'Lay chi tiet group khong ton tai', FAKE_ID, [404, 400]],
  200 |     ['TC7', 'Lay chi tiet group id sai format', INVALID_ID, [400, 404]],
  201 |   ]
  202 |   for (const [tcId, tcName, groupId, statuses] of detailNegativeCases) {
  203 |     runTc(tcId, tcName, async ({ client, context }) => {
  204 |       const response = await client.getGroupAPI(groupId)
  205 |       await recordGroupResponse(context, 'Get invalid group detail', response, {
  206 |         method: 'GET',
  207 |         endpoint: `${GROUP_API_BASE}/${groupId}`,
  208 |       })
  209 |       expectAllowedStatus(response.status(), statuses)
  210 |       attachGroupAssertion(context, `Backend rejects invalid detail id with status ${response.status()}`)
  211 |     })
  212 |   }
  213 | 
  214 |   const createNormalCases: Array<[string, string, Array<string | number>]> = [
  215 |     ['TC8', 'Tao nhom thuong khong co thiet bi', []],
  216 |     ['TC9', 'Tao nhom thuong co 1 thiet bi', [TEST_SWITCH_DEVICE_ID_1]],
  217 |     ['TC10', 'Tao nhom thuong co nhieu thiet bi', [TEST_SWITCH_DEVICE_ID_1, TEST_SWITCH_DEVICE_ID_2]],
  218 |   ]
  219 |   for (const [tcId, tcName, deviceIds] of createNormalCases) {
  220 |     runTc(tcId, tcName, async ({ client, context }) => {
  221 |       let groupId: string | undefined
  222 |       try {
```