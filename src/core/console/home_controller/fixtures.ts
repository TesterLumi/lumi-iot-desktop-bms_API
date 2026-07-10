import { Fixtures } from '@playwright/test'
import { HomeControllerApiClient } from './api'
import { HomeController } from './type'
import { getApiDefaultContext } from '../context'
import { createHomeControllerData } from './data'
import { PostgresClient } from '@src/utils'
import { HomeControllerDb } from './db'

export type HomeControllerFixture = {
  homeControllerClient: HomeControllerApiClient
  homeController: HomeController
  homeControllerDb: HomeControllerDb
}

export const homeControllerFixture: Fixtures<HomeControllerFixture> = {
  homeControllerClient: async ({}, use) => {
    const context = await getApiDefaultContext()
    const homeControllerClient = new HomeControllerApiClient(context)
    await use(homeControllerClient)
  },
  homeController: async ({ homeControllerClient }, use) => {
    const randomHc = createHomeControllerData()
    const hc = await homeControllerClient.createHomeController(randomHc)

    await use(hc)
    await homeControllerClient.deleteHomeControllerAPI(hc.id)
  },
  homeControllerDb: async ({}, use) => {
    const client = await PostgresClient.getInstance()
    const homeControllerDb = new HomeControllerDb(client)
    await use(homeControllerDb)
  },
}
