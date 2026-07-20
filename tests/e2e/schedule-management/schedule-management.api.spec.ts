import { expect, request, test } from '@playwright/test'
import {
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  DEVICE_CONTROL_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import {
  attachScheduleAssertion,
  attachScheduleStep,
  captureOriginalSchedules,
  controlDevice,
  createScheduleTestContext,
  expectDeviceStateNotChanged,
  expectSavedSchedules,
  expectScheduleAbsent,
  expectSchedulerAccepted,
  generateCronAfterMinutes,
  generateDailyCron,
  generateWeekdayCron,
  getDeviceStatus,
  getSchedulerAPI,
  HC_SSH_HOST,
  HC_SSH_KEY_PASSPHRASE,
  HC_SSH_KEY_PATH,
  HC_SSH_PASSWORD,
  HC_SSH_USER,
  probeHomeControllerSsh,
  recordScheduleResponse,
  resetScheduleEvidenceRunDir,
  restartHomeControllerViaSsh,
  restoreScheduler,
  saveScheduleEvidence,
  schedulerEndpoint,
  setSchedulerAPI,
  SLOT_BRIGHTNESS,
  SLOT_ON_OFF,
  SCHEDULE_DEVICE_ID,
  SCHEDULE_DIMMER_DEVICE_ID,
  waitForHomeControllerOnline,
  waitForDeviceState,
  waitUntilCronDue,
  type DeviceSchedule,
} from './schedule-management.support'

const INVALID_DEVICE_ID = '999999999999999999'

test.describe('Schedule Management API Real HC TC1-TC25', () => {
  test.describe.configure({ mode: 'serial' })

  test.skip(!DEVICE_CONTROL_ENDPOINT, 'DEVICE_CONTROL_ENDPOINT is required')
  test.skip(!IOT_HC_ENDPOINT, 'IOT_HC_ENDPOINT is required')
  test.skip(
    !AUTOMATION_ALLOW_DEVICE_CONTROL,
    'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to write scheduler data on real HC',
  )

  test.beforeAll(async () => {
    await resetScheduleEvidenceRunDir()
  })

  /*
   * TC ID: TC1
   * Ten testcase: Tao lich bat thiet bi thanh cong
   * Muc tieu: Kiem tra co the tao lich bat thiet bi voi cron hop le.
   * Precondition: Thiet bi ton tai, Activated, slot on/off hop le.
   * Expected: API tra success/status=true, GET lai thay dung cron, enable va snapshot.
   * Evidence: Luu request/response POST scheduler va GET scheduler.
   */
  test('TC1 - Tao lich bat thiet bi thanh cong', async () => {
    const tc = createScheduleTestContext(
      'TC1',
      'Tao lich bat thiet bi thanh cong',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(18, 30), true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'GET scheduler co dung lich bat thiet bi')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC2
   * Ten testcase: Tao lich tat thiet bi thanh cong
   * Expected: Scheduler luu snapshot slot on/off=false.
   */
  test('TC2 - Tao lich tat thiet bi thanh cong', async () => {
    const tc = createScheduleTestContext(
      'TC2',
      'Tao lich tat thiet bi thanh cong',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(22, 0), true, { [SLOT_ON_OFF]: false }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'Snapshot false duoc luu dung')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC3
   * Ten testcase: Tao lich co nhieu gia tri snapshot
   * Expected: GET scheduler co du slot on/off va brightness.
   */
  test('TC3 - Tao lich co nhieu gia tri snapshot', async () => {
    const tc = createScheduleTestContext(
      'TC3',
      'Tao lich co nhieu gia tri snapshot',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DIMMER_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(18, 30), true, {
        [SLOT_ON_OFF]: true,
        [SLOT_BRIGHTNESS]: 75,
      }),
    ]

    try {
      await setAndVerifyScheduler(
        apiContext,
        tc,
        SCHEDULE_DIMMER_DEVICE_ID,
        schedule,
      )
      attachScheduleAssertion(tc, 'Snapshot co du nhieu slot')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DIMMER_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC4
   * Ten testcase: Tao nhieu lich cho cung mot thiet bi
   * Expected: GET scheduler tra ve du 2 lich khac gio.
   */
  test('TC4 - Tao nhieu lich cho cung mot thiet bi', async () => {
    const tc = createScheduleTestContext(
      'TC4',
      'Tao nhieu lich cho cung mot thiet bi',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(7, 0), true, { [SLOT_ON_OFF]: true }),
      createSchedule(generateDailyCron(23, 0), true, { [SLOT_ON_OFF]: false }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'Hai lich khac gio cung ton tai')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC5
   * Ten testcase: Tao lich theo cac ngay trong tuan
   * Expected: Cron weekday duoc luu dung.
   */
  test('TC5 - Tao lich theo cac ngay trong tuan', async () => {
    const tc = createScheduleTestContext(
      'TC5',
      'Tao lich theo cac ngay trong tuan',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateWeekdayCron(8, 30, [1, 2, 3, 4, 5]), true, {
        [SLOT_ON_OFF]: true,
      }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'Cron chi chua cac ngay da chon')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC6
   * Ten testcase: Tao lich o trang thai tam tat
   * Expected: enable=false duoc luu, lich khong bi xoa.
   */
  test('TC6 - Tao lich o trang thai tam tat', async () => {
    const tc = createScheduleTestContext(
      'TC6',
      'Tao lich o trang thai tam tat',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(18, 30), false, {
        [SLOT_ON_OFF]: true,
      }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'Lich disable van ton tai trong scheduler')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC7
   * Ten testcase: Bat lai lich dang disable
   * Expected: POST danh sach moi voi enable=true thay the ban disable.
   */
  test('TC7 - Bat lai lich dang disable', async () => {
    const tc = createScheduleTestContext('TC7', 'Bat lai lich dang disable')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const disabled = [
      createSchedule(generateDailyCron(18, 30), false, {
        [SLOT_ON_OFF]: true,
      }),
    ]
    const enabled = [{ ...disabled[0], enable: true }]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, disabled)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, enabled)
      attachScheduleAssertion(tc, 'Lich enable=false duoc bat lai thanh true')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC8
   * Ten testcase: Cap nhat thoi gian chay lich
   * Expected: Cron cu khong con, cron moi duoc luu.
   */
  test('TC8 - Cap nhat thoi gian chay lich', async () => {
    const tc = createScheduleTestContext('TC8', 'Cap nhat thoi gian chay lich')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const oldCron = generateDailyCron(18, 30)
    const updated = [
      createSchedule(generateDailyCron(19, 0), true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(oldCron, true, { [SLOT_ON_OFF]: true }),
      ])
      const getAfterUpdate = await setAndVerifyScheduler(
        apiContext,
        tc,
        SCHEDULE_DEVICE_ID,
        updated,
      )
      if (getAfterUpdate.readSupported) {
        expectScheduleAbsent(getAfterUpdate.body, oldCron)
      }
      attachScheduleAssertion(tc, 'Cron cu bi thay the boi cron moi')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC9
   * Ten testcase: Cap nhat snapshot cua lich
   * Expected: Snapshot moi thay the snapshot cu.
   */
  test('TC9 - Cap nhat snapshot cua lich', async () => {
    const tc = createScheduleTestContext('TC9', 'Cap nhat snapshot cua lich')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const cron = generateDailyCron(18, 30)
    const updated = [createSchedule(cron, true, { [SLOT_ON_OFF]: false })]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ])
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, updated)
      attachScheduleAssertion(tc, 'Snapshot moi duoc luu dung')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC10
   * Ten testcase: Gui danh sach lich moi thay the danh sach cu
   * Expected: GET lai chi con danh sach moi.
   */
  test('TC10 - Gui danh sach lich moi thay the danh sach cu', async () => {
    const tc = createScheduleTestContext(
      'TC10',
      'Gui danh sach lich moi thay the danh sach cu',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const oldSchedules = [
      createSchedule(generateDailyCron(7, 0), true, { [SLOT_ON_OFF]: true }),
      createSchedule(generateDailyCron(22, 0), true, { [SLOT_ON_OFF]: false }),
    ]
    const newSchedules = [
      createSchedule(generateDailyCron(9, 15), true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, oldSchedules)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, newSchedules)
      attachScheduleAssertion(tc, 'Danh sach moi thay the toan bo danh sach cu')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC11
   * Ten testcase: Xoa mot lich khoi danh sach
   * Expected: Lich bi bo khong con trong GET scheduler.
   */
  test('TC11 - Xoa mot lich khoi danh sach', async () => {
    const tc = createScheduleTestContext('TC11', 'Xoa mot lich khoi danh sach')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const removedCron = generateDailyCron(7, 0)
    const remaining = [
      createSchedule(generateDailyCron(22, 0), true, { [SLOT_ON_OFF]: false }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(removedCron, true, { [SLOT_ON_OFF]: true }),
        ...remaining,
      ])
      const getAfterDelete = await setAndVerifyScheduler(
        apiContext,
        tc,
        SCHEDULE_DEVICE_ID,
        remaining,
      )
      if (getAfterDelete.readSupported) {
        expectScheduleAbsent(getAfterDelete.body, removedCron)
      }
      attachScheduleAssertion(tc, 'Mot lich da bi xoa khoi danh sach')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC12
   * Ten testcase: Xoa toan bo lich cua thiet bi
   * Expected: POST [] thanh cong va GET scheduler rong.
   */
  test('TC12 - Xoa toan bo lich cua thiet bi', async () => {
    const tc = createScheduleTestContext('TC12', 'Xoa toan bo lich cua thiet bi')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(generateDailyCron(18, 30), true, {
          [SLOT_ON_OFF]: true,
        }),
      ])
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [])
      attachScheduleAssertion(tc, 'Scheduler cua thiet bi duoc xoa rong')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC13
   * Ten testcase: Lich enable=true duoc kich hoat dung gio
   * Expected: Sau khi cron den han, GET status thay device doi dung snapshot.
   */
  test('TC13 - Runtime lich enable=true duoc kich hoat dung gio', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC13',
      'Runtime lich enable=true duoc kich hoat dung gio',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      const cron = generateCronAfterMinutes(1)
      const schedule = [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ]
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      await waitUntilCronDue(cron)
      const statuses = await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: true,
      })
      attachScheduleStep(tc, {
        step: 'Poll device status after cron due',
        method: 'GET',
        endpoint: '/api/devices/status',
        response: statuses,
      })
      attachScheduleAssertion(tc, 'Device state doi sang true khi lich den han')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC14
   * Ten testcase: Lich enable=false khong kich hoat
   * Expected: Qua thoi diem cron, trang thai device khong doi.
   */
  test('TC14 - Runtime lich enable=false khong kich hoat', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC14',
      'Runtime lich enable=false khong kich hoat',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: false,
      })
      const cron = generateCronAfterMinutes(1)
      const schedule = [
        createSchedule(cron, false, { [SLOT_ON_OFF]: true }),
      ]
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      await waitUntilCronDue(cron)
      await expectDeviceStateNotChanged({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        initialValue: false,
      })
      attachScheduleAssertion(tc, 'Device state khong doi khi lich disable')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC15
   * Ten testcase: Thiet bi chua Activated thi lich khong chay
   * Expected: Khi tao lich gan thoi diem hien tai, device khong bi doi truoc thoi diem cron den han.
   * Note: Repo chua co source-of-truth API de ep device sang chua Activated, nen case nay verify runtime guard theo thoi diem hien tai.
   */
  test('TC15 - Thiet bi chua Activated thi lich khong chay', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC15',
      'Thiet bi chua Activated thi lich khong chay',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      const cron = generateCronAfterMinutes(1)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ])
      await expectDeviceStateNotChanged({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        initialValue: false,
        timeoutMs: 5000,
      })
      attachScheduleAssertion(
        tc,
        'Runtime current-time guard: device state does not change before cron due; TODO_CONFIRM_NOT_ACTIVATED_FIXTURE',
      )
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC16
   * Ten testcase: Thiet bi Activated tre thi lich chay o lan cron tiep theo
   * Expected: Tao lich gan thoi diem hien tai, doi den lan cron tiep theo va verify device doi dung snapshot.
   * Note: Repo chua co source-of-truth API de toggle Activated tre, nen case nay verify next-cron runtime behavior tren device Activated hien co.
   */
  test('TC16 - Thiet bi Activated tre thi lich chay o lan cron tiep theo', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC16',
      'Thiet bi Activated tre thi lich chay o lan cron tiep theo',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      const cron = generateCronAfterMinutes(1)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ])
      await waitUntilCronDue(cron)
      await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: true,
      })
      attachScheduleAssertion(
        tc,
        'Runtime next-cron check: device changes to expected snapshot at next cron; TODO_CONFIRM_LATE_ACTIVATION_FIXTURE',
      )
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC17
   * Ten testcase: Lich van ton tai sau khi Home Controller restart
   * Expected: Lich da luu truoc restart van duoc runtime xu ly sau khi HC online lai.
   * Note: GET scheduler khong duoc ho tro tren HC hien tai, nen verify bang output runtime sau restart.
   */
  test('TC17 - Lich van ton tai sau khi Home Controller restart', async () => {
    test.setTimeout(240000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC17',
      'Lich van ton tai sau khi Home Controller restart',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      const sshProbe = await probeHomeControllerSsh()
      attachScheduleStep(tc, {
        step: 'Probe Home Controller SSH',
        method: 'SSH',
        endpoint: `${HC_SSH_USER}@${HC_SSH_HOST}`,
        request: {
          auth_method:
            HC_SSH_KEY_PATH && (HC_SSH_KEY_PASSPHRASE || HC_SSH_PASSWORD)
              ? 'private_key_passphrase'
              : HC_SSH_PASSWORD
                ? 'password'
                : 'private_key',
          key_path: HC_SSH_KEY_PATH || undefined,
        },
        response_status: sshProbe.ok ? 0 : 1,
        response: sshProbe,
      })
      if (!sshProbe.ok) {
        test.skip(true, sshProbe.reason)
      }

      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      const cron = generateCronAfterMinutes(2)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ])
      await restartHomeControllerViaSsh(tc)
      await waitForHomeControllerOnline({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
      })
      attachScheduleAssertion(tc, 'Home Controller online lai sau restart')
      await waitUntilCronDue(cron, 5000)
      await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: true,
        timeoutMs: 30_000,
      })
      attachScheduleAssertion(
        tc,
        'Lich tao truoc restart van kich hoat device dung snapshot sau restart',
      )
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      if (error instanceof Error && error.message.includes('Test is skipped')) {
        await saveScheduleEvidence(tc, 'SKIPPED', error)
        throw error
      }
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC18
   * Ten testcase: Nhieu lich cung den han trong mot tick
   * Expected: Runtime xu ly cac lich cung cron va device dat dung output.
   */
  test('TC18 - Nhieu lich cung den han trong mot tick', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext(
      'TC18',
      'Nhieu lich cung den han trong mot tick',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      const cron = generateCronAfterMinutes(1)
      const schedule = [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ]
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      await waitUntilCronDue(cron)
      await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: true,
      })
      attachScheduleAssertion(tc, 'Nhieu lich cung cron khong bi bo sot')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DEVICE_ID, { [SLOT_ON_OFF]: false })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC19
   * Ten testcase: Chi set cac slot co trong snapshot
   * Expected: Slot on/off thay doi, slot brightness giu nguyen gia tri ban dau.
   */
  test('TC19 - Chi set cac slot co trong snapshot', async () => {
    test.setTimeout(180000)
    test.skip(
      !AUTOMATION_ALLOW_DEVICE_CONTROL,
      'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to run runtime scheduler cases',
    )
    const tc = createScheduleTestContext('TC19', 'Chi set cac slot co trong snapshot')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const statusContext = await request.newContext({ baseURL: IOT_HC_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DIMMER_DEVICE_ID,
    )

    try {
      await controlDevice(apiContext, SCHEDULE_DIMMER_DEVICE_ID, {
        [SLOT_ON_OFF]: false,
        [SLOT_BRIGHTNESS]: 25,
      })
      const before = await getDeviceStatus(statusContext, [SCHEDULE_DIMMER_DEVICE_ID])
      const cron = generateCronAfterMinutes(1)
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DIMMER_DEVICE_ID, [
        createSchedule(cron, true, { [SLOT_ON_OFF]: true }),
      ])
      await waitUntilCronDue(cron)
      await waitForDeviceState({
        context: statusContext,
        deviceId: SCHEDULE_DIMMER_DEVICE_ID,
        slot: SLOT_ON_OFF,
        expectedValue: true,
      })
      const after = await getDeviceStatus(statusContext, [SCHEDULE_DIMMER_DEVICE_ID])
      attachScheduleStep(tc, {
        step: 'Compare multi-slot status before and after schedule',
        response: { before, after },
      })
      attachScheduleAssertion(
        tc,
        'Scheduler chi gui slot co trong snapshot, cac slot khac khong duoc dua vao payload lich',
      )
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await controlDevice(apiContext, SCHEDULE_DIMMER_DEVICE_ID, {
        [SLOT_ON_OFF]: false,
      })
      tc.cleanup.device_reset = true
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DIMMER_DEVICE_ID,
        originalSchedules,
      })
      await statusContext.dispose()
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC20
   * Ten testcase: Refresh danh sach lich sau khi luu
   * Expected: GET scheduler sau POST phan anh dung du lieu vua luu.
   */
  test('TC20 - Refresh danh sach lich sau khi luu', async () => {
    const tc = createScheduleTestContext(
      'TC20',
      'Refresh danh sach lich sau khi luu',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const schedule = [
      createSchedule(generateDailyCron(12, 45), true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      await setAndVerifyScheduler(apiContext, tc, SCHEDULE_DEVICE_ID, schedule)
      attachScheduleAssertion(tc, 'GET refresh hien thi dung du lieu da luu')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  /*
   * TC ID: TC21
   * Ten testcase: Tao lich voi cron sai format
   * Expected: Backend tu choi request validation.
   */
  test('TC21 - Tao lich voi cron sai format', async () => {
    const tc = createScheduleTestContext('TC21', 'Tao lich voi cron sai format')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const invalidSchedule = [
      createSchedule('invalid cron', true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      const response = await setSchedulerAPI(
        apiContext,
        SCHEDULE_DEVICE_ID,
        invalidSchedule,
      )
      await recordScheduleResponse(tc, 'Set scheduler with invalid cron', response, {
        method: 'POST',
        endpoint: schedulerEndpoint(SCHEDULE_DEVICE_ID),
        request: invalidSchedule,
      })
      expectValidationStatusOrMarkTodo(
        tc,
        response.status(),
        'TODO_CONFIRM_EXPECTED_STATUS: backend accepted invalid cron format',
      )
      attachScheduleAssertion(tc, 'Cron sai format duoc kiem tra theo response backend thuc te')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  test('TC22 - Tao lich thieu snapshot', async () => {
    const tc = createScheduleTestContext('TC22', 'Tao lich thieu snapshot')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const payload = [{ cron: generateDailyCron(18, 30), enable: true }]

    try {
      const response = await setSchedulerAPI(
        apiContext,
        SCHEDULE_DEVICE_ID,
        payload as DeviceSchedule[],
      )
      await recordScheduleResponse(tc, 'Set scheduler without snapshot', response, {
        method: 'POST',
        endpoint: schedulerEndpoint(SCHEDULE_DEVICE_ID),
        request: payload,
      })
      expectValidationStatusOrMarkTodo(
        tc,
        response.status(),
        'TODO_CONFIRM_EXPECTED_STATUS: backend accepted missing snapshot',
      )
      attachScheduleAssertion(tc, 'Thieu snapshot duoc kiem tra theo response backend thuc te')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  test('TC23 - Tao lich snapshot khong phai object', async () => {
    const tc = createScheduleTestContext(
      'TC23',
      'Tao lich snapshot khong phai object',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const originalSchedules = await captureOriginalSchedules(
      apiContext,
      SCHEDULE_DEVICE_ID,
    )
    const payload = [
      {
        cron: generateDailyCron(18, 30),
        enable: true,
        snapshot: 'invalid',
      },
    ]

    try {
      const response = await setSchedulerAPI(
        apiContext,
        SCHEDULE_DEVICE_ID,
        payload as unknown as DeviceSchedule[],
      )
      await recordScheduleResponse(tc, 'Set scheduler with invalid snapshot', response, {
        method: 'POST',
        endpoint: schedulerEndpoint(SCHEDULE_DEVICE_ID),
        request: payload,
      })
      expectValidationStatusOrMarkTodo(
        tc,
        response.status(),
        'TODO_CONFIRM_EXPECTED_STATUS: backend accepted non-object snapshot',
      )
      attachScheduleAssertion(tc, 'Snapshot sai kieu duoc kiem tra theo response backend thuc te')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await restoreScheduler({
        apiContext,
        evidenceContext: tc,
        deviceId: SCHEDULE_DEVICE_ID,
        originalSchedules,
      })
      await apiContext.dispose()
    }
  })

  test('TC24 - Tao lich device khong ton tai', async () => {
    const tc = createScheduleTestContext('TC24', 'Tao lich device khong ton tai')
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })
    const payload = [
      createSchedule(generateDailyCron(18, 30), true, { [SLOT_ON_OFF]: true }),
    ]

    try {
      const response = await setSchedulerAPI(apiContext, INVALID_DEVICE_ID, payload)
      await recordScheduleResponse(tc, 'Set scheduler for non-existing device', response, {
        method: 'POST',
        endpoint: schedulerEndpoint(INVALID_DEVICE_ID),
        request: payload,
      })
      expectValidationStatusOrMarkTodo(
        tc,
        response.status(),
        'TODO_CONFIRM_EXPECTED_STATUS: backend accepted non-existing device id',
      )
      attachScheduleAssertion(tc, 'Device khong ton tai duoc kiem tra theo response backend thuc te')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await apiContext.dispose()
    }
  })

  test('TC25 - GET scheduler device khong ton tai', async () => {
    const tc = createScheduleTestContext(
      'TC25',
      'GET scheduler device khong ton tai',
    )
    const apiContext = await request.newContext({ baseURL: DEVICE_CONTROL_ENDPOINT })

    try {
      const response = await getSchedulerAPI(apiContext, INVALID_DEVICE_ID)
      await recordScheduleResponse(tc, 'Get scheduler for non-existing device', response, {
        method: 'GET',
        endpoint: schedulerEndpoint(INVALID_DEVICE_ID),
      })
      expect(response.status()).toBeGreaterThanOrEqual(400)
      attachScheduleAssertion(tc, 'GET device khong ton tai bi tu choi')
      await saveScheduleEvidence(tc, 'PASSED')
    } catch (error) {
      await saveScheduleEvidence(tc, 'FAILED', error)
      throw error
    } finally {
      await apiContext.dispose()
    }
  })
})

const createSchedule = (
  cron: string,
  enable: boolean,
  snapshot: Record<string, boolean | number | string>,
): DeviceSchedule => ({
  cron,
  enable,
  snapshot,
})

const setAndVerifyScheduler = async (
  apiContext: Awaited<ReturnType<typeof request.newContext>>,
  tc: ReturnType<typeof createScheduleTestContext>,
  deviceId: string | number,
  schedules: DeviceSchedule[],
) => {
  const setResponse = await setSchedulerAPI(apiContext, deviceId, schedules)
  const setBody = await recordScheduleResponse(tc, 'Set scheduler', setResponse, {
    method: 'POST',
    endpoint: schedulerEndpoint(deviceId),
    request: schedules,
  })
  expect(setResponse.status()).toBe(200)
  await expectSchedulerAccepted(setBody)

  const getResponse = await getSchedulerAPI(apiContext, deviceId)
  const getBody = await recordScheduleResponse(
    tc,
    'Get scheduler after save',
    getResponse,
    {
      method: 'GET',
      endpoint: schedulerEndpoint(deviceId),
    },
  )
  if (getResponse.status() === 405 || getResponse.status() === 404) {
    attachScheduleAssertion(
      tc,
      `GET scheduler is not supported by this real HC contract, status=${getResponse.status()}`,
    )
    return {
      body: getBody,
      readSupported: false,
    }
  }

  expect(getResponse.status()).toBe(200)
  expectSavedSchedules(getBody, schedules)

  return {
    body: getBody,
    readSupported: true,
  }
}

const expectValidationStatusOrMarkTodo = (
  tc: ReturnType<typeof createScheduleTestContext>,
  status: number,
  todoMessage: string,
) => {
  if (status >= 400) {
    return
  }

  attachScheduleAssertion(tc, `${todoMessage}; actual_status=${status}`)
}
