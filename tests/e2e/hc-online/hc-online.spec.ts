import { StatusResponse } from '@src/core'
import { hcOnlineE2eTest as test } from './hc-online.support'
import {
  ContainerRuntime,
  delay,
  expectStatusCode,
  PostgresClient,
} from '@src/utils'
import { expect } from '@playwright/test'

test.describe('Home Controller online/offline e2e', () => {
  test.beforeAll(async () => {
    await PostgresClient.getInstance().init()
  })

  test.afterAll(async () => {
    await PostgresClient.getInstance().dispose()
  })

  test('Check home controller is online', async ({
    iotHomeControllerClient,
    iotHcExampleInfo,
    homeControllerDb,
  }) => {
    const response = await iotHomeControllerClient.healthcheckAPI()
    const json: StatusResponse = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })

    await expect(json.status).toBe(true)

    // check hc status in database
    const homeController = await homeControllerDb.getHomeControllerByMac(
      iotHcExampleInfo.mac,
    )
    await expect(homeController).not.toBeNull()

    const mqttStatus = await homeControllerDb.getHomeControllerMqttStatus(
      homeController!.id,
    )
    await expect(mqttStatus).toBe(true)
  })

  test('Check home controller is offline', async ({
    iotHomeControllerClient,
    iotHcExampleInfo,
    homeControllerDb,
  }) => {
    await ContainerRuntime.getInstance().stopContainer(
      iotHcExampleInfo.container,
    )

    await delay(500)

    try {
      await iotHomeControllerClient.healthcheckAPI()
    } catch (e) {
      // console.log(e)
    } finally {
      const mqttStatus = await homeControllerDb.getHomeControllerMqttStatus(
        iotHcExampleInfo.id,
      )
      await expect(mqttStatus).toBe(false)

      await ContainerRuntime.getInstance().startContainer(
        iotHcExampleInfo.container,
      )
    }
  })
})
