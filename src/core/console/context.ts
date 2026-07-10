import { request } from '@playwright/test'
import { IOT_CONSOLE_ENDPOINT } from '@src/config'

export const getApiDefaultContext = async () => {
  return await request.newContext({
    baseURL: IOT_CONSOLE_ENDPOINT,
  })
}
