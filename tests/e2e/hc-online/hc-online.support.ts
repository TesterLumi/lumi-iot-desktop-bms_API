import { test as base } from '@playwright/test'
import {
  homeControllerFixture,
  HomeControllerFixture,
  iotHomeControllerFixture,
  IotHomeControllerFixture,
} from '@src/core'
import { combineFixtures } from '@src/utils'

export const hcOnlineE2eTest = base.extend<
  HomeControllerFixture,
  IotHomeControllerFixture
>(combineFixtures(homeControllerFixture, iotHomeControllerFixture))
