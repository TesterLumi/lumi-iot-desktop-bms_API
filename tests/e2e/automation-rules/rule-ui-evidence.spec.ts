import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import {
  AUTOMATION_ACTION_DEVICE_ID,
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_CONDITION_DEVICE_ID,
  AUTOMATION_PIR_SENSOR_DEVICE_ID,
  AUTOMATION_RULE_ENDPOINT_SLOT,
  AUTOMATION_RULE_INPUT_SLOT,
  AUTOMATION_RULE_OUTPUT_SLOT,
  AUTOMATION_SERVICE_ENDPOINT,
  AUTOMATION_TRIGGER_DEVICE_ID,
  DEVICE_SERVICE_ENDPOINT,
} from '@src/config'
import {
  AutomationCenterApiClient,
  createAutomationDetailData,
} from '@src/core'
import {
  AutomationRuleIdentity,
  attachRuleAssertion,
  attachRuleStep,
  controlGatewayDevice,
  createRuleTestContext,
  expectAutomationInList,
  expectRuleMappedToDevices,
  getGatewayDeviceStatus,
  getAutomationRuleIdentity,
  saveRuleEvidence,
  waitForGatewayDeviceState,
} from './rule.support'

type CreatedRuleEvidence = {
  automation_id: string | number
  automation_name: string
  execution_id: string | number
  execution_type: string
  start_time?: string | null
  end_time?: string | null
  identity: AutomationRuleIdentity
  trigger_device_id: string
  condition_device_id?: string
  action_device_id: string
  input_slot: number
  output_slot: number
}

const GATEWAY_DEVICE_SLOT = AUTOMATION_RULE_ENDPOINT_SLOT

const toNumericSuffix = (name?: string) => {
  const matched = name?.match(/^thuy_rule_(\d+)/)
  return matched ? Number(matched[1]) : 0
}

const getNextThuyRuleIndex = async (client: AutomationCenterApiClient) => {
  const response = await client.listAutomationsAPI({
    page: 1,
    limit: 100,
  })
  const json = await response.json()
  const items = (json.data?.items ?? []) as Array<{ name?: string }>

  await expect(response.status()).toBe(200)
  await expect(json.success).toBe(true)

  return Math.max(0, ...items.map((item) => toNumericSuffix(item.name))) + 1
}

const padTimePart = (value: number) => String(value).padStart(2, '0')

const createRuleTimeWindow = (startOffsetMinutes: number, endOffsetMinutes: number) => {
  const now = new Date()
  const start = new Date(now.getTime() + startOffsetMinutes * 60 * 1000)
  const end = new Date(now.getTime() + endOffsetMinutes * 60 * 1000)

  return {
    startTime: `0 ${start.getMinutes()} ${start.getHours()} * * 1,2,3,4,5,6,7 *`,
    endTime: `${padTimePart(end.getHours())}:${padTimePart(end.getMinutes())}`,
  }
}

const TIME_OUTSIDE_TRIGGER_DEVICE_ID =
  process.env.TIME_OUTSIDE_TRIGGER_DEVICE_ID ?? '87903193043180546'

const TIME_OUTSIDE_ACTION_DEVICE_ID =
  process.env.TIME_OUTSIDE_ACTION_DEVICE_ID ?? '87903193043180547'

const DISABLED_RULE_TRIGGER_DEVICE_ID =
  process.env.DISABLED_RULE_TRIGGER_DEVICE_ID ?? '120416080507841538'

const DISABLED_RULE_ACTION_DEVICE_ID =
  process.env.DISABLED_RULE_ACTION_DEVICE_ID ?? AUTOMATION_ACTION_DEVICE_ID

const hasDeviceSlotValue = (
  statuses: Awaited<ReturnType<typeof getGatewayDeviceStatus>>,
  deviceId: string,
  slot: number,
  value: boolean,
) =>
  statuses.some(
    (device) =>
      String(device.id) === deviceId &&
      device.status.some(
        (state) => Number(state.idx) === slot && state.value === value,
      ),
  )

const triggerRuleAndCollectEvidence = async ({
  inputDeviceId,
  outputDeviceId,
  expectedOutputValue,
}: {
  inputDeviceId: string
  outputDeviceId: string
  expectedOutputValue: boolean
}) => {
  const waitForSlotSoft = async (
    deviceId: string,
    slot: number,
    value: boolean,
    attempts = 10,
  ) => {
    let statuses = await getGatewayDeviceStatus([deviceId])
    let matched = hasDeviceSlotValue(statuses, deviceId, slot, value)

    for (let attempt = 0; attempt < attempts && !matched; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      statuses = await getGatewayDeviceStatus([deviceId])
      matched = hasDeviceSlotValue(statuses, deviceId, slot, value)
    }

    return { matched, statuses }
  }

  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: false,
  })
  await controlGatewayDevice({
    deviceId: outputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: false,
  })
  const inputReset = await waitForSlotSoft(
    inputDeviceId,
    GATEWAY_DEVICE_SLOT,
    false,
  )
  const outputReset = await waitForSlotSoft(
    outputDeviceId,
    GATEWAY_DEVICE_SLOT,
    false,
  )

  const beforeStatuses = await getGatewayDeviceStatus([
    inputDeviceId,
    outputDeviceId,
  ])

  await controlGatewayDevice({
    deviceId: inputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: true,
  })
  await waitForGatewayDeviceState({
    deviceId: inputDeviceId,
    slot: GATEWAY_DEVICE_SLOT,
    value: true,
  })

  let afterStatuses = await getGatewayDeviceStatus([
    inputDeviceId,
    outputDeviceId,
  ])
  let outputMatched = hasDeviceSlotValue(
    afterStatuses,
    outputDeviceId,
    GATEWAY_DEVICE_SLOT,
    expectedOutputValue,
  )

  for (let attempt = 0; attempt < 10 && !outputMatched; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    afterStatuses = await getGatewayDeviceStatus([inputDeviceId, outputDeviceId])
    outputMatched = hasDeviceSlotValue(
      afterStatuses,
      outputDeviceId,
      GATEWAY_DEVICE_SLOT,
      expectedOutputValue,
    )
  }

  return {
    inputResetMatched: inputReset.matched,
    outputResetMatched: outputReset.matched,
    beforeStatuses,
    afterStatuses,
    outputMatched,
  }
}

const createRuleAndEvidence = async ({
  client,
  name,
  type,
  inputs,
  outputs,
  startTime = null,
  endTime = null,
}: {
  client: AutomationCenterApiClient
  name: string
  type: 'And' | 'Or'
  inputs: Array<{ id: string; status: boolean }>
  outputs: Array<{ id: string; status: boolean }>
  startTime?: string | null
  endTime?: string | null
}): Promise<CreatedRuleEvidence> => {
  const payload = createAutomationDetailData({
    type,
    name,
    description: 'Retained automation rule data for UI/manual testcase check',
    inputs,
    outputs,
    startTime,
    endTime,
  })
  const createResponse = await client.createAutomationDetailAPI(payload)
  const createJson = await createResponse.json()
  const automationId = createJson.data?.id

  await expect(createResponse.status()).toBe(200)
  await expect(createJson.success).toBe(true)
  await expect(automationId).toBeTruthy()

  const detailResponse = await client.getAutomationDetailAPI(automationId, [
    'input_connection',
    'output_connection',
  ])
  const detailJson = await detailResponse.json()

  await expect(detailResponse.status()).toBe(200)
  await expect(detailJson.success).toBe(true)
  await expect(detailJson.data.automation.name).toBe(name)
  await expect(detailJson.data.automation.execution_id).toBeTruthy()
  await expect(detailJson.data.execution.type).toBe(type)
  await expect(detailJson.data.execution.input.length).toBe(inputs.length)
  await expect(detailJson.data.execution.output.length).toBe(outputs.length)

  return {
    automation_id: automationId,
    automation_name: detailJson.data.automation.name,
    execution_id: detailJson.data.automation.execution_id,
    execution_type: detailJson.data.execution.type,
    start_time: detailJson.data.automation.start_time,
    end_time: detailJson.data.automation.end_time,
    identity: getAutomationRuleIdentity(createJson, payload.automation),
    trigger_device_id: inputs[0].id,
    condition_device_id: inputs[1]?.id,
    action_device_id: outputs[0].id,
    input_slot: AUTOMATION_RULE_INPUT_SLOT,
    output_slot: AUTOMATION_RULE_OUTPUT_SLOT,
  }
}

const runUiEvidence = (
  title: string,
  handler: (
    fixtures: { request: APIRequestContext },
    testInfo: TestInfo,
  ) => Promise<void>,
) => {
  const tcId = title.split(' ')[0]
  test(title, async ({ request }, testInfo) => {
    const context = createRuleTestContext(tcId, title, 'ui')
    attachRuleStep(context, {
      step: 'Run Rule UI evidence testcase',
      details: {
        tc_id: tcId,
        tc_name: title,
      },
    })

    try {
      await handler({ request }, testInfo)
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

test.describe('Automation rules UI evidence data', () => {
  test.setTimeout(120000)

  test.skip(!AUTOMATION_SERVICE_ENDPOINT, 'AUTOMATION_SERVICE_ENDPOINT is required')
  test.skip(!DEVICE_SERVICE_ENDPOINT, 'DEVICE_SERVICE_ENDPOINT is required')
  test.skip(
    process.env.AUTOMATION_RULE_WRITE_ENABLED !== 'true',
    'AUTOMATION_RULE_WRITE_ENABLED=true is required to create retained rule data',
  )

  runUiEvidence('RULE-UI creates retained thuy_rule data and verifies API/device mapping', async ({
    request,
  }) => {
    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)

    const andRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_and`,
      type: 'And',
      inputs: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID, status: true },
        { id: AUTOMATION_CONDITION_DEVICE_ID, status: true },
      ],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: true }],
    })

    const orRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex + 1}_or`,
      type: 'Or',
      inputs: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID, status: true },
        { id: AUTOMATION_CONDITION_DEVICE_ID, status: true },
      ],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: true }],
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: andRule.identity,
    })
    await expectAutomationInList({
      apiRequest: request,
      identity: orRule.identity,
    })

    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID },
        { id: AUTOMATION_CONDITION_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: andRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID },
        { id: AUTOMATION_CONDITION_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: orRule.identity,
    })

    console.log(
      JSON.stringify({
        retained_rule_data_for_ui_check: {
          and_rule: andRule,
          or_rule: orRule,
          manual_check: {
            list_filter_hint: 'Search Automation Rules by thuy_rule_',
            expected_status: 'enabled',
            expected_devices_are_distinct: true,
            expected_input_slot: AUTOMATION_RULE_INPUT_SLOT,
            expected_output_slot: AUTOMATION_RULE_OUTPUT_SLOT,
          },
        },
      }),
    )
  })

  runUiEvidence('RULE-UI-PIR creates retained PIR sensor trigger rules', async ({
    request,
  }) => {
    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)

    const pirDetectedRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_pir_detected`,
      type: 'And',
      inputs: [{ id: AUTOMATION_PIR_SENSOR_DEVICE_ID, status: true }],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: true }],
    })

    const pirClearRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex + 1}_pir_clear`,
      type: 'And',
      inputs: [{ id: AUTOMATION_PIR_SENSOR_DEVICE_ID, status: false }],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: false }],
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: pirDetectedRule.identity,
    })
    await expectAutomationInList({
      apiRequest: request,
      identity: pirClearRule.identity,
    })

    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_PIR_SENSOR_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: pirDetectedRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_PIR_SENSOR_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: pirClearRule.identity,
    })

    console.log(
      JSON.stringify({
        retained_pir_rule_data_for_ui_check: {
          pir_detected_rule: pirDetectedRule,
          pir_clear_rule: pirClearRule,
          pir_sensor: {
            device_id: AUTOMATION_PIR_SENSOR_DEVICE_ID,
            state_name: 'PIR Sensor State',
            detected_value: true,
            clear_value: false,
            input_slot: AUTOMATION_RULE_INPUT_SLOT,
          },
          output_device: {
            device_id: AUTOMATION_ACTION_DEVICE_ID,
            output_slot: AUTOMATION_RULE_OUTPUT_SLOT,
          },
          manual_check: {
            list_filter_hint: 'Search Automation Rules by pir_',
            expected_trigger: 'PIR Sensor State',
            expected_devices_are_distinct:
              AUTOMATION_PIR_SENSOR_DEVICE_ID !== AUTOMATION_ACTION_DEVICE_ID,
          },
        },
      }),
    )
  })

  runUiEvidence('RULE-UI-TIME-CURRENT creates current-window rule and verifies output state', async ({
    request,
  }) => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'AUTOMATION_ALLOW_DEVICE_CONTROL=true is required to trigger real input devices',
    )

    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)
    const timeWindow = createRuleTimeWindow(-10, 20)
    const timeRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_time_current`,
      type: 'And',
      inputs: [{ id: AUTOMATION_TRIGGER_DEVICE_ID, status: true }],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: true }],
      startTime: timeWindow.startTime,
      endTime: timeWindow.endTime,
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: timeRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: timeRule.identity,
    })

    const runtimeEvidence = await triggerRuleAndCollectEvidence({
      inputDeviceId: AUTOMATION_TRIGGER_DEVICE_ID,
      outputDeviceId: AUTOMATION_ACTION_DEVICE_ID,
      expectedOutputValue: true,
    })

    console.log(
      JSON.stringify({
        retained_time_current_rule_check: {
          rule: timeRule,
          time_window: timeWindow,
          expectation: 'current time is inside range, output should become true',
          trigger: {
            device_id: AUTOMATION_TRIGGER_DEVICE_ID,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            value: true,
          },
          output: {
            device_id: AUTOMATION_ACTION_DEVICE_ID,
            slot: AUTOMATION_RULE_OUTPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            expected_value: true,
          },
          ...runtimeEvidence,
        },
      }),
    )

    await expect(
      runtimeEvidence.outputMatched,
      `Output device ${AUTOMATION_ACTION_DEVICE_ID} slot ${AUTOMATION_RULE_OUTPUT_SLOT} should become true inside the active time range`,
    ).toBe(true)
  })

  runUiEvidence('RULE-UI-TIME-OUTSIDE creates outside-window rule and verifies output is not activated', async ({
    request,
  }) => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'AUTOMATION_ALLOW_DEVICE_CONTROL=true is required to trigger real input devices',
    )

    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)
    const timeWindow = createRuleTimeWindow(-120, -60)
    const timeRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_time_outside`,
      type: 'And',
      inputs: [{ id: TIME_OUTSIDE_TRIGGER_DEVICE_ID, status: true }],
      outputs: [{ id: TIME_OUTSIDE_ACTION_DEVICE_ID, status: true }],
      startTime: timeWindow.startTime,
      endTime: timeWindow.endTime,
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: timeRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: TIME_OUTSIDE_TRIGGER_DEVICE_ID },
        { id: TIME_OUTSIDE_ACTION_DEVICE_ID },
      ],
      identity: timeRule.identity,
    })

    const runtimeEvidence = await triggerRuleAndCollectEvidence({
      inputDeviceId: TIME_OUTSIDE_TRIGGER_DEVICE_ID,
      outputDeviceId: TIME_OUTSIDE_ACTION_DEVICE_ID,
      expectedOutputValue: true,
    })

    console.log(
      JSON.stringify({
        retained_time_outside_rule_check: {
          rule: timeRule,
          time_window: timeWindow,
          expectation: 'current time is outside range, output should remain false',
          trigger: {
            device_id: TIME_OUTSIDE_TRIGGER_DEVICE_ID,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            value: true,
          },
          output: {
            device_id: TIME_OUTSIDE_ACTION_DEVICE_ID,
            slot: AUTOMATION_RULE_OUTPUT_SLOT,
            expected_value: false,
          },
          ...runtimeEvidence,
        },
      }),
    )

    await expect(
      runtimeEvidence.outputMatched,
      `Output device ${TIME_OUTSIDE_ACTION_DEVICE_ID} slot ${AUTOMATION_RULE_OUTPUT_SLOT} should not become true outside the active time range`,
    ).toBe(false)
  })

  runUiEvidence('RULE-UI-DISABLED edits rule to disabled and verifies output is not activated', async ({
    request,
  }) => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'AUTOMATION_ALLOW_DEVICE_CONTROL=true is required to trigger real input devices',
    )

    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)
    const disabledRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_disabled_edit`,
      type: 'And',
      inputs: [{ id: DISABLED_RULE_TRIGGER_DEVICE_ID, status: true }],
      outputs: [{ id: DISABLED_RULE_ACTION_DEVICE_ID, status: true }],
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: disabledRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: DISABLED_RULE_TRIGGER_DEVICE_ID },
        { id: DISABLED_RULE_ACTION_DEVICE_ID },
      ],
      identity: disabledRule.identity,
    })

    const updateResponse = await client.updateAutomationAPI(
      disabledRule.automation_id,
      {
        name: disabledRule.automation_name,
        description: 'Edited to disabled by automation rule evidence test',
        enable: false,
      },
    )
    const updateJson = await updateResponse.json()

    await expect(updateResponse.status()).toBe(200)
    await expect(updateJson.success).toBe(true)
    await expect(updateJson.data.enable).toBe(false)

    const detailResponse = await client.getAutomationDetailAPI(
      disabledRule.automation_id,
      ['input_connection', 'output_connection'],
    )
    const detailJson = await detailResponse.json()

    await expect(detailResponse.status()).toBe(200)
    await expect(detailJson.success).toBe(true)
    await expect(detailJson.data.automation.enable).toBe(false)

    const runtimeEvidence = await triggerRuleAndCollectEvidence({
      inputDeviceId: DISABLED_RULE_TRIGGER_DEVICE_ID,
      outputDeviceId: DISABLED_RULE_ACTION_DEVICE_ID,
      expectedOutputValue: true,
    })

    console.log(
      JSON.stringify({
        retained_disabled_rule_check: {
          rule: {
            ...disabledRule,
            enable_after_edit: detailJson.data.automation.enable,
          },
          expectation: 'rule is disabled, output should remain false',
          trigger: {
            device_id: DISABLED_RULE_TRIGGER_DEVICE_ID,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            value: true,
          },
          output: {
            device_id: DISABLED_RULE_ACTION_DEVICE_ID,
            slot: AUTOMATION_RULE_OUTPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            expected_value: false,
          },
          ...runtimeEvidence,
        },
      }),
    )

    await expect(
      runtimeEvidence.outputMatched,
      `Output device ${DISABLED_RULE_ACTION_DEVICE_ID} slot ${AUTOMATION_RULE_OUTPUT_SLOT} should not become true after disabling the rule`,
    ).toBe(false)
  })

  runUiEvidence('RULE-UI-RUNTIME activates input and verifies rule output state', async ({
    request,
  }) => {
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'AUTOMATION_ALLOW_DEVICE_CONTROL=true is required to trigger real input devices',
    )

    const client = new AutomationCenterApiClient(request)
    const nextIndex = await getNextThuyRuleIndex(client)
    const runtimeRule = await createRuleAndEvidence({
      client,
      name: `thuy_rule_${nextIndex}_runtime_trigger`,
      type: 'And',
      inputs: [{ id: AUTOMATION_TRIGGER_DEVICE_ID, status: true }],
      outputs: [{ id: AUTOMATION_ACTION_DEVICE_ID, status: true }],
    })

    await expectAutomationInList({
      apiRequest: request,
      identity: runtimeRule.identity,
    })
    await expectRuleMappedToDevices({
      devices: [
        { id: AUTOMATION_TRIGGER_DEVICE_ID },
        { id: AUTOMATION_ACTION_DEVICE_ID },
      ],
      identity: runtimeRule.identity,
    })

    await controlGatewayDevice({
      deviceId: AUTOMATION_TRIGGER_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: false,
    })
    await controlGatewayDevice({
      deviceId: AUTOMATION_ACTION_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: false,
    })
    await waitForGatewayDeviceState({
      deviceId: AUTOMATION_TRIGGER_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: false,
    })
    await waitForGatewayDeviceState({
      deviceId: AUTOMATION_ACTION_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: false,
    })

    const beforeStatuses = await getGatewayDeviceStatus([
      AUTOMATION_TRIGGER_DEVICE_ID,
      AUTOMATION_ACTION_DEVICE_ID,
    ])

    await controlGatewayDevice({
      deviceId: AUTOMATION_TRIGGER_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: true,
    })
    await waitForGatewayDeviceState({
      deviceId: AUTOMATION_TRIGGER_DEVICE_ID,
      slot: GATEWAY_DEVICE_SLOT,
      value: true,
    })
    let afterStatuses = await getGatewayDeviceStatus([
      AUTOMATION_TRIGGER_DEVICE_ID,
      AUTOMATION_ACTION_DEVICE_ID,
    ])
    let outputMatched = afterStatuses.some(
      (device) =>
        String(device.id) === AUTOMATION_ACTION_DEVICE_ID &&
        device.status.some(
          (state) =>
            Number(state.idx) === GATEWAY_DEVICE_SLOT &&
            state.value === true,
        ),
    )

    for (let attempt = 0; attempt < 10 && !outputMatched; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      afterStatuses = await getGatewayDeviceStatus([
        AUTOMATION_TRIGGER_DEVICE_ID,
        AUTOMATION_ACTION_DEVICE_ID,
      ])
      outputMatched = afterStatuses.some(
        (device) =>
          String(device.id) === AUTOMATION_ACTION_DEVICE_ID &&
          device.status.some(
            (state) =>
              Number(state.idx) === GATEWAY_DEVICE_SLOT &&
              state.value === true,
          ),
      )
    }

    console.log(
      JSON.stringify({
        retained_rule_runtime_trigger_check: {
          rule: runtimeRule,
          trigger: {
            device_id: AUTOMATION_TRIGGER_DEVICE_ID,
            slot: AUTOMATION_RULE_INPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            from: false,
            to: true,
          },
          expected_output: {
            device_id: AUTOMATION_ACTION_DEVICE_ID,
            slot: AUTOMATION_RULE_OUTPUT_SLOT,
            gateway_slot: GATEWAY_DEVICE_SLOT,
            value: true,
          },
          before_statuses: beforeStatuses,
          after_statuses: afterStatuses,
          output_matched: outputMatched,
        },
      }),
    )

    await expect(
      outputMatched,
      `Output device ${AUTOMATION_ACTION_DEVICE_ID} slot ${AUTOMATION_RULE_OUTPUT_SLOT} should become true after input trigger`,
    ).toBe(true)
  })
})
