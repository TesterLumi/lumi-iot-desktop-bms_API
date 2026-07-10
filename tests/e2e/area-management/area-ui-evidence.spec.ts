import { expect, test } from '@playwright/test'
import {
  AreaSuiteApi,
  generateTcAreaName,
  getAreaSuiteEnv,
  loginAreaSuiteUser,
  newAreaSuiteApi,
} from '@src/core/bms-api/area-management-suite'

type AreaBody = {
  data?: {
    id?: string
    name?: string
    code?: string
    parent_id?: string | null
    path?: string
    floor_plan_url?: string | null
  }
}

type CreatedArea = NonNullable<AreaBody['data']> & {
  id: string
}

type ApiResult = {
  status: () => number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

type TimelineStep = {
  step: string
  status?: number
  area_id?: string
  name?: string
  code?: string
  parent_id?: string | null
  target?: unknown
  note?: string
}

const env = getAreaSuiteEnv()

const responseBody = async (response: ApiResult): Promise<AreaBody> =>
  (await response.json()) as AreaBody

const requireArea = async (
  response: ApiResult,
  step: string,
): Promise<CreatedArea> => {
  const body = await responseBody(response)
  await expect(response.status(), `${step} status`).toBe(200)
  await expect(body.data?.id, `${step} area id`).toBeTruthy()

  return body.data as CreatedArea
}

const createArea = async (
  api: AreaSuiteApi,
  timeline: TimelineStep[],
  step: string,
  payload: { name: string; parent_id?: string | null },
) => {
  const area = await requireArea(await api.createArea(payload), step)
  timeline.push({
    step,
    status: 200,
    area_id: area.id,
    name: area.name,
    code: area.code,
    parent_id: area.parent_id,
  })

  return area
}

const pauseForManualCheck = async (
  timeline: TimelineStep[],
  step: string,
  detail: unknown,
) => {
  const delayMs = Number(process.env.AREA_UI_EVIDENCE_PAUSE_MS || 0)
  timeline.push({
    step,
    target: detail,
    note:
      delayMs > 0
        ? `Paused ${delayMs}ms for manual UI check`
        : 'Pause disabled. Set AREA_UI_EVIDENCE_PAUSE_MS to inspect UI live.',
  })

  if (delayMs <= 0) return

  console.log(
    JSON.stringify({
      area_ui_manual_check_pause: {
        step,
        delay_ms: delayMs,
        detail,
      },
    }),
  )
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

const cleanupArea = async (
  api: AreaSuiteApi,
  timeline: TimelineStep[],
  areaId?: string,
) => {
  if (!areaId) return

  const response = await api.deleteArea(areaId)
  const status = response.status()
  timeline.push({
    step: 'cleanup_delete_area',
    status,
    area_id: areaId,
  })
  await expect([200, 404]).toContain(status)
}

const expectAreaDeleted = async (
  api: AreaSuiteApi,
  timeline: TimelineStep[],
  areaId?: string,
) => {
  if (!areaId) return

  const response = await api.getArea(areaId)
  timeline.push({
    step: 'verify_area_deleted',
    status: response.status(),
    area_id: areaId,
  })
  await expect(response.status()).toBe(404)
}

const runOptionalFixtureStep = async (
  timeline: TimelineStep[],
  fixtureName: string,
  fixtureValue: string,
  fn: (fixtureValue: string) => Promise<void>,
) => {
  if (!fixtureValue) {
    timeline.push({
      step: 'skipped_fixture',
      target: { fixture: fixtureName },
      note: `${fixtureName} is not set`,
    })
    return
  }

  await fn(fixtureValue)
}

test.describe('Area Management UI evidence data', () => {
  test.setTimeout(180000)

  test('AREA-UI creates one parent/child workflow for manual UI checking', async () => {
    test.skip(
      !env.adminUsername || !env.adminPassword,
      'ADMIN_USERNAME and ADMIN_PASSWORD are required',
    )

    const login = await loginAreaSuiteUser(
      env,
      env.adminUsername,
      env.adminPassword,
    )
    const api = await newAreaSuiteApi(env, login.token)
    const timeline: TimelineStep[] = []
    const createdAreaIds: string[] = []
    let parentId: string | undefined
    let parentBId: string | undefined
    let childId: string | undefined
    let cascadeChildId: string | undefined

    try {
      /*
      TC ID: TC9
      Ten testcase: Tao khu vuc root thanh cong
      Muc tieu: Tao khu vuc cha/root de kiem tra hien thi tren UI
      Precondition: Admin login thanh cong va co quyen create area
      Expected: API tra 200, area co id/name/code, parent_id=null
      Evidence UI: Pause manual_check_parent_created de search theo name/code tren UI
      */
      const parent = await createArea(api, timeline, 'created_parent', {
        name: generateTcAreaName('UI_parent'),
      })
      parentId = parent.id
      createdAreaIds.push(parentId)
      await pauseForManualCheck(timeline, 'manual_check_parent_created', parent)

      /*
      TC ID: TC10
      Ten testcase: Tao khu vuc con thanh cong
      Muc tieu: Tao khu vuc con nam duoi khu vuc cha vua tao
      Precondition: Da co parent area hop le
      Expected: API tra 200, child co parent_id dung bang parent id
      Evidence UI: Pause manual_check_child_created de kiem tra child trong cay khu vuc
      */
      const child = await createArea(api, timeline, 'created_child', {
        name: generateTcAreaName('UI_child'),
        parent_id: parentId,
      })
      childId = child.id
      createdAreaIds.push(childId)
      await pauseForManualCheck(timeline, 'manual_check_child_created', child)

      /*
      TC ID: TC19
      Ten testcase: Cap nhat ten khu vuc
      Muc tieu: Sua ten khu vuc con va kiem tra ten moi duoc luu
      Precondition: Da co child area
      Expected: PATCH tra 200, response co name moi
      Evidence UI: Pause manual_check_name_updated de search/refresh UI thay ten moi
      */
      const updatedName = generateTcAreaName('UI_child_updated')
      const updateNameResponse = await api.updateArea(childId, {
        name: updatedName,
      })
      const updatedChild = await requireArea(updateNameResponse, 'updated_name')
      await expect(updatedChild.name).toBe(updatedName)
      timeline.push({
        step: 'updated_name',
        status: updateNameResponse.status(),
        area_id: childId,
        name: updatedChild.name,
        code: updatedChild.code,
        parent_id: updatedChild.parent_id,
      })
      await pauseForManualCheck(timeline, 'manual_check_name_updated', {
        area_id: childId,
        name: updatedName,
      })

      /*
      TC ID: TC20
      Ten testcase: Cap nhat floor_plan_url
      Muc tieu: Gan floor_plan_url cho khu vuc con
      Precondition: Da co child area
      Expected: PATCH tra 200, floor_plan_url dung voi gia tri gui len
      Evidence UI: Timeline ghi updated_floor_plan_url de doi chieu neu UI co hien floor plan
      */
      const floorPlanUrl = `https://example.test/floor-plan-${Date.now()}.png`
      const updateFloorResponse = await api.updateArea(childId, {
        floor_plan_url: floorPlanUrl,
      })
      const floorArea = await requireArea(
        updateFloorResponse,
        'updated_floor_plan_url',
      )
      await expect(floorArea.floor_plan_url).toBe(floorPlanUrl)
      timeline.push({
        step: 'updated_floor_plan_url',
        status: updateFloorResponse.status(),
        area_id: childId,
        target: { floor_plan_url: floorPlanUrl },
      })

      /*
      TC ID: TC21
      Ten testcase: Xoa floor_plan_url
      Muc tieu: Xoa floor_plan_url bang gia tri null
      Precondition: Child area da co floor_plan_url
      Expected: PATCH tra 200, floor_plan_url=null
      Evidence UI: Timeline ghi cleared_floor_plan_url de doi chieu neu UI co hien floor plan
      */
      const clearFloorResponse = await api.updateArea(childId, {
        floor_plan_url: null,
      })
      const clearedFloorArea = await requireArea(
        clearFloorResponse,
        'cleared_floor_plan_url',
      )
      await expect(clearedFloorArea.floor_plan_url).toBeNull()
      timeline.push({
        step: 'cleared_floor_plan_url',
        status: clearFloorResponse.status(),
        area_id: childId,
      })

      /*
      TC ID: TC22
      Ten testcase: Di chuyen khu vuc con sang parent khac
      Muc tieu: Tao parent B va chuyen child tu parent A sang parent B
      Precondition: Co parent A, parent B va child
      Expected: PATCH tra 200, child.parent_id=parentBId
      Evidence UI: Timeline ghi moved_child_to_second_parent de doi chieu cay khu vuc
      */
      const parentB = await createArea(api, timeline, 'created_second_parent', {
        name: generateTcAreaName('UI_parent_B'),
      })
      parentBId = parentB.id
      createdAreaIds.push(parentBId)

      const moveToParentResponse = await api.updateArea(childId, {
        parent_id: parentBId,
      })
      const movedToParent = await requireArea(
        moveToParentResponse,
        'moved_child_to_second_parent',
      )
      await expect(movedToParent.parent_id).toBe(parentBId)
      timeline.push({
        step: 'moved_child_to_second_parent',
        status: moveToParentResponse.status(),
        area_id: childId,
        parent_id: movedToParent.parent_id,
      })

      /*
      TC ID: TC23
      Ten testcase: Di chuyen khu vuc ra root
      Muc tieu: Chuyen child tu parent B ve root
      Precondition: Child dang co parent_id=parentBId
      Expected: PATCH tra 200, child.parent_id=null
      Evidence UI: Pause manual_check_tree_moves de kiem tra thay doi cay khu vuc
      */
      const moveToRootResponse = await api.updateArea(childId, {
        parent_id: null,
      })
      const movedToRoot = await requireArea(
        moveToRootResponse,
        'moved_child_to_root',
      )
      await expect(movedToRoot.parent_id).toBeNull()
      timeline.push({
        step: 'moved_child_to_root',
        status: moveToRootResponse.status(),
        area_id: childId,
        parent_id: movedToRoot.parent_id,
      })
      await pauseForManualCheck(timeline, 'manual_check_tree_moves', {
        child_id: childId,
        second_parent_id: parentBId,
      })
      const activeChildId = childId
      if (!activeChildId) {
        throw new Error('Child area id is required for fixture evidence steps')
      }

      /*
      TC ID: TC41, TC48
      Ten testcase: Gan thiet bi vao khu vuc / Go thiet bi khoi khu vuc
      Muc tieu: Gan fixture device vao child area, sau do go khoi area
      Precondition: TEST_DEVICE_ID_1 co san va child area ton tai
      Expected: Assign tra 200, unassign tra 200 hoac 404 theo idempotent backend
      Evidence UI: Pause manual_check_device_assigned de kiem tra lien ket device tren UI
      */
      await runOptionalFixtureStep(
        timeline,
        'TEST_DEVICE_ID_1',
        env.testDeviceId1,
        async (deviceId) => {
          const assignResponse = await api.assignDevices(activeChildId, [
            deviceId,
          ])
          await expect(assignResponse.status()).toBe(200)
          timeline.push({
            step: 'assigned_device',
            status: assignResponse.status(),
            area_id: activeChildId,
            target: { device_ids: [deviceId] },
          })
          await pauseForManualCheck(timeline, 'manual_check_device_assigned', {
            area_id: activeChildId,
            device_id: deviceId,
          })

          const unassignResponse = await api.unassignDevices(activeChildId, [
            deviceId,
          ])
          await expect([200, 404]).toContain(unassignResponse.status())
          timeline.push({
            step: 'unassigned_device',
            status: unassignResponse.status(),
            area_id: activeChildId,
            target: { device_ids: [deviceId] },
          })
        },
      )

      /*
      TC ID: TC62, TC68
      Ten testcase: Gan lighting group vao khu vuc / Go group khoi khu vuc
      Muc tieu: Gan fixture lighting group vao child area, sau do go khoi area
      Precondition: TEST_LIGHTING_GROUP_ID co san va child area ton tai
      Expected: Assign tra 200, unassign tra 200 hoac 404 theo idempotent backend
      Evidence UI: Pause manual_check_group_assigned de kiem tra lien ket group tren UI
      */
      await runOptionalFixtureStep(
        timeline,
        'TEST_LIGHTING_GROUP_ID',
        env.testLightingGroupId,
        async (groupId) => {
          const assignResponse = await api.assignGroups(activeChildId, [
            groupId,
          ])
          await expect(assignResponse.status()).toBe(200)
          timeline.push({
            step: 'assigned_group',
            status: assignResponse.status(),
            area_id: activeChildId,
            target: { group_ids: [groupId] },
          })
          await pauseForManualCheck(timeline, 'manual_check_group_assigned', {
            area_id: activeChildId,
            group_id: groupId,
          })

          const unassignResponse = await api.unassignGroups(activeChildId, [
            groupId,
          ])
          await expect([200, 404]).toContain(unassignResponse.status())
          timeline.push({
            step: 'unassigned_group',
            status: unassignResponse.status(),
            area_id: activeChildId,
            target: { group_ids: [groupId] },
          })
        },
      )

      /*
      TC ID: TC79, TC83
      Ten testcase: Gan home controller vao khu vuc / Go home controller khoi khu vuc
      Muc tieu: Gan fixture HC vao child area, sau do go khoi area
      Precondition: TEST_HC_ID_1 co san va child area ton tai
      Expected: Assign tra 200, unassign tra 200 hoac 404 theo idempotent backend
      Evidence UI: Pause manual_check_hc_assigned de kiem tra HC tren UI
      */
      await runOptionalFixtureStep(
        timeline,
        'TEST_HC_ID_1',
        env.testHcId1,
        async (hcId) => {
          const assignResponse = await api.assignHomeControllers(
            activeChildId,
            [hcId],
          )
          await expect(assignResponse.status()).toBe(200)
          timeline.push({
            step: 'assigned_home_controller',
            status: assignResponse.status(),
            area_id: activeChildId,
            target: { hc_ids: [hcId] },
          })
          await pauseForManualCheck(timeline, 'manual_check_hc_assigned', {
            area_id: activeChildId,
            hc_id: hcId,
          })

          const unassignResponse = await api.unassignHomeControllers(
            activeChildId,
            [hcId],
          )
          await expect([200, 404]).toContain(unassignResponse.status())
          timeline.push({
            step: 'unassigned_home_controller',
            status: unassignResponse.status(),
            area_id: activeChildId,
            target: { hc_ids: [hcId] },
          })
        },
      )

      /*
      TC ID: TC28
      Ten testcase: Xoa khu vuc khong co con thanh cong
      Muc tieu: Xoa child area dang la leaf area
      Precondition: Child area ton tai va khong co area con
      Expected: DELETE tra 200, GET lai tra 404
      Evidence UI: Timeline ghi deleted_child_area va verify_area_deleted
      */
      const deleteChildResponse = await api.deleteArea(activeChildId)
      await expect(deleteChildResponse.status()).toBe(200)
      timeline.push({
        step: 'deleted_child_area',
        status: deleteChildResponse.status(),
        area_id: activeChildId,
      })
      await expectAreaDeleted(api, timeline, activeChildId)
      childId = undefined

      /*
      TC ID: TC29
      Ten testcase: Xoa khu vuc cha cascade con
      Muc tieu: Tao cascade child duoi parent, xoa parent va kiem tra con bi xoa theo
      Precondition: Parent area ton tai va co child con
      Expected: DELETE parent tra 200, GET parent va cascade child deu tra 404
      Evidence UI: Pause manual_check_deleted_areas de kiem tra khu vuc da khong con tren UI
      */
      const cascadeChild = await createArea(
        api,
        timeline,
        'created_cascade_child',
        {
          name: generateTcAreaName('UI_cascade_child'),
          parent_id: parentId,
        },
      )
      cascadeChildId = cascadeChild.id
      createdAreaIds.push(cascadeChildId)

      const deleteParentResponse = await api.deleteArea(parentId)
      await expect(deleteParentResponse.status()).toBe(200)
      timeline.push({
        step: 'deleted_parent_area_cascade',
        status: deleteParentResponse.status(),
        area_id: parentId,
        target: { cascade_child_id: cascadeChildId },
      })
      await expectAreaDeleted(api, timeline, parentId)
      await expectAreaDeleted(api, timeline, cascadeChildId)
      parentId = undefined
      cascadeChildId = undefined

      await pauseForManualCheck(timeline, 'manual_check_deleted_areas', {
        deleted_child_id: child.id,
        deleted_parent_id: parent.id,
      })
    } finally {
      await cleanupArea(api, timeline, childId)
      await cleanupArea(api, timeline, cascadeChildId)
      await cleanupArea(api, timeline, parentId)
      await cleanupArea(api, timeline, parentBId)
      await api.context.dispose()

      console.log(
        JSON.stringify({
          area_ui_evidence_for_manual_check: {
            manual_check_hint:
              'Open Area Management UI and search by names/codes printed in timeline during pause steps.',
            pause_ms: Number(process.env.AREA_UI_EVIDENCE_PAUSE_MS || 0),
            covered_cases: [
              'TC9',
              'TC10',
              'TC19',
              'TC20',
              'TC21',
              'TC22',
              'TC23',
              'TC28',
              'TC29',
              'device/group/HC fixture cases when env is set',
            ],
            timeline,
            created_area_ids: createdAreaIds,
          },
        }),
      )
    }
  })
})
