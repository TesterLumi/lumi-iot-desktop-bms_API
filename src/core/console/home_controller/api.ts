import test, { APIRequestContext, APIResponse } from '@playwright/test'
import { APIClient, expectNotNull, expectStatusCode } from '@src/utils'
import { HomeController, HomeControllerCreateRequest } from './type'
import { ApiV0Response } from '../response'

const ROUTE = '/api/v0/home-controllers'

export class HomeControllerApiClient implements APIClient {
  constructor(public context: APIRequestContext) {}

  async createHomeControllerAPI(
    data: HomeControllerCreateRequest,
  ): Promise<APIResponse> {
    return await test.step('Creating home controller', async () => {
      return await this.context.post(ROUTE, {
        data,
      })
    })
  }

  async getHomeControllerAPI(hcId: string): Promise<APIResponse> {
    return await test.step(`Getting home controller with id ${hcId}`, async () => {
      return await this.context.get(`${ROUTE}/${hcId}`)
    })
  }

  async updateHomeControllerAPI(
    hcId: string,
    data: Partial<HomeControllerCreateRequest>,
  ): Promise<APIResponse> {
    return await test.step(`Updating home controller with id ${hcId}`, async () => {
      return await this.context.patch(`${ROUTE}/${hcId}`, {
        data,
      })
    })
  }

  async deleteHomeControllerAPI(hcId: string): Promise<APIResponse> {
    return await test.step(`Deleting home controller with id ${hcId}`, async () => {
      return await this.context.delete(`${ROUTE}/${hcId}`)
    })
  }

  async createHomeController(
    data: HomeControllerCreateRequest,
  ): Promise<HomeController> {
    const response = await this.createHomeControllerAPI(data)
    await expectStatusCode({
      actual: response.status(),
      expected: 200,
      api: response.url(),
    })

    const body: ApiV0Response<HomeController> = await response.json()
    await expectNotNull({
      actual: body.data,
      description: 'Home controller data in response',
    })

    return body.data!
  }
}
