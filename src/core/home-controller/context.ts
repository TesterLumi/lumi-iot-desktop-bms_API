import { request } from '@playwright/test'
import { IOT_HC_ENDPOINT } from '@src/config'

export const getApiDefaultContext = async () => {
  return await request.newContext({
    baseURL: IOT_HC_ENDPOINT,
  })
}
