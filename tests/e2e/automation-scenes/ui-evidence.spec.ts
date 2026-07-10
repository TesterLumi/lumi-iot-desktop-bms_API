import { expect, test } from '@playwright/test'
import {
  AUTOMATION_ALLOW_DEVICE_CONTROL,
  AUTOMATION_DEVICE_STATE_IDX,
  DEVICE_CONTROL_ENDPOINT,
  DEVICE_SERVICE_ENDPOINT,
  IOT_HC_ENDPOINT,
} from '@src/config'
import { AutomationCenterApiClient } from '@src/core'
import {
  attachSceneAssertion,
  attachSceneStep,
  createAutoScenePayload,
  createSceneTestContext,
  createAndWaitForScene,
  createDistinctSceneTargetGroups,
  deleteCreatedScenes,
  discoverSceneTargetPool,
  expectDeviceSceneBindingMappings,
  expectHcSceneBindingValues,
  getNextThuySceneIndex,
  getSceneHcId,
  invertSceneBindings,
  prepareAndActivateSceneBindings,
  recordSceneResponse,
  resolveSceneHcId,
  saveSceneEvidence,
  toMixedSceneBindings,
  toSceneDeviceSummary,
  type SceneDeviceCandidate,
  type ThuySceneBindingInput,
} from './scenes.support'

const WEEKDAY_0830_CRON = '0 30 8 * * 2,3,4,5,6,7 *'

type CreatedSceneEvidence = {
  id: string
  name: string
  hcid?: string
  targets: SceneDeviceCandidate[]
  bindings: ThuySceneBindingInput[]
}

test.describe('Scene UI Evidence Real HC TC1-TC6', () => {
  test.describe.configure({ mode: 'serial' })

  let client: AutomationCenterApiClient
  let nextThuyIndex = 0
  let sceneTargetPool: SceneDeviceCandidate[] = []
  let firstScene: CreatedSceneEvidence | undefined
  let scheduledScene: CreatedSceneEvidence | undefined
  const createdSceneIds: string[] = []

  test.beforeEach(({ request }) => {
    client = new AutomationCenterApiClient(request)
  })

  /*
   * TC1 - Tao scene thuy<N> voi device online that
   * Precondition: HC co thiet bi online, controllable, slot 1 boolean.
   * Steps: goi device service lay danh sach device theo HC, random 2-3 device, tao scene thuy<N> snapshot mixed true/false.
   * Expected: scene tao thanh cong, sync xuong HC, device detail co mapping scene.
   */
  test('TC1 - Tao scene thuy<N> add device online thật', async ({ playwright }) => {
    test.setTimeout(120000)
    test.skip(!DEVICE_SERVICE_ENDPOINT, 'DEVICE_SERVICE_ENDPOINT is required')
    const context = createSceneTestContext('UI-TC1', 'Tao scene thuy<N> add device online that')
    const discoveryRequest = await playwright.request.newContext()

    try {
      nextThuyIndex = await getNextThuySceneIndex(client)
      sceneTargetPool = await discoverSceneTargetPool(discoveryRequest)
      const [firstSceneGroup] = createDistinctSceneTargetGroups({
        targets: sceneTargetPool,
        groupCount: 2,
      })
      const bindings = toMixedSceneBindings(
        firstSceneGroup.targets,
        AUTOMATION_DEVICE_STATE_IDX,
        0,
      )
      const payload = createAutoScenePayload({
        tcId: 'UI_TC1',
        name: `thuy${nextThuyIndex}`,
        bindings,
      })
      const scene = await createAndWaitForScene(client, payload)
      createdSceneIds.push(String(scene.id))
      firstScene = {
        id: String(scene.id),
        name: String(scene.name),
        hcid: await resolveSceneHcId(client, String(scene.id)),
        targets: firstSceneGroup.targets,
        bindings,
      }

      attachSceneStep(context, {
        step: 'Create thuy scene with real online devices',
        method: 'POST',
        endpoint: '/api/v0/scenes',
        request: payload,
        response: {
          scene: firstScene,
          target_pool: sceneTargetPool.map(toSceneDeviceSummary),
        },
      })
      await expectHcSceneBindingValues(firstScene.id, bindings)
      await expectDeviceSceneBindingMappings(firstScene.id, firstSceneGroup.targets, bindings)
      attachSceneAssertion(context, 'Scene thuy<N> created, synced to HC, and mapped to real devices')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    } finally {
      await discoveryRequest.dispose()
    }
  })

  /*
   * TC2 - Tao scene thuy<N+1> co lich 8:30 cac ngay trong tuan
   * Precondition: TC1 da discover pool device online cua HC.
   * Steps: chon group device khac neu du inventory, tao scene thuy<N+1> voi cron_enable=true va cron 8:30 thu 2-7.
   * Expected: scene lich tao thanh cong, cron duoc luu, binding sync xuong HC.
   */
  test('TC2 - Tao scene thuy<N+1> có lịch 8:30 add device online thật', async () => {
    test.setTimeout(120000)
    const context = createSceneTestContext('UI-TC2', 'Tao scene thuy<N+1> co lich 8:30')

    try {
      expect(sceneTargetPool.length, 'TC1 should discover scene target pool first').toBeGreaterThan(0)
      const [, scheduledSceneGroup] = createDistinctSceneTargetGroups({
        targets: sceneTargetPool,
        groupCount: 2,
      })
      const bindings = invertSceneBindings(
        toMixedSceneBindings(
          scheduledSceneGroup.targets,
          AUTOMATION_DEVICE_STATE_IDX,
          1,
        ),
      )
      const payload = createAutoScenePayload({
        tcId: 'UI_TC2',
        name: `thuy${nextThuyIndex + 1}`,
        bindings,
        cron: WEEKDAY_0830_CRON,
        cronEnable: true,
      })
      const scene = await createAndWaitForScene(client, payload)
      createdSceneIds.push(String(scene.id))
      scheduledScene = {
        id: String(scene.id),
        name: String(scene.name),
        hcid: await resolveSceneHcId(client, String(scene.id)),
        targets: scheduledSceneGroup.targets,
        bindings,
      }

      attachSceneStep(context, {
        step: 'Create scheduled thuy scene with real online devices',
        method: 'POST',
        endpoint: '/api/v0/scenes',
        request: payload,
        response: scheduledScene,
      })
      const detail = await client.getSceneDetailAPI(scheduledScene.id)
      const detailBody = await recordSceneResponse(context, 'Verify scheduled scene detail', detail, {
        method: 'GET',
        endpoint: `/api/v0/scenes/${scheduledScene.id}/detail`,
      })
      expect(detail.status()).toBe(200)
      expect(JSON.stringify(detailBody)).toContain(WEEKDAY_0830_CRON)
      await expectHcSceneBindingValues(scheduledScene.id, bindings)
      await expectDeviceSceneBindingMappings(scheduledScene.id, scheduledSceneGroup.targets, bindings)
      attachSceneAssertion(context, 'Scheduled scene thuy<N+1> created with 8:30 cron and real device mapping')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    }
  })

  /*
   * TC3 - Doi ten scene thuy<N> thanh thuyvu<N>
   * Precondition: TC1 da tao scene thuy<N>.
   * Steps: update scene name bang API, get detail lai.
   * Expected: detail tra ve name moi thuyvu<N>.
   */
  test('TC3 - Đổi tên scene thuy<N> thành thuyvu<N>', async () => {
    const context = createSceneTestContext('UI-TC3', 'Doi ten scene thuy<N> thanh thuyvu<N>')

    try {
      expect(firstScene, 'TC1 should create first scene').toBeTruthy()
      const renamedName = `thuyvu${nextThuyIndex}`
      const response = await client.updateSceneAPI(firstScene!.id, {
        name: renamedName,
      })
      await recordSceneResponse(context, 'Rename first thuy scene', response, {
        method: 'PUT',
        endpoint: `/api/v0/scenes/${firstScene!.id}`,
        request: { name: renamedName },
      })
      expect(response.status()).toBe(200)

      const detail = await client.getSceneDetailAPI(firstScene!.id)
      const detailBody = await recordSceneResponse(context, 'Verify renamed scene detail', detail, {
        method: 'GET',
        endpoint: `/api/v0/scenes/${firstScene!.id}/detail`,
      })
      expect(detail.status()).toBe(200)
      expect(JSON.stringify(detailBody)).toContain(renamedName)
      firstScene = {
        ...firstScene!,
        name: renamedName,
      }
      attachSceneAssertion(context, 'Scene thuy<N> renamed to thuyvu<N>')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    }
  })

  /*
   * TC4 - Kich hoat scene thuyvu<N> va verify dau ra
   * Precondition: device target dang duoc baseline ve trang thai nguoc snapshot.
   * Steps: control tung binding device theo snapshot scene, poll HC direct status.
   * Expected: tat ca device output slot 1 trung voi snapshot da cai trong scene.
   */
  test('TC4 - Kích hoạt scene thuyvu<N> và verify output device', async () => {
    test.setTimeout(180000)
    test.skip(!DEVICE_CONTROL_ENDPOINT, 'DEVICE_CONTROL_ENDPOINT is required')
    test.skip(!IOT_HC_ENDPOINT, 'IOT_HC_ENDPOINT is required')
    test.skip(!AUTOMATION_ALLOW_DEVICE_CONTROL, 'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to control real devices')
    const context = createSceneTestContext('UI-TC4', 'Kich hoat scene thuyvu<N> verify output')

    try {
      expect(firstScene, 'TC1/TC3 should create and rename first scene').toBeTruthy()
      const activation = await prepareAndActivateSceneBindings({
        sceneId: firstScene!.id,
        sceneTargets: firstScene!.targets,
        bindings: firstScene!.bindings,
      })
      attachSceneStep(context, {
        step: 'Activate renamed thuyvu scene and verify real output',
        method: 'POST',
        endpoint: '/api/devices/control',
        request: {
          mode: 'ui_device_binding_controls',
          scene_id: firstScene!.id,
          scene_name: firstScene!.name,
          device_hc_id: getSceneHcId(firstScene!.targets),
          baseline: invertSceneBindings(firstScene!.bindings),
          expected: firstScene!.bindings,
        },
        response: activation,
      })
      attachSceneAssertion(context, 'Renamed scene output states matched configured snapshots')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    }
  })

  /*
   * TC5 - Kich hoat scene co lich thuy<N+1> va verify dau ra
   * Precondition: scheduled scene da tao va device target baseline nguoc snapshot.
   * Steps: control tung binding device theo snapshot scene, poll HC direct status.
   * Expected: tat ca device output slot 1 trung voi snapshot da cai trong scene lich.
   */
  test('TC5 - Kích hoạt scene lịch thuy<N+1> và verify output device', async () => {
    test.setTimeout(180000)
    test.skip(!DEVICE_CONTROL_ENDPOINT, 'DEVICE_CONTROL_ENDPOINT is required')
    test.skip(!IOT_HC_ENDPOINT, 'IOT_HC_ENDPOINT is required')
    test.skip(!AUTOMATION_ALLOW_DEVICE_CONTROL, 'Set AUTOMATION_ALLOW_DEVICE_CONTROL=true to control real devices')
    const context = createSceneTestContext('UI-TC5', 'Kich hoat scene lich thuy<N+1> verify output')

    try {
      expect(scheduledScene, 'TC2 should create scheduled scene').toBeTruthy()
      const activation = await prepareAndActivateSceneBindings({
        sceneId: scheduledScene!.id,
        sceneTargets: scheduledScene!.targets,
        bindings: scheduledScene!.bindings,
      })
      attachSceneStep(context, {
        step: 'Activate scheduled thuy scene and verify real output',
        method: 'POST',
        endpoint: '/api/devices/control',
        request: {
          mode: 'ui_device_binding_controls',
          scene_id: scheduledScene!.id,
          scene_name: scheduledScene!.name,
          device_hc_id: getSceneHcId(scheduledScene!.targets),
          baseline: invertSceneBindings(scheduledScene!.bindings),
          expected: scheduledScene!.bindings,
        },
        response: activation,
      })
      attachSceneAssertion(context, 'Scheduled scene output states matched configured snapshots')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    }
  })

  /*
   * TC6 - Xoa cac scene UI evidence da tao
   * Precondition: TC1/TC2 da tao scene test.
   * Steps: deleteManyScenesAPI voi danh sach scene_id vua tao.
   * Expected: scene test duoc xoa, cleanup evidence ghi lai scene_id da xoa.
   */
  test('TC6 - Xóa toàn bộ scene UI evidence đã tạo', async () => {
    const context = createSceneTestContext('UI-TC6', 'Xoa toan bo scene UI evidence da tao')

    try {
      await deleteCreatedScenes(client, createdSceneIds)
      attachSceneStep(context, {
        step: 'Delete UI evidence scenes',
        method: 'DELETE',
        endpoint: '/api/v0/scenes',
        request: {
          scene_ids: createdSceneIds,
        },
        response: {
          deleted_scene_ids: createdSceneIds,
        },
      })
      attachSceneAssertion(context, 'All UI evidence scenes created by this run were deleted')
      await saveSceneEvidence(context, 'PASSED')
    } catch (error) {
      await saveSceneEvidence(context, 'FAILED', error)
      throw error
    }
  })
})
