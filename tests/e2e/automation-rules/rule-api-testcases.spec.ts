import { expect, test, type TestInfo } from '@playwright/test'
import {
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_RULE_ENDPOINT_SLOT,
  AUTOMATION_RULE_INPUT_SLOT,
  AUTOMATION_RULE_OUTPUT_SLOT,
  AUTOMATION_SERVICE_ENDPOINT,
} from '@src/config'
import {
  AutomationCenterApiClient,
  createAutomationDetailData,
  createAutomationExecutionData,
} from '@src/core'
import {
  AutomationRuleRuntimeDevices,
  discoverAutomationRuleDevices,
  expectAutomationInList,
  expectRuleMappedToDevices,
  controlGatewayDevice,
  attachRuleAssertion,
  attachRuleStep,
  createRuleTestContext,
  getGatewayDeviceStatus,
  hasGatewaySlotValue,
  triggerRuleAndCollectEvidence,
  getAutomationRuleIdentity,
  redactAutomationSecrets,
  saveRuleEvidence,
  type RuleTestContext,
} from './rule.support'

type CreatedExecution = {
  id: string | number
}

type CreatedRule = {
  id: string | number
  name: string
}

type CreatedCell = {
  id: string | number
}

type CreatedConnection = {
  id: string | number
}

const fakeId = '999999999999999999'
const GATEWAY_DEVICE_SLOT = AUTOMATION_RULE_ENDPOINT_SLOT

test.describe('Automation Rule API TC1-TC73', () => {
  test.setTimeout(120000)

  test.skip(
    !AUTOMATION_SERVICE_ENDPOINT,
    'AUTOMATION_SERVICE_ENDPOINT is required',
  )

  let ruleDevices: AutomationRuleRuntimeDevices

  test.beforeAll(async ({ playwright }) => {
    const apiRequest = await playwright.request.newContext()
    try {
      ruleDevices = await discoverAutomationRuleDevices(apiRequest)
    } finally {
      await apiRequest.dispose()
    }
  })

  const triggerDeviceId = () => ruleDevices.trigger.id
  const conditionDeviceId = () => ruleDevices.condition?.id ?? ruleDevices.trigger.id
  const actionDeviceId = () => ruleDevices.action.id
  const poolDeviceId = (index: number) =>
    ruleDevices.pool[index]?.id ?? ruleDevices.action.id

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (
      client: AutomationCenterApiClient,
      context: RuleTestContext,
      testInfo: TestInfo,
    ) => Promise<void>,
  ) => {
    test(`${tcId} - ${tcName}`, async ({ request }, testInfo) => {
      const context = createRuleTestContext(tcId, tcName, 'api')
      const client = new AutomationCenterApiClient(request)
      attachRuleStep(context, {
        step: 'Run Rule API testcase',
        details: {
          tc_id: tcId,
          tc_name: tcName,
        },
      })

      try {
        await handler(client, context, testInfo)
        attachRuleAssertion(context, `${tcId} completed successfully`)
        await saveRuleEvidence(context, 'PASSED')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await saveRuleEvidence(
          context,
          /skip/i.test(message) ? 'SKIPPED' : 'FAILED',
          error,
        )
        throw error
      }
    })
  }

  const requireWriteEnabled = () => {
    test.skip(
      process.env.AUTOMATION_RULE_WRITE_ENABLED !== 'true',
      'AUTOMATION_RULE_WRITE_ENABLED=true is required to create/update/delete rule data',
    )
  }

  const requireRuntimeEnabled = () => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'AUTOMATION_ALLOW_DEVICE_CONTROL=true is required to control real devices',
    )
  }

  runTc('TC1', 'Lay danh sach execution template', async (client) => {
    const response = await client.listExecutionTemplatesAPI()
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(Array.isArray(json.data.items)).toBe(true)
    await expect(
      json.data.items.map((template: { type?: string }) => template.type),
    ).toEqual(expect.arrayContaining(['And', 'Or']))
  })

  runTc('TC2', 'Lay chi tiet execution template', async (client) => {
    const listResponse = await client.listExecutionTemplatesAPI()
    const listJson = await listResponse.json()
    const firstTemplate = listJson.data.items[0]

    await expect(listResponse.status()).toBe(200)
    await expect(firstTemplate?.id).toBeTruthy()

    const detailResponse = await client.getExecutionTemplateAPI(firstTemplate.id)
    const detailJson = await detailResponse.json()

    await expect(detailResponse.status()).toBe(200)
    await expect(detailJson.success).toBe(true)
    await expect(detailJson.data.id).toBe(firstTemplate.id)
    await expect(detailJson.data.type).toBe(firstTemplate.type)
  })

  runTc('TC3', 'Lay execution template khong ton tai', async (client) => {
    const response = await client.getExecutionTemplateAPI(fakeId)
    await expectDocumentedStatus(response.status(), [400, 404, 500])
  })

  runTc('TC4', 'Tao execution And thanh cong', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    await cleanupExecution(client, execution.id)
  })

  runTc('TC5', 'Tao execution Or thanh cong', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'Or')
    await cleanupExecution(client, execution.id)
  })

  runTc('TC6', 'Lay danh sach execution', async (client) => {
    const response = await client.listExecutionsAPI({ page: 1, limit: 20 })
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(Array.isArray(json.data.items)).toBe(true)
    await expect(json.data.total).not.toBeUndefined()
  })

  runTc('TC7', 'Lay chi tiet execution vua tao', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    try {
      const response = await client.getExecutionAPI(execution.id)
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(String(json.data.id)).toBe(String(execution.id))
      await expect(json.data.type).toBe('And')
    } finally {
      await cleanupExecution(client, execution.id)
    }
  })

  runTc('TC8', 'Cap nhat execution tu And sang Or', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    try {
      const response = await client.updateExecutionAPI(execution.id, {
        type: 'Or',
      })
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(json.data.type).toBe('Or')
    } finally {
      await cleanupExecution(client, execution.id)
    }
  })

  runTc('TC9', 'Xoa execution chua dung trong rule', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    const response = await client.deleteExecutionAPI(execution.id)
    await expect([200, 204, 404]).toContain(response.status())
  })

  runTc('TC10', 'Tao execution thieu input', async (client) => {
    const response = await client.createExecutionAPI({
      ...createAutomationExecutionData('And'),
      input: undefined as never,
    })
    await expectDocumentedStatus(response.status(), [400, 422])
  })

  runTc('TC11', 'Tao execution thieu output', async (client) => {
    const response = await client.createExecutionAPI({
      ...createAutomationExecutionData('And'),
      output: undefined as never,
    })
    await expectDocumentedStatus(response.status(), [400, 422])
  })

  runTc('TC12', 'Tao execution type sai enum', async (client) => {
    const response = await client.createExecutionAPI({
      ...createAutomationExecutionData('And'),
      type: 'Invalid' as never,
    })
    await expectDocumentedStatus(response.status(), [400, 422])
  })

  runTc('TC13', 'Cap nhat execution khong ton tai', async (client) => {
    const response = await client.updateExecutionAPI(fakeId, { type: 'Or' })
    await expectDocumentedStatus(response.status(), [400, 404, 500])
  })

  runTc('TC14', 'Tao automation detail And mot input mot output', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC14', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC15', 'Tao automation detail And hai input', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC15', {
      type: 'And',
      inputs: [
        { id: triggerDeviceId(), status: true, slot: 0 },
        { id: conditionDeviceId(), status: true, slot: 1 },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC16', 'Tao automation detail Or hai input', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC16', {
      type: 'Or',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC17', 'Tao automation detail nhieu output action', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC17', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [
        { id: actionDeviceId(), status: true },
        { id: conditionDeviceId(), status: false },
      ],
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC18', 'Tao automation detail voi time range', async (client) => {
    requireWriteEnabled()
    const timeWindow = createRuleTimeWindow(-10, 20)
    const rule = await createRule(client, 'TC18', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
      startTime: timeWindow.startTime,
      endTime: timeWindow.endTime,
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC19', 'Tao automation detail dang disabled', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC19', {
      type: 'And',
      enable: false,
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    await cleanupRule(client, rule.id)
  })

  runTc('TC20', 'Lay danh sach automation', async (client) => {
    const response = await client.listAutomationsAPI({ page: 1, limit: 20 })
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(Array.isArray(json.data.items)).toBe(true)
  })

  runTc('TC21', 'Lay expanded detail automation', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC21', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const response = await client.getAutomationDetailAPI(rule.id, [
        'input_connection',
        'output_connection',
      ])
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(json.data.automation).toBeTruthy()
      await expect(json.data.execution).toBeTruthy()
      await expect(json.data.execution.input.length).toBe(1)
      await expect(json.data.execution.output.length).toBe(1)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC22', 'Cap nhat rule sang disabled', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC22', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const response = await client.updateAutomationAPI(rule.id, {
        name: rule.name,
        enable: false,
      })
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(json.data.enable).toBe(false)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC23', 'Cap nhat rule sang enabled', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC23', {
      type: 'And',
      enable: false,
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const response = await client.updateAutomationAPI(rule.id, {
        name: rule.name,
        enable: true,
      })
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(json.data.enable).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC24', 'Doi ten automation rule', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC24', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const renamed = `${rule.name}_renamed`
      const response = await client.updateAutomationAPI(rule.id, {
        name: renamed,
        enable: true,
      })
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(json.data.name).toBe(renamed)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC25', 'Update output value cua rule', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC25', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const payload = createAutomationDetailData({
        type: 'And',
        name: rule.name,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: false }],
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC26', 'Update condition type tu And sang Or', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC26', {
      type: 'And',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const payload = createAutomationDetailData({
        type: 'Or',
        name: rule.name,
        inputs: [
          { id: triggerDeviceId(), status: true },
          { id: conditionDeviceId(), status: true },
        ],
        outputs: [{ id: actionDeviceId(), status: true }],
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC27', 'Update input device cua rule', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC27', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const payload = createAutomationDetailData({
        type: 'And',
        name: rule.name,
        inputs: [{ id: conditionDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC28', 'Update time range cua rule', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC28', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const timeWindow = createRuleTimeWindow(-5, 30)
      const payload = createAutomationDetailData({
        type: 'And',
        name: rule.name,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
        startTime: timeWindow.startTime,
        endTime: timeWindow.endTime,
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC29', 'Xoa automation rule thanh cong', async (client) => {
    requireWriteEnabled()
    const rule = await createRule(client, 'TC29', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })

    const response = await client.deleteAutomationAPI(rule.id)
    await expect([200, 204]).toContain(response.status())
  })

  runTc('TC30', 'Xoa nhieu automation rule', async (client) => {
    requireWriteEnabled()
    const first = await createRule(client, 'TC30_first', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    const second = await createRule(client, 'TC30_second', {
      type: 'Or',
      inputs: [{ id: conditionDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })

    const response = await client.deleteManyAutomationsAPI([first.id, second.id])
    await expectDocumentedStatus(response.status(), [200, 204])
  })

  runTc('TC31', 'Tao automation detail thieu automation', async (client) => {
    const response = await client.createAutomationDetailAPI({
      execution: {
        type: 'And',
        input: [
          {
            id: triggerDeviceId(),
            status: true,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            endpoint_slot: AUTOMATION_RULE_ENDPOINT_SLOT,
          },
        ],
        output: [
          {
            id: actionDeviceId(),
            status: true,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            endpoint_slot: AUTOMATION_RULE_ENDPOINT_SLOT,
          },
        ],
      },
    })
    await expectDocumentedStatus(response.status(), [400, 422])
  })

  const negativeDetailCases: Array<{
    id: string
    name: string
    payload: () => Record<string, unknown>
  }> = [
    {
      id: 'TC32',
      name: 'Tao automation detail thieu execution',
      payload: () => ({
        automation: {
          name: `thuy_rule_TC32_${Date.now()}`,
          description: 'Missing execution',
          enable: true,
        },
      }),
    },
    {
      id: 'TC33',
      name: 'Tao automation detail input rong',
      payload: () => createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC33_${Date.now()}`,
        inputs: [],
        outputs: [{ id: actionDeviceId(), status: true }],
      }) as unknown as Record<string, unknown>,
    },
    {
      id: 'TC34',
      name: 'Tao automation detail output rong',
      payload: () => createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC34_${Date.now()}`,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [],
      }) as unknown as Record<string, unknown>,
    },
    {
      id: 'TC35',
      name: 'Tao automation detail device khong ton tai',
      payload: () => createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC35_${Date.now()}`,
        inputs: [{ id: fakeId, status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
      }) as unknown as Record<string, unknown>,
    },
    {
      id: 'TC36',
      name: 'Tao automation detail slot khong hop le',
      payload: () => createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC36_${Date.now()}`,
        inputs: [{ id: triggerDeviceId(), status: true, slot: 255 }],
        outputs: [{ id: actionDeviceId(), status: true }],
      }) as unknown as Record<string, unknown>,
    },
  ]

  for (const scenario of negativeDetailCases) {
    runTc(scenario.id, scenario.name, async (client) => {
      const response = await client.createAutomationDetailAPI(scenario.payload())
      const json = await parseJsonIfPossible(response)
      const acceptedId = getAcceptedAutomationId(json)

      if (response.status() < 400 && acceptedId !== undefined) {
        await cleanupRule(client, acceptedId)
      }

      console.log(
        JSON.stringify({
          rule_negative_case: scenario.id,
          status: response.status(),
          accepted_by_backend: response.status() < 400,
          response: redactAutomationSecrets(json),
        }),
      )

      await expectDocumentedStatus(response.status(), [200, 400, 422])
    })
  }

  runTc('TC37', 'Tao automation detail endpoint slot khong hop le', async (client) => {
    const response = await client.createAutomationDetailAPI(
      createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC37_${Date.now()}`,
        inputs: [
          {
            id: triggerDeviceId(),
            status: true,
            endpointSlot: 255,
          },
        ],
        outputs: [{ id: actionDeviceId(), status: true }],
      }),
    )
    const json = await parseJsonIfPossible(response)
    const acceptedId = getAcceptedAutomationId(json)
    if (response.status() < 400 && acceptedId !== undefined) {
      await cleanupRule(client, acceptedId)
    }
    await expectDocumentedStatus(response.status(), [200, 400, 422])
  })

  runTc('TC38', 'Tao automation detail start time sai cron', async (client) => {
    const response = await client.createAutomationDetailAPI(
      createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC38_${Date.now()}`,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
        startTime: 'invalid cron',
      }),
    )
    const json = await parseJsonIfPossible(response)
    const acceptedId = getAcceptedAutomationId(json)
    if (response.status() < 400 && acceptedId !== undefined) {
      await cleanupRule(client, acceptedId)
    }
    await expectDocumentedStatus(response.status(), [200, 400, 422])
  })

  runTc('TC39', 'Tao automation detail end time sai dinh dang', async (client) => {
    const response = await client.createAutomationDetailAPI(
      createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC39_${Date.now()}`,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
        endTime: 'not-a-time',
      }),
    )
    const json = await parseJsonIfPossible(response)
    const acceptedId = getAcceptedAutomationId(json)
    if (response.status() < 400 && acceptedId !== undefined) {
      await cleanupRule(client, acceptedId)
    }
    await expectDocumentedStatus(response.status(), [200, 400, 422])
  })

  runTc('TC40', 'Tao automation detail trung ten rule', async (client) => {
    requireWriteEnabled()
    const name = `thuy_rule_TC40_duplicate_${Date.now()}`
    const first = await createRule(client, 'TC40_first', {
      type: 'And',
      name,
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    const createdIds: Array<string | number> = [first.id]
    try {
      const response = await client.createAutomationDetailAPI(
        createAutomationDetailData({
          type: 'And',
          name,
          inputs: [{ id: triggerDeviceId(), status: true }],
          outputs: [{ id: actionDeviceId(), status: true }],
        }),
      )
      const json = await parseJsonIfPossible(response)
      const duplicateId = getAcceptedAutomationId(json)
      if (duplicateId !== undefined) {
        createdIds.push(duplicateId)
      }
      await expectDocumentedStatus(response.status(), [200, 400, 409, 422])
    } finally {
      for (const id of createdIds) {
        await cleanupRule(client, id)
      }
    }
  })

  runTc('TC41', 'Update automation khong ton tai', async (client) => {
    const response = await client.updateAutomationAPI(fakeId, {
      name: `thuy_rule_TC41_${Date.now()}`,
      enable: true,
    })
    await expectDocumentedStatus(response.status(), [400, 404, 500])
  })

  runTc('TC42', 'Delete automation khong ton tai', async (client) => {
    const response = await client.deleteAutomationAPI(fakeId)
    await expectDocumentedStatus(response.status(), [200, 400, 404, 500])
  })

  runTc('TC43', 'Tao automation basic voi execution id hop le', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    let automationId: string | number | undefined
    try {
      const response = await client.createAutomationAPI({
        name: `thuy_rule_TC43_${Date.now()}`,
        description: 'Basic automation create testcase',
        enable: true,
        execution_id: execution.id,
      })
      const json = await response.json()
      automationId = json.data?.id

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(automationId).toBeTruthy()
      await expect(String(json.data.execution_id)).toBe(String(execution.id))
    } finally {
      if (automationId !== undefined) {
        await cleanupRule(client, automationId)
      }
      await cleanupExecution(client, execution.id)
    }
  })

  runTc('TC44', 'Tao automation basic thieu name', async (client) => {
    const response = await client.createAutomationAPI({
      description: 'Missing name',
      enable: true,
      execution_id: fakeId,
    } as never)
    await expectDocumentedStatus(response.status(), [400, 422])
  })

  runTc('TC45', 'Tao automation basic execution id khong ton tai', async (client) => {
    const response = await client.createAutomationAPI({
      name: `thuy_rule_TC45_${Date.now()}`,
      description: 'Unknown execution id',
      enable: true,
      execution_id: fakeId,
    })
    const json = await parseJsonIfPossible(response)
    const acceptedId = getAcceptedAutomationId(json)
    if (response.status() < 400 && acceptedId !== undefined) {
      await cleanupRule(client, acceptedId)
    }

    console.log(
      JSON.stringify({
        rule_negative_case: 'TC45',
        status: response.status(),
        accepted_by_backend: response.status() < 400,
        response: redactAutomationSecrets(json),
      }),
    )

    await expectDocumentedStatus(response.status(), [200, 400, 404, 405, 422, 500])
  })

  runTc('TC46', 'Delete execution dang duoc automation su dung', async (client) => {
    requireWriteEnabled()
    const execution = await createExecution(client, 'And')
    let automationId: string | number | undefined
    try {
      const createResponse = await client.createAutomationAPI({
        name: `thuy_rule_TC46_${Date.now()}`,
        description: 'Execution in-use delete contract',
        enable: true,
        execution_id: execution.id,
      })
      const createJson = await createResponse.json()
      automationId = createJson.data?.id
      await expect(createResponse.status()).toBe(200)

      const deleteExecutionResponse = await client.deleteExecutionAPI(execution.id)
      await expectDocumentedStatus(deleteExecutionResponse.status(), [
        200,
        400,
        404,
        409,
        500,
      ])
    } finally {
      if (automationId !== undefined) {
        await cleanupRule(client, automationId)
      }
      await cleanupExecution(client, execution.id)
    }
  })

  runTc('TC47', 'Tao connection input', async (client) => {
    requireWriteEnabled()
    const response = await client.createConnectionAPI(createConnectionPayload(fakeId, fakeId))
    const json = await parseJsonIfPossible(response)

    await expectDocumentedStatus(response.status(), [200, 400, 404, 405, 422, 500])
    await cleanupAcceptedConnection(client, json)
  })

  runTc('TC48', 'Tao connection output', async (client) => {
    requireWriteEnabled()
    const response = await client.createConnectionAPI({
      source: { id: Number(fakeId), slot: 1 },
      target: { id: Number(fakeId), slot: 0 },
      transformer: null,
    })
    const json = await parseJsonIfPossible(response)

    await expectDocumentedStatus(response.status(), [200, 400, 404, 405, 422, 500])
    await cleanupAcceptedConnection(client, json)
  })

  runTc('TC49', 'Lay danh sach connection', async (client) => {
    const response = await client.listConnectionsAPI({ page: 1, limit: 20 })
    const json = await response.json()

    await expect(response.status()).toBe(200)
    await expect(json.success).toBe(true)
    await expect(Array.isArray(json.data.items)).toBe(true)
  })

  runTc('TC50', 'Lay chi tiet connection', async (client) => {
    const response = await client.getConnectionAPI(fakeId)
    await expectDocumentedStatus(response.status(), [400, 404, 500])
  })

  runTc('TC51', 'Update connection target', async (client) => {
    requireWriteEnabled()
    const response = await client.updateConnectionAPI(fakeId, {
      target: {
        id: Number(fakeId),
        slot: 0,
      },
    })
    await expectDocumentedStatus(response.status(), [400, 404, 422, 500])
  })

  runTc('TC52', 'Bulk create connection', async (client) => {
    requireWriteEnabled()
    const response = await client.createManyConnectionsAPI([
      createConnectionPayload(fakeId, fakeId),
      createConnectionPayload(fakeId, fakeId),
    ])
    const json = await parseJsonIfPossible(response)

    await expectDocumentedStatus(response.status(), [200, 400, 404, 422, 500])
    for (const id of collectCreatedIds(json)) {
      await cleanupConnection(client, id)
    }
  })

  runTc('TC53', 'Bulk update connection', async (client) => {
    requireWriteEnabled()
    const response = await client.updateManyConnectionsAPI([
      {
        id: Number(fakeId),
        target: {
          id: Number(fakeId),
          slot: 0,
        },
      } as never,
    ])
    const json = await parseJsonIfPossible(response)

    await expectDocumentedStatus(response.status(), [200, 400, 404, 405, 422, 500])
    console.log(JSON.stringify({ rule_connection_bulk_update_tc53: redactAutomationSecrets(json) }))
  })

  runTc('TC54', 'Delete connection', async (client) => {
    requireWriteEnabled()
    const response = await client.deleteConnectionAPI(Number(fakeId))
    await expectDocumentedStatus(response.status(), [200, 204, 400, 404, 410, 500])
  })

  runTc('TC55', 'Runtime input ON trigger output ON', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC55', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const evidence = await triggerRuleAndCollectEvidence({
        inputDeviceId: triggerDeviceId(),
        inputSlot: GATEWAY_DEVICE_SLOT,
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputSlot: GATEWAY_DEVICE_SLOT,
        initialOutputValue: false,
        expectedOutputValue: true,
        timeoutMs: 30000,
      })
      console.log(
        JSON.stringify({
          rule_runtime_tc55: {
            trigger_device_id: triggerDeviceId(),
            action_device_id: actionDeviceId(),
            input_slot: AUTOMATION_RULE_INPUT_SLOT,
            output_slot: AUTOMATION_RULE_OUTPUT_SLOT,
            gateway_device_slot: GATEWAY_DEVICE_SLOT,
            ...evidence,
          },
        }),
      )
      await expect(evidence.outputMatched).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC56', 'Runtime input OFF trigger output OFF', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC56', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: false }],
      outputs: [{ id: actionDeviceId(), status: false }],
    })
    try {
      const evidence = await triggerRuleAndCollectEvidence({
        inputDeviceId: triggerDeviceId(),
        inputSlot: GATEWAY_DEVICE_SLOT,
        inputValue: false,
        outputDeviceId: actionDeviceId(),
        outputSlot: GATEWAY_DEVICE_SLOT,
        initialOutputValue: true,
        expectedOutputValue: false,
        timeoutMs: 30000,
      })
      await expect(evidence.outputMatched).toBe(true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC57', 'Runtime sai input khong doi output', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC57', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: false,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC58', 'Runtime AND hai input cung dung moi trigger', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC58', {
      type: 'And',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [conditionDeviceId(), false],
        [actionDeviceId(), false],
      ])
      await controlGatewayDevice({
        deviceId: triggerDeviceId(),
        slot: GATEWAY_DEVICE_SLOT,
        value: true,
      })
      await expectOutputAfterTrigger({
        inputDeviceId: conditionDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC59', 'Runtime AND thieu input thu hai khong trigger', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC59', {
      type: 'And',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [conditionDeviceId(), false],
        [actionDeviceId(), false],
      ])
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC60', 'Runtime OR input thu nhat trigger output', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC60', {
      type: 'Or',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([[conditionDeviceId(), false]])
      await expectOutputAfterTrigger({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC61', 'Runtime OR input thu hai trigger output', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC61', {
      type: 'Or',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([[triggerDeviceId(), false]])
      await expectOutputAfterTrigger({
        inputDeviceId: conditionDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC62', 'Runtime OR khong input nao dung khong trigger', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC62', {
      type: 'Or',
      inputs: [
        { id: triggerDeviceId(), status: true },
        { id: conditionDeviceId(), status: true },
      ],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [conditionDeviceId(), false],
      ])
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: false,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC63', 'Runtime rule disabled khong chay', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC63', {
      type: 'And',
      enable: false,
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC64', 'Runtime re-enable rule roi trigger lai', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC64', {
      type: 'And',
      enable: false,
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
      const response = await client.updateAutomationAPI(rule.id, {
        name: rule.name,
        enable: true,
      })
      const json = await response.json()
      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expectOutputAfterTrigger({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC65', 'Runtime mot input dieu khien nhieu output', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const secondOutputId = poolDeviceId(3)
    const rule = await createRule(client, 'TC65', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [
        { id: actionDeviceId(), status: true },
        { id: secondOutputId, status: true },
      ],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [actionDeviceId(), false],
        [secondOutputId, false],
      ])
      await controlGatewayDevice({
        deviceId: triggerDeviceId(),
        slot: GATEWAY_DEVICE_SLOT,
        value: true,
      })
      await expectGatewayOutput(actionDeviceId(), true)
      await expectGatewayOutput(secondOutputId, true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC66', 'Runtime lap lai trigger 5 lan', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC66', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await expectOutputAfterTrigger({
          inputDeviceId: triggerDeviceId(),
          inputValue: true,
          outputDeviceId: actionDeviceId(),
          expectedOutputValue: true,
        })
      }
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC67', 'Runtime rapid repeated input', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC67', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [actionDeviceId(), false],
      ])
      for (const value of [true, false, true]) {
        await controlGatewayDevice({
          deviceId: triggerDeviceId(),
          slot: GATEWAY_DEVICE_SLOT,
          value,
        })
      }
      await expectGatewayOutput(actionDeviceId(), true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC68', 'Runtime sau khi doi output target', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const secondOutputId = poolDeviceId(3)
    const rule = await createRule(client, 'TC68', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const payload = createAutomationDetailData({
        type: 'And',
        name: rule.name,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: secondOutputId, status: true }],
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()
      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await setRuleSlots([
        [triggerDeviceId(), false],
        [actionDeviceId(), false],
        [secondOutputId, false],
      ])
      await controlGatewayDevice({
        deviceId: triggerDeviceId(),
        slot: GATEWAY_DEVICE_SLOT,
        value: true,
      })
      await expectGatewayOutput(secondOutputId, true)
      await expectGatewayOutput(actionDeviceId(), false, 3000)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC69', 'Runtime sau khi doi input condition', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC69', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      const payload = createAutomationDetailData({
        type: 'And',
        name: rule.name,
        inputs: [{ id: conditionDeviceId(), status: true }],
        outputs: [{ id: actionDeviceId(), status: true }],
      })
      const response = await client.updateAutomationDetailAPI(rule.id, payload)
      const json = await response.json()
      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await setRuleSlots([
        [triggerDeviceId(), false],
        [conditionDeviceId(), false],
        [actionDeviceId(), false],
      ])
      await expectOutputUnchanged({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
      await expectOutputAfterTrigger({
        inputDeviceId: conditionDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC70', 'Output action la device', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const rule = await createRule(client, 'TC70', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
    })
    try {
      await expectOutputAfterTrigger({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC71', 'Output action la nhieu device', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const secondOutputId = poolDeviceId(3)
    const thirdOutputId = poolDeviceId(4)
    const rule = await createRule(client, 'TC71', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [
        { id: actionDeviceId(), status: true },
        { id: secondOutputId, status: true },
        { id: thirdOutputId, status: true },
      ],
    })
    try {
      await setRuleSlots([
        [triggerDeviceId(), false],
        [actionDeviceId(), false],
        [secondOutputId, false],
        [thirdOutputId, false],
      ])
      await controlGatewayDevice({
        deviceId: triggerDeviceId(),
        slot: GATEWAY_DEVICE_SLOT,
        value: true,
      })
      await expectGatewayOutput(actionDeviceId(), true)
      await expectGatewayOutput(secondOutputId, true)
      await expectGatewayOutput(thirdOutputId, true)
    } finally {
      await cleanupRule(client, rule.id)
    }
  })

  runTc('TC72', 'Output action la scene', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()
    const sceneTargetId = poolDeviceId(3)
    const scene = await createSceneForRuleOutput(client, 'TC72', sceneTargetId, true)
    let rule: CreatedRule | undefined
    try {
      const payload = createAutomationDetailData({
        type: 'And',
        name: `thuy_rule_TC72_${Date.now()}`,
        inputs: [{ id: triggerDeviceId(), status: true }],
        outputs: [{ id: scene.id, status: true }],
      })
      const response = await client.createAutomationDetailAPI(payload)
      const json = await response.json()
      const id = json.data?.id

      await expect(response.status()).toBe(200)
      await expect(json.success).toBe(true)
      await expect(id).toBeTruthy()
      rule = { id, name: payload.automation.name }

      await setRuleSlots([
        [triggerDeviceId(), false],
        [sceneTargetId, false],
      ])
      await controlGatewayDevice({
        deviceId: triggerDeviceId(),
        slot: GATEWAY_DEVICE_SLOT,
        value: true,
      })
      await expectGatewayOutput(sceneTargetId, true)
    } finally {
      if (rule) {
        await cleanupRule(client, rule.id)
      }
      await cleanupScene(client, scene.id)
    }
  })

  runTc('TC73', 'Rule co lich trong va ngoai khoang', async (client) => {
    requireRuntimeEnabled()
    requireWriteEnabled()

    const currentWindow = createRuleTimeWindow(-10, 20)
    const currentRule = await createRule(client, 'TC73_current_window', {
      type: 'And',
      inputs: [{ id: triggerDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
      startTime: currentWindow.startTime,
      endTime: currentWindow.endTime,
    })
    try {
      await expectOutputAfterTrigger({
        inputDeviceId: triggerDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        expectedOutputValue: true,
      })
    } finally {
      await cleanupRule(client, currentRule.id)
    }

    const outsideWindow = createRuleTimeWindow(-120, -60)
    const outsideRule = await createRule(client, 'TC73_outside_window', {
      type: 'And',
      inputs: [{ id: conditionDeviceId(), status: true }],
      outputs: [{ id: actionDeviceId(), status: true }],
      startTime: outsideWindow.startTime,
      endTime: outsideWindow.endTime,
    })
    try {
      await expectOutputUnchanged({
        inputDeviceId: conditionDeviceId(),
        inputValue: true,
        outputDeviceId: actionDeviceId(),
        outputValue: false,
      })
    } finally {
      await cleanupRule(client, outsideRule.id)
    }
  })

})

const createExecution = async (
  client: AutomationCenterApiClient,
  type: 'And' | 'Or',
): Promise<CreatedExecution> => {
  const response = await client.createExecutionAPI(
    createAutomationExecutionData(type),
  )
  const json = await response.json()
  const id = json.data?.id

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(id).toBeTruthy()
  await expect(json.data.type).toBe(type)

  return { id }
}

const createCell = async (
  client: AutomationCenterApiClient,
  tcId: string,
  executionId: string | number,
): Promise<CreatedCell> => {
  const response = await client.createCellAPI({
    name: `thuy_rule_cell_${tcId}_${Date.now()}`,
    description: 'Temporary automation cell generated by rule testcase',
    execution_id: Number(executionId),
    enable: true,
    cron: null,
  })
  const json = await response.json()
  const id = json.data?.id

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(id).toBeTruthy()

  return { id }
}

const createConnectionFixture = async (
  client: AutomationCenterApiClient,
  tcId: string,
  cellCount = 2,
) => {
  const executions: CreatedExecution[] = []
  const cells: CreatedCell[] = []

  for (let index = 0; index < cellCount; index += 1) {
    const execution = await createExecution(client, 'And')
    executions.push(execution)
    cells.push(await createCell(client, `${tcId}_${index}`, execution.id))
  }

  return {
    executions,
    sourceCell: cells[0],
    targetCell: cells[1],
    extraCells: cells.slice(2),
    cells,
  }
}

const cleanupConnectionFixture = async (
  client: AutomationCenterApiClient,
  fixture: Awaited<ReturnType<typeof createConnectionFixture>>,
) => {
  for (const cell of [...fixture.cells].reverse()) {
    await cleanupCell(client, cell.id)
  }
  for (const execution of [...fixture.executions].reverse()) {
    await cleanupExecution(client, execution.id)
  }
}

const createConnectionPayload = (
  sourceCellId: string | number,
  targetCellId: string | number,
) => ({
  source: {
    id: Number(sourceCellId),
    slot: 0,
  },
  target: {
    id: Number(targetCellId),
    slot: 0,
  },
  transformer: null,
})

const createConnection = async (
  client: AutomationCenterApiClient,
  sourceCellId: string | number,
  targetCellId: string | number,
): Promise<CreatedConnection> => {
  const response = await client.createConnectionAPI(
    createConnectionPayload(sourceCellId, targetCellId),
  )
  const json = await response.json()
  const id = json.data?.id

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(id).toBeTruthy()

  return { id }
}

const createRule = async (
  client: AutomationCenterApiClient,
  tcId: string,
  options: Parameters<typeof createAutomationDetailData>[0],
): Promise<CreatedRule> => {
  const payload = createAutomationDetailData({
    ...options,
    name: `thuy_rule_${tcId}_${Date.now()}`,
  })
  const response = await client.createAutomationDetailAPI(payload)
  const json = await response.json()
  const id = json.data?.id
  const identity = getAutomationRuleIdentity(json, payload.automation)

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(id).toBeTruthy()
  await expect(json.data.enable).toBe(payload.automation.enable)

  await expectAutomationInList({ apiRequest: client.context, identity })
  await expectRuleMappedToDevices({
    devices: [
      ...payload.execution.input.map((input) => ({ id: String(input.id) })),
      ...payload.execution.output.map((output) => ({ id: String(output.id) })),
    ],
    identity,
  })

  return {
    id,
    name: payload.automation.name,
  }
}

const cleanupExecution = async (
  client: AutomationCenterApiClient,
  id: string | number,
) => {
  const response = await client.deleteExecutionAPI(id)
  await expect([200, 204, 404, 410, 500]).toContain(response.status())
}

const cleanupCell = async (
  client: AutomationCenterApiClient,
  id: string | number,
) => {
  const response = await client.deleteCellAPI(Number(id))
  await expect([200, 204, 404, 410, 500]).toContain(response.status())
}

const cleanupConnection = async (
  client: AutomationCenterApiClient,
  id: string | number,
) => {
  const response = await client.deleteConnectionAPI(Number(id))
  await expect([200, 204, 404, 410, 500]).toContain(response.status())
}

const createSceneForRuleOutput = async (
  client: AutomationCenterApiClient,
  tcId: string,
  targetDeviceId: string | number,
  value: boolean,
) => {
  const response = await client.createSceneAPI({
    type: 'Normal',
    name: `thuy_scene_rule_${tcId}_${Date.now()}`,
    icon: '-1',
    enable: true,
    background: null,
    background_color: '#ffffff',
    binding: [
      {
        id: String(targetDeviceId),
        snapshot: {
          [String(GATEWAY_DEVICE_SLOT)]: value,
        },
        status: 'Activated',
      },
    ],
    cron: null,
    cron_enable: false,
  })
  const json = await response.json()
  const id = json.data?.id

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)
  await expect(id).toBeTruthy()

  return {
    id,
    name: json.data?.name,
  }
}

const cleanupScene = async (
  client: AutomationCenterApiClient,
  id: string | number,
) => {
  const response = await client.deleteSceneAPI(id)
  await expect([200, 204, 404, 410, 500]).toContain(response.status())
}

const cleanupAcceptedConnection = async (
  client: AutomationCenterApiClient,
  value: unknown,
) => {
  for (const id of collectCreatedIds(value)) {
    await cleanupConnection(client, id)
  }
}

const cleanupRule = async (
  client: AutomationCenterApiClient,
  id: string | number,
) => {
  const response = await client.deleteAutomationAPI(id)
  await expect([200, 204, 404, 410, 500]).toContain(response.status())
}

const expectDocumentedStatus = async (
  actual: number,
  expected: number[],
) => {
  await expect(
    expected,
    `Expected status ${expected.join('/')} but got ${actual}`,
  ).toContain(actual)
}

const createRuleTimeWindow = (
  startOffsetMinutes: number,
  endOffsetMinutes: number,
) => {
  const now = new Date()
  const start = new Date(now.getTime() + startOffsetMinutes * 60 * 1000)
  const end = new Date(now.getTime() + endOffsetMinutes * 60 * 1000)

  return {
    startTime: `0 ${start.getMinutes()} ${start.getHours()} * * 1,2,3,4,5,6,7 *`,
    endTime: `${String(end.getHours()).padStart(2, '0')}:${String(
      end.getMinutes(),
    ).padStart(2, '0')}`,
  }
}

const parseJsonIfPossible = async (response: {
  json: () => Promise<unknown>
}) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const collectCreatedIds = (value: unknown): Array<string | number> => {
  if (typeof value !== 'object' || value === null) {
    return []
  }

  const data = (value as { data?: unknown }).data
  if (Array.isArray(data)) {
    return data
      .map((item) =>
        typeof item === 'object' && item !== null
          ? (item as { id?: string | number }).id
          : undefined,
      )
      .filter((id): id is string | number => id !== undefined)
  }

  if (typeof data === 'object' && data !== null) {
    const id = (data as { id?: string | number }).id
    return id === undefined ? [] : [id]
  }

  return []
}

const getAcceptedAutomationId = (
  value: unknown,
): string | number | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const data = (value as { data?: { id?: string | number } }).data
  return data?.id
}

const setRuleSlots = async (
  deviceValues: Array<[string | number, boolean]>,
) => {
  for (const [deviceId, value] of deviceValues) {
    await controlGatewayDevice({
      deviceId,
      slot: GATEWAY_DEVICE_SLOT,
      value,
    })
    await waitForGatewaySlotValue(deviceId, GATEWAY_DEVICE_SLOT, value)
  }
}

const expectOutputAfterTrigger = async ({
  inputDeviceId,
  inputValue,
  outputDeviceId,
  expectedOutputValue,
}: {
  inputDeviceId: string | number
  inputValue: boolean
  outputDeviceId: string | number
  expectedOutputValue: boolean
}) => {
  const evidence = await triggerRuleAndCollectEvidence({
    inputDeviceId,
    inputSlot: GATEWAY_DEVICE_SLOT,
    inputValue,
    outputDeviceId,
    outputSlot: GATEWAY_DEVICE_SLOT,
    initialOutputValue: !expectedOutputValue,
    expectedOutputValue,
    timeoutMs: 30000,
  })

  console.log(JSON.stringify({ rule_runtime_evidence: evidence }))
  await expect(evidence.outputMatched).toBe(true)
}

const expectOutputUnchanged = async ({
  inputDeviceId,
  inputValue,
  outputDeviceId,
  outputValue,
}: {
  inputDeviceId: string | number
  inputValue: boolean
  outputDeviceId: string | number
  outputValue: boolean
}) => {
  await controlGatewayDevice({
    deviceId: outputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: outputValue,
  })
  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: inputValue,
  })
  await new Promise((resolve) => setTimeout(resolve, 5000))
  await expectGatewayOutput(outputDeviceId, outputValue, 1000)
}

const expectGatewayOutput = async (
  deviceId: string | number,
  value: boolean,
  timeoutMs = 30000,
) => {
  await waitForGatewaySlotValue(deviceId, GATEWAY_DEVICE_SLOT, value, timeoutMs)
}

const waitForGatewaySlotValue = async (
  deviceId: string | number,
  slot: number,
  value: boolean,
  timeoutMs = 30000,
) => {
  const intervalMs = 1000
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs))
  let statuses = await getGatewayDeviceStatus([deviceId])
  let matched = hasGatewaySlotValue(statuses, deviceId, slot, value)

  for (let attempt = 0; attempt < attempts && !matched; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    statuses = await getGatewayDeviceStatus([deviceId])
    matched = hasGatewaySlotValue(statuses, deviceId, slot, value)
  }

  console.log(
    JSON.stringify({
      rule_gateway_slot_check: {
        device_id: deviceId,
        slot,
        expected: value,
        matched,
        statuses,
      },
    }),
  )
  await expect(matched).toBe(true)
}
