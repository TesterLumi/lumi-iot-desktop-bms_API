import { HomeController, homeControllerSchema } from '@src/core'
import { consoleServiceTest as test } from './home-controller.support'
import {
  expectNotNull,
  expectStatusCode,
  PostgresClient,
  validateSchema,
} from '@src/utils'
import { ApiV0Response } from '@src/core/console/response'
import { createHomeControllerData } from '@src/core/console/home_controller/data'
import { expect } from '@playwright/test'

test.describe('Home Controller', () => {
  test.beforeAll(async () => {
    await PostgresClient.getInstance().init()
  })

  test.afterAll(async () => {
    await PostgresClient.getInstance().dispose()
  })

  test('Get HomeController', async ({
    homeController,
    homeControllerClient,
  }) => {
    const response = await homeControllerClient.getHomeControllerAPI(
      homeController.id,
    )
    const json: ApiV0Response<HomeController> = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expectNotNull({
      actual: json.data,
      description: 'HomeController data should not be null',
    })
    await validateSchema({ schema: homeControllerSchema, json: json.data })
  })

  test('Create HomeController', async ({
    homeControllerClient,
    homeControllerDb,
  }) => {
    const payload = createHomeControllerData()

    const response = await homeControllerClient.createHomeControllerAPI(payload)
    const json: ApiV0Response<HomeController> = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expectNotNull({
      actual: json.data,
      description: 'HomeController data should not be null',
    })
    await validateSchema({ schema: homeControllerSchema, json: json.data })
    await expect(json.data!.mac).toBe(payload.mac)

    const hcInDB = await homeControllerDb.getHomeControllerById(json.data!.id)
    await expectNotNull({
      actual: hcInDB,
      description: 'HomeController should exist in the database after creation',
    })
    await expect(hcInDB!.mac).toBe(payload.mac)
  })

  test('Update HomeController', async ({
    homeController,
    homeControllerClient,
  }) => {
    const payload = {
      name: 'Updated HomeController Name',
      notes: 'Updated notes for the HomeController',
    }

    const response = await homeControllerClient.updateHomeControllerAPI(
      homeController.id,
      payload,
    )
    const json: ApiV0Response<HomeController> = await response.json()

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })
    await expectNotNull({
      actual: json.data,
      description: 'HomeController data should not be null',
    })
    await validateSchema({ schema: homeControllerSchema, json: json.data })
    await expect(json.data!.name).toBe(payload.name)
    await expect(json.data!.notes).toBe(payload.notes)
  })

  test('Delete HomeController', async ({
    homeController,
    homeControllerClient,
    homeControllerDb,
  }) => {
    const response = await homeControllerClient.deleteHomeControllerAPI(
      homeController.id,
    )

    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })

    // Verify that the HomeController is deleted
    const getResponse = await homeControllerClient.getHomeControllerAPI(
      homeController.id,
    )
    await expectStatusCode({
      actual: getResponse.status(),
      expected: 404,
      api: getResponse.url(),
    })

    // verify in database
    const hcInDB = await homeControllerDb.getHomeControllerById(homeController.id)
    await expectNotNull({
      actual: hcInDB,
      description: 'HomeController should exist in the database after creation',
    })
    await expect(hcInDB!.deleted_at).not.toBeNull()
  })
})
