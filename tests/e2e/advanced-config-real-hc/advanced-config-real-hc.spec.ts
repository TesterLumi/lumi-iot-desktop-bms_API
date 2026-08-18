import { expect, test } from '@playwright/test'
import {
  AdvancedConfigApiClient,
  AdvancedConfigEvidence,
  AdvancedConfigEnv,
  createAdvancedConfigApi,
  getAdvancedConfigEnv,
  requireEnvValue,
  resetAdvancedConfigEvidenceRunDir,
  targetInOutConfig,
  targetOutConfig,
  withRestoredConfig,
} from './advanced-config-real-hc.support'

type ConfigCase = {
  tcId: string
  tcName: string
  device: 'msb' | 'msbScene' | 'presence'
  keys: string[]
  config: (env: AdvancedConfigEnv) => Record<string, unknown>
  expectedConfig?: (env: AdvancedConfigEnv) => Record<string, unknown>
}

const msbConfigCases: ConfigCase[] = [
  {
    tcId: 'TC-AC-002',
    tcName: 'MSB autolock_schedule khoa ngay',
    device: 'msb',
    keys: ['autolock_schedule'],
    config: () => ({
      autolock_schedule: {
        lock_state: 1,
        enable: 0,
        start_time: 0,
        stop_time: 0,
        repeat_time: 127,
      },
    }),
    expectedConfig: () => ({
      autolock_schedule: {
        lock_state: 1,
      },
    }),
  },
  {
    tcId: 'TC-AC-003',
    tcName: 'MSB autolock_schedule theo lich gio ngay lam viec',
    device: 'msb',
    keys: ['autolock_schedule'],
    config: () => ({
      autolock_schedule: {
        lock_state: 1,
        enable: 1,
        start_time: 480,
        stop_time: 1020,
        repeat_time: 124,
      },
    }),
    expectedConfig: () => ({
      autolock_schedule: {
        lock_state: 1,
        start_time: 480,
        stop_time: 1020,
        repeat_time: 124,
      },
    }),
  },
  {
    tcId: 'TC-AC-004',
    tcName: 'MSB scene event press_1_time gan target',
    device: 'msbScene',
    keys: ['event[press_1_time]'],
    config: (env) => ({
      'event[press_1_time]': targetOutConfig(env, 1),
    }),
  },
  {
    tcId: 'TC-AC-005',
    tcName: 'MSB scene event press_1_time update target',
    device: 'msbScene',
    keys: ['event[press_1_time]'],
    config: (env) => ({
      'event[press_1_time]': targetOutConfig(env, 0),
    }),
  },
  {
    tcId: 'TC-AC-008',
    tcName: 'MSB relay group_all true',
    device: 'msb',
    keys: ['group_all'],
    config: () => ({ group_all: true }),
  },
  {
    tcId: 'TC-AC-031',
    tcName: 'MSB scene event press_2_times gan target',
    device: 'msbScene',
    keys: ['event[press_2_times]'],
    config: (env) => ({
      'event[press_2_times]': targetOutConfig(env, 1),
    }),
  },
  {
    tcId: 'TC-AC-032',
    tcName: 'MSB scene event hold_2_seconds gan target',
    device: 'msbScene',
    keys: ['event[hold_2_seconds]'],
    config: (env) => ({
      'event[hold_2_seconds]': targetOutConfig(env, 0),
    }),
  },
  {
    tcId: 'TC-AC-033',
    tcName: 'MSB scene autolock_schedule khoa ngay',
    device: 'msbScene',
    keys: ['autolock_schedule'],
    config: () => ({
      autolock_schedule: {
        lock_state: 1,
        enable: 0,
        start_time: 0,
        stop_time: 0,
        repeat_time: 127,
      },
    }),
    expectedConfig: () => ({
      autolock_schedule: {
        lock_state: 1,
      },
    }),
  },
  {
    tcId: 'TC-AC-034',
    tcName: 'MSB relay group_all false',
    device: 'msb',
    keys: ['group_all'],
    config: () => ({ group_all: false }),
  },
  {
    tcId: 'TC-AC-009',
    tcName: 'MSB relay state_default keep state',
    device: 'msb',
    keys: ['state_default'],
    config: () => ({ state_default: 2 }),
  },
  {
    tcId: 'TC-AC-035',
    tcName: 'MSB relay state_default always off',
    device: 'msb',
    keys: ['state_default'],
    config: () => ({ state_default: 0 }),
  },
  {
    tcId: 'TC-AC-036',
    tcName: 'MSB relay state_default always on',
    device: 'msb',
    keys: ['state_default'],
    config: () => ({ state_default: 1 }),
  },
  {
    tcId: 'TC-AC-010',
    tcName: 'MSB relay touch_mode momentary',
    device: 'msb',
    keys: ['touch_mode'],
    config: () => ({
      touch_mode: { mode: 1, output_mode: 0, delay: 0 },
    }),
  },
  {
    tcId: 'TC-AC-011',
    tcName: 'MSB relay touch_mode auto off delay',
    device: 'msb',
    keys: ['touch_mode'],
    config: () => ({
      touch_mode: { mode: 0, output_mode: 4, delay: 60 },
    }),
  },
  {
    tcId: 'TC-AC-037',
    tcName: 'MSB relay touch_mode auto on delay',
    device: 'msb',
    keys: ['touch_mode'],
    config: () => ({
      touch_mode: { mode: 0, output_mode: 3, delay: 30 },
    }),
  },
  {
    tcId: 'TC-AC-038',
    tcName: 'MSB relay touch_mode lighting',
    device: 'msb',
    keys: ['touch_mode'],
    config: () => ({
      touch_mode: { mode: 2, output_mode: 0, delay: 0 },
    }),
  },
  {
    tcId: 'TC-AC-012',
    tcName: 'MSB relay event on off gan target',
    device: 'msb',
    keys: ['event[on]', 'event[off]'],
    config: (env) => ({
      'event[on]': targetOutConfig(env, 1),
      'event[off]': targetOutConfig(env, 0),
    }),
  },
]

const presenceConfigCases: ConfigCase[] = [
  {
    tcId: 'TC-AC-017',
    tcName: 'Presence presence_mode PIR radar',
    device: 'presence',
    keys: ['presence_mode'],
    config: () => ({ presence_mode: 0 }),
  },
  {
    tcId: 'TC-AC-018',
    tcName: 'Presence pir_time boundary max',
    device: 'presence',
    keys: ['pir_time'],
    config: () => ({ pir_time: 1800 }),
  },
  {
    tcId: 'TC-AC-043',
    tcName: 'Presence pir_time boundary min',
    device: 'presence',
    keys: ['pir_time'],
    config: () => ({ pir_time: 0 }),
  },
  {
    tcId: 'TC-AC-019',
    tcName: 'Presence distance boundary max',
    device: 'presence',
    keys: ['distance'],
    config: () => ({ distance: 600 }),
  },
  {
    tcId: 'TC-AC-044',
    tcName: 'Presence distance boundary min',
    device: 'presence',
    keys: ['distance'],
    config: () => ({ distance: 75 }),
  },
  {
    tcId: 'TC-AC-020',
    tcName: 'Presence environment_volatile boundary max',
    device: 'presence',
    keys: ['environment_volatile'],
    config: () => ({ environment_volatile: 14400 }),
  },
  {
    tcId: 'TC-AC-045',
    tcName: 'Presence environment_volatile boundary min',
    device: 'presence',
    keys: ['environment_volatile'],
    config: () => ({ environment_volatile: 180 }),
  },
  {
    tcId: 'TC-AC-021',
    tcName: 'Presence link_state true lux_threshold ban dem',
    device: 'presence',
    keys: ['link_state', 'lux_threshold'],
    config: () => ({ link_state: true, lux_threshold: 10 }),
  },
  {
    tcId: 'TC-AC-046',
    tcName: 'Presence link_state true lux_threshold ban ngay',
    device: 'presence',
    keys: ['link_state', 'lux_threshold'],
    config: () => ({ link_state: true, lux_threshold: 65535 }),
  },
  {
    tcId: 'TC-AC-047',
    tcName: 'Presence link_state true lux_threshold tuy chinh',
    device: 'presence',
    keys: ['link_state', 'lux_threshold'],
    config: () => ({ link_state: true, lux_threshold: 2000 }),
  },
  {
    tcId: 'TC-AC-022',
    tcName: 'Presence link_state false lux_threshold ignored behavior',
    device: 'presence',
    keys: ['link_state', 'lux_threshold'],
    config: () => ({ link_state: false, lux_threshold: 65535 }),
  },
  {
    tcId: 'TC-AC-048',
    tcName: 'Presence link_state false',
    device: 'presence',
    keys: ['link_state'],
    config: () => ({ link_state: false }),
  },
  {
    tcId: 'TC-AC-049',
    tcName: 'Presence schedule inactive',
    device: 'presence',
    keys: ['schedule'],
    config: () => ({
      schedule: {
        active: false,
        start: 0,
        end: 1439,
        repeat: 127,
      },
    }),
  },
  {
    tcId: 'TC-AC-023',
    tcName: 'Presence schedule active moi ngay',
    device: 'presence',
    keys: ['schedule'],
    config: () => ({
      schedule: {
        active: true,
        start: 510,
        end: 1065,
        repeat: 127,
      },
    }),
  },
  {
    tcId: 'TC-AC-050',
    tcName: 'Presence schedule active ngay lam viec',
    device: 'presence',
    keys: ['schedule'],
    config: () => ({
      schedule: {
        active: true,
        start: 480,
        end: 1020,
        repeat: 124,
      },
    }),
  },
  {
    tcId: 'TC-AC-051',
    tcName: 'Presence sensitivity boundary min',
    device: 'presence',
    keys: ['sensitivity'],
    config: () => ({ sensitivity: 5 }),
  },
  {
    tcId: 'TC-AC-052',
    tcName: 'Presence sensitivity boundary max',
    device: 'presence',
    keys: ['sensitivity'],
    config: () => ({ sensitivity: 45 }),
  },
  {
    tcId: 'TC-AC-053',
    tcName: 'Presence radar_bluetooth_state true',
    device: 'presence',
    keys: ['radar_bluetooth_state'],
    config: () => ({ radar_bluetooth_state: true }),
  },
  {
    tcId: 'TC-AC-054',
    tcName: 'Presence time boundary min',
    device: 'presence',
    keys: ['time'],
    config: () => ({ time: 10 }),
  },
  {
    tcId: 'TC-AC-055',
    tcName: 'Presence time boundary max',
    device: 'presence',
    keys: ['time'],
    config: () => ({ time: 3600 }),
  },
  {
    tcId: 'TC-AC-024',
    tcName: 'Presence event active co in out',
    device: 'presence',
    keys: ['event[active]'],
    config: (env) => ({
      'event[active]': targetInOutConfig(env, 1),
    }),
  },
  {
    tcId: 'TC-AC-025',
    tcName: 'Presence event inactive co in out',
    device: 'presence',
    keys: ['event[inactive]'],
    config: (env) => ({
      'event[inactive]': targetInOutConfig(env, 0),
    }),
  },
]

const presencePresetCases = [
  {
    tcId: 'TC-AC-059',
    tcName: 'Presence environment preset bathroom gui tuan tu roi auto_calib',
    distance: 300,
    environmentVolatile: 3600,
    pirTime: 20,
  },
  {
    tcId: 'TC-AC-060',
    tcName: 'Presence environment preset wc gui tuan tu roi auto_calib',
    distance: 300,
    environmentVolatile: 3600,
    pirTime: 30,
  },
  {
    tcId: 'TC-AC-061',
    tcName: 'Presence environment preset bedroom gui tuan tu roi auto_calib',
    distance: 375,
    environmentVolatile: 14400,
    pirTime: 300,
  },
  {
    tcId: 'TC-AC-062',
    tcName: 'Presence environment preset kitchen gui tuan tu roi auto_calib',
    distance: 300,
    environmentVolatile: 7200,
    pirTime: 30,
  },
  {
    tcId: 'TC-AC-063',
    tcName: 'Presence environment preset lobby gui tuan tu roi auto_calib',
    distance: 300,
    environmentVolatile: 300,
    pirTime: 10,
  },
  {
    tcId: 'TC-AC-064',
    tcName: 'Presence environment preset other gui tuan tu roi auto_calib',
    distance: 375,
    environmentVolatile: 3600,
    pirTime: 30,
  },
]

test.describe('Advanced config real HC', () => {
  const env = getAdvancedConfigEnv()
  let baseApi: AdvancedConfigApiClient

  test.beforeAll(async () => {
    await resetAdvancedConfigEvidenceRunDir(env)
    baseApi = await createAdvancedConfigApi(env)
  })

  test.afterAll(async () => {
    await baseApi?.dispose()
  })

  const runTc = (
    tcId: string,
    tcName: string,
    handler: (
      api: AdvancedConfigApiClient,
      evidence: AdvancedConfigEvidence,
    ) => Promise<void>,
    options: { requireWrite?: boolean; timeoutMs?: number } = {},
  ) => {
    test(`${tcId} - ${tcName}`, async ({}, testInfo) => {
      test.setTimeout(options.timeoutMs ?? 120000)
      const evidence = new AdvancedConfigEvidence(testInfo, tcId, tcName, env)
      const api = baseApi.withEvidence(evidence)
      try {
        test.skip(
          options.requireWrite === true && !env.allowDeviceControl,
          'Set ADVANCED_CONFIG_ALLOW_DEVICE_CONTROL=true to change real device config',
        )
        await handler(api, evidence)
        await evidence.save('PASSED')
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Test is skipped')
        ) {
          await evidence.save('SKIPPED', error)
          throw error
        }
        await evidence.save('FAILED', error)
        throw error
      }
    })
  }

  runTc('TC-AC-001', 'GET MSB device config online', async (api, evidence) => {
    requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
    await api.listDevices('List devices before MSB config tests')
    const config = await api.readDeviceConfig(env.msbDeviceId)
    expect(config).toBeTruthy()
    evidence.attachAssertion('MSB device config is readable from real system')
  })

  for (const configCase of msbConfigCases) {
    runTc(
      configCase.tcId,
      configCase.tcName,
      async (api, evidence) => {
        const deviceId =
          configCase.device === 'msbScene'
            ? env.msbSceneDeviceId
            : env.msbDeviceId
        requireEnvValue(
          deviceId,
          configCase.device === 'msbScene'
            ? 'ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID'
            : 'ADVANCED_CONFIG_MSB_DEVICE_ID',
        )
        const config = configCase.config(env)
        await withRestoredConfig(
          api,
          evidence,
          deviceId,
          configCase.keys,
          async () => {
            await api.setConfigAndWait(
              deviceId,
              config,
              configCase.expectedConfig?.(env) ?? config,
            )
          },
        )
      },
      { requireWrite: true, timeoutMs: 90000 },
    )
  }

  runTc(
    'TC-AC-006',
    'MSB scene event press_1_time delete bang null',
    async (api, evidence) => {
      requireEnvValue(
        env.msbSceneDeviceId,
        'ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID',
      )
      const key = 'event[press_1_time]'
      await withRestoredConfig(
        api,
        evidence,
        env.msbSceneDeviceId,
        [key],
        async () => {
          await api.setConfigAndWait(env.msbSceneDeviceId, {
            [key]: targetOutConfig(env, 1),
          })
          await api.setConfigAndWait(env.msbSceneDeviceId, { [key]: null })
        },
      )
    },
    { requireWrite: true, timeoutMs: 120000 },
  )

  runTc(
    'TC-AC-007',
    'MSB scene event qua 5 target bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.msbSceneDeviceId,
        'ADVANCED_CONFIG_MSB_SCENE_DEVICE_ID',
      )
      requireEnvValue(env.targetDeviceId, 'ADVANCED_CONFIG_TARGET_DEVICE_ID')
      const key = 'event[press_1_time]'
      const targetText = String(env.targetDeviceId)
      const numericTarget = /^\d+$/.test(targetText) ? BigInt(targetText) : null
      const tooManyTargets = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          numericTarget === null
            ? `${targetText}_${index}`
            : String(numericTarget + BigInt(index)),
          { 'input[1]': index % 2 },
        ]),
      )
      await withRestoredConfig(
        api,
        evidence,
        env.msbSceneDeviceId,
        [key],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.msbSceneDeviceId,
            {
              [key]: { out: tooManyTargets },
            },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-013',
    'MSB command clear_time accepted',
    async (api) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      await api.command(env.msbDeviceId, 'clear_time', {})
    },
    { requireWrite: true, timeoutMs: 60000 },
  )

  runTc(
    'TC-AC-014',
    'MSB command clear_power accepted',
    async (api) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      await api.command(env.msbDeviceId, 'clear_power', {})
    },
    { requireWrite: true, timeoutMs: 60000 },
  )

  runTc(
    'TC-AC-015',
    'MSB clear_power gui sai qua config bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      await withRestoredConfig(
        api,
        evidence,
        env.msbDeviceId,
        ['clear_power'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(env.msbDeviceId, {
            clear_power: {},
          })
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-039',
    'MSB relay event on delete bang null',
    async (api, evidence) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      const key = 'event[on]'
      await withRestoredConfig(
        api,
        evidence,
        env.msbDeviceId,
        [key],
        async () => {
          await api.setConfigAndWait(env.msbDeviceId, {
            [key]: targetOutConfig(env, 1),
          })
          await api.setConfigAndWait(env.msbDeviceId, { [key]: null })
        },
      )
    },
    { requireWrite: true, timeoutMs: 120000 },
  )

  runTc(
    'TC-AC-040',
    'MSB relay event off delete bang null',
    async (api, evidence) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      const key = 'event[off]'
      await withRestoredConfig(
        api,
        evidence,
        env.msbDeviceId,
        [key],
        async () => {
          await api.setConfigAndWait(env.msbDeviceId, {
            [key]: targetOutConfig(env, 0),
          })
          await api.setConfigAndWait(env.msbDeviceId, { [key]: null })
        },
      )
    },
    { requireWrite: true, timeoutMs: 120000 },
  )

  runTc(
    'TC-AC-041',
    'MSB relay state_default ngoai enum bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      await withRestoredConfig(
        api,
        evidence,
        env.msbDeviceId,
        ['state_default'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(env.msbDeviceId, {
            state_default: 3,
          })
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-042',
    'MSB relay touch_mode delay ngoai range bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(env.msbDeviceId, 'ADVANCED_CONFIG_MSB_DEVICE_ID')
      await withRestoredConfig(
        api,
        evidence,
        env.msbDeviceId,
        ['touch_mode'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(env.msbDeviceId, {
            touch_mode: { mode: 0, output_mode: 4, delay: 10801 },
          })
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-016',
    'GET Presence device config online',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      const config = await api.readDeviceConfig(env.presenceDeviceId)
      expect(config).toBeTruthy()
      evidence.attachAssertion(
        'Presence device config is readable from real system',
      )
    },
  )

  for (const configCase of presenceConfigCases) {
    runTc(
      configCase.tcId,
      configCase.tcName,
      async (api, evidence) => {
        requireEnvValue(
          env.presenceDeviceId,
          'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
        )
        const config = configCase.config(env)
        await withRestoredConfig(
          api,
          evidence,
          env.presenceDeviceId,
          configCase.keys,
          async () => {
            await api.setConfigAndWait(
              env.presenceDeviceId,
              config,
              configCase.expectedConfig?.(env) ?? config,
            )
          },
        )
      },
      { requireWrite: true, timeoutMs: 90000 },
    )
  }

  runTc(
    'TC-AC-026',
    'Presence event active delete bang null',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      const key = 'event[active]'
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        [key],
        async () => {
          await api.setConfigAndWait(env.presenceDeviceId, {
            [key]: targetInOutConfig(env, 1),
          })
          await api.setConfigAndWait(env.presenceDeviceId, { [key]: null })
        },
      )
    },
    { requireWrite: true, timeoutMs: 120000 },
  )

  runTc(
    'TC-AC-027',
    'Presence command auto_calib accepted',
    async (api) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await api.command(env.presenceDeviceId, 'auto_calib', {
        act: 'start',
        duration: 180,
      })
    },
    { requireWrite: true, timeoutMs: 60000 },
  )

  runTc(
    'TC-AC-028',
    'Presence auto_calib gui sai qua config bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['auto_calib'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.presenceDeviceId,
            {
              auto_calib: { act: 'start', duration: 180 },
            },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-029',
    'Presence environment preset office gui tuan tu roi auto_calib',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['distance', 'environment_volatile', 'pir_time'],
        async () => {
          await api.setConfigAndWait(env.presenceDeviceId, { distance: 375 })
          await api.setConfigAndWait(env.presenceDeviceId, {
            environment_volatile: 10800,
          })
          await api.setConfigAndWait(env.presenceDeviceId, { pir_time: 120 })
          await api.command(env.presenceDeviceId, 'auto_calib', {
            act: 'start',
            duration: 180,
          })
          evidence.attachAssertion(
            'Preset sequence followed distance -> environment_volatile -> pir_time -> auto_calib',
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 180000 },
  )

  runTc(
    'TC-AC-030',
    'Presence distance ngoai range bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['distance'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.presenceDeviceId,
            { distance: 700 },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-056',
    'Presence presence_mode ngoai enum bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['presence_mode'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.presenceDeviceId,
            { presence_mode: 3 },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-057',
    'Presence pir_time ngoai range bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['pir_time'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.presenceDeviceId,
            { pir_time: 1801 },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  runTc(
    'TC-AC-058',
    'Presence lux_threshold ngoai range bi reject hoac khong persist',
    async (api, evidence) => {
      requireEnvValue(
        env.presenceDeviceId,
        'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
      )
      await withRestoredConfig(
        api,
        evidence,
        env.presenceDeviceId,
        ['lux_threshold'],
        async () => {
          await api.expectConfigMisuseRejectedOrNotPersisted(
            env.presenceDeviceId,
            { lux_threshold: 65536 },
          )
        },
      )
    },
    { requireWrite: true, timeoutMs: 90000 },
  )

  for (const preset of presencePresetCases) {
    runTc(
      preset.tcId,
      preset.tcName,
      async (api, evidence) => {
        requireEnvValue(
          env.presenceDeviceId,
          'ADVANCED_CONFIG_PRESENCE_DEVICE_ID',
        )
        await withRestoredConfig(
          api,
          evidence,
          env.presenceDeviceId,
          ['distance', 'environment_volatile', 'pir_time'],
          async () => {
            await api.setConfigAndWait(env.presenceDeviceId, {
              distance: preset.distance,
            })
            await api.setConfigAndWait(env.presenceDeviceId, {
              environment_volatile: preset.environmentVolatile,
            })
            await api.setConfigAndWait(env.presenceDeviceId, {
              pir_time: preset.pirTime,
            })
            await api.command(env.presenceDeviceId, 'auto_calib', {
              act: 'start',
              duration: 180,
            })
            evidence.attachAssertion(
              'Preset sequence followed distance -> environment_volatile -> pir_time -> auto_calib',
            )
          },
        )
      },
      { requireWrite: true, timeoutMs: 180000 },
    )
  }
})
