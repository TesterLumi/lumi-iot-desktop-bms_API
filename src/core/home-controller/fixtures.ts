import { Fixtures } from '@playwright/test'
import { IotHomeControllerApiClient } from './api'
import { getApiDefaultContext } from './context'

const SAMPLE_HC_MAC = '00:00:00:00:00:00'
const CONTAINER_NAME = 'hc1'
const HC_ID = '1'

export type IotHomeControllerFixture = {
  iotHomeControllerClient: IotHomeControllerApiClient
  iotHcExampleInfo: {
    mac: string
    container: string
    id: string
  }
}

export const iotHomeControllerFixture: Fixtures<IotHomeControllerFixture> = {
  iotHomeControllerClient: async ({}, use) => {
    const context = await getApiDefaultContext()
    const homeControllerClient = new IotHomeControllerApiClient(context)
    await use(homeControllerClient)
  },
  iotHcExampleInfo: async ({}, use) => {
    await use({
      mac: SAMPLE_HC_MAC,
      container: CONTAINER_NAME,
      id: HC_ID,
    })
  },
}
