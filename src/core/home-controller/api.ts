import test, { APIRequestContext, APIResponse } from '@playwright/test'
import { APIClient, SEC } from '@src/utils'

const ROUTE = '/api'

export class IotHomeControllerApiClient implements APIClient {
  constructor(public context: APIRequestContext) {}

  async healthcheckAPI(): Promise<APIResponse> {
    return await test.step(
      'Check hc is online',
      async () => {
        return await this.context.get(`${ROUTE}/health_check`)
      },
      {
        timeout: SEC,
      },
    )
  }
}
